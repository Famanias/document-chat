import "server-only";

import { embedQuery } from "@/lib/ai/embeddings";
import {
  rankEvidenceCandidates,
  RETRIEVAL_CANDIDATE_LIMIT,
  type RetrievalCandidate,
} from "@/lib/ai/retrieval-ranking";
import { db } from "@/lib/db";

type EvidenceRow = {
  chunk_id: string;
  document_id: string;
  filename: string;
  page_number: number | null;
  section: string | null;
  chunk_index: number;
  content: string;
  embedding: string | number[];
};

function parseEmbedding(value: string | number[]) {
  if (Array.isArray(value)) return value;
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    parsed.some((coordinate) => typeof coordinate !== "number")
  ) {
    throw new Error("Database returned a malformed chunk embedding.");
  }
  return parsed;
}

export async function retrieveEvidence(chatId: string, question: string) {
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
        chunks.embedding::text AS embedding
      FROM document_chunks AS chunks
      INNER JOIN documents ON documents.id = chunks.document_id
      INNER JOIN chat_documents ON chat_documents.document_id = documents.id
      WHERE chat_documents.chat_id = $2
        AND documents.status = 'ready'
      ORDER BY chunks.embedding <=> $1::vector
      LIMIT ${RETRIEVAL_CANDIDATE_LIMIT}
    `,
    [JSON.stringify(queryEmbedding), chatId],
  )) as unknown as EvidenceRow[];

  const candidates = rows.map(
    (row): RetrievalCandidate => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      filename: row.filename,
      pageNumber: row.page_number,
      section: row.section,
      chunkIndex: row.chunk_index,
      content: row.content,
      embedding: parseEmbedding(row.embedding),
    }),
  );

  return rankEvidenceCandidates(queryEmbedding, candidates);
}
