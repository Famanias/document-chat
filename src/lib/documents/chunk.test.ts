import { describe, expect, it } from "vitest";

import {
  CHUNK_OVERLAP_CHARACTERS,
  CHUNK_TARGET_CHARACTERS,
  chunkSegments,
} from "@/lib/documents/chunk";

describe("chunkSegments", () => {
  it("keeps source metadata attached and adds bounded overlap", () => {
    const content = Array.from({ length: 900 }, (_, index) => `Sentence ${index}.`).join(" ");
    const chunks = chunkSegments([
      { content, pageNumber: 7, section: "Findings" },
    ]);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.pageNumber === 7)).toBe(true);
    expect(chunks.every((chunk) => chunk.section === "Findings")).toBe(true);
    expect(chunks.every((chunk) => chunk.content.length <= CHUNK_TARGET_CHARACTERS + 1)).toBe(true);

    const tail = chunks[0].content.slice(-CHUNK_OVERLAP_CHARACTERS / 2);
    expect(chunks[1].content).toContain(tail.trim());
  });

  it("never merges separate pages", () => {
    const chunks = chunkSegments([
      { content: "Page one fact.", pageNumber: 1, section: null },
      { content: "Page two fact.", pageNumber: 2, section: null },
    ]);

    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => chunk.pageNumber)).toEqual([1, 2]);
  });
});
