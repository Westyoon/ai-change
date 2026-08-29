-- Reference schema for a newly provisioned D1 database.
-- Existing databases must use the versioned files in backend/migrations/.

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
    unspent_points INTEGER NOT NULL DEFAULT 0 CHECK (unspent_points >= 0),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_results (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status = 'CLEAR'),
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 1000000),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, attempt_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stats_score ON stats(score);
CREATE INDEX IF NOT EXISTS idx_stats_clears ON stats(clears);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_game_results_user_id ON game_results(user_id);
