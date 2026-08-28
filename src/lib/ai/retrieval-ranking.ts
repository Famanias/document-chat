import type { Evidence } from "@/lib/chat/types";

export const RETRIEVAL_LIMIT = 6;
export const RETRIEVAL_CANDIDATE_LIMIT = 24;
export const RRF_K = 60;
export const DEFAULT_VECTOR_WEIGHT = 1.0;
export const DEFAULT_LEXICAL_WEIGHT = 1.0;

export type RetrievalCandidate = Omit<
  Evidence,
  "id" | "excerpt" | "similarity"
> & {
  embedding?: readonly number[];
  similarity?: number;
  lexicalScore?: number;
};

function assertVector(vector: readonly number[], label: string) {
  if (vector.length === 0 || vector.some((value) => !Number.isFinite(value))) {
    throw new Error(`${label} must contain finite vector values.`);
  }
}

export function cosineSimilarity(
  left: readonly number[],
  right: readonly number[],
) {
  assertVector(left, "Left embedding");
  assertVector(right, "Right embedding");
  if (left.length !== right.length) {
    throw new Error(
      `Embedding dimensions differ: ${left.length} and ${right.length}.`,
    );
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    throw new Error("Embeddings must have a non-zero magnitude.");
  }

  return dotProduct / Math.sqrt(leftMagnitude * rightMagnitude);
}

export function createEvidenceExcerpt(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= 420) return normalized;
  return `${normalized.slice(0, 417).trimEnd()}…`;
}

export function rankEvidenceCandidates(
  queryEmbedding: readonly number[],
  candidates: readonly RetrievalCandidate[],
  limit = RETRIEVAL_LIMIT,
) {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("Retrieval limit must be a positive integer.");
  }

  return candidates
    .map((candidate, originalIndex) => ({
      candidate,
      originalIndex,
      similarity: candidate.embedding ? cosineSimilarity(queryEmbedding, candidate.embedding) : (candidate.similarity ?? 0),
    }))
    .sort(
      (left, right) =>
        right.similarity - left.similarity ||
        left.originalIndex - right.originalIndex,
    )
    .slice(0, limit)
    .map(
      ({ candidate, similarity }, index): Evidence => ({
        id: `E${index + 1}`,
        chunkId: candidate.chunkId,
        documentId: candidate.documentId,
        filename: candidate.filename,
        pageNumber: candidate.pageNumber,
        section: candidate.section,
        chunkIndex: candidate.chunkIndex,
        content: candidate.content,
        excerpt: createEvidenceExcerpt(candidate.content),
        similarity,
      }),
    );
}

export type FusionOptions = {
  k?: number;
  vectorWeight?: number;
  lexicalWeight?: number;
  limit?: number;
};

export function reciprocalRankFusion(
  vectorCandidates: readonly RetrievalCandidate[],
  lexicalCandidates: readonly RetrievalCandidate[],
  options: FusionOptions = {},
): Evidence[] {
  const k = options.k ?? RRF_K;
  const vectorWeight = options.vectorWeight ?? DEFAULT_VECTOR_WEIGHT;
  const lexicalWeight = options.lexicalWeight ?? DEFAULT_LEXICAL_WEIGHT;
  const limit = options.limit ?? RETRIEVAL_LIMIT;

  const candidateMap = new Map<
    string,
    {
      candidate: RetrievalCandidate;
      rrfScore: number;
      vectorRank: number | null;
      lexicalRank: number | null;
      similarity: number;
    }
  >();

  vectorCandidates.forEach((candidate, index) => {
    const rank = index + 1;
    const score = vectorWeight / (k + rank);
    candidateMap.set(candidate.chunkId, {
      candidate,
      rrfScore: score,
      vectorRank: rank,
      lexicalRank: null,
      similarity: candidate.similarity ?? 0,
    });
  });

  lexicalCandidates.forEach((candidate, index) => {
    const rank = index + 1;
    const score = lexicalWeight / (k + rank);
    const existing = candidateMap.get(candidate.chunkId);
    if (existing) {
      existing.rrfScore += score;
      existing.lexicalRank = rank;
    } else {
      candidateMap.set(candidate.chunkId, {
        candidate,
        rrfScore: score,
        vectorRank: null,
        lexicalRank: rank,
        similarity: candidate.similarity ?? 0,
      });
    }
  });

  const sorted = Array.from(candidateMap.values()).sort(
    (a, b) => b.rrfScore - a.rrfScore || a.candidate.chunkIndex - b.candidate.chunkIndex,
  );

  return sorted.slice(0, limit).map(({ candidate, similarity }, index): Evidence => ({
    id: `E${index + 1}`,
    chunkId: candidate.chunkId,
    documentId: candidate.documentId,
    filename: candidate.filename,
    pageNumber: candidate.pageNumber,
    section: candidate.section,
    chunkIndex: candidate.chunkIndex,
    content: candidate.content,
    excerpt: createEvidenceExcerpt(candidate.content),
    similarity,
  }));
}
