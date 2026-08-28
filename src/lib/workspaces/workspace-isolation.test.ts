// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PRE_AUTH_WORKSPACE_ID } from "@/lib/workspaces/context";

const migrationsDirectory = resolve(process.cwd(), "migrations");
const allMigrations = [
  "001_initial.sql",
  "002_openrouter_embeddings.sql",
  "003_workspace_ownership.sql",
  "004_temporary_guest_conversation.sql",
  "005_guest_lifecycle.sql",
  "006_ingestion_jobs.sql",
  "007_hybrid_retrieval.sql",
  "008_member_accounts.sql",
];

const workspaceA = "10000000-0000-4000-8000-000000000001";
const workspaceB = "20000000-0000-4000-8000-000000000002";
const chatA = "10000000-0000-4000-8000-000000000011";
const chatB = "20000000-0000-4000-8000-000000000012";
const documentA = "10000000-0000-4000-8000-000000000021";
const documentB = "20000000-0000-4000-8000-000000000022";
const chunkA = "10000000-0000-4000-8000-000000000031";
const chunkB = "20000000-0000-4000-8000-000000000032";
const zeroVector = `[${Array.from({ length: 1_024 }, () => "0").join(",")}]`;

function createDatabase() {
  return new PGlite({ extensions: { vector } });
}

async function applyMigrations(database: PGlite, filenames: string[]) {
  for (const filename of filenames) {
    const migration = await readFile(resolve(migrationsDirectory, filename), "utf8");
    const statements = migration
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);

    await database.transaction(async (transaction) => {
      for (const statement of statements) await transaction.exec(statement);
    });
  }
}

async function seedOwnedGraph(database: PGlite, workspaceId: string, suffix: "A" | "B") {
  const chatId = suffix === "A" ? chatA : chatB;
  const documentId = suffix === "A" ? documentA : documentB;
  const chunkId = suffix === "A" ? chunkA : chunkB;

  await database.query("INSERT INTO workspaces (id) VALUES ($1)", [workspaceId]);
  await database.query("INSERT INTO chats (id, workspace_id) VALUES ($1, $2)", [
    chatId,
    workspaceId,
  ]);
  await database.query(
    `
      INSERT INTO documents (
        id, workspace_id, filename, mime_type, size_bytes, extracted_text, status
      ) VALUES ($1, $2, $3, 'text/plain', 4, 'text', 'ready')
    `,
    [documentId, workspaceId, `${suffix}.txt`],
  );
  await database.query(
    "INSERT INTO chat_documents (workspace_id, chat_id, document_id) VALUES ($1, $2, $3)",
    [workspaceId, chatId, documentId],
  );
  await database.query(
    `
      INSERT INTO document_chunks (
        id, workspace_id, document_id, chunk_index, content, embedding
      ) VALUES ($1, $2, $3, 0, 'text', $4::vector)
    `,
    [chunkId, workspaceId, documentId, zeroVector],
  );
  await database.query(
    `
      INSERT INTO messages (id, workspace_id, chat_id, role, content)
      VALUES ($1, $2, $3, 'user', 'question')
    `,
    [`message-${suffix}`, workspaceId, chatId],
  );
}

describe("workspace ownership migration", () => {
  it(
    "applies to an empty database and can be reapplied",
    async () => {
      const database = createDatabase();
      try {
        await applyMigrations(database, allMigrations);
        await applyMigrations(database, [
          "003_workspace_ownership.sql",
          "004_temporary_guest_conversation.sql",
        ]);

        const result = await database.query<{ id: string }>(
          "SELECT id FROM workspaces WHERE id = $1",
          [PRE_AUTH_WORKSPACE_ID],
        );
        expect(result.rows).toEqual([{ id: PRE_AUTH_WORKSPACE_ID }]);
      } finally {
        await database.close();
      }
    },
    30_000,
  );

  it(
    "backfills every existing row into the pre-auth workspace",
    async () => {
      const database = createDatabase();
      try {
        await applyMigrations(database, allMigrations.slice(0, 2));
        await database.query("INSERT INTO chats (id) VALUES ($1)", [chatA]);
        await database.query(
          `
            INSERT INTO documents (id, filename, mime_type, size_bytes, extracted_text, status)
            VALUES ($1, 'legacy.txt', 'text/plain', 4, 'text', 'ready')
          `,
          [documentA],
        );
        await database.query(
          "INSERT INTO chat_documents (chat_id, document_id) VALUES ($1, $2)",
          [chatA, documentA],
        );
        await database.query(
          `
            INSERT INTO document_chunks (id, document_id, chunk_index, content, embedding)
            VALUES ($1, $2, 0, 'text', $3::vector)
          `,
          [chunkA, documentA, zeroVector],
        );
        await database.query(
          "INSERT INTO messages (id, chat_id, role, content) VALUES ('legacy-message', $1, 'user', 'question')",
          [chatA],
        );

        await applyMigrations(database, ["003_workspace_ownership.sql"]);

        for (const table of [
          "chats",
          "documents",
          "chat_documents",
          "document_chunks",
          "messages",
        ]) {
          const result = await database.query<{ workspace_id: string }>(
            `SELECT workspace_id FROM ${table}`,
          );
          expect(result.rows).toEqual([{ workspace_id: PRE_AUTH_WORKSPACE_ID }]);
        }
      } finally {
        await database.close();
      }
    },
    30_000,
  );
});

describe("two-workspace isolation", () => {
  let database: PGlite;

  beforeAll(async () => {
    database = createDatabase();
    await applyMigrations(database, allMigrations);
    await seedOwnedGraph(database, workspaceA, "A");
    await seedOwnedGraph(database, workspaceB, "B");
  }, 30_000);

  afterAll(async () => {
    await database.close();
  });

  it("makes guessed chat and document IDs look missing in another workspace", async () => {
    const chatResult = await database.query(
      "SELECT id FROM chats WHERE workspace_id = $1 AND id = $2",
      [workspaceA, chatB],
    );
    const documentResult = await database.query(
      "SELECT id FROM documents WHERE workspace_id = $1 AND id = $2",
      [workspaceA, documentB],
    );

    expect(chatResult.rows).toEqual([]);
    expect(documentResult.rows).toEqual([]);
  });

  it("rejects cross-workspace links, messages, and chunks", async () => {
    await expect(
      database.query(
        "INSERT INTO chat_documents (workspace_id, chat_id, document_id) VALUES ($1, $2, $3)",
        [workspaceA, chatA, documentB],
      ),
    ).rejects.toMatchObject({ code: "23503" });

    await expect(
      database.query(
        `
          INSERT INTO messages (id, workspace_id, chat_id, role, content)
          VALUES ('cross-message', $1, $2, 'user', 'question')
        `,
        [workspaceA, chatB],
      ),
    ).rejects.toMatchObject({ code: "23503" });

    await expect(
      database.query(
        `
          INSERT INTO document_chunks (
            id, workspace_id, document_id, chunk_index, content, embedding
          ) VALUES ('30000000-0000-4000-8000-000000000033', $1, $2, 1, 'cross', $3::vector)
        `,
        [workspaceA, documentB, zeroVector],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("cascades one workspace without affecting the other", async () => {
    await database.query("DELETE FROM workspaces WHERE id = $1", [workspaceA]);

    for (const table of [
      "chats",
      "documents",
      "chat_documents",
      "document_chunks",
      "messages",
    ]) {
      const deleted = await database.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM ${table} WHERE workspace_id = $1`,
        [workspaceA],
      );
      const retained = await database.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM ${table} WHERE workspace_id = $1`,
        [workspaceB],
      );

      expect(deleted.rows[0]?.count).toBe(0);
      expect(retained.rows[0]?.count).toBe(1);
    }
  });
});

describe("temporary guest session isolation", () => {
  it(
    "maps each credential digest to exactly one workspace and conversation without storing raw credentials",
    async () => {
      const database = createDatabase();
      const digestA = "a".repeat(64);
      const digestB = "b".repeat(64);
      try {
        await applyMigrations(database, allMigrations);
        await seedOwnedGraph(database, workspaceA, "A");
        await seedOwnedGraph(database, workspaceB, "B");
        await database.query(
          "INSERT INTO guest_sessions (credential_digest, workspace_id, chat_id) VALUES ($1, $2, $3), ($4, $5, $6)",
          [digestA, workspaceA, chatA, digestB, workspaceB, chatB],
        );

        const sessionA = await database.query<{
          credential_digest: string;
          workspace_id: string;
          chat_id: string;
        }>(
          "SELECT credential_digest, workspace_id, chat_id FROM guest_sessions WHERE credential_digest = $1",
          [digestA],
        );
        expect(sessionA.rows).toEqual([
          { credential_digest: digestA, workspace_id: workspaceA, chat_id: chatA },
        ]);

        await expect(
          database.query(
            "INSERT INTO guest_sessions (credential_digest, workspace_id, chat_id) VALUES ($1, $2, $3)",
            ["c".repeat(64), workspaceA, chatA],
          ),
        ).rejects.toMatchObject({ code: "23505" });
        const workspaceC = "30000000-0000-4000-8000-000000000003";
        const chatC = "30000000-0000-4000-8000-000000000013";
        const workspaceD = "40000000-0000-4000-8000-000000000004";
        const chatD = "40000000-0000-4000-8000-000000000014";
        await database.query("INSERT INTO workspaces (id) VALUES ($1)", [workspaceC]);
        await database.query("INSERT INTO workspaces (id) VALUES ($1)", [workspaceD]);
        await database.query("INSERT INTO chats (id, workspace_id) VALUES ($1, $2)", [
          chatC,
          workspaceC,
        ]);
        await database.query("INSERT INTO chats (id, workspace_id) VALUES ($1, $2)", [
          chatD,
          workspaceD,
        ]);
        await expect(
          database.query(
            "INSERT INTO guest_sessions (credential_digest, workspace_id, chat_id) VALUES ($1, $2, $3)",
            ["d".repeat(64), workspaceC, chatD],
          ),
        ).rejects.toMatchObject({ code: "23503" });
      } finally {
        await database.close();
      }
    },
    30_000,
  );
});
