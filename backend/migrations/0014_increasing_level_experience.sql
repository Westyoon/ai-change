-- Preserve earned levels, allocated stats and unspent points. Convert only the
-- cumulative XP base from fixed 100-XP levels to 100, 200, 300 ... XP levels.
UPDATE stats
SET experience = (MAX(1, COALESCE(level, 1)) - 1) * MAX(1, COALESCE(level, 1)) * 50
  + MIN(MAX(1, COALESCE(level, 1)) * 100 - 1,
        MAX(0, COALESCE(experience, 0) - (MAX(1, COALESCE(level, 1)) - 1) * 100)),
    updated_at = CURRENT_TIMESTAMP;
