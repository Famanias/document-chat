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

import {
  signMemberSession,
  verifyMemberSessionToken,
} from "@/lib/auth/session";

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

describe("member authentication & session tokens", () => {
  const session = {
    userId: "user-123",
    email: "test@example.com",
    workspaceId: "10000000-0000-4000-8000-000000000001",
  };

  it("signs and verifies a valid member session token", () => {
    const token = signMemberSession(session);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(2);

    const verified = verifyMemberSessionToken(token);
    expect(verified).toEqual(session);
  });

  it("rejects a forged or tampered session token", () => {
    const token = signMemberSession(session);
    const [payload] = token.split(".");
    const tampered = `${payload}.invalid_signature`;

    const verified = verifyMemberSessionToken(tampered);
    expect(verified).toBeNull();
  });
});

describe("member workspace isolation in database", () => {
  let database: PGlite;
  const memberAId = "10000000-0000-4000-8000-000000000001";
  const memberBId = "20000000-0000-4000-8000-000000000002";
  const workspaceA = "10000000-0000-4000-8000-000000000011";
  const workspaceB = "20000000-0000-4000-8000-000000000012";

  const chatA = "10000000-0000-4000-8000-000000000021";
  const chatB = "20000000-0000-4000-8000-000000000022";

  beforeAll(async () => {
    database = createDatabase();
    await applyMigrations(database, allMigrations);

    await database.transaction(async (tx) => {
      await tx.query("INSERT INTO workspaces (id) VALUES ($1), ($2)", [workspaceA, workspaceB]);
      await tx.query(
        "INSERT INTO member_accounts (id, provider_subject, email, workspace_id) VALUES ($1, 'sub-a', 'a@test.com', $2), ($3, 'sub-b', 'b@test.com', $4)",
        [memberAId, workspaceA, memberBId, workspaceB],
      );
      await tx.query(
        "INSERT INTO chats (id, workspace_id, title) VALUES ($1, $2, 'Chat A'), ($3, $4, 'Chat B')",
        [chatA, workspaceA, chatB, workspaceB],
      );
    });
  }, 30_000);

  afterAll(async () => {
    await database.close();
  });

  it("ensures members see only their own conversations", async () => {
    const chatsA = await database.query<{ id: string; title: string }>(
      "SELECT id, title FROM chats WHERE workspace_id = $1",
      [workspaceA],
    );
    const chatsB = await database.query<{ id: string; title: string }>(
      "SELECT id, title FROM chats WHERE workspace_id = $1",
      [workspaceB],
    );

    expect(chatsA.rows).toEqual([{ id: chatA, title: "Chat A" }]);
    expect(chatsB.rows).toEqual([{ id: chatB, title: "Chat B" }]);
  });

  it("prevents duplicate provider subjects via uniqueness constraint", async () => {
    await expect(
      database.query(
        "INSERT INTO member_accounts (id, provider_subject, email, workspace_id) VALUES ('30000000-0000-4000-8000-000000000003', 'sub-a', 'a2@test.com', '30000000-0000-4000-8000-000000000013')",
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
