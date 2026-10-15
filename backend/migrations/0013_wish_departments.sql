ALTER TABLE wish_posts ADD COLUMN department TEXT
  CHECK (department IS NULL OR department IN ('DS', 'CS', 'CSE', 'AI', 'AIDS'));
CREATE INDEX IF NOT EXISTS idx_wish_posts_department ON wish_posts(department, created_at DESC, id DESC);
