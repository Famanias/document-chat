import type { DocumentChunk, SourceSegment } from "@/lib/documents/types";

export const CHUNK_TARGET_CHARACTERS = 1_600;
export const CHUNK_OVERLAP_CHARACTERS = 200;

function normalizeText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findNaturalBoundary(text: string, target: number) {
  if (text.length <= target) return text.length;

  const minimum = Math.floor(target * 0.65);
  const candidates = [
    text.lastIndexOf("\n\n", target),
    text.lastIndexOf(". ", target),
    text.lastIndexOf("\n", target),
    text.lastIndexOf(" ", target),
  ];

  const boundary = Math.max(...candidates);
  return boundary >= minimum ? boundary + 1 : target;
}

function chunkSegment(segment: SourceSegment) {
  const chunks: string[] = [];
  let remaining = normalizeText(segment.content);

  while (remaining.length > CHUNK_TARGET_CHARACTERS) {
    const boundary = findNaturalBoundary(remaining, CHUNK_TARGET_CHARACTERS);
    const content = remaining.slice(0, boundary).trim();
    if (content) chunks.push(content);

    const nextStart = Math.max(0, boundary - CHUNK_OVERLAP_CHARACTERS);
    remaining = remaining.slice(nextStart).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export function chunkSegments(segments: SourceSegment[]): DocumentChunk[] {
  let chunkIndex = 0;

  return segments.flatMap((segment) =>
    chunkSegment(segment).map((content) => ({
      content,
      pageNumber: segment.pageNumber,
      section: segment.section,
      chunkIndex: chunkIndex++,
    })),
  );
}
