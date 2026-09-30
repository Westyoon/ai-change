-- HP used to store one allocation as +1 (100, 101, 102, ...). It now stores
-- the actual maximum-HP value, where every allocated point is +100
-- (100, 200, 300, ...). Preserve the number of points already invested.
UPDATE stats
SET hp = 100 + MAX(0, COALESCE(hp, 100) - 100) * 100,
    updated_at = CURRENT_TIMESTAMP;
