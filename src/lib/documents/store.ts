import "server-only";

import { randomUUID } from "node:crypto";

import { AppError } from "@/lib/api-errors";
import { db } from "@/lib/db";
import type { DocumentChunk, ParsedDocument } from "@/lib/documents/types";

type StoreDocumentInput = {
  chatId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  parsed: ParsedDocument;
  chunks: DocumentChunk[];
  embeddings: number[][];
};

export async function storeDocument(input: StoreDocumentInput) {
  if (input.chunks.length !== input.embeddings.length) {
    throw new Error("Every document chunk must have one embedding.");
  }

  const sql = db();
  const documentId = randomUUID();
  const exists = (await sql.query(
    "SELECT 1 FROM chats WHERE id = $1 LIMIT 1",
    [input.chatId],
  )) as unknown as Record<string, unknown>[];
  if (exists.length === 0) {
    throw new AppError(404, "That conversation no longer exists.");
  }

  await sql.transaction((transaction) => [
    transaction`
      INSERT INTO documents (
        id, filename, mime_type, size_bytes, extracted_text, page_count, status
      ) VALUES (
        ${documentId}, ${input.filename}, ${input.mimeType}, ${input.sizeBytes},
        ${input.parsed.extractedText}, ${input.parsed.pageCount}, 'ready'
      )
    `,
    transaction`
      INSERT INTO chat_documents (chat_id, document_id)
      VALUES (${input.chatId}, ${documentId})
    `,
    ...input.chunks.map((chunk, index) =>
      transaction`
        INSERT INTO document_chunks (
          id, document_id, chunk_index, content, page_number, section, embedding
        ) VALUES (
          ${randomUUID()}, ${documentId}, ${chunk.chunkIndex}, ${chunk.content},
          ${chunk.pageNumber}, ${chunk.section}, ${JSON.stringify(input.embeddings[index])}::vector
        )
      `,
    ),
    transaction`
      UPDATE chats SET updated_at = NOW() WHERE id = ${input.chatId}
    `,
  ]);

  return {
    id: documentId,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    pageCount: input.parsed.pageCount,
    chunkCount: input.chunks.length,
    status: "ready" as const,
  };
}
