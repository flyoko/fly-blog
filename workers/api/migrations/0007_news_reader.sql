ALTER TABLE news_items ADD COLUMN updated_at TEXT;
UPDATE news_items SET updated_at = fetched_at WHERE updated_at IS NULL;

CREATE TABLE IF NOT EXISTS news_documents (
  item_id TEXT PRIMARY KEY,
  reader_key TEXT NOT NULL UNIQUE,
  source_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  original_url TEXT,
  title TEXT NOT NULL,
  body_text TEXT NOT NULL,
  content_mode TEXT NOT NULL CHECK (content_mode IN ('full', 'summary')),
  attribution_name TEXT NOT NULL,
  attribution_url TEXT NOT NULL,
  published_at TEXT,
  content_hash TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_news_documents_reader ON news_documents(reader_key);
CREATE INDEX IF NOT EXISTS idx_news_documents_updated ON news_documents(updated_at DESC);

ALTER TABLE news_sync_state ADD COLUMN etag TEXT;
ALTER TABLE news_sync_state ADD COLUMN last_modified TEXT;
ALTER TABLE news_sync_state ADD COLUMN next_sync_at TEXT;
