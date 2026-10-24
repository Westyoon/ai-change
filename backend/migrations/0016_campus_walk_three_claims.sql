CREATE TABLE campus_walk_awards (
  user_id TEXT NOT NULL,
  claim_number INTEGER NOT NULL CHECK (claim_number BETWEEN 1 AND 3),
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, claim_number),
  UNIQUE (user_id, request_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Preserve the previous one-time award as the first of three lifetime claims.
-- Backfill before installing the trigger so historical HP is not awarded twice.
INSERT INTO campus_walk_awards (user_id, claim_number, request_id, created_at)
  SELECT user_id, 1, 'legacy', created_at FROM campus_walk_claims;

CREATE TRIGGER campus_walk_award_hp AFTER INSERT ON campus_walk_awards
WHEN NEW.request_id <> 'legacy'
BEGIN
  UPDATE stats SET hp = hp + 100, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = NEW.user_id;
  INSERT OR IGNORE INTO campus_walk_claims (user_id) VALUES (NEW.user_id);
END;

-- Keep old Worker requests during rollout in the same lifetime claim history.
CREATE TRIGGER campus_walk_legacy_claim AFTER INSERT ON campus_walk_claims
BEGIN
  INSERT OR IGNORE INTO campus_walk_awards (user_id, claim_number, request_id, created_at)
    VALUES (NEW.user_id, 1, 'legacy', NEW.created_at);
END;
