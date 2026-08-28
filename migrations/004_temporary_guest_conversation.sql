CREATE TABLE IF NOT EXISTS guest_sessions (
  credential_digest CHAR(64) PRIMARY KEY,
  workspace_id UUID NOT NULL UNIQUE,
  chat_id UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT guest_sessions_credential_digest_format
    CHECK (credential_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT guest_sessions_workspace_fk
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT guest_sessions_workspace_chat_fk
    FOREIGN KEY (workspace_id, chat_id)
    REFERENCES chats(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS guest_sessions_workspace_chat_idx
  ON guest_sessions (workspace_id, chat_id);
