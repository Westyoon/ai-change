-- Add an optional player-selected public nickname without replacing the
-- provider display name. Existing accounts keep NULL and continue to fall
-- back to their Google display name until they choose a nickname.
ALTER TABLE users ADD COLUMN nickname TEXT CHECK (
    nickname IS NULL
    OR (length(nickname) BETWEEN 2 AND 16 AND nickname = trim(nickname))
);
