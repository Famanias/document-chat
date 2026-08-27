import "server-only";

import { db } from "@/lib/db";
import { embedQuery } from "@/lib/ai/embeddings";
import type { Evidence } from "@/lib/chat/types";
import type { WorkspaceContext } from "@/lib/workspaces/context";

type EvidenceRow = {
  chunk_id: string;
  document_id: string;
  filename: string;
  page_number: number | null;
  section: string | null;
  chunk_index: number;
  content: string;
  similarity: number | string;
};

function createExcerpt(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= 420) return normalized;
  return `${normalized.slice(0, 417).trimEnd()}…`;
}

export async function retrieveEvidence(
  workspace: WorkspaceContext,
  chatId: string,
  question: string,
) {
  const queryEmbedding = await embedQuery(question);
  const rows = (await db().query(
    `
      SELECT
        chunks.id AS chunk_id,
        chunks.document_id,
        documents.filename,
        chunks.page_number,
        chunks.section,
        chunks.chunk_index,
        chunks.content,
        1 - (chunks.embedding <=> $1::vector) AS similarity
      FROM document_chunks AS chunks
      INNER JOIN documents
        ON documents.workspace_id = chunks.workspace_id
        AND documents.id = chunks.document_id
      INNER JOIN chat_documents
        ON chat_documents.workspace_id = documents.workspace_id
        AND chat_documents.document_id = documents.id
      WHERE chunks.workspace_id = $2
        AND chat_documents.workspace_id = $2
        AND chat_documents.chat_id = $3
        AND documents.status = 'ready'
      ORDER BY chunks.embedding <=> $1::vector
      LIMIT 6
    `,
    [JSON.stringify(queryEmbedding), workspace.workspaceId, chatId],
  )) as unknown as EvidenceRow[];

  return rows.map(
    (row, index): Evidence => ({
      id: `E${index + 1}`,
      chunkId: row.chunk_id,
      documentId: row.document_id,
      filename: row.filename,
      pageNumber: row.page_number,
      section: row.section,
      chunkIndex: row.chunk_index,
      content: row.content,
      excerpt: createExcerpt(row.content),
      similarity: Number(row.similarity),
    }),
  );
}
