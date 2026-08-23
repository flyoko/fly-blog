CREATE TABLE market_source_observation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_date TEXT NOT NULL,
  capability TEXT NOT NULL CHECK (capability IN ('indices', 'breadth', 'sector-industry', 'sector-concept', 'watchlist-sync')),
  source_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  expected_item_count INTEGER CHECK (expected_item_count IS NULL OR expected_item_count >= 0),
  missing_count INTEGER NOT NULL DEFAULT 0 CHECK (missing_count >= 0),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  endpoint TEXT,
  scheduled_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  UNIQUE (capability, scheduled_at)
);

CREATE INDEX idx_market_source_observation_trade_capability
  ON market_source_observation (trade_date DESC, capability, scheduled_at DESC);

CREATE INDEX idx_market_source_observation_scheduled_at
  ON market_source_observation (scheduled_at DESC);
