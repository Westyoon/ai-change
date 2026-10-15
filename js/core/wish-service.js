export function normalizeWishText(value) {
  const text = typeof value === "string" ? value.normalize("NFC").trim() : "";
  return text && Array.from(text).length <= 300
    && !/[\p{Cf}\p{Cs}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text) ? text : null;
}

function publicWish(value) {
  if (!value || typeof value.id !== "string" || typeof value.text !== "string") throw new Error("소원을 불러오지 못했습니다.");
  return Object.freeze({ id: value.id, nickname: String(value.nickname ?? "꿈꾸는 이화인"), text: value.text,
    department: getWishDepartment(value.department)?.code ?? null });
}

export class WishService {
  constructor({ fetchImpl = globalThis.fetch?.bind(globalThis), timeoutMs = 8000 } = {}) {
    this.fetch = fetchImpl; this.timeoutMs = timeoutMs;
  }
  async request(path, { signal, method = "GET", body } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = globalThis.setTimeout(abort, this.timeoutMs);
    try {
      const response = await this.fetch(path, {
        method, signal: controller.signal, credentials: "same-origin", cache: "no-store",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new Error(response.status === 429
        ? "잠깐 쉬었다가 다시 전해 주세요." : "소원을 전하지 못했습니다. 다시 시도해 주세요.");
      return await response.json();
    } catch (error) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (error instanceof Error && error.message.includes("전해 주세요")) throw error;
      throw new Error("연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally { globalThis.clearTimeout(timer); signal?.removeEventListener("abort", abort); }
  }
  async list({ after = null, department = null, signal } = {}) {
    const params = new URLSearchParams();
    if (after) params.set("after", after);
    if (department) {
      if (!getWishDepartment(department)) throw new Error("학과를 골라 주세요.");
      params.set("department", department);
    }
    const query = params.toString();
    const result = await this.request(`/api/wishes${query ? `?${query}` : ""}`, { signal });
    if (!Array.isArray(result?.wishes)) throw new Error("소원을 불러오지 못했습니다.");
    return { wishes: result.wishes.map(publicWish), nextCursor: typeof result.nextCursor === "string" ? result.nextCursor : null };
  }
  async submit(text, { requestId = globalThis.crypto.randomUUID(), department, signal } = {}) {
    if (!getWishDepartment(department)) throw new Error("학과를 골라 주세요.");
    const normalized = normalizeWishText(text);
    if (!normalized) throw new Error("소원을 300자 이내로 적어 주세요.");
    const result = await this.request("/api/wishes", { method: "POST", body: { text: normalized, requestId, department }, signal });
    return publicWish(result.wish);
  }
}
import { getWishDepartment } from "./wish-departments.js";
