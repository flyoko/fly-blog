CREATE TABLE IF NOT EXISTS finance_flash_items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  published_at TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('market', 'company', 'macro', 'overseas', 'tech')),
  category_label TEXT NOT NULL,
  topic TEXT,
  important INTEGER NOT NULL DEFAULT 0 CHECK (important IN (0, 1)),
  importance_origin TEXT NOT NULL CHECK (importance_origin IN ('upstream', 'rule', 'model', 'prototype')),
  importance_score REAL,
  source_name TEXT NOT NULL,
  source_url TEXT,
  fetched_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_finance_flash_public
  ON finance_flash_items(published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_finance_flash_important
  ON finance_flash_items(important, published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_finance_flash_category
  ON finance_flash_items(category, published_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS finance_flash_sync_state (
  source_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  item_count INTEGER NOT NULL DEFAULT 0,
  last_success_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL
);
