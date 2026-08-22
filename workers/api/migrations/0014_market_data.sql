CREATE TABLE market_source_health (
  capability TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  item_count INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (capability, source_id)
);

CREATE TABLE market_daily_snapshot (
  trade_date TEXT PRIMARY KEY,
  market_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  indices_json TEXT,
  breadth_json TEXT,
  sources_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE market_sector_flow_daily (
  trade_date TEXT NOT NULL,
  sector_kind TEXT NOT NULL CHECK (sector_kind IN ('industry', 'concept')),
  sector_code TEXT NOT NULL,
  sector_name TEXT NOT NULL,
  change_pct REAL,
  main_net_inflow REAL,
  main_net_inflow_ratio REAL,
  leader_stock_code TEXT,
  leader_stock_name TEXT,
  market_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  source_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (trade_date, sector_kind, sector_code)
);

CREATE INDEX idx_market_sector_flow_kind_date
  ON market_sector_flow_daily (sector_kind, trade_date DESC);

CREATE INDEX idx_market_source_health_updated_at
  ON market_source_health (updated_at DESC);
