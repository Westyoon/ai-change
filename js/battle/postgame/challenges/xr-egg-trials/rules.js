export const TRIAL_IDS = Object.freeze(["rps", "card-match", "mash"]);

export const RPS_HANDS = Object.freeze(["rock", "scissors", "paper"]);

const RPS_BEATS = Object.freeze({
  rock: "scissors",
  scissors: "paper",
  paper: "rock",
});

export function judgeRps(playerHand, opponentHand) {
  if (!RPS_HANDS.includes(playerHand) || !RPS_HANDS.includes(opponentHand)) {
    throw new TypeError("가위바위보 손 모양은 rock/scissors/paper 중 하나여야 합니다.");
  }
  if (playerHand === opponentHand) return "draw";
  return RPS_BEATS[playerHand] === opponentHand ? "win" : "lose";
}

export function selectRandomItem(items, random = Math.random) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new TypeError("무작위 선택 대상이 비어 있습니다.");
  }
  const sample = Math.max(0, Math.min(0.999999999999, Number(random()) || 0));
  return items[Math.floor(sample * items.length)];
}

export function shuffledCards(symbols, random = Math.random) {
  if (!Array.isArray(symbols) || symbols.length < 2) {
    throw new TypeError("카드 짝맞추기에는 서로 다른 기호가 두 개 이상 필요합니다.");
  }
  const deck = symbols.flatMap((symbol, pairIndex) => [
    { id: `${pairIndex}-a`, symbol },
    { id: `${pairIndex}-b`, symbol },
  ]);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const sample = Math.max(0, Math.min(0.999999999999, Number(random()) || 0));
    const swapIndex = Math.floor(sample * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

export function clampWholeNumber(value, minimum, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.trunc(parsed));
}

export function calculateTrialScore(trialId, metrics = {}) {
  if (trialId === "rps") return metrics.outcome === "win" ? 100 : 0;
  if (trialId === "card-match") {
    return Math.max(0, (Number(metrics.matchedPairs) || 0) * 100 + (Number(metrics.livesRemaining) || 0) * 10);
  }
  if (trialId === "mash") return Math.max(0, (Number(metrics.presses) || 0) * 10);
  return 0;
}
