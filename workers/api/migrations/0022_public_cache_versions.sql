CREATE TABLE IF NOT EXISTS public_cache_versions (
  namespace TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 0),
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO public_cache_versions (namespace, version, updated_at)
VALUES ('finance', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO public_cache_versions (namespace, version, updated_at)
VALUES ('market', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
