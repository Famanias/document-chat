/**
 * document-chat
 * Copyright (C) 2026 Famanias
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { digestGuestCredential } from "@/lib/workspaces/guest-session";

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

describe("guest conversation claim transaction & concurrency", () => {
  let database: PGlite;
  const rawCredential = "a".repeat(64);
  const digest = digestGuestCredential(rawCredential);

  const guestWorkspaceId = "10000000-0000-4000-8000-000000000001";
  const guestChatId = "10000000-0000-4000-8000-000000000011";
  const guestDocId = "10000000-0000-4000-8000-000000000021";
  const guestChunkId = "10000000-0000-4000-8000-000000000031";

  const memberWorkspaceId = "20000000-0000-4000-8000-000000000002";
  const memberAccountId = "20000000-0000-4000-8000-000000000012";
  const zeroVector = `[${Array.from({ length: 1_024 }, () => "0").join(",")}]`;

  beforeAll(async () => {
    database = createDatabase();
    await applyMigrations(database, allMigrations);

    // Setup guest workspace with a document and message
    await database.transaction(async (tx) => {
      await tx.query("INSERT INTO workspaces (id) VALUES ($1), ($2)", [guestWorkspaceId, memberWorkspaceId]);
      await tx.query(
        "INSERT INTO member_accounts (id, provider_subject, email, workspace_id) VALUES ($1, 'sub-member', 'member@test.com', $2)",
        [memberAccountId, memberWorkspaceId],
      );
      await tx.query(
        "INSERT INTO chats (id, workspace_id, title) VALUES ($1, $2, 'Guest chat about AI')",
        [guestChatId, guestWorkspaceId],
      );
      await tx.query(
        "INSERT INTO guest_sessions (credential_digest, workspace_id, chat_id) VALUES ($1, $2, $3)",
        [digest, guestWorkspaceId, guestChatId],
      );
      await tx.query(
        "INSERT INTO documents (id, workspace_id, filename, mime_type, size_bytes, extracted_text, status) VALUES ($1, $2, 'guest.txt', 'text/plain', 50, 'text', 'ready')",
        [guestDocId, guestWorkspaceId],
      );
      await tx.query(
        "INSERT INTO chat_documents (workspace_id, chat_id, document_id) VALUES ($1, $2, $3)",
        [guestWorkspaceId, guestChatId, guestDocId],
      );
      await tx.query(
        `INSERT INTO document_chunks (id, workspace_id, document_id, chunk_index, content, embedding)
         VALUES ($1, $2, $3, 0, 'Guest chunk content', $4::vector)`,
        [guestChunkId, guestWorkspaceId, guestDocId, zeroVector],
      );
      await tx.query(
        `INSERT INTO messages (id, workspace_id, chat_id, role, content, structured_data)
         VALUES ('msg-1', $1, $2, 'user', 'What is AI?', '{}'::jsonb)`,
        [guestWorkspaceId, guestChatId],
      );
    });
  }, 30_000);

  afterAll(async () => {
    await database.close();
  });

  it("claims the complete conversation graph into the member workspace atomically", async () => {
    await database.transaction(async (tx) => {
      // 1. Lock guest session
      const session = (await tx.query<{ workspace_id: string; chat_id: string }>(
        "SELECT workspace_id, chat_id FROM guest_sessions WHERE credential_digest = $1 FOR UPDATE",
        [digest],
      )).rows[0];

      expect(session).toBeDefined();

      // 2. Transfer chat
      await tx.query("UPDATE chats SET workspace_id = $1 WHERE workspace_id = $2 AND id = $3", [
        memberWorkspaceId,
        guestWorkspaceId,
        guestChatId,
      ]);
      // 3. Transfer chunks
      await tx.query(
        "UPDATE document_chunks SET workspace_id = $1 WHERE workspace_id = $2 AND document_id = $3",
        [memberWorkspaceId, guestWorkspaceId, guestDocId],
      );
      // 4. Transfer docs
      await tx.query(
        "UPDATE documents SET workspace_id = $1 WHERE workspace_id = $2 AND id = $3",
        [memberWorkspaceId, guestWorkspaceId, guestDocId],
      );
      // 5. Transfer chat_documents
      await tx.query(
        "UPDATE chat_documents SET workspace_id = $1 WHERE workspace_id = $2 AND chat_id = $3",
        [memberWorkspaceId, guestWorkspaceId, guestChatId],
      );
      // 6. Transfer messages
      await tx.query(
        "UPDATE messages SET workspace_id = $1 WHERE workspace_id = $2 AND chat_id = $3",
        [memberWorkspaceId, guestWorkspaceId, guestChatId],
      );
      // 7. Delete old guest session & old workspace
      await tx.query("DELETE FROM guest_sessions WHERE credential_digest = $1", [digest]);
      await tx.query("DELETE FROM workspaces WHERE id = $1", [guestWorkspaceId]);
    });

    // Verification
    const chat = (await database.query<{ workspace_id: string; title: string }>(
      "SELECT workspace_id, title FROM chats WHERE id = $1",
      [guestChatId],
    )).rows[0];
    expect(chat?.workspace_id).toBe(memberWorkspaceId);
    expect(chat?.title).toBe("Guest chat about AI");

    const doc = (await database.query<{ workspace_id: string }>(
      "SELECT workspace_id FROM documents WHERE id = $1",
      [guestDocId],
    )).rows[0];
    expect(doc?.workspace_id).toBe(memberWorkspaceId);

    const chunk = (await database.query<{ workspace_id: string }>(
      "SELECT workspace_id FROM document_chunks WHERE id = $1",
      [guestChunkId],
    )).rows[0];
    expect(chunk?.workspace_id).toBe(memberWorkspaceId);

    const msg = (await database.query<{ workspace_id: string }>(
      "SELECT workspace_id FROM messages WHERE id = 'msg-1'",
    )).rows[0];
    expect(msg?.workspace_id).toBe(memberWorkspaceId);

    // Old guest session and workspace are gone
    const sessionCheck = await database.query("SELECT 1 FROM guest_sessions WHERE credential_digest = $1", [digest]);
    expect(sessionCheck.rows).toHaveLength(0);

    const workspaceCheck = await database.query("SELECT 1 FROM workspaces WHERE id = $1", [guestWorkspaceId]);
    expect(workspaceCheck.rows).toHaveLength(0);
  });
});
