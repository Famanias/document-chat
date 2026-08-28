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
import "server-only";

import { randomUUID } from "node:crypto";

import { AppError } from "@/lib/api-errors";
import { embedDocumentChunks } from "@/lib/ai/embeddings";
import { chunkSegments } from "@/lib/documents/chunk";
import { parseDocument } from "@/lib/documents/parse";
import { extensionOf, validateChunkCount } from "@/lib/documents/validate-upload";
import {
  claimJob,
  completeJob,
  failJob,
  getRawSourceBytes,
  updateJobProgress,
} from "@/lib/ingestion/store";
import { db } from "@/lib/db";

type JobInfo = {
  id: string;
  filename: string;
  attempts: number;
  max_attempts: number;
};

export async function processIngestionJob(
  jobId: string,
  workerId = `worker-${randomUUID()}`,
): Promise<{ success: boolean; error?: string }> {
  const claimed = await claimJob(jobId, workerId);
  if (!claimed) {
    return { success: false, error: "Job could not be claimed." };
  }

  const rows = (await db().query(
    "SELECT id, filename, attempts, max_attempts FROM ingestion_jobs WHERE id = $1 LIMIT 1",
    [jobId],
  )) as unknown as JobInfo[];

  const job = rows[0];
  if (!job) {
    return { success: false, error: "Job not found." };
  }

  try {
    const sourceBytes = await getRawSourceBytes(jobId);
    if (!sourceBytes || sourceBytes.length === 0) {
      throw new AppError(422, "Source document payload is empty or missing.");
    }

    const extension = extensionOf(job.filename);
    if (!extension) {
      throw new AppError(415, "Upload a PDF, TXT, or Markdown (.md) file.");
    }

    // Stage 1: Extracting
    await updateJobProgress(jobId, "extracting", 25);
    const arrayBuffer = sourceBytes.buffer.slice(
      sourceBytes.byteOffset,
      sourceBytes.byteOffset + sourceBytes.byteLength,
    ) as ArrayBuffer;
    const parsed = await parseDocument(extension, arrayBuffer);

    // Stage 2: Chunking
    await updateJobProgress(jobId, "chunking", 50);
    const chunks = chunkSegments(parsed.segments);
    if (chunks.length === 0) {
      throw new AppError(422, "No readable text was found in this document.");
    }
    validateChunkCount(chunks.length);

    // Stage 3: Embedding
    await updateJobProgress(jobId, "embedding", 75);
    const embeddings = await embedDocumentChunks(chunks.map((chunk) => chunk.content));

    // Stage 4: Persisting
    await updateJobProgress(jobId, "persisting", 90);
    await completeJob(jobId, { parsed, chunks, embeddings });

    return { success: true };
  } catch (error) {
    const safeMessage =
      error instanceof AppError
        ? error.message
        : error instanceof Error && error.message
          ? error.message
          : "The document could not be processed.";

    await failJob(jobId, safeMessage);
    return { success: false, error: safeMessage };
  }
}
