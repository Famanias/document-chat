ALTER TABLE guest_sessions
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour';

CREATE INDEX IF NOT EXISTS guest_sessions_expires_at_idx
  ON guest_sessions (expires_at);
