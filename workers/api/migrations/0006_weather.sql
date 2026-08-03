CREATE TABLE IF NOT EXISTS weather_snapshots (
  config_key TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  timezone TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  upstream_updated_at TEXT,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_error TEXT,
  last_error_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_weather_snapshots_fetched ON weather_snapshots(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_weather_snapshots_expires ON weather_snapshots(expires_at);
