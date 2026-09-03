CREATE TABLE IF NOT EXISTS market_sector_flow_intraday_snapshot (
  sector_kind TEXT PRIMARY KEY CHECK (sector_kind IN ('industry', 'concept')),
  market_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  source_id TEXT NOT NULL,
  items_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
