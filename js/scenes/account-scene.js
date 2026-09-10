import { createButton, createElement, showToast } from "./scene-utils.js";

const ACCOUNT_ORIGIN = "https://ai-change.ai-change-backend.workers.dev";

function isSeparateHostedOrigin(locationRef = globalThis.location) {
  const origin = locationRef?.origin;
  const protocol = locationRef?.protocol;
  return protocol === "https:" && typeof origin === "string" && origin !== ACCOUNT_ORIGIN;
}

const STAT_DEFINITIONS = Object.freeze([
  Object.freeze({ key: "attack", label: "공격", description: "기본 전투 공격 스탯" }),
  Object.freeze({ key: "hp", label: "HP", description: "기본 전투 체력 스탯" }),
  Object.freeze({ key: "defense", label: "방어", description: "기본 전투 방어 스탯" }),
]);

function statCard(definition, value, { canAllocate, disabled, onAllocate }) {
  const card = createElement("article", { className: "account-stat-card" }, [
    createElement("span", { className: "account-stat-card__label", text: definition.label }),
    createElement("strong", { className: "account-stat-card__value", text: value }),
    createElement("span", { className: "muted account-stat-card__description", text: definition.description }),
  ]);
  if (canAllocate) {
    const button = createButton(`${definition.label} +1`, onAllocate, "ghost");
    button.classList.add("account-stat-card__allocate");
    button.disabled = disabled;
    button.setAttribute("aria-label", `미사용 포인트로 ${definition.label} 스탯 1 올리기`);
    card.append(button);
  }
  return card;
}

function notice(text, tone = "info") {
  return createElement("p", {
    className: `account-notice account-notice--${tone}`,
    text,
    attributes: { role: tone === "error" ? "alert" : "status" },
  });
}

export function createAccountScene(context) {
  let mounted = false;
  let unsubscribe = null;
  let busyAction = null;
  let actionError = null;
  let progressSyncing = false;

  return {
    mount(root, params = {}) {
      mounted = true;
      const service = context.services.account;
      const scene = createElement("section", {
        className: "scene scene--panel account-scene",
        attributes: { "aria-labelledby": "account-title" },
      });
      const heading = createElement("header", { className: "account-scene__header" }, [
        createElement("div", {}, [
          createElement("p", { className: "eyebrow", text: "PLAYER ACCOUNT" }),
          createElement("h2", { text: "내 계정과 전투 스탯", attributes: { id: "account-title" } }),
          createElement("p", {
            className: "muted",
            text: "미니게임 클리어 기록과 사후게임 기본 전투 스탯을 확인합니다.",
          }),
        ]),
        createButton("메뉴로", () => context.router.navigate("main-menu"), "ghost"),
      ]);
      const content = createElement("div", {
        className: "account-scene__content",
        attributes: { "aria-live": "polite" },
      });
      scene.append(heading, content);
      root.append(scene);
      const miniGameIds = new Set(context.content.minigames.map((game) => game.id));
      const totalMiniGames = miniGameIds.size;
      const localCompletedGameIds = () => (
        context.services.save?.getCompletedMiniGameIds?.() ?? []
      ).filter((gameId) => miniGameIds.has(gameId));

      const runAllocation = async (stat) => {
        if (busyAction || progressSyncing) return;
        busyAction = stat;
        actionError = null;
        render(service.getState());
        try {
          await service.allocateStat(stat);
          if (mounted) showToast(context, "스탯 1포인트를 반영했습니다.");
        } catch (error) {
          actionError = error instanceof Error ? error.message : "스탯을 반영하지 못했습니다.";
        } finally {
          busyAction = null;
          if (mounted) render(service.getState());
        }
      };

      const runLogout = async () => {
        if (busyAction || progressSyncing) return;
        busyAction = "logout";
        actionError = null;
        render(service.getState());
        try {
          await service.logout();
          if (mounted) showToast(context, "로그아웃했습니다.");
        } catch (error) {
          actionError = error instanceof Error ? error.message : "로그아웃하지 못했습니다.";
        } finally {
          busyAction = null;
          if (mounted) render(service.getState());
        }
      };

      const render = (state) => {
        if (!mounted) return;
        const nodes = [];
        if (params.authCallback === "success") {
          if (state.status === "idle" || state.status === "loading") {
            nodes.push(notice(params.notice, params.noticeTone));
          } else if (state.authenticated) {
            nodes.push(notice("Google 로그인이 확인되었습니다. 계정 정보를 불러왔습니다."));
          } else {
            nodes.push(notice(
              state.available
                ? "Google 인증은 완료됐지만 이 브라우저에서 로그인 세션을 찾지 못했습니다. 아래 버튼으로 다시 로그인해 주세요."
                : "Google 인증은 완료됐지만 계정 서버 확인이 지연되고 있습니다. 잠시 뒤 연결을 다시 확인해 주세요.",
              "error",
            ));
          }
        } else if (params.notice) {
          nodes.push(notice(params.notice, params.noticeTone));
        }
        if (actionError) nodes.push(notice(actionError, "error"));
        if (progressSyncing) nodes.push(notice("이 브라우저의 클리어 기록을 계정에 옮기고 있습니다."));

        if (state.status === "idle" || (state.status === "loading" && !state.authenticated)) {
          nodes.push(createElement("div", { className: "account-empty" }, [
            createElement("span", { className: "account-spinner", attributes: { "aria-hidden": "true" } }),
            createElement("strong", { text: "로그인 상태를 확인하고 있습니다." }),
            createElement("span", { className: "muted", text: "게임 로딩과는 별도로 처리됩니다." }),
          ]));
          content.replaceChildren(...nodes);
          return;
        }

        if (!state.authenticated) {
          const separateAccountOrigin = !state.available && isSeparateHostedOrigin();
          const loginLink = createElement("a", {
            className: "button button--primary",
            text: "Google로 로그인",
            attributes: {
              href: separateAccountOrigin
                ? `${ACCOUNT_ORIGIN}/api/auth/google`
                : service.getLoginUrl(),
            },
          });
          const retry = createButton("연결 다시 확인", () => {
            actionError = null;
            void service.refreshSession();
          }, "ghost");
          const actions = createElement("div", { className: "button-row" }, [loginLink]);
          if (!state.available) actions.append(retry);
          if (separateAccountOrigin) {
            actions.append(
              createElement("a", {
                className: "button button--ghost",
                text: "운영 주소에서 열기",
                attributes: { href: ACCOUNT_ORIGIN },
              }),
            );
          }
          const localProgress = localCompletedGameIds().length;
          const progressCopy = separateAccountOrigin
            ? "이 주소에 저장된 진행은 브라우저 보안상 운영 주소로 자동 이전되지 않습니다. 운영 주소에서 플레이한 기록은 로그인할 때 자동 연결됩니다."
            : `이 브라우저의 사전게임 진행 ${localProgress}/${totalMiniGames}도 로그인 후 계정에 연결합니다.`;
          nodes.push(createElement("div", { className: "account-empty" }, [
            createElement("strong", { text: "현재 게스트로 플레이 중입니다." }),
            createElement("span", {
              className: "muted",
              text: state.error ?? "로그인하면 클리어 기록과 전투 스탯을 서버에 저장할 수 있습니다.",
            }),
            createElement("span", {
              className: "account-privacy-note",
              text: `${progressCopy} Google 계정 식별자와 이메일은 로그인 연결에만 사용하며 공개하지 않습니다. 표시 이름은 테스트 랭킹에 공개됩니다.`,
            }),
            actions,
          ]));
          content.replaceChildren(...nodes);
          return;
        }

        const stats = state.stats;
        const completedGameCount = state.completedGameIds.filter(
          (gameId) => miniGameIds.has(gameId),
        ).length;
        const canAllocate = stats.unspentPoints > 0;
        const statGrid = createElement("div", { className: "account-stat-grid" });
        for (const definition of STAT_DEFINITIONS) {
          statGrid.append(statCard(definition, stats[definition.key], {
            canAllocate,
            disabled: Boolean(busyAction) || progressSyncing,
            onAllocate: () => void runAllocation(definition.key),
          }));
        }

        const recordGrid = createElement("dl", { className: "account-record-grid" }, [
          createElement("div", {}, [
            createElement("dt", { text: "누적 클리어" }),
            createElement("dd", { text: stats.clears }),
          ]),
          createElement("div", {}, [
            createElement("dt", { text: "사전게임 진행" }),
            createElement("dd", { text: `${completedGameCount} / ${totalMiniGames}` }),
          ]),
          createElement("div", { className: "account-record-grid__points" }, [
            createElement("dt", { text: "미사용 스탯 포인트" }),
            createElement("dd", { text: stats.unspentPoints }),
          ]),
        ]);
        const logout = createButton(busyAction === "logout" ? "로그아웃 중…" : "로그아웃", () => void runLogout(), "ghost");
        logout.disabled = Boolean(busyAction) || progressSyncing;
        nodes.push(
          createElement("div", { className: "account-profile" }, [
            createElement("span", { className: "status-badge", text: "SIGNED IN" }),
            createElement("h3", { text: `${state.user?.name ?? "플레이어"} 님` }),
            createElement("p", { className: "muted", text: "이 화면에는 이메일이나 외부 계정 ID를 표시하지 않습니다." }),
          ]),
          recordGrid,
          createElement("div", { className: "account-section-heading" }, [
            createElement("h3", { text: "기본 전투 스탯" }),
            createElement("span", {
              className: "status-badge",
              text: canAllocate ? `사용 가능 ${stats.unspentPoints}` : "포인트 없음",
            }),
          ]),
          statGrid,
          createElement("p", {
            className: "muted account-formula-note",
            text: "현재 값은 계정 원본 스탯입니다. HP·공격·방어의 실제 전투 계산식은 사후게임 전투 모듈에서 별도로 적용합니다.",
          }),
          createElement("div", { className: "button-row" }, [
            createButton("랭킹 보기", () => context.router.navigate("ranking"), "primary"),
            logout,
          ]),
        );
        content.replaceChildren(...nodes);
      };

      const syncLocalProgress = async (state) => {
        if (!mounted || progressSyncing || !state.authenticated) return;
        const pendingGameIds = localCompletedGameIds().filter(
          (gameId) => !state.completedGameIds.includes(gameId),
        );
        if (pendingGameIds.length === 0) return;

        progressSyncing = true;
        actionError = null;
        render(state);
        try {
          const result = await service.importCompletedGameIds(pendingGameIds);
          if (mounted && result.importedGameIds.length > 0) {
            showToast(context, `게스트 클리어 ${result.importedGameIds.length}개를 계정에 옮겼습니다.`);
          }
        } catch (error) {
          actionError = error instanceof Error
            ? error.message
            : "게스트 클리어 기록을 계정에 옮기지 못했습니다.";
        } finally {
          progressSyncing = false;
          if (mounted) render(service.getState());
        }
      };

      unsubscribe = service.subscribe((state) => {
        render(state);
        void syncLocalProgress(state);
      });
      if (service.getState().status === "idle") void service.refreshSession();
    },
    unmount() {
      mounted = false;
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}

export default createAccountScene;
