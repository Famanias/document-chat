CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO workspaces (id)
VALUES ('00000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE chats ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE chat_documents ADD COLUMN IF NOT EXISTS workspace_id UUID;

UPDATE chats
SET workspace_id = '00000000-0000-4000-8000-000000000001'
WHERE workspace_id IS NULL;

UPDATE documents
SET workspace_id = '00000000-0000-4000-8000-000000000001'
WHERE workspace_id IS NULL;

UPDATE messages AS messages
SET workspace_id = chats.workspace_id
FROM chats
WHERE messages.chat_id = chats.id
  AND messages.workspace_id IS NULL;

UPDATE document_chunks AS chunks
SET workspace_id = documents.workspace_id
FROM documents
WHERE chunks.document_id = documents.id
  AND chunks.workspace_id IS NULL;

UPDATE chat_documents AS links
SET workspace_id = chats.workspace_id
FROM chats
WHERE links.chat_id = chats.id
  AND links.workspace_id IS NULL;

ALTER TABLE chats ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE documents ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE document_chunks ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE chat_documents ALTER COLUMN workspace_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS chats_workspace_id_id_key
  ON chats (workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS documents_workspace_id_id_key
  ON documents (workspace_id, id);

ALTER TABLE chats DROP CONSTRAINT IF EXISTS chats_workspace_fk;
ALTER TABLE chats
  ADD CONSTRAINT chats_workspace_fk
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_workspace_fk;
ALTER TABLE documents
  ADD CONSTRAINT documents_workspace_fk
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_workspace_chat_fk;
ALTER TABLE messages
  ADD CONSTRAINT messages_workspace_chat_fk
  FOREIGN KEY (workspace_id, chat_id)
  REFERENCES chats(workspace_id, id) ON DELETE CASCADE;

ALTER TABLE document_chunks DROP CONSTRAINT IF EXISTS document_chunks_workspace_document_fk;
ALTER TABLE document_chunks
  ADD CONSTRAINT document_chunks_workspace_document_fk
  FOREIGN KEY (workspace_id, document_id)
  REFERENCES documents(workspace_id, id) ON DELETE CASCADE;

ALTER TABLE chat_documents DROP CONSTRAINT IF EXISTS chat_documents_workspace_chat_fk;
ALTER TABLE chat_documents
  ADD CONSTRAINT chat_documents_workspace_chat_fk
  FOREIGN KEY (workspace_id, chat_id)
  REFERENCES chats(workspace_id, id) ON DELETE CASCADE;

ALTER TABLE chat_documents DROP CONSTRAINT IF EXISTS chat_documents_workspace_document_fk;
ALTER TABLE chat_documents
  ADD CONSTRAINT chat_documents_workspace_document_fk
  FOREIGN KEY (workspace_id, document_id)
  REFERENCES documents(workspace_id, id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS chats_workspace_updated_idx
  ON chats (workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS messages_workspace_chat_created_idx
  ON messages (workspace_id, chat_id, created_at, id);
CREATE INDEX IF NOT EXISTS document_chunks_workspace_document_idx
  ON document_chunks (workspace_id, document_id, chunk_index);
CREATE INDEX IF NOT EXISTS chat_documents_workspace_chat_idx
  ON chat_documents (workspace_id, chat_id, document_id);
