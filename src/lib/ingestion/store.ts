import "server-only";

import { randomUUID } from "node:crypto";

import { AppError } from "@/lib/api-errors";
import { db } from "@/lib/db";
import type { DocumentChunk, ParsedDocument } from "@/lib/documents/types";
import type { CreateJobInput, IngestionJob, IngestionStage } from "@/lib/ingestion/types";
import type { WorkspaceContext } from "@/lib/workspaces/context";

type JobRow = {
  id: string;
  workspace_id: string;
  chat_id: string;
  document_id: string;
  filename: string;
  mime_type: string;
  size_bytes: string | number;
  status: string;
  stage: string;
  progress_percent: number;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

function mapJobRow(row: JobRow): IngestionJob {
  return Object.freeze({
    id: row.id,
    workspaceId: row.workspace_id,
    chatId: row.chat_id,
    documentId: row.document_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: typeof row.size_bytes === "string" ? Number.parseInt(row.size_bytes, 10) : row.size_bytes,
    status: row.status as IngestionJob["status"],
    stage: row.stage as IngestionStage,
    progressPercent: row.progress_percent,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function createIngestionJob(
  workspace: WorkspaceContext,
  input: CreateJobInput,
): Promise<IngestionJob> {
  const sql = db();
  const documentId = randomUUID();
  const jobId = randomUUID();

  const chatExists = (await sql.query(
    "SELECT 1 FROM chats WHERE workspace_id = $1 AND id = $2 LIMIT 1",
    [workspace.workspaceId, input.chatId],
  )) as unknown as Record<string, unknown>[];
  if (chatExists.length === 0) {
    throw new AppError(404, "That conversation no longer exists.");
  }

  await sql.transaction((transaction) => [
    transaction`
      INSERT INTO documents (
        id, workspace_id, filename, mime_type, size_bytes, extracted_text, status
      ) VALUES (
        ${documentId}, ${workspace.workspaceId}, ${input.filename}, ${input.mimeType}, ${input.sizeBytes},
        '', 'queued'
      )
    `,
    transaction`
      INSERT INTO chat_documents (workspace_id, chat_id, document_id)
      VALUES (${workspace.workspaceId}, ${input.chatId}, ${documentId})
    `,
    transaction`
      INSERT INTO ingestion_jobs (
        id, workspace_id, chat_id, document_id, filename, mime_type, size_bytes,
        status, stage, progress_percent, attempts, max_attempts, raw_source_bytes
      ) VALUES (
        ${jobId}, ${workspace.workspaceId}, ${input.chatId}, ${documentId}, ${input.filename},
        ${input.mimeType}, ${input.sizeBytes}, 'queued', 'queued', 0, 0, 3, ${input.buffer}
      )
    `,
  ]);

  const job = await getJob(workspace, jobId);
  if (!job) throw new Error("Failed to load newly created ingestion job.");
  return job;
}

export async function getJob(
  workspace: WorkspaceContext,
  jobId: string,
): Promise<IngestionJob | null> {
  const rows = (await db().query(
    `
      SELECT id, workspace_id, chat_id, document_id, filename, mime_type, size_bytes,
             status, stage, progress_percent, attempts, max_attempts, error_message,
             created_at, updated_at
      FROM ingestion_jobs
      WHERE workspace_id = $1 AND id = $2
      LIMIT 1
    `,
    [workspace.workspaceId, jobId],
  )) as unknown as JobRow[];

  const row = rows[0];
  return row ? mapJobRow(row) : null;
}

export async function getJobByDocumentId(
  workspace: WorkspaceContext,
  documentId: string,
): Promise<IngestionJob | null> {
  const rows = (await db().query(
    `
      SELECT id, workspace_id, chat_id, document_id, filename, mime_type, size_bytes,
             status, stage, progress_percent, attempts, max_attempts, error_message,
             created_at, updated_at
      FROM ingestion_jobs
      WHERE workspace_id = $1 AND document_id = $2
      LIMIT 1
    `,
    [workspace.workspaceId, documentId],
  )) as unknown as JobRow[];

  const row = rows[0];
  return row ? mapJobRow(row) : null;
}

export async function getRawSourceBytes(jobId: string): Promise<Buffer | null> {
  const rows = (await db().query(
    "SELECT raw_source_bytes FROM ingestion_jobs WHERE id = $1 LIMIT 1",
    [jobId],
  )) as unknown as { raw_source_bytes: Buffer | null }[];

  const row = rows[0];
  return row?.raw_source_bytes ?? null;
}

export async function claimJob(
  jobId: string,
  workerId: string,
  leaseDurationMs = 60_000,
): Promise<boolean> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

  const result = (await db().query(
    `
      UPDATE ingestion_jobs
      SET status = 'processing',
          lease_owner = $2,
          lease_expires_at = $3,
          updated_at = NOW()
      WHERE id = $1
        AND (status = 'queued' OR (status = 'processing' AND lease_expires_at <= $4))
      RETURNING id
    `,
    [jobId, workerId, leaseExpiresAt.toISOString(), now.toISOString()],
  )) as unknown as { id: string }[];

  return result.length > 0;
}

export async function updateJobProgress(
  jobId: string,
  stage: IngestionStage,
  progressPercent: number,
): Promise<void> {
  await db().query(
    `
      UPDATE ingestion_jobs
      SET stage = $2,
          progress_percent = $3,
          status = 'processing',
          updated_at = NOW()
      WHERE id = $1
    `,
    [jobId, stage, progressPercent],
  );
}

type CompleteJobInput = {
  parsed: ParsedDocument;
  chunks: DocumentChunk[];
  embeddings: number[][];
};

export async function completeJob(
  jobId: string,
  input: CompleteJobInput,
): Promise<void> {
  const sql = db();
  const jobRows = (await sql.query(
    "SELECT workspace_id, chat_id, document_id FROM ingestion_jobs WHERE id = $1 LIMIT 1",
    [jobId],
  )) as unknown as { workspace_id: string; chat_id: string; document_id: string }[];

  const job = jobRows[0];
  if (!job) throw new Error("Job not found during completion.");

  await sql.transaction((transaction) => [
    transaction`
      DELETE FROM document_chunks
      WHERE workspace_id = ${job.workspace_id} AND document_id = ${job.document_id}
    `,
    transaction`
      UPDATE documents
      SET extracted_text = ${input.parsed.extractedText},
          page_count = ${input.parsed.pageCount},
          status = 'ready'
      WHERE workspace_id = ${job.workspace_id} AND id = ${job.document_id}
    `,
    ...input.chunks.map((chunk, index) =>
      transaction`
        INSERT INTO document_chunks (
          id, workspace_id, document_id, chunk_index, content, page_number, section, embedding
        ) VALUES (
          ${randomUUID()}, ${job.workspace_id}, ${job.document_id}, ${chunk.chunkIndex}, ${chunk.content},
          ${chunk.pageNumber}, ${chunk.section}, ${JSON.stringify(input.embeddings[index])}::vector
        )
      `,
    ),
    transaction`
      UPDATE ingestion_jobs
      SET status = 'ready',
          stage = 'ready',
          progress_percent = 100,
          raw_source_bytes = NULL,
          lease_owner = NULL,
          lease_expires_at = NULL,
          updated_at = NOW()
      WHERE id = ${jobId}
    `,
    transaction`
      UPDATE chats
      SET updated_at = NOW()
      WHERE workspace_id = ${job.workspace_id} AND id = ${job.chat_id}
    `,
  ]);
}

export async function failJob(
  jobId: string,
  errorMessage: string,
): Promise<void> {
  const sql = db();
  const jobRows = (await sql.query(
    "SELECT workspace_id, document_id, attempts, max_attempts FROM ingestion_jobs WHERE id = $1 LIMIT 1",
    [jobId],
  )) as unknown as { workspace_id: string; document_id: string; attempts: number; max_attempts: number }[];

  const job = jobRows[0];
  if (!job) return;

  const newAttempts = job.attempts + 1;

  await sql.transaction((transaction) => [
    transaction`
      UPDATE ingestion_jobs
      SET status = 'failed',
          stage = 'failed',
          attempts = ${newAttempts},
          error_message = ${errorMessage},
          lease_owner = NULL,
          lease_expires_at = NULL,
          updated_at = NOW()
      WHERE id = ${jobId}
    `,
    transaction`
      UPDATE documents
      SET status = 'failed'
      WHERE workspace_id = ${job.workspace_id} AND id = ${job.document_id}
    `,
  ]);
}

export async function retryJob(
  workspace: WorkspaceContext,
  jobId: string,
): Promise<IngestionJob> {
  const sql = db();
  const job = await getJob(workspace, jobId);
  if (!job) throw new AppError(404, "Ingestion job not found.");

  const sourceBytes = await getRawSourceBytes(jobId);
  if (!sourceBytes) {
    throw new AppError(410, "Source document is no longer available. Please upload the file again.");
  }

  await sql.transaction((transaction) => [
    transaction`
      UPDATE ingestion_jobs
      SET status = 'queued',
          stage = 'queued',
          progress_percent = 0,
          error_message = NULL,
          lease_owner = NULL,
          lease_expires_at = NULL,
          updated_at = NOW()
      WHERE workspace_id = ${workspace.workspaceId} AND id = ${jobId}
    `,
    transaction`
      UPDATE documents
      SET status = 'queued'
      WHERE workspace_id = ${workspace.workspaceId} AND id = ${job.documentId}
    `,
  ]);

  const updated = await getJob(workspace, jobId);
  if (!updated) throw new Error("Failed to load updated job.");
  return updated;
}
