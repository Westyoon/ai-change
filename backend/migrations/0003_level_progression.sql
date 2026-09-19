-- Add the bounded level progression used by account stats.
-- Existing clears are converted to 100 XP each, capped at level 10. Existing
-- unspent points are deliberately preserved because migration must not grant a
-- second copy of points that were already awarded by the legacy clear logic.
ALTER TABLE stats ADD COLUMN level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 10);
ALTER TABLE stats ADD COLUMN experience INTEGER NOT NULL DEFAULT 0 CHECK (experience BETWEEN 0 AND 900);

UPDATE stats
SET experience = MIN(9, MAX(0, COALESCE(clears, 0))) * 100,
    level = 1 + MIN(9, MAX(0, COALESCE(clears, 0)));
