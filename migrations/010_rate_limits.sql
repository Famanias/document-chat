CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key VARCHAR(128) PRIMARY KEY,
  count INT NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limit_buckets_reset_idx
  ON rate_limit_buckets (reset_at);
