import { createButton, createElement } from "../../scenes/scene-utils.js";

function memberNames(snapshot) {
  return (Array.isArray(snapshot?.roster) ? snapshot.roster : [])
    .map((member) => member?.name)
    .filter((name) => typeof name === "string" && name.trim())
    .slice(0, 5)
    .join(" · ");
}

export function createBattleRecoveryPrompt({ onContinue, onLeave } = {}) {
  let snapshot = null;
  let battleTitle = "보스";
  let leaving = false;

  const title = createElement("h2", {
    className: "battle-recovery__title",
    text: "진행 중인 전투가 있습니다",
    attributes: { id: "battle-recovery-title" },
  });
  const summary = createElement("p", { className: "battle-recovery__summary" });
  const roster = createElement("p", { className: "battle-recovery__roster" });
  const status = createElement("p", {
    className: "battle-recovery__status",
    attributes: { role: "status", "aria-live": "polite" },
  });
  const continueButton = createButton("이어하기", () => {
    if (!snapshot || leaving) return;
    onContinue?.(snapshot);
  }, "primary");
  continueButton.className += " battle-recovery__continue";
  const leaveButton = createButton("전투 나가기", () => {
    if (!snapshot || leaving) return;
    onLeave?.(snapshot);
  }, "ghost");
  leaveButton.className += " battle-recovery__leave";

  const element = createElement("section", {
    className: "battle-recovery",
    attributes: {
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "battle-recovery-title",
    },
    dataset: { open: "false", leaving: "false" },
  }, [
    createElement("div", { className: "battle-recovery__panel" }, [
      title,
      summary,
      roster,
      status,
      createElement("div", { className: "battle-recovery__actions" }, [
        continueButton,
        leaveButton,
      ]),
    ]),
  ]);
  element.hidden = true;

  const render = () => {
    const bossHp = Math.max(0, Math.trunc(Number(snapshot?.bossHp) || 0));
    const bossMaxHp = Math.max(1, Math.trunc(Number(snapshot?.bossMaxHp) || 1));
    summary.textContent = `${battleTitle} · 보스 체력 ${bossHp}/${bossMaxHp}`;
    const names = memberNames(snapshot);
    roster.textContent = names ? `파티원 · ${names}` : "파티 정보를 불러오는 중입니다.";
    status.textContent = leaving
      ? "전투 참가 상태를 정리하는 중입니다…"
      : "자동으로 입장하지 않습니다. 이어갈지, 전투에서 나갈지 선택해 주세요.";
    continueButton.disabled = leaving;
    leaveButton.disabled = leaving;
    leaveButton.textContent = leaving ? "나가는 중…" : "전투 나가기";
    element.dataset.leaving = String(leaving);
  };

  return Object.freeze({
    element,
    open(nextSnapshot, { title: nextTitle = "보스" } = {}) {
      if (!nextSnapshot?.roomId || !nextSnapshot?.battleId) return false;
      snapshot = nextSnapshot;
      battleTitle = nextTitle;
      leaving = false;
      element.hidden = false;
      element.dataset.open = "true";
      render();
      continueButton.focus?.({ preventScroll: true });
      return true;
    },
    update(nextSnapshot) {
      if (!snapshot || nextSnapshot?.roomId !== snapshot.roomId) return false;
      snapshot = nextSnapshot;
      render();
      return true;
    },
    setLeaving(nextLeaving) {
      leaving = nextLeaving === true;
      render();
    },
    close() {
      snapshot = null;
      leaving = false;
      element.hidden = true;
      element.dataset.open = "false";
      element.dataset.leaving = "false";
    },
    isOpen: () => element.dataset.open === "true",
    getSnapshot: () => snapshot,
    destroy() {
      snapshot = null;
      element.remove?.();
    },
  });
}

export default createBattleRecoveryPrompt;
