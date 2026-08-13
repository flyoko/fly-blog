CREATE TABLE IF NOT EXISTS finance_flash_exclusions (
  item_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  restored_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_finance_flash_exclusions_created
  ON finance_flash_exclusions(created_at DESC);
