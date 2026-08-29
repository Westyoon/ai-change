-- Upgrade an existing PR #12 database without replacing user or stats data.
ALTER TABLE stats ADD COLUMN unspent_points INTEGER NOT NULL DEFAULT 0 CHECK (unspent_points >= 0);

-- The imported baseline allowed NULLs, so normalize legacy rows before the
-- application starts using arithmetic updates.
UPDATE stats
SET attack = COALESCE(attack, 0),
    hp = COALESCE(hp, 0),
    defense = COALESCE(defense, 0),
    clears = COALESCE(clears, 0),
    score = COALESCE(score, 0);

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

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_game_results_user_id ON game_results(user_id);
