import { describe, expect, it } from "vitest";

import {
  cosineSimilarity,
  rankEvidenceCandidates,
  type RetrievalCandidate,
} from "@/lib/ai/retrieval-ranking";

function candidate(
  chunkId: string,
  embedding: number[],
  content = chunkId,
): RetrievalCandidate {
  return {
    chunkId,
    documentId: "document-1",
    filename: "fixture.txt",
    pageNumber: null,
    section: null,
    chunkIndex: Number(chunkId.replace("chunk-", "")),
    content,
    embedding,
  };
}

describe("rankEvidenceCandidates", () => {
  it("uses cosine similarity and assigns evidence IDs after ranking", () => {
    const evidence = rankEvidenceCandidates(
      [1, 0],
      [candidate("chunk-0", [0, 1]), candidate("chunk-1", [1, 0])],
      2,
    );

    expect(evidence.map(({ id, chunkId }) => ({ id, chunkId }))).toEqual([
      { id: "E1", chunkId: "chunk-1" },
      { id: "E2", chunkId: "chunk-0" },
    ]);
    expect(evidence[0].similarity).toBe(1);
  });

  it("keeps source order for exact ties and normalizes long excerpts", () => {
    const content = `  ${"word ".repeat(100)}  `;
    const evidence = rankEvidenceCandidates(
      [1, 1],
      [candidate("chunk-0", [1, 0], content), candidate("chunk-1", [0, 1])],
      2,
    );

    expect(evidence.map((item) => item.chunkId)).toEqual(["chunk-0", "chunk-1"]);
    expect(evidence[0].excerpt).toHaveLength(418);
    expect(evidence[0].excerpt.endsWith("…")).toBe(true);
  });

  it("fails clearly for malformed vectors", () => {
    expect(() => cosineSimilarity([1], [1, 0])).toThrow(
      "Embedding dimensions differ",
    );
    expect(() => cosineSimilarity([0, 0], [1, 0])).toThrow(
      "non-zero magnitude",
    );
  });
});
