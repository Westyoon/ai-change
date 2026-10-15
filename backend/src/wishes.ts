export const WISH_PAGE_SIZE = 20;
export const WISH_COOLDOWN_MS = 10_000;
export const WISH_DEPARTMENTS = ["DS", "CS", "CSE", "AI", "AIDS"] as const;
export function isWishDepartment(value: unknown): value is typeof WISH_DEPARTMENTS[number] {
  return typeof value === "string" && WISH_DEPARTMENTS.some((code) => code === value);
}
export const WISH_INSERT_SQL = `INSERT INTO wish_posts (id, nickname, body, department, created_at, rate_key)
  SELECT ?, ?, ?, ?, ?, ? WHERE (
    SELECT COUNT(*) FROM wish_posts WHERE rate_key = ? AND created_at > ?
  ) < ? ON CONFLICT(id) DO NOTHING`;

export function normalizeWish(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.normalize("NFC").trim();
  if (!text || Array.from(text).length > 300 || /[\p{Cf}\p{Cs}]/u.test(text)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) return null;
  return text;
}

export function isWishId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}
