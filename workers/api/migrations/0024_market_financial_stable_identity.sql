CREATE UNIQUE INDEX IF NOT EXISTS idx_market_financial_report_report_code
  ON market_financial_report (report_date, security_code);
