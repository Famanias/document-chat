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

import { assertSameOrigin } from "@/lib/security/origin";
import { redactSensitiveData } from "@/lib/security/redaction";
import { AppError } from "@/lib/api-errors";

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

describe("origin and cross-site request validation", () => {
  it("allows safe same-origin GET and POST requests", () => {
    const getReq = new Request("https://example.com/api/chats", { method: "GET" });
    expect(() => assertSameOrigin(getReq)).not.toThrow();

    const postReq = new Request("https://example.com/api/chats", {
      method: "POST",
      headers: {
        origin: "https://example.com",
        host: "example.com",
      },
    });
    expect(() => assertSameOrigin(postReq)).not.toThrow();
  });

  it("blocks cross-site mutations with Sec-Fetch-Site: cross-site", () => {
    const postReq = new Request("https://example.com/api/chats", {
      method: "POST",
      headers: {
        "sec-fetch-site": "cross-site",
      },
    });
    expect(() => assertSameOrigin(postReq)).toThrowError(AppError);
  });

  it("blocks requests with mismatched origin and host headers", () => {
    const postReq = new Request("https://example.com/api/chats", {
      method: "POST",
      headers: {
        origin: "https://evil.com",
        host: "example.com",
      },
    });
    expect(() => assertSameOrigin(postReq)).toThrowError(AppError);
  });
});

describe("structured logging sensitive data redaction", () => {
  it("redacts credentials, passwords, tokens, and raw document contents", () => {
    const sensitive = {
      email: "user@example.com",
      password: "supersecretpassword",
      sessionToken: "abc.123.xyz",
      credentialDigest: "deadbeef",
      extractedText: "Confidential document text here...",
      normalField: "visible",
    };

    const redacted = redactSensitiveData(sensitive);

    expect(redacted.email).toBe("user@example.com");
    expect(redacted.password).toBe("[REDACTED]");
    expect(redacted.sessionToken).toBe("[REDACTED]");
    expect(redacted.credentialDigest).toBe("[REDACTED]");
    expect(redacted.extractedText).toBe("[CONTENT_LENGTH_34]");
    expect(redacted.normalField).toBe("visible");
  });
});

describe("database rate limiter buckets", () => {
  let database: PGlite;

  beforeAll(async () => {
    database = createDatabase();
    await applyMigrations(database, allMigrations);
  }, 30_000);

  afterAll(async () => {
    await database.close();
  });

  it("tracks rate limit count per key in rate_limit_buckets table", async () => {
    const key = "ip:127.0.0.1:chat";
    await database.query(
      `
        INSERT INTO rate_limit_buckets (key, count, reset_at)
        VALUES ($1, 1, NOW() + INTERVAL '60 seconds')
      `,
      [key],
    );

    const row = (await database.query<{ count: number }>(
      "SELECT count FROM rate_limit_buckets WHERE key = $1",
      [key],
    )).rows[0];

    expect(row?.count).toBe(1);
  });
});
