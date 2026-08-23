CREATE TABLE IF NOT EXISTS market_watchlist_signal (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  bucket_at TEXT NOT NULL,
  market_at TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('up', 'down', 'neutral')),
  severity TEXT NOT NULL CHECK(severity IN ('watch', 'strong')),
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
  title TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, symbol, bucket_at, signal_type, engine_version),
  FOREIGN KEY(owner_id, symbol) REFERENCES market_watchlist(owner_id, symbol) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_signal_owner_time
  ON market_watchlist_signal(owner_id, market_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_signal_owner_symbol_time
  ON market_watchlist_signal(owner_id, symbol, market_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_signal_owner_direction_time
  ON market_watchlist_signal(owner_id, direction, market_at DESC);
