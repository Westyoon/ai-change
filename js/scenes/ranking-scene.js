import { createButton, createElement } from "./scene-utils.js";

const BOSSES = Object.freeze({
  "stat-boss": "스탯 보스",
  "control-boss": "컨트롤 보스",
});

const CRITERIA = Object.freeze({
  "boss-clears": Object.freeze({
    label: "누적 클리어",
    value: (entry) => `${entry.clears.toLocaleString("ko-KR")}회`,
  }),
  "boss-speed": Object.freeze({
    label: "최단 클리어",
    value: (entry) => formatClearTime(entry.clearTimeMs),
  }),
});

function formatClearTime(milliseconds) {
  const safe = Math.max(0, Math.trunc(Number(milliseconds) || 0));
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  const fraction = String(safe % 1_000).padStart(3, "0");
  return `${minutes}:${String(seconds).padStart(2, "0")}.${fraction}`;
}

function rankingRow(entry, criterion) {
  const row = createElement("li", { className: "ranking-row" });
  if (entry.rank <= 3) row.dataset.podium = String(entry.rank);
  const identity = createElement("span", { className: "ranking-row__identity" }, [
    createElement("strong", { className: "ranking-row__name", text: entry.name }),
  ]);
  if (entry.partySize > 1 && entry.members.length > 0) {
    identity.append(createElement("small", {
      className: "ranking-row__members",
      text: entry.members.join(" · "),
    }));
  }
  row.append(
    createElement("strong", { className: "ranking-row__rank", text: `${entry.rank}위` }),
    identity,
    createElement("strong", {
      className: "ranking-row__value",
      text: CRITERIA[criterion].value(entry),
    }),
  );
  return row;
}

function leaderboard(criterion) {
  const list = createElement("ol", { className: "ranking-list list-reset" });
  const status = createElement("p", {
    className: "muted ranking-status",
    text: "불러오는 중…",
    attributes: { role: "status" },
  });
  const element = createElement("section", {
    className: "ranking-board",
    attributes: { "aria-labelledby": `ranking-${criterion}` },
  }, [
    createElement("h3", {
      text: CRITERIA[criterion].label,
      attributes: { id: `ranking-${criterion}` },
    }),
    status,
    list,
  ]);
  return { criterion, element, list, status };
}

export function createRankingScene(context) {
  let mounted = false;
  let requestSequence = 0;
  let requestController = null;

  return {
    mount(root, params = {}) {
      mounted = true;
      let bossId = Object.hasOwn(BOSSES, params.bossId) ? params.bossId : "stat-boss";
      const scene = createElement("section", {
        className: "scene scene--panel ranking-scene",
        attributes: { "aria-labelledby": "ranking-title" },
      });
      const heading = createElement("header", { className: "account-scene__header" }, [
        createElement("div", {}, [
          createElement("p", { className: "eyebrow", text: "BOSS RANKING" }),
          createElement("h2", { text: "랭킹보드", attributes: { id: "ranking-title" } }),
        ]),
        createButton("메뉴로", () => context.router.navigate("main-menu"), "ghost"),
      ]);

      const bossButtons = Object.entries(BOSSES).map(([id, label]) => createButton(
        label,
        () => selectBoss(id),
        "ghost",
      ));
      const controls = createElement("div", {
        className: "ranking-tabs",
        attributes: { role: "group", "aria-label": "보스 선택" },
      }, bossButtons);
      const boards = Object.keys(CRITERIA).map(leaderboard);
      const boardGrid = createElement("div", { className: "ranking-boards" },
        boards.map((board) => board.element));
      const footer = createElement("div", { className: "button-row" }, [
        createButton("내 계정", () => context.router.navigate("account"), "primary"),
      ]);
      scene.append(heading, controls, boardGrid, footer);
      root.append(scene);

      function updateBossTabs() {
        Object.keys(BOSSES).forEach((id, index) => {
          const active = id === bossId;
          bossButtons[index].classList.toggle("ranking-tabs__button--active", active);
          bossButtons[index].setAttribute("aria-pressed", String(active));
        });
      }

      function renderBoard(board, entries) {
        if (entries.length === 0) {
          board.list.replaceChildren();
          board.status.hidden = false;
          board.status.textContent = "아직 클리어 기록이 없습니다.";
          return;
        }
        board.list.replaceChildren(...entries.map((entry) => rankingRow(entry, board.criterion)));
        board.status.hidden = true;
      }

      async function loadRankings() {
        const sequence = ++requestSequence;
        requestController?.abort();
        requestController = new AbortController();
        scene.setAttribute("aria-busy", "true");
        for (const board of boards) {
          board.list.replaceChildren();
          board.status.hidden = false;
          board.status.textContent = `${BOSSES[bossId]} ${CRITERIA[board.criterion].label}을 불러오는 중…`;
        }
        try {
          const rankings = await Promise.all(boards.map((board) => (
            context.services.account.getRanking(board.criterion, {
              bossId,
              signal: requestController.signal,
            })
          )));
          if (!mounted || sequence !== requestSequence) return;
          boards.forEach((board, index) => renderBoard(board, rankings[index]));
        } catch (error) {
          if (error?.name === "AbortError" || !mounted || sequence !== requestSequence) return;
          for (const board of boards) {
            board.list.replaceChildren();
            board.status.hidden = false;
            board.status.textContent = error instanceof Error
              ? error.message
              : "랭킹을 불러오지 못했습니다.";
          }
          boards[0].list.replaceChildren(createElement("li", { className: "ranking-retry" }, [
            createButton("다시 시도", () => void loadRankings(), "ghost"),
          ]));
        } finally {
          if (mounted && sequence === requestSequence) scene.removeAttribute("aria-busy");
        }
      }

      function selectBoss(nextBossId) {
        if (nextBossId === bossId || !Object.hasOwn(BOSSES, nextBossId)) return;
        bossId = nextBossId;
        updateBossTabs();
        void loadRankings();
      }

      updateBossTabs();
      void loadRankings();
    },
    unmount() {
      mounted = false;
      requestSequence += 1;
      requestController?.abort();
      requestController = null;
    },
  };
}

export default createRankingScene;
