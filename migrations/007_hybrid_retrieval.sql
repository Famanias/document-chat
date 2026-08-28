ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS content_tsv TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX IF NOT EXISTS document_chunks_content_tsv_idx
  ON document_chunks USING GIN (content_tsv);
