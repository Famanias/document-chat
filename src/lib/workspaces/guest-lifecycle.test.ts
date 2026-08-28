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

import { PRE_AUTH_WORKSPACE_ID } from "@/lib/workspaces/context";
import {
  GUEST_INACTIVITY_LIMIT_MS,
  type GuestSessionRepository,
} from "@/lib/workspaces/guest-session";

const migrationsDirectory = resolve(process.cwd(), "migrations");
const allMigrations = [
  "001_initial.sql",
  "002_openrouter_embeddings.sql",
  "003_workspace_ownership.sql",
  "004_temporary_guest_conversation.sql",
  "005_guest_lifecycle.sql",
];

const digestA = "a".repeat(64);
const digestB = "b".repeat(64);

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

function pgliteGuestRepository(database: PGlite): GuestSessionRepository {
  return {
    async findByDigest(credentialDigest, now = new Date()) {
      const rows = (await database.query<{ workspace_id: string; chat_id: string }>(
        `
          SELECT guest_sessions.workspace_id, guest_sessions.chat_id
          FROM guest_sessions
          INNER JOIN workspaces ON workspaces.id = guest_sessions.workspace_id
          INNER JOIN chats
            ON chats.workspace_id = guest_sessions.workspace_id
            AND chats.id = guest_sessions.chat_id
          WHERE guest_sessions.credential_digest = $1
            AND guest_sessions.expires_at > $2
          LIMIT 1
        `,
        [credentialDigest, now.toISOString()],
      )).rows;
      const row = rows[0];
      return row
        ? Object.freeze({ workspaceId: row.workspace_id, conversationId: row.chat_id })
        : null;
    },

    async touchActivity(credentialDigest, now = new Date()) {
      const expiresAt = new Date(now.getTime() + GUEST_INACTIVITY_LIMIT_MS);
      await database.query(
        `
          UPDATE guest_sessions
          SET last_active_at = $2,
              expires_at = $3
          WHERE credential_digest = $1
        `,
        [credentialDigest, now.toISOString(), expiresAt.toISOString()],
      );
    },

    async create(credentialDigest, now = new Date()) {
      const workspaceId = crypto.randomUUID();
      const conversationId = crypto.randomUUID();
      const expiresAt = new Date(now.getTime() + GUEST_INACTIVITY_LIMIT_MS);

      await database.transaction(async (tx) => {
        await tx.query("INSERT INTO workspaces (id) VALUES ($1)", [workspaceId]);
        await tx.query("INSERT INTO chats (id, workspace_id) VALUES ($1, $2)", [conversationId, workspaceId]);
        await tx.query(
          `
            INSERT INTO guest_sessions (credential_digest, workspace_id, chat_id, last_active_at, expires_at)
            VALUES ($1, $2, $3, $4, $5)
          `,
          [credentialDigest, workspaceId, conversationId, now.toISOString(), expiresAt.toISOString()],
        );
      });

      return Object.freeze({ workspaceId, conversationId });
    },

    async deleteByDigest(credentialDigest) {
      await database.query(
        `
          DELETE FROM workspaces
          WHERE id IN (
            SELECT workspace_id FROM guest_sessions WHERE credential_digest = $1
          )
        `,
        [credentialDigest],
      );
    },

    async deleteByWorkspaceId(workspaceId) {
      await database.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    },

    async cleanupExpired(batchSize = 50, now = new Date()) {
      const rows = (await database.query<{ id: string }>(
        `
          WITH expired AS (
            SELECT workspace_id
            FROM guest_sessions
            WHERE expires_at <= $1
            LIMIT $2
          )
          DELETE FROM workspaces
          WHERE id IN (SELECT workspace_id FROM expired)
          RETURNING id
        `,
        [now.toISOString(), batchSize],
      )).rows;

      return { deletedCount: rows.length };
    },
  };
}

describe("guest session lifecycle & expiration", () => {
  let database: PGlite;
  let repo: GuestSessionRepository;

  beforeAll(async () => {
    database = createDatabase();
    await applyMigrations(database, allMigrations);
    repo = pgliteGuestRepository(database);
  }, 30_000);

  afterAll(async () => {
    await database.close();
  });

  it("creates a guest session with 1-hour expiration timestamp", async () => {
    const t0 = new Date("2026-08-28T10:00:00Z");
    const workspace = await repo.create(digestA, t0);

    const session = (await database.query<{
      workspace_id: string;
      chat_id: string;
      last_active_at: string;
      expires_at: string;
    }>("SELECT * FROM guest_sessions WHERE credential_digest = $1", [digestA])).rows[0];

    expect(session).toBeDefined();
    expect(session?.workspace_id).toBe(workspace.workspaceId);
    expect(new Date(session!.expires_at).getTime()).toBe(t0.getTime() + GUEST_INACTIVITY_LIMIT_MS);
  });

  it("finds active session and extends expiration on activity touch", async () => {
    const t30m = new Date("2026-08-28T10:30:00Z");

    const active = await repo.findByDigest(digestA, t30m);
    expect(active).not.toBeNull();

    await repo.touchActivity(digestA, t30m);

    const session = (await database.query<{ expires_at: string }>(
      "SELECT expires_at FROM guest_sessions WHERE credential_digest = $1",
      [digestA],
    )).rows[0];

    expect(new Date(session!.expires_at).getTime()).toBe(t30m.getTime() + GUEST_INACTIVITY_LIMIT_MS);
  });

  it("returns null when looking up an expired session", async () => {
    const t2h = new Date("2026-08-28T12:30:00Z"); // > 1h after last activity
    const active = await repo.findByDigest(digestA, t2h);
    expect(active).toBeNull();
  });

  it("deletes a guest workspace and cascades all its data on explicit deletion", async () => {
    const t0 = new Date("2026-08-28T10:00:00Z");
    const ws = await repo.create(digestB, t0);

    await database.query(
      "INSERT INTO documents (id, workspace_id, filename, mime_type, size_bytes, extracted_text, status) VALUES ($1, $2, 'test.txt', 'text/plain', 4, 'data', 'ready')",
      ["50000000-0000-4000-8000-000000000001", ws.workspaceId],
    );

    await repo.deleteByDigest(digestB);

    const wsRows = (await database.query("SELECT id FROM workspaces WHERE id = $1", [ws.workspaceId])).rows;
    const docRows = (await database.query("SELECT id FROM documents WHERE workspace_id = $1", [ws.workspaceId])).rows;
    const sessionRows = (await database.query("SELECT credential_digest FROM guest_sessions WHERE credential_digest = $1", [digestB])).rows;

    expect(wsRows).toHaveLength(0);
    expect(docRows).toHaveLength(0);
    expect(sessionRows).toHaveLength(0);
  });

  it("scheduled cleanup removes expired guest workspaces while preserving active sessions and member workspaces", async () => {
    const t0 = new Date("2026-08-28T08:00:00Z");
    const digestExpired = "e".repeat(64);
    const digestActive = "f".repeat(64);

    const expiredWs = await repo.create(digestExpired, t0);
    const activeWs = await repo.create(digestActive, new Date("2026-08-28T11:30:00Z"));

    const now = new Date("2026-08-28T12:00:00Z");
    const cleanupResult = await repo.cleanupExpired(50, now);

    expect(cleanupResult.deletedCount).toBeGreaterThanOrEqual(1);

    // Expired workspace is deleted
    const expiredCheck = (await database.query("SELECT id FROM workspaces WHERE id = $1", [expiredWs.workspaceId])).rows;
    expect(expiredCheck).toHaveLength(0);

    // Active guest workspace is preserved
    const activeCheck = (await database.query("SELECT id FROM workspaces WHERE id = $1", [activeWs.workspaceId])).rows;
    expect(activeCheck).toHaveLength(1);

    // Pre-auth / member workspace is immune and preserved
    const preAuthCheck = (await database.query("SELECT id FROM workspaces WHERE id = $1", [PRE_AUTH_WORKSPACE_ID])).rows;
    expect(preAuthCheck).toHaveLength(1);
  });
});
