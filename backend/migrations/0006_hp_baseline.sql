-- Account HP is stored as a value starting at 100. Older schemas used a zero
-- default, so rebuild the table with the current invariant and monotonically
-- normalize only legacy rows below the baseline.
CREATE TABLE stats_hp_baseline (
    user_id TEXT PRIMARY KEY,
    attack INTEGER NOT NULL DEFAULT 0 CHECK (attack >= 0),
    hp INTEGER NOT NULL DEFAULT 100 CHECK (hp >= 100),
    defense INTEGER NOT NULL DEFAULT 0 CHECK (defense >= 0),
    level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
    experience INTEGER NOT NULL DEFAULT 0 CHECK (experience >= 0),
    clears INTEGER NOT NULL DEFAULT 0 CHECK (clears >= 0),
    score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
    unspent_points INTEGER NOT NULL DEFAULT 0 CHECK (unspent_points >= 0),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO stats_hp_baseline (
    user_id,
    attack,
    hp,
    defense,
    level,
    experience,
    clears,
    score,
    unspent_points,
    updated_at
)
SELECT
    user_id,
    attack,
    MAX(100, COALESCE(hp, 0)),
    defense,
    level,
    experience,
    clears,
    score,
    unspent_points,
    updated_at
FROM stats;

DROP TABLE stats;
ALTER TABLE stats_hp_baseline RENAME TO stats;

CREATE INDEX idx_stats_score ON stats(score);
CREATE INDEX idx_stats_clears ON stats(clears);
