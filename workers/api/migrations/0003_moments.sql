CREATE TABLE IF NOT EXISTS moments (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'withdrawn')),
  tags_json TEXT NOT NULL DEFAULT '[]',
  city TEXT,
  music_json TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  published_at TEXT,
  withdrawn_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_moments_public ON moments(status, published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_moments_updated ON moments(updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS moment_media (
  moment_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  alt_text TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (moment_id, media_id),
  FOREIGN KEY (moment_id) REFERENCES moments(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media_objects(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_moment_media_order ON moment_media(moment_id, sort_order, media_id);

CREATE TABLE IF NOT EXISTS moment_likes (
  moment_id TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (moment_id, visitor_hash),
  FOREIGN KEY (moment_id) REFERENCES moments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_moment_likes_created ON moment_likes(moment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS moment_backup_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  last_changed_at TEXT,
  last_checksum TEXT,
  last_commit_sha TEXT,
  last_backup_path TEXT,
  last_success_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  source_ref TEXT,
  target_ref TEXT,
  checksum TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_kind_created ON sync_runs(kind, created_at DESC, id DESC);
