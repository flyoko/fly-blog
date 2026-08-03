CREATE TABLE IF NOT EXISTS news_items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hot', 'daily', 'rss', 'manual')),
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT NOT NULL,
  original_url TEXT,
  category TEXT,
  rank INTEGER,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  selected INTEGER NOT NULL DEFAULT 1 CHECK (selected IN (0, 1)),
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_news_public ON news_items(selected, published_at DESC, rank ASC, id DESC);
CREATE INDEX IF NOT EXISTS idx_news_source ON news_items(source_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS news_briefings (
  date TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  lead TEXT,
  content_json TEXT NOT NULL,
  source_url TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS news_sync_state (
  source_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  last_success_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL
);
