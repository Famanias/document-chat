import "server-only";

import { AppError } from "@/lib/api-errors";
import { db } from "@/lib/db";
import {
  createIngestionJob,
  getJobByDocumentId,
  getRawSourceBytes,
  retryJob,
} from "@/lib/ingestion/store";
import { processIngestionJob } from "@/lib/ingestion/worker";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export async function deleteDocument(
  workspace: WorkspaceContext,
  chatId: string,
  documentId: string,
): Promise<{ deleted: boolean }> {
  const sql = db();

  const exists = (await sql.query(
    `
      SELECT 1
      FROM chat_documents
      WHERE workspace_id = $1 AND chat_id = $2 AND document_id = $3
      LIMIT 1
    `,
    [workspace.workspaceId, chatId, documentId],
  )) as unknown as Record<string, unknown>[];

  if (exists.length === 0) {
    throw new AppError(404, "Document not found in this conversation.");
  }

  const otherRefs = (await sql.query(
    `
      SELECT 1
      FROM chat_documents
      WHERE workspace_id = $1 AND document_id = $2 AND chat_id != $3
      LIMIT 1
    `,
    [workspace.workspaceId, documentId, chatId],
  )) as unknown as Record<string, unknown>[];

  if (otherRefs.length === 0) {
    await sql.transaction((tx) => [
      tx`
        DELETE FROM chat_documents
        WHERE workspace_id = ${workspace.workspaceId} AND chat_id = ${chatId} AND document_id = ${documentId}
      `,
      tx`
        DELETE FROM document_chunks
        WHERE workspace_id = ${workspace.workspaceId} AND document_id = ${documentId}
      `,
      tx`
        DELETE FROM ingestion_jobs
        WHERE workspace_id = ${workspace.workspaceId} AND document_id = ${documentId}
      `,
      tx`
        DELETE FROM documents
        WHERE workspace_id = ${workspace.workspaceId} AND id = ${documentId}
      `,
      tx`
        UPDATE chats
        SET updated_at = NOW()
        WHERE workspace_id = ${workspace.workspaceId} AND id = ${chatId}
      `,
    ]);
  } else {
    await sql.transaction((tx) => [
      tx`
        DELETE FROM chat_documents
        WHERE workspace_id = ${workspace.workspaceId} AND chat_id = ${chatId} AND document_id = ${documentId}
      `,
      tx`
        UPDATE chats
        SET updated_at = NOW()
        WHERE workspace_id = ${workspace.workspaceId} AND id = ${chatId}
      `,
    ]);
  }

  return { deleted: true };
}

export async function reindexDocument(
  workspace: WorkspaceContext,
  chatId: string,
  documentId: string,
): Promise<{ success: boolean; jobId: string; error?: string }> {
  const sql = db();

  const docRows = (await sql.query(
    `
      SELECT documents.id, documents.filename, documents.mime_type, documents.size_bytes, documents.extracted_text
      FROM documents
      INNER JOIN chat_documents
        ON chat_documents.document_id = documents.id
      WHERE documents.workspace_id = $1 AND chat_documents.chat_id = $2 AND documents.id = $3
      LIMIT 1
    `,
    [workspace.workspaceId, chatId, documentId],
  )) as unknown as {
    id: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
    extracted_text: string;
  }[];

  const doc = docRows[0];
  if (!doc) {
    throw new AppError(404, "Document not found in this conversation.");
  }

  const existingJob = await getJobByDocumentId(workspace, documentId);
  let rawBytes = existingJob ? await getRawSourceBytes(existingJob.id) : null;

  if (existingJob && rawBytes && rawBytes.length > 0) {
    const retriedJob = await retryJob(workspace, existingJob.id);
    const result = await processIngestionJob(retriedJob.id);
    return { ...result, jobId: retriedJob.id };
  }

  if (!rawBytes || rawBytes.length === 0) {
    rawBytes = Buffer.from(doc.extracted_text || "");
  }

  const job = await createIngestionJob(workspace, {
    chatId,
    filename: doc.filename,
    mimeType: doc.mime_type,
    sizeBytes: doc.size_bytes,
    buffer: rawBytes,
  });

  const result = await processIngestionJob(job.id);

  return { ...result, jobId: job.id };
}
