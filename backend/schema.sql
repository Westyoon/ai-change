-- Reference schema for a newly provisioned D1 database.
-- Existing databases must use the versioned files in backend/migrations/.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    nickname TEXT CHECK (
        nickname IS NULL
        OR (length(nickname) BETWEEN 2 AND 16 AND nickname = trim(nickname))
    ),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stats (
    user_id TEXT PRIMARY KEY,
    attack INTEGER NOT NULL DEFAULT 0 CHECK (attack >= 0),
    hp INTEGER NOT NULL DEFAULT 100 CHECK (hp >= 100 AND hp % 100 = 0),
    defense INTEGER NOT NULL DEFAULT 0 CHECK (defense >= 0),
    level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
    experience INTEGER NOT NULL DEFAULT 0 CHECK (experience >= 0),
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

CREATE TABLE IF NOT EXISTS story_progress (
    user_id TEXT NOT NULL,
    story_id TEXT NOT NULL,
    seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, story_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Postgame progression is deliberately separated from pre-game story clears.
-- Only an X-egg clear or a server-authoritative boss victory may create one of
-- these rows and therefore grant experience, a level, and a stat point.
CREATE TABLE IF NOT EXISTS postgame_results (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    content_id TEXT NOT NULL CHECK (
        content_id IN ('xr-egg-trials', 'data-sphinx', 'stat-boss', 'control-boss')
    ),
    source TEXT NOT NULL CHECK (source IN ('field', 'boss')),
    status TEXT NOT NULL CHECK (status = 'CLEAR'),
    score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 1000000),
    awarded INTEGER NOT NULL DEFAULT 0 CHECK (awarded IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (source = 'field' AND content_id = 'xr-egg-trials')
        OR (source = 'boss' AND content_id IN ('data-sphinx', 'stat-boss', 'control-boss'))
    ),
    UNIQUE (user_id, attempt_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS boss_runs (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL UNIQUE,
    boss_id TEXT NOT NULL CHECK (boss_id IN ('stat-boss', 'control-boss')),
    party_key TEXT NOT NULL,
    team_name TEXT NOT NULL CHECK (length(team_name) BETWEEN 1 AND 32),
    party_size INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 5),
    clear_time_ms INTEGER NOT NULL CHECK (clear_time_ms >= 0),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS boss_run_members (
    run_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    nickname_snapshot TEXT NOT NULL CHECK (length(nickname_snapshot) BETWEEN 1 AND 32),
    member_order INTEGER NOT NULL CHECK (member_order BETWEEN 0 AND 4),
    PRIMARY KEY (run_id, user_id),
    FOREIGN KEY (run_id) REFERENCES boss_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stats_score ON stats(score);
CREATE INDEX IF NOT EXISTS idx_stats_clears ON stats(clears);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_game_results_user_id ON game_results(user_id);
CREATE INDEX IF NOT EXISTS idx_postgame_results_user_id ON postgame_results(user_id);
CREATE INDEX IF NOT EXISTS idx_postgame_results_content ON postgame_results(content_id, created_at);
CREATE INDEX IF NOT EXISTS idx_story_progress_user_id ON story_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_boss_runs_clears ON boss_runs (boss_id, party_key, created_at);
CREATE INDEX IF NOT EXISTS idx_boss_runs_speed ON boss_runs (boss_id, clear_time_ms, created_at);
CREATE INDEX IF NOT EXISTS idx_boss_run_members_run ON boss_run_members (run_id, member_order);
