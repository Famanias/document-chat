CREATE TABLE IF NOT EXISTS member_accounts (
  id UUID PRIMARY KEY,
  provider_subject VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  workspace_id UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT member_accounts_workspace_fk
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS member_accounts_provider_subject_idx
  ON member_accounts (provider_subject);
