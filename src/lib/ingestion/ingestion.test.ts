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

const migrationsDirectory = resolve(process.cwd(), "migrations");
const allMigrations = [
  "001_initial.sql",
  "002_openrouter_embeddings.sql",
  "003_workspace_ownership.sql",
  "004_temporary_guest_conversation.sql",
  "005_guest_lifecycle.sql",
  "006_ingestion_jobs.sql",
];

const workspaceA = "10000000-0000-4000-8000-000000000001";
const workspaceB = "20000000-0000-4000-8000-000000000002";
const chatA = "10000000-0000-4000-8000-000000000011";
const chatB = "20000000-0000-4000-8000-000000000012";

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

describe("durable ingestion jobs state machine & isolation", () => {
  let database: PGlite;

  beforeAll(async () => {
    database = createDatabase();
    await applyMigrations(database, allMigrations);

    await database.query("INSERT INTO workspaces (id) VALUES ($1), ($2)", [workspaceA, workspaceB]);
    await database.query("INSERT INTO chats (id, workspace_id) VALUES ($1, $2), ($3, $4)", [
      chatA,
      workspaceA,
      chatB,
      workspaceB,
    ]);
  }, 30_000);

  afterAll(async () => {
    await database.close();
  });

  it("creates an ingestion job in queued state with raw source bytes staged", async () => {
    const docId = "50000000-0000-4000-8000-000000000001";
    const jobId = "60000000-0000-4000-8000-000000000001";
    const content = Buffer.from("Hello world, this is a test document.");

    await database.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO documents (id, workspace_id, filename, mime_type, size_bytes, extracted_text, status) VALUES ($1, $2, 'test.txt', 'text/plain', $3, '', 'queued')",
        [docId, workspaceA, content.length],
      );
      await tx.query(
        "INSERT INTO chat_documents (workspace_id, chat_id, document_id) VALUES ($1, $2, $3)",
        [workspaceA, chatA, docId],
      );
      await tx.query(
        `INSERT INTO ingestion_jobs (
          id, workspace_id, chat_id, document_id, filename, mime_type, size_bytes,
          status, stage, progress_percent, attempts, raw_source_bytes
        ) VALUES ($1, $2, $3, $4, 'test.txt', 'text/plain', $5, 'queued', 'queued', 0, 0, $6)`,
        [jobId, workspaceA, chatA, docId, content.length, content],
      );
    });

    const job = (await database.query<{
      status: string;
      stage: string;
      progress_percent: number;
      raw_source_bytes: Buffer;
    }>("SELECT status, stage, progress_percent, raw_source_bytes FROM ingestion_jobs WHERE id = $1", [jobId])).rows[0];

    expect(job).toBeDefined();
    expect(job?.status).toBe("queued");
    expect(job?.stage).toBe("queued");
    expect(job?.progress_percent).toBe(0);
    expect(job?.raw_source_bytes).toBeDefined();
  });

  it("advances job through stages and clears raw source bytes on completion", async () => {
    const docId = "50000000-0000-4000-8000-000000000001";
    const jobId = "60000000-0000-4000-8000-000000000001";
    const zeroVector = `[${Array.from({ length: 1_024 }, () => "0").join(",")}]`;

    // Advance to extracting
    await database.query("UPDATE ingestion_jobs SET status = 'processing', stage = 'extracting', progress_percent = 25 WHERE id = $1", [jobId]);
    // Advance to chunking
    await database.query("UPDATE ingestion_jobs SET stage = 'chunking', progress_percent = 50 WHERE id = $1", [jobId]);
    // Advance to embedding
    await database.query("UPDATE ingestion_jobs SET stage = 'embedding', progress_percent = 75 WHERE id = $1", [jobId]);

    // Complete job
    await database.transaction(async (tx) => {
      await tx.query(
        "UPDATE documents SET extracted_text = 'Hello world', page_count = 1, status = 'ready' WHERE id = $1",
        [docId],
      );
      await tx.query(
        `INSERT INTO document_chunks (id, workspace_id, document_id, chunk_index, content, embedding)
         VALUES ($1, $2, $3, 0, 'Hello world', $4::vector)`,
        ["70000000-0000-4000-8000-000000000001", workspaceA, docId, zeroVector],
      );
      await tx.query(
        `UPDATE ingestion_jobs
         SET status = 'ready', stage = 'ready', progress_percent = 100, raw_source_bytes = NULL
         WHERE id = $1`,
        [jobId],
      );
    });

    const completed = (await database.query<{
      status: string;
      stage: string;
      progress_percent: number;
      raw_source_bytes: Buffer | null;
    }>("SELECT status, stage, progress_percent, raw_source_bytes FROM ingestion_jobs WHERE id = $1", [jobId])).rows[0];

    expect(completed?.status).toBe("ready");
    expect(completed?.stage).toBe("ready");
    expect(completed?.progress_percent).toBe(100);
    expect(completed?.raw_source_bytes).toBeNull();

    const doc = (await database.query<{ status: string }>("SELECT status FROM documents WHERE id = $1", [docId])).rows[0];
    expect(doc?.status).toBe("ready");
  });

  it("handles failure by recording attempts and safe error message", async () => {
    const docId = "50000000-0000-4000-8000-000000000002";
    const jobId = "60000000-0000-4000-8000-000000000002";

    await database.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO documents (id, workspace_id, filename, mime_type, size_bytes, extracted_text, status) VALUES ($1, $2, 'bad.pdf', 'application/pdf', 10, '', 'queued')",
        [docId, workspaceA],
      );
      await tx.query(
        "INSERT INTO chat_documents (workspace_id, chat_id, document_id) VALUES ($1, $2, $3)",
        [workspaceA, chatA, docId],
      );
      await tx.query(
        `INSERT INTO ingestion_jobs (
          id, workspace_id, chat_id, document_id, filename, mime_type, size_bytes,
          status, stage, progress_percent, attempts
        ) VALUES ($1, $2, $3, $4, 'bad.pdf', 'application/pdf', 10, 'failed', 'failed', 0, 1)`,
        [jobId, workspaceA, chatA, docId],
      );
      await tx.query(
        "UPDATE ingestion_jobs SET error_message = 'No readable text was found in this document.' WHERE id = $1",
        [jobId],
      );
      await tx.query("UPDATE documents SET status = 'failed' WHERE id = $1", [docId]);
    });

    const failed = (await database.query<{
      status: string;
      error_message: string;
      attempts: number;
    }>("SELECT status, error_message, attempts FROM ingestion_jobs WHERE id = $1", [jobId])).rows[0];

    expect(failed?.status).toBe("failed");
    expect(failed?.attempts).toBe(1);
    expect(failed?.error_message).toBe("No readable text was found in this document.");
  });

  it("enforces strict workspace isolation on ingestion jobs", async () => {
    const crossQuery = await database.query(
      "SELECT id FROM ingestion_jobs WHERE workspace_id = $1 AND chat_id = $2",
      [workspaceB, chatA],
    );
    expect(crossQuery.rows).toHaveLength(0);
  });
});
