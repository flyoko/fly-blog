CREATE TABLE market_financial_report (
  report_date TEXT NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('q1', 'semiannual', 'q3', 'annual')),
  security_code TEXT NOT NULL,
  secucode TEXT NOT NULL,
  security_name TEXT NOT NULL,
  industry_name TEXT,
  notice_date TEXT NOT NULL,
  net_profit_yoy REAL,
  gross_margin REAL,
  previous_gross_margin REAL,
  gross_margin_yoy_change REAL,
  inventory REAL,
  previous_inventory REAL,
  inventory_yoy_change REAL,
  inventory_yoy_pct REAL,
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (report_date, fetched_at, security_code)
);

CREATE INDEX idx_market_financial_period_date_profit
  ON market_financial_report (period_type, report_date DESC, fetched_at, net_profit_yoy DESC);

CREATE INDEX idx_market_financial_report_code_date
  ON market_financial_report (security_code, report_date DESC, fetched_at);

CREATE TABLE market_financial_sync_state (
  report_date TEXT PRIMARY KEY,
  period_type TEXT NOT NULL CHECK (period_type IN ('q1', 'semiannual', 'q3', 'annual')),
  comparison_report_date TEXT NOT NULL,
  performance_row_count INTEGER NOT NULL CHECK (performance_row_count >= 0),
  balance_row_count INTEGER NOT NULL CHECK (balance_row_count >= 0),
  comparable_row_count INTEGER NOT NULL CHECK (comparable_row_count >= 0),
  future_notice_excluded_count INTEGER NOT NULL CHECK (future_notice_excluded_count >= 0),
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_market_financial_sync_period_date
  ON market_financial_sync_state (period_type, report_date DESC);
