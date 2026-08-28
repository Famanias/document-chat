ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE documents ADD CONSTRAINT documents_status_check
  CHECK (status IN ('queued', 'processing', 'extracting', 'chunking', 'embedding', 'persisting', 'ready', 'failed'));

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  chat_id UUID NOT NULL,
  document_id UUID NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  size_bytes BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  stage VARCHAR(32) NOT NULL DEFAULT 'queued',
  progress_percent INT NOT NULL DEFAULT 0,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  lease_owner VARCHAR(64) NULL,
  lease_expires_at TIMESTAMPTZ NULL,
  error_message TEXT NULL,
  raw_source_bytes BYTEA NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ingestion_jobs_workspace_fk
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT ingestion_jobs_workspace_chat_fk
    FOREIGN KEY (workspace_id, chat_id) REFERENCES chats(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT ingestion_jobs_workspace_doc_fk
    FOREIGN KEY (workspace_id, document_id) REFERENCES documents(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ingestion_jobs_workspace_status_idx
  ON ingestion_jobs (workspace_id, status);

CREATE INDEX IF NOT EXISTS ingestion_jobs_status_lease_idx
  ON ingestion_jobs (status, lease_expires_at);
