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

describe("full release verification matrix (Ticket #9)", () => {
  let database: PGlite;
  const guestRaw = "1".repeat(64);
  const guestDigest = digestGuestCredential(guestRaw);

  const guestWorkspace = "10000000-0000-4000-8000-000000000001";
  const guestChat = "10000000-0000-4000-8000-000000000011";
  const guestDoc = "10000000-0000-4000-8000-000000000021";

  const memberAWorkspace = "20000000-0000-4000-8000-000000000002";
  const memberAChat = "20000000-0000-4000-8000-000000000012";
  const memberBWorkspace = "30000000-0000-4000-8000-000000000003";
  const memberBChat = "30000000-0000-4000-8000-000000000013";

  beforeAll(async () => {
    database = createDatabase();
    await applyMigrations(database, allMigrations);

    await database.transaction(async (tx) => {
      // 1. Setup Guest
      await tx.query("INSERT INTO workspaces (id) VALUES ($1)", [guestWorkspace]);
      await tx.query("INSERT INTO chats (id, workspace_id, title) VALUES ($1, $2, 'Guest Chat')", [
        guestChat,
        guestWorkspace,
      ]);
      await tx.query("INSERT INTO guest_sessions (credential_digest, workspace_id, chat_id) VALUES ($1, $2, $3)", [
        guestDigest,
        guestWorkspace,
        guestChat,
      ]);
      await tx.query(
        "INSERT INTO documents (id, workspace_id, filename, mime_type, size_bytes, extracted_text, status) VALUES ($1, $2, 'guest.txt', 'text/plain', 50, 'guest text', 'ready')",
        [guestDoc, guestWorkspace],
      );
      await tx.query("INSERT INTO chat_documents (workspace_id, chat_id, document_id) VALUES ($1, $2, $3)", [
        guestWorkspace,
        guestChat,
        guestDoc,
      ]);

      // 2. Setup Member A
      await tx.query("INSERT INTO workspaces (id) VALUES ($1)", [memberAWorkspace]);
      await tx.query(
        "INSERT INTO member_accounts (id, provider_subject, email, workspace_id) VALUES ('10000000-0000-4000-8000-000000000031', 'sub-a', 'a@domain.com', $1)",
        [memberAWorkspace],
      );
      await tx.query("INSERT INTO chats (id, workspace_id, title) VALUES ($1, $2, 'Member A Chat')", [
        memberAChat,
        memberAWorkspace,
      ]);

      // 3. Setup Member B
      await tx.query("INSERT INTO workspaces (id) VALUES ($1)", [memberBWorkspace]);
      await tx.query(
        "INSERT INTO member_accounts (id, provider_subject, email, workspace_id) VALUES ('20000000-0000-4000-8000-000000000032', 'sub-b', 'b@domain.com', $1)",
        [memberBWorkspace],
      );
      await tx.query("INSERT INTO chats (id, workspace_id, title) VALUES ($1, $2, 'Member B Chat')", [
        memberBChat,
        memberBWorkspace,
      ]);
    });
  }, 30_000);

  afterAll(async () => {
    await database.close();
  });

  it("verifies strict data isolation across one guest and two independent members", async () => {
    const guestChats = await database.query<{ id: string }>("SELECT id FROM chats WHERE workspace_id = $1", [guestWorkspace]);
    const memberAChats = await database.query<{ id: string }>("SELECT id FROM chats WHERE workspace_id = $1", [memberAWorkspace]);
    const memberBChats = await database.query<{ id: string }>("SELECT id FROM chats WHERE workspace_id = $1", [memberBWorkspace]);

    expect(guestChats.rows).toHaveLength(1);
    expect(memberAChats.rows).toHaveLength(1);
    expect(memberBChats.rows).toHaveLength(1);

    expect(guestChats.rows[0]?.id).toBe(guestChat);
    expect(memberAChats.rows[0]?.id).toBe(memberAChat);
    expect(memberBChats.rows[0]?.id).toBe(memberBChat);
  });

  it("claims guest conversation into member A and validates zero leakage to member B", async () => {
    await database.transaction(async (tx) => {
      await tx.query("UPDATE chats SET workspace_id = $1 WHERE workspace_id = $2 AND id = $3", [
        memberAWorkspace,
        guestWorkspace,
        guestChat,
      ]);
      await tx.query("UPDATE documents SET workspace_id = $1 WHERE workspace_id = $2 AND id = $3", [
        memberAWorkspace,
        guestWorkspace,
        guestDoc,
      ]);
      await tx.query("UPDATE chat_documents SET workspace_id = $1 WHERE workspace_id = $2 AND chat_id = $3", [
        memberAWorkspace,
        guestWorkspace,
        guestChat,
      ]);
      await tx.query("DELETE FROM guest_sessions WHERE credential_digest = $1", [guestDigest]);
      await tx.query("DELETE FROM workspaces WHERE id = $1", [guestWorkspace]);
    });

    // Member A now has 2 chats
    const memberAChats = await database.query<{ id: string }>("SELECT id FROM chats WHERE workspace_id = $1", [memberAWorkspace]);
    expect(memberAChats.rows).toHaveLength(2);

    // Member B still has exactly 1 chat
    const memberBChats = await database.query<{ id: string }>("SELECT id FROM chats WHERE workspace_id = $1", [memberBWorkspace]);
    expect(memberBChats.rows).toHaveLength(1);
    expect(memberBChats.rows[0]?.id).toBe(memberBChat);

    // Guest workspace is completely removed
    const oldGuest = await database.query("SELECT 1 FROM workspaces WHERE id = $1", [guestWorkspace]);
    expect(oldGuest.rows).toHaveLength(0);
  });
});
