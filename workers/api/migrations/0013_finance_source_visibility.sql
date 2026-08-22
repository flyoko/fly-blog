ALTER TABLE finance_flash_items
  ADD COLUMN public_visible INTEGER NOT NULL DEFAULT 1 CHECK (public_visible IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_finance_flash_items_public_visible
  ON finance_flash_items(public_visible, published_at DESC, id DESC);
