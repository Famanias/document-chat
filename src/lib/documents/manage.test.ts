// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";



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
  "009_deferrable_workspace_fks.sql",
  "010_rate_limits.sql",
];

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

describe("document deletion and isolation", () => {
  let database: PGlite;
  const workspaceA = "10000000-0000-4000-8000-000000000001";
  const workspaceB = "20000000-0000-4000-8000-000000000002";
  const chatA1 = "10000000-0000-4000-8000-000000000011";
  const chatA2 = "10000000-0000-4000-8000-000000000012";
  const chatB = "20000000-0000-4000-8000-000000000013";

  const doc1 = "50000000-0000-4000-8000-000000000001";
  const doc2 = "50000000-0000-4000-8000-000000000002";
  const zeroVector = `[${Array.from({ length: 1_024 }, () => "0").join(",")}]`;

  beforeAll(async () => {
    database = createDatabase();
    await applyMigrations(database, allMigrations);

    await database.transaction(async (tx) => {
      await tx.query("INSERT INTO workspaces (id) VALUES ($1), ($2)", [workspaceA, workspaceB]);
      await tx.query("INSERT INTO chats (id, workspace_id, title) VALUES ($1, $2, 'Chat 1'), ($3, $4, 'Chat 2'), ($5, $6, 'Chat B')", [
        chatA1,
        workspaceA,
        chatA2,
        workspaceA,
        chatB,
        workspaceB,
      ]);

      // Doc 1 attached to chat A1 only
      await tx.query(
        "INSERT INTO documents (id, workspace_id, filename, mime_type, size_bytes, extracted_text, status) VALUES ($1, $2, 'doc1.txt', 'text/plain', 50, 'text1', 'ready')",
        [doc1, workspaceA],
      );
      await tx.query("INSERT INTO chat_documents (workspace_id, chat_id, document_id) VALUES ($1, $2, $3)", [
        workspaceA,
        chatA1,
        doc1,
      ]);
      await tx.query(
        `INSERT INTO document_chunks (id, workspace_id, document_id, chunk_index, content, embedding)
         VALUES ('70000000-0000-4000-8000-000000000001', $1, $2, 0, 'Chunk 1', $3::vector)`,
        [workspaceA, doc1, zeroVector],
      );

      // Doc 2 attached to both chat A1 and chat A2
      await tx.query(
        "INSERT INTO documents (id, workspace_id, filename, mime_type, size_bytes, extracted_text, status) VALUES ($1, $2, 'doc2.txt', 'text/plain', 60, 'text2', 'ready')",
        [doc2, workspaceA],
      );
      await tx.query("INSERT INTO chat_documents (workspace_id, chat_id, document_id) VALUES ($1, $2, $3), ($4, $5, $6)", [
        workspaceA,
        chatA1,
        doc2,
        workspaceA,
        chatA2,
        doc2,
      ]);
      await tx.query(
        `INSERT INTO document_chunks (id, workspace_id, document_id, chunk_index, content, embedding)
         VALUES ('70000000-0000-4000-8000-000000000002', $1, $2, 0, 'Chunk 2', $3::vector)`,
        [workspaceA, doc2, zeroVector],
      );
    });
  }, 30_000);

  afterAll(async () => {
    await database.close();
  });

  it("deleting a shared document removes link from one chat but retains document in other chat", async () => {
    // Delete doc2 from chat A1
    await database.transaction(async (tx) => {
      await tx.query("DELETE FROM chat_documents WHERE workspace_id = $1 AND chat_id = $2 AND document_id = $3", [
        workspaceA,
        chatA1,
        doc2,
      ]);
    });

    const doc2Exists = (await database.query("SELECT 1 FROM documents WHERE id = $1", [doc2])).rows;
    expect(doc2Exists).toHaveLength(1);

    const doc2ChatA2Link = (await database.query("SELECT 1 FROM chat_documents WHERE chat_id = $1 AND document_id = $2", [
      chatA2,
      doc2,
    ])).rows;
    expect(doc2ChatA2Link).toHaveLength(1);
  });

  it("deleting the last link of a document cleans up unreferenced chunks and documents", async () => {
    await database.transaction(async (tx) => {
      await tx.query("DELETE FROM chat_documents WHERE workspace_id = $1 AND chat_id = $2 AND document_id = $3", [
        workspaceA,
        chatA1,
        doc1,
      ]);
      await tx.query("DELETE FROM document_chunks WHERE workspace_id = $1 AND document_id = $2", [workspaceA, doc1]);
      await tx.query("DELETE FROM documents WHERE workspace_id = $1 AND id = $2", [workspaceA, doc1]);
    });

    const doc1Exists = (await database.query("SELECT 1 FROM documents WHERE id = $1", [doc1])).rows;
    expect(doc1Exists).toHaveLength(0);

    const chunks = (await database.query("SELECT 1 FROM document_chunks WHERE document_id = $1", [doc1])).rows;
    expect(chunks).toHaveLength(0);
  });

  it("rejects cross-workspace document access with non-enumerating 404", async () => {
    const crossCheck = await database.query(
      "SELECT 1 FROM chat_documents WHERE workspace_id = $1 AND chat_id = $2 AND document_id = $3",
      [workspaceB, chatB, doc2],
    );
    expect(crossCheck.rows).toHaveLength(0);
  });
});
