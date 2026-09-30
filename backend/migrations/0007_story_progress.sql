-- Account-scoped one-time story and unlock notices.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS story_progress (
    user_id TEXT NOT NULL,
    story_id TEXT NOT NULL,
    seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, story_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_story_progress_user_id
    ON story_progress(user_id);
