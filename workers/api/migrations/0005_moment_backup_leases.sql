ALTER TABLE moment_backup_state ADD COLUMN lease_owner TEXT;
ALTER TABLE moment_backup_state ADD COLUMN lease_expires_at TEXT;

CREATE TABLE IF NOT EXISTS moment_public_cache_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
