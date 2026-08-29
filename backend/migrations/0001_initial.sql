-- Baseline tables imported from PR #12. Existing tables remain untouched by
-- IF NOT EXISTS; newly provisioned databases receive the stricter constraints.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stats (
    user_id TEXT PRIMARY KEY,
    attack INTEGER NOT NULL DEFAULT 0 CHECK (attack >= 0),
    hp INTEGER NOT NULL DEFAULT 0 CHECK (hp >= 0),
    defense INTEGER NOT NULL DEFAULT 0 CHECK (defense >= 0),
    clears INTEGER NOT NULL DEFAULT 0 CHECK (clears >= 0),
    score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stats_score ON stats(score);
CREATE INDEX IF NOT EXISTS idx_stats_clears ON stats(clears);
