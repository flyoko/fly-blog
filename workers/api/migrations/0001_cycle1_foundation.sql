PRAGMA foreign_keys = ON;

CREATE TABLE admin_sessions (
  id_hash TEXT PRIMARY KEY,
  github_user_id TEXT NOT NULL,
  github_login TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  csrf_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_admin_sessions_expiry ON admin_sessions(expires_at);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_login TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  result TEXT NOT NULL CHECK(result IN ('success','failure')),
  request_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  state TEXT NOT NULL CHECK(state IN ('running','complete','failed')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_idempotency_expiry ON idempotency_keys(expires_at);

CREATE TABLE media_objects (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  original_key TEXT,
  original_name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','trashed','deleted')),
  public_url TEXT,
  created_at TEXT NOT NULL,
  trashed_at TEXT,
  deleted_at TEXT
);
CREATE INDEX idx_media_objects_created ON media_objects(created_at DESC);

CREATE TABLE media_references (
  media_id TEXT NOT NULL REFERENCES media_objects(id) ON DELETE CASCADE,
  repository_path TEXT NOT NULL,
  repository_sha TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(media_id, repository_path)
);

CREATE TABLE publish_runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('direct','pull_request')),
  status TEXT NOT NULL,
  repository_ref TEXT NOT NULL,
  commit_sha TEXT,
  pull_number INTEGER,
  workflow_run_id INTEGER,
  deployment_url TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_publish_runs_updated ON publish_runs(updated_at DESC);
