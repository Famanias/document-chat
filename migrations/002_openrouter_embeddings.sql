DROP INDEX IF EXISTS document_chunks_embedding_hnsw_idx;

ALTER TABLE document_chunks
  ALTER COLUMN embedding TYPE VECTOR(1024)
  USING embedding::VECTOR(1024);

CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw_idx
  ON document_chunks USING HNSW (embedding vector_cosine_ops);
