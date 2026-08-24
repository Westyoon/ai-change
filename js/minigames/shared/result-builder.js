export const MINI_GAME_STATUSES = Object.freeze(["CLEAR", "FAIL", "QUIT", "ERROR"]);

const CANDIDATE_FIELDS = new Set(["status", "score", "failureReason", "metrics", "reward"]);

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new TypeError("Mini-game result metrics must be JSON serializable.");
  }
}

export function buildMiniGameCandidate({
  status,
  score = null,
  failureReason = null,
  metrics = {},
  reward = null,
} = {}) {
  if (!MINI_GAME_STATUSES.includes(status)) {
    throw new TypeError(`Invalid mini-game result status: ${String(status)}`);
  }
  if (score !== null && (!Number.isFinite(score) || typeof score !== "number")) {
    throw new TypeError("Mini-game score must be a finite number or null.");
  }
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    throw new TypeError("Mini-game metrics must be an object.");
  }
  if ((status === "CLEAR" || status === "QUIT") && failureReason !== null) {
    throw new TypeError(`${status} result must not include a failure reason.`);
  }
  if ((status === "FAIL" || status === "ERROR") && !failureReason) {
    throw new TypeError(`${status} result requires a stable failure reason.`);
  }
  if ((status === "QUIT" || status === "ERROR") && Object.keys(metrics).length > 0) {
    throw new TypeError(`${status} result metrics must be empty.`);
  }
  if ((status === "QUIT" || status === "ERROR") && (score !== null || reward !== null)) {
    throw new TypeError(`${status} result score and reward must be null.`);
  }

  return Object.freeze({
    status,
    score,
    failureReason,
    metrics: Object.freeze(cloneJson(metrics)),
    reward: cloneJson(reward),
  });
}

export function assertCandidateFieldAllowlist(candidate) {
  const invalid = Object.keys(candidate ?? {}).filter((field) => !CANDIDATE_FIELDS.has(field));
  if (invalid.length > 0) {
    throw new TypeError(`Candidate contains host-owned or unknown fields: ${invalid.join(", ")}`);
  }
  return true;
}

export function buildClearCandidate(metrics = {}, options = {}) {
  return buildMiniGameCandidate({ ...options, status: "CLEAR", metrics, failureReason: null });
}

export function buildFailCandidate(failureReason, metrics = {}, options = {}) {
  return buildMiniGameCandidate({ ...options, status: "FAIL", failureReason, metrics });
}

export default buildMiniGameCandidate;
