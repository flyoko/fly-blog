CREATE TABLE market_watchlist (
  owner_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('SSE', 'SZSE', 'BSE')),
  stock_code TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  attention_price REAL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, symbol)
);

CREATE INDEX idx_market_watchlist_owner_sort
  ON market_watchlist (owner_id, sort_order, symbol);

CREATE TABLE market_watchlist_quote_5m (
  owner_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  bucket_at TEXT NOT NULL,
  market_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  price REAL NOT NULL,
  change_value REAL NOT NULL,
  change_pct REAL NOT NULL,
  open_price REAL,
  high_price REAL,
  low_price REAL,
  previous_close REAL,
  volume REAL,
  turnover REAL,
  turnover_rate REAL,
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, symbol, bucket_at)
);

CREATE INDEX idx_market_watchlist_quote_owner_symbol_market
  ON market_watchlist_quote_5m (owner_id, symbol, market_at DESC);

CREATE TRIGGER trg_market_watchlist_limit
BEFORE INSERT ON market_watchlist
WHEN (SELECT COUNT(*) FROM market_watchlist) >= 30
BEGIN
  SELECT RAISE(ABORT, 'market_watchlist_limit');
END;
