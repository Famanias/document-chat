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
