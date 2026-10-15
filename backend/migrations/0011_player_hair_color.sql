-- Keep existing accounts unchanged; NULL prompts the initial character choice.
ALTER TABLE users ADD COLUMN hair_color TEXT
  CHECK (hair_color IS NULL OR hair_color IN ('magenta', 'purple', 'brown', 'blonde'));
