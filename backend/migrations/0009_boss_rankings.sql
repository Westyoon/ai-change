-- Server-authoritative cooperative boss clear records.
-- A room id is created by the Durable Object and can be credited only once.
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

CREATE INDEX IF NOT EXISTS idx_boss_runs_clears
    ON boss_runs (boss_id, party_key, created_at);
CREATE INDEX IF NOT EXISTS idx_boss_runs_speed
    ON boss_runs (boss_id, clear_time_ms, created_at);
CREATE INDEX IF NOT EXISTS idx_boss_run_members_run
    ON boss_run_members (run_id, member_order);
