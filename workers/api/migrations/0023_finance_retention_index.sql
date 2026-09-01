CREATE INDEX IF NOT EXISTS idx_finance_flash_source_published
  ON finance_flash_items(source_id, published_at);
