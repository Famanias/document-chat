export type SourceSegment = {
  content: string;
  pageNumber: number | null;
  section: string | null;
};

export type ParsedDocument = {
  extractedText: string;
  pageCount: number | null;
  segments: SourceSegment[];
};

export type DocumentChunk = SourceSegment & {
  chunkIndex: number;
};
