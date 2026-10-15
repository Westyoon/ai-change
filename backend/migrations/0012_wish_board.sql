CREATE TABLE IF NOT EXISTS wish_posts (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 300),
  created_at INTEGER NOT NULL,
  rate_key TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wish_posts_recent ON wish_posts(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_wish_posts_rate ON wish_posts(rate_key, created_at DESC);
