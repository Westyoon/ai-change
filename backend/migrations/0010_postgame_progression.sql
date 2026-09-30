-- Growth rewards belong only to postgame X-egg clears and boss victories.
-- The awarded flag and per-user attempt uniqueness make retries idempotent.
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

CREATE INDEX IF NOT EXISTS idx_postgame_results_user_id
    ON postgame_results(user_id);
CREATE INDEX IF NOT EXISTS idx_postgame_results_content
    ON postgame_results(content_id, created_at);
