CREATE TABLE IF NOT EXISTS news_exclusions (
  item_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_news_exclusions_created ON news_exclusions(created_at DESC);

INSERT INTO news_documents (
  item_id,
  reader_key,
  source_id,
  source_url,
  original_url,
  title,
  body_text,
  content_mode,
  attribution_name,
  attribution_url,
  published_at,
  content_hash,
  fetched_at,
  updated_at
)
SELECT
  n.id,
  lower(hex(randomblob(16))),
  n.source_id,
  n.url,
  COALESCE(n.original_url, n.url),
  n.title,
  COALESCE(NULLIF(trim(n.summary), ''), '这条手动精选暂未填写摘要，请通过原始来源阅读完整内容。'),
  'summary',
  '原文来源',
  COALESCE(n.original_url, n.url),
  n.published_at,
  lower(hex(randomblob(32))),
  n.fetched_at,
  COALESCE(n.updated_at, n.fetched_at)
FROM news_items n
WHERE n.kind = 'manual'
  AND NOT EXISTS (
    SELECT 1
    FROM news_documents d
    WHERE d.item_id = n.id
  );
