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

import { embedQuery } from "@/lib/ai/embeddings";
import {
  rankEvidenceCandidates,
  reciprocalRankFusion,
  RETRIEVAL_CANDIDATE_LIMIT,
  type RetrievalCandidate,
} from "@/lib/ai/retrieval-ranking";
import { db } from "@/lib/db";
import type { WorkspaceContext } from "@/lib/workspaces/context";

type EvidenceRow = {
  chunk_id: string;
  document_id: string;
  filename: string;
  page_number: number | null;
  section: string | null;
  chunk_index: number;
  content: string;
  embedding?: string | number[];
  similarity?: number;
  lexical_score?: number;
};

function parseEmbedding(value: string | number[] | undefined) {
  if (!value) return undefined;
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

export type RetrievalMode = "hybrid" | "vector" | "lexical";

export function getRetrievalMode(): RetrievalMode {
  const mode = process.env.RETRIEVAL_MODE?.toLowerCase();
  if (mode === "vector" || mode === "lexical" || mode === "hybrid") return mode;
  return "hybrid";
}

export async function retrieveEvidence(
  workspace: WorkspaceContext,
  chatId: string,
  question: string,
  mode: RetrievalMode = getRetrievalMode(),
) {
  const queryEmbedding = await embedQuery(question);

  // Vector Candidate Query
  const vectorPromise =
    mode !== "lexical"
      ? (db().query(
          `
            SELECT
              chunks.id AS chunk_id,
              chunks.document_id,
              documents.filename,
              chunks.page_number,
              chunks.section,
              chunks.chunk_index,
              chunks.content,
              chunks.embedding::text AS embedding,
              (1 - (chunks.embedding <=> $1::vector)) AS similarity
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
            LIMIT ${RETRIEVAL_CANDIDATE_LIMIT}
          `,
          [JSON.stringify(queryEmbedding), workspace.workspaceId, chatId],
        ) as unknown as Promise<EvidenceRow[]>)
      : Promise.resolve([]);

  // Lexical Candidate Query
  const cleanedQuery = question.replace(/['":*&|!()<>\\]/g, " ").trim();
  const lexicalPromise =
    mode !== "vector" && cleanedQuery.length > 0
      ? (db().query(
          `
            SELECT
              chunks.id AS chunk_id,
              chunks.document_id,
              documents.filename,
              chunks.page_number,
              chunks.section,
              chunks.chunk_index,
              chunks.content,
              ts_rank_cd(chunks.content_tsv, plainto_tsquery('english', $1)) AS lexical_score
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
              AND chunks.content_tsv @@ plainto_tsquery('english', $1)
            ORDER BY lexical_score DESC
            LIMIT ${RETRIEVAL_CANDIDATE_LIMIT}
          `,
          [cleanedQuery, workspace.workspaceId, chatId],
        ).catch(() => []) as unknown as Promise<EvidenceRow[]>)
      : Promise.resolve([]);

  const [vectorRows, lexicalRows] = await Promise.all([vectorPromise, lexicalPromise]);

  const vectorCandidates: RetrievalCandidate[] = vectorRows.map((row) => ({
    chunkId: row.chunk_id,
    documentId: row.document_id,
    filename: row.filename,
    pageNumber: row.page_number,
    section: row.section,
    chunkIndex: row.chunk_index,
    content: row.content,
    embedding: parseEmbedding(row.embedding),
    similarity: row.similarity,
  }));

  const lexicalCandidates: RetrievalCandidate[] = lexicalRows.map((row) => ({
    chunkId: row.chunk_id,
    documentId: row.document_id,
    filename: row.filename,
    pageNumber: row.page_number,
    section: row.section,
    chunkIndex: row.chunk_index,
    content: row.content,
    lexicalScore: row.lexical_score,
  }));

  if (mode === "vector" || lexicalCandidates.length === 0) {
    return rankEvidenceCandidates(queryEmbedding, vectorCandidates);
  }

  if (mode === "lexical") {
    return reciprocalRankFusion([], lexicalCandidates);
  }

  return reciprocalRankFusion(vectorCandidates, lexicalCandidates);
}
