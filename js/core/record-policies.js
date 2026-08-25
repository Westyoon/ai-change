const VALID_ELIGIBLE_STATUSES = new Set(["CLEAR", "FAIL"]);
const VALID_COMPARISON_RESULTS = new Set(["BETTER", "EQUAL", "WORSE"]);

const policies = new Map();

export function defineRecordPolicy(key, definition) {
  if (typeof key !== "string" || !/^[a-z][a-z0-9-]*$/.test(key)) {
    throw new TypeError("Record policy key must be lowercase kebab-case.");
  }
  if (policies.has(key)) {
    throw new Error(`Record policy is already registered: ${key}`);
  }

  const eligibleStatuses = [...(definition?.eligibleStatuses ?? [])];
  if (
    eligibleStatuses.length === 0 ||
    eligibleStatuses.some((status) => !VALID_ELIGIBLE_STATUSES.has(status))
  ) {
    throw new TypeError("Record policies may target approved CLEAR/FAIL statuses only.");
  }
  if (typeof definition?.project !== "function" || typeof definition?.compare !== "function") {
    throw new TypeError("Record policy requires project and compare functions.");
  }

  const policy = Object.freeze({
    eligibleStatuses: Object.freeze(eligibleStatuses),
    project: definition.project,
    compare(nextRecord, currentRecord) {
      const outcome = definition.compare(nextRecord, currentRecord);
      if (!VALID_COMPARISON_RESULTS.has(outcome)) {
        throw new TypeError(`Invalid record comparison result: ${String(outcome)}`);
      }
      return outcome;
    },
    tieBreak: definition.tieBreak ?? "KEEP_EXISTING",
  });

  policies.set(key, policy);
  return policy;
}

export function hasRecordPolicy(key) {
  return policies.has(key);
}

export function getRecordPolicy(key) {
  if (key == null) {
    return null;
  }
  return policies.get(key) ?? null;
}

export function projectRecord(key, result) {
  const policy = getRecordPolicy(key);
  if (!policy || !policy.eligibleStatuses.includes(result?.status)) {
    return null;
  }
  return policy.project(result);
}

export function compareRecords(key, nextRecord, currentRecord) {
  const policy = getRecordPolicy(key);
  if (!policy) {
    throw new Error(`Unknown record policy: ${String(key)}`);
  }
  if (currentRecord == null) {
    return "BETTER";
  }
  return policy.compare(nextRecord, currentRecord);
}

export function listRecordPolicyKeys() {
  return [...policies.keys()];
}

// Policies are deliberately not pre-registered while D-04/D-06~D-09 remain
// undecided. Approved policies can be registered here without allowing JSON to
// name arbitrary executable functions.
