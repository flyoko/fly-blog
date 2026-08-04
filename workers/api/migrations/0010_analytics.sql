CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pageview_id TEXT NOT NULL UNIQUE,
  visitor_hash TEXT,
  session_hash TEXT,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('edge', 'spa')),
  path TEXT NOT NULL,
  title TEXT,
  referrer_host TEXT,
  referrer_path TEXT,
  response_status INTEGER,
  ip_address TEXT,
  ip_expires_at TEXT,
  country_code TEXT,
  region_code TEXT,
  region_name TEXT,
  city TEXT,
  postal_code TEXT,
  timezone TEXT,
  latitude REAL,
  longitude REAL,
  asn INTEGER,
  as_organization TEXT,
  user_agent TEXT,
  device_type TEXT,
  browser_name TEXT,
  browser_version TEXT,
  os_name TEXT,
  os_version TEXT,
  is_bot INTEGER NOT NULL DEFAULT 0 CHECK (is_bot IN (0, 1)),
  bot_name TEXT,
  bot_category TEXT,
  is_suspected_bot INTEGER NOT NULL DEFAULT 0 CHECK (is_suspected_bot IN (0, 1)),
  classification_source TEXT NOT NULL,
  CHECK (NOT (is_bot = 1 AND is_suspected_bot = 1)),
  CHECK (
    is_bot = 1
    OR is_suspected_bot = 1
    OR (visitor_hash IS NOT NULL AND session_hash IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_received
  ON analytics_events(received_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_occurred
  ON analytics_events(occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor
  ON analytics_events(visitor_hash, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session
  ON analytics_events(session_hash, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_path
  ON analytics_events(path, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_status
  ON analytics_events(response_status, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_geo
  ON analytics_events(country_code, region_name, city, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_device
  ON analytics_events(device_type, browser_name, os_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_ip_expiry
  ON analytics_events(ip_expires_at)
  WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_events_traffic
  ON analytics_events(is_bot, is_suspected_bot, occurred_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS analytics_sessions (
  session_hash TEXT PRIMARY KEY,
  visitor_hash TEXT NOT NULL,
  first_pageview_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  pageview_count INTEGER NOT NULL DEFAULT 1 CHECK (pageview_count >= 1)
);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_visitor
  ON analytics_sessions(visitor_hash, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_last_seen
  ON analytics_sessions(last_seen_at);

CREATE TABLE IF NOT EXISTS analytics_visitors (
  visitor_hash TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  total_pageviews INTEGER NOT NULL DEFAULT 0 CHECK (total_pageviews >= 0),
  total_sessions INTEGER NOT NULL DEFAULT 0 CHECK (total_sessions >= 0),
  last_country_code TEXT,
  last_region_name TEXT,
  last_city TEXT,
  last_device_type TEXT,
  last_browser_name TEXT,
  last_os_name TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_visitors_last_seen
  ON analytics_visitors(last_seen_at DESC, visitor_hash);
CREATE INDEX IF NOT EXISTS idx_analytics_visitors_first_seen
  ON analytics_visitors(first_seen_at DESC, visitor_hash);

CREATE TRIGGER IF NOT EXISTS trg_analytics_events_after_human_insert
AFTER INSERT ON analytics_events
WHEN NEW.is_bot = 0
  AND NEW.is_suspected_bot = 0
  AND NEW.visitor_hash IS NOT NULL
  AND NEW.session_hash IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO analytics_sessions (
    session_hash, visitor_hash, first_pageview_id, started_at, last_seen_at, pageview_count
  ) VALUES (
    NEW.session_hash, NEW.visitor_hash, NEW.pageview_id, NEW.occurred_at, NEW.occurred_at, 1
  );

  UPDATE analytics_sessions
  SET
    started_at = MIN(started_at, NEW.occurred_at),
    last_seen_at = MAX(last_seen_at, NEW.occurred_at),
    pageview_count = pageview_count + CASE
      WHEN first_pageview_id = NEW.pageview_id THEN 0 ELSE 1 END
  WHERE session_hash = NEW.session_hash
    AND visitor_hash = NEW.visitor_hash;

  INSERT INTO analytics_visitors (
    visitor_hash, first_seen_at, last_seen_at, total_pageviews, total_sessions,
    last_country_code, last_region_name, last_city, last_device_type,
    last_browser_name, last_os_name, updated_at
  ) VALUES (
    NEW.visitor_hash, NEW.occurred_at, NEW.occurred_at, 1,
    CASE WHEN (
      SELECT first_pageview_id
      FROM analytics_sessions
      WHERE session_hash = NEW.session_hash AND visitor_hash = NEW.visitor_hash
    ) = NEW.pageview_id THEN 1 ELSE 0 END,
    NEW.country_code, NEW.region_name, NEW.city, NEW.device_type,
    NEW.browser_name, NEW.os_name, NEW.received_at
  )
  ON CONFLICT(visitor_hash) DO UPDATE SET
    first_seen_at = MIN(analytics_visitors.first_seen_at, excluded.first_seen_at),
    last_seen_at = MAX(analytics_visitors.last_seen_at, excluded.last_seen_at),
    total_pageviews = analytics_visitors.total_pageviews + 1,
    total_sessions = analytics_visitors.total_sessions + excluded.total_sessions,
    last_country_code = CASE
      WHEN excluded.last_seen_at >= analytics_visitors.last_seen_at
      THEN excluded.last_country_code ELSE analytics_visitors.last_country_code END,
    last_region_name = CASE
      WHEN excluded.last_seen_at >= analytics_visitors.last_seen_at
      THEN excluded.last_region_name ELSE analytics_visitors.last_region_name END,
    last_city = CASE
      WHEN excluded.last_seen_at >= analytics_visitors.last_seen_at
      THEN excluded.last_city ELSE analytics_visitors.last_city END,
    last_device_type = CASE
      WHEN excluded.last_seen_at >= analytics_visitors.last_seen_at
      THEN excluded.last_device_type ELSE analytics_visitors.last_device_type END,
    last_browser_name = CASE
      WHEN excluded.last_seen_at >= analytics_visitors.last_seen_at
      THEN excluded.last_browser_name ELSE analytics_visitors.last_browser_name END,
    last_os_name = CASE
      WHEN excluded.last_seen_at >= analytics_visitors.last_seen_at
      THEN excluded.last_os_name ELSE analytics_visitors.last_os_name END,
    updated_at = MAX(analytics_visitors.updated_at, excluded.updated_at);
END;

CREATE TABLE IF NOT EXISTS analytics_daily_site (
  date TEXT PRIMARY KEY,
  pageviews INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  new_visitors INTEGER NOT NULL DEFAULT 0,
  bot_pageviews INTEGER NOT NULL DEFAULT 0,
  suspected_pageviews INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_daily_path (
  date TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  pageviews INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date, path)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_path_rank
  ON analytics_daily_path(date, pageviews DESC, path);

CREATE TABLE IF NOT EXISTS analytics_daily_geo (
  date TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT '',
  region_name TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  pageviews INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date, country_code, region_name, city)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_geo_rank
  ON analytics_daily_geo(date, pageviews DESC, country_code, region_name, city);

CREATE TABLE IF NOT EXISTS analytics_daily_device (
  date TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT '',
  browser_name TEXT NOT NULL DEFAULT '',
  os_name TEXT NOT NULL DEFAULT '',
  pageviews INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date, device_type, browser_name, os_name)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_device_rank
  ON analytics_daily_device(date, pageviews DESC, device_type, browser_name, os_name);

CREATE TABLE IF NOT EXISTS analytics_daily_referrer (
  date TEXT NOT NULL,
  referrer_host TEXT NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date, referrer_host)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_referrer_rank
  ON analytics_daily_referrer(date, pageviews DESC, referrer_host);

CREATE TABLE IF NOT EXISTS analytics_daily_bot (
  date TEXT NOT NULL,
  bot_name TEXT NOT NULL DEFAULT '',
  bot_category TEXT NOT NULL DEFAULT '',
  classification_source TEXT NOT NULL DEFAULT '',
  traffic_type TEXT NOT NULL CHECK (traffic_type IN ('bot', 'suspected')),
  pageviews INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date, bot_name, bot_category, classification_source, traffic_type)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_bot_rank
  ON analytics_daily_bot(date, pageviews DESC, bot_name, bot_category);
