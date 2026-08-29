import { createButton, createElement } from "./scene-utils.js";

const CRITERIA = Object.freeze({
  score: Object.freeze({ label: "최고 점수", value: (entry) => entry.score.toLocaleString("ko-KR") }),
  clears: Object.freeze({ label: "누적 클리어", value: (entry) => `${entry.clears}회` }),
});
const SCORE_GAME_IDS = new Set([
  "cyber-click-to-purify",
  "computer-code-heart",
  "ai-ball-classification",
]);

function rankingRow(entry, criterion) {
  const row = createElement("li", { className: "ranking-row" });
  if (entry.rank <= 3) row.dataset.podium = String(entry.rank);
  row.append(
    createElement("strong", { className: "ranking-row__rank", text: `${entry.rank}위` }),
    createElement("span", { className: "ranking-row__name", text: entry.name }),
    createElement("strong", { className: "ranking-row__value", text: CRITERIA[criterion].value(entry) }),
  );
  return row;
}

export function createRankingScene(context) {
  let mounted = false;
  let requestSequence = 0;
  let requestController = null;

  return {
    mount(root, params = {}) {
      mounted = true;
      const scoreGames = (context.content.minigames ?? [])
        .filter((game) => SCORE_GAME_IDS.has(game.id));
      let scoreGameId = scoreGames.some((game) => game.id === params.gameId)
        ? params.gameId
        : (scoreGames.find((game) => game.id === "computer-code-heart")?.id ?? scoreGames[0]?.id ?? null);
      let criterion = Object.hasOwn(CRITERIA, params.criteria) ? params.criteria : "clears";
      if (criterion === "score" && !scoreGameId) criterion = "clears";
      const scene = createElement("section", {
        className: "scene scene--panel ranking-scene",
        attributes: { "aria-labelledby": "ranking-title" },
      });
      const heading = createElement("header", { className: "account-scene__header" }, [
        createElement("div", {}, [
          createElement("p", { className: "eyebrow", text: "FESTIVAL RANKING" }),
          createElement("h2", { text: "랭킹보드", attributes: { id: "ranking-title" } }),
          createElement("p", {
            className: "muted",
            text: "표시 이름과 게임 기록만 공개합니다. 현재는 브라우저 판정 기반 테스트 순위이며 공식 경쟁·실물 보상용이 아닙니다.",
          }),
        ]),
        createButton("메뉴로", () => context.router.navigate("main-menu"), "ghost"),
      ]);
      const scoreButton = createButton("최고 점수", () => selectCriterion("score"), "ghost");
      const clearsButton = createButton("누적 클리어", () => selectCriterion("clears"), "ghost");
      const controls = createElement("div", {
        className: "ranking-tabs",
        attributes: { role: "group", "aria-label": "랭킹 기준" },
      }, [scoreButton, clearsButton]);
      scoreButton.disabled = scoreGames.length === 0;
      const gameSelect = createElement("select", {
        className: "ranking-game-filter__select",
        attributes: { "aria-label": "점수 랭킹 미니게임" },
        on: {
          change(event) {
            scoreGameId = event.currentTarget.value;
            if (criterion === "score") void loadRanking();
          },
        },
      }, scoreGames.map((game) => createElement("option", {
        text: `${game.departmentCode} · ${game.title}`,
        attributes: { value: game.id },
      })));
      if (scoreGameId) gameSelect.value = scoreGameId;
      const gameFilter = createElement("label", { className: "ranking-game-filter" }, [
        createElement("span", { text: "점수 비교 게임" }),
        gameSelect,
      ]);
      const status = createElement("p", {
        className: "muted ranking-status",
        text: "랭킹을 불러오고 있습니다.",
        attributes: { role: "status" },
      });
      const list = createElement("ol", { className: "ranking-list list-reset" });
      const footer = createElement("div", { className: "button-row" }, [
        createButton("내 계정", () => context.router.navigate("account"), "primary"),
      ]);
      scene.append(heading, controls, gameFilter, status, list, footer);
      root.append(scene);

      function updateTabs() {
        for (const [key, button] of [["score", scoreButton], ["clears", clearsButton]]) {
          const active = key === criterion;
          button.classList.toggle("ranking-tabs__button--active", active);
          button.setAttribute("aria-pressed", String(active));
        }
        gameFilter.hidden = criterion !== "score";
      }

      async function loadRanking() {
        const sequence = ++requestSequence;
        requestController?.abort();
        requestController = new AbortController();
        list.replaceChildren();
        status.hidden = false;
        const activeGame = scoreGames.find((game) => game.id === scoreGameId);
        const rankingLabel = criterion === "score"
          ? `${activeGame?.title ?? "미니게임"} 최고 점수`
          : CRITERIA[criterion].label;
        status.textContent = `${rankingLabel} 랭킹을 불러오고 있습니다.`;
        scene.setAttribute("aria-busy", "true");
        try {
          const entries = await context.services.account.getRanking(criterion, {
            signal: requestController.signal,
            gameId: criterion === "score" ? scoreGameId : null,
          });
          if (!mounted || sequence !== requestSequence) return;
          if (entries.length === 0) {
            status.textContent = "아직 표시할 랭킹 기록이 없습니다.";
            return;
          }
          const fragment = document.createDocumentFragment();
          for (const entry of entries) fragment.append(rankingRow(entry, criterion));
          list.replaceChildren(fragment);
          status.hidden = true;
        } catch (error) {
          if (error?.name === "AbortError" || !mounted || sequence !== requestSequence) return;
          status.textContent = error instanceof Error
            ? error.message
            : "랭킹을 불러오지 못했습니다.";
          const retry = createButton("다시 시도", () => void loadRanking(), "ghost");
          list.replaceChildren(createElement("li", { className: "ranking-retry" }, [retry]));
        } finally {
          if (mounted && sequence === requestSequence) scene.removeAttribute("aria-busy");
        }
      }

      function selectCriterion(next) {
        if (next === criterion) return;
        if (next === "score" && !scoreGameId) return;
        criterion = next;
        updateTabs();
        void loadRanking();
      }

      updateTabs();
      void loadRanking();
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
