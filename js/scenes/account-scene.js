import { validateAccountNickname } from "../core/account-service.js";
import { formatCombatValue } from "../battle/combat-display.js";
import { createHairColorChoices } from "../ui/hair-color-picker.js";
import { isFestivalOpen } from "../core/story-progress.js";
import { createButton, createElement, showToast } from "./scene-utils.js";

export const ACCOUNT_ORIGIN = "https://ai-change.ai-change-backend.workers.dev";
export const LOCAL_ACCOUNT_ORIGIN = "http://127.0.0.1:8787";
const AUTH_RECOVERY_RETRY_DELAYS_MS = Object.freeze([0, 1_000, 3_000]);
const ACCOUNT_RECONNECT_DELAYS_MS = Object.freeze([3_000, 10_000, 30_000]);

export function isLikelyEmbeddedBrowser(
  navigatorRef = globalThis.navigator,
  windowRef = globalThis.window,
) {
  const userAgent = typeof navigatorRef?.userAgent === "string"
    ? navigatorRef.userAgent
    : "";
  let framed = false;
  try {
    framed = Boolean(windowRef?.self && windowRef?.top && windowRef.self !== windowRef.top);
  } catch {
    framed = true;
  }
  return framed || /(?:Electron\/|VSCode|Code\/)/iu.test(userAgent);
}

export function isSeparateHostedOrigin(locationRef = globalThis.location) {
  const origin = locationRef?.origin;
  const protocol = locationRef?.protocol;
  if (!origin && !protocol) return false;
  return origin !== ACCOUNT_ORIGIN && origin !== LOCAL_ACCOUNT_ORIGIN;
}

export function accountConnectionMessage(
  state,
  locationRef = globalThis.location,
  navigatorRef = globalThis.navigator,
  windowRef = globalThis.window,
) {
  if (isSeparateHostedOrigin(locationRef)) {
    const message = `현재 주소에는 계정 API가 연결되어 있지 않습니다. 운영 주소(${ACCOUNT_ORIGIN})에서 다시 열어 주세요.`;
    return isLikelyEmbeddedBrowser(navigatorRef, windowRef)
      ? `${message} VS Code·앱 내부 브라우저 대신 Chrome/Edge에서 직접 열어 주세요.`
      : message;
  }
  const message = state?.error ?? "계정 서버에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.";
  if (!isLikelyEmbeddedBrowser(navigatorRef, windowRef)) return message;
  return `${message} VS Code·앱 내부 브라우저에서는 로그인과 게임을 같은 탭에서 계속해야 합니다. 아래 연결 다시 확인을 누르거나 Chrome/Edge에서 운영 주소를 열어 주세요.`;
}

function waitForAuthRecovery(delayMs, signal) {
  if (signal?.aborted) return Promise.resolve(false);
  if (delayMs <= 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (shouldContinue) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      signal?.removeEventListener?.("abort", abort);
      resolve(shouldContinue);
    };
    const abort = () => finish(false);
    const timeoutId = globalThis.setTimeout(() => finish(true), delayMs);
    signal?.addEventListener?.("abort", abort, { once: true });
  });
}

export async function recoverSessionAfterAuth(
  service,
  {
    signal = null,
    wait = waitForAuthRecovery,
    retryDelaysMs = AUTH_RECOVERY_RETRY_DELAYS_MS,
  } = {},
) {
  let state = service.getState();
  for (const delayMs of retryDelaysMs) {
    if (state.authenticated || signal?.aborted) return state;
    if (!await wait(delayMs, signal)) return state;
    state = service.getState();
    if (state.authenticated || signal?.aborted) return state;
    // AccountService's normal 8 second timeout is intentional here. The loading
    // scene already performed quick checks; this pass recovers from a cold or
    // temporarily interrupted session request without blocking game startup.
    state = await service.refreshSession();
  }
  return state;
}

const STAT_DEFINITIONS = Object.freeze([
  Object.freeze({ key: "attack", label: "공격", increment: 1 }),
  Object.freeze({ key: "hp", label: "체력", increment: 100 }),
  Object.freeze({ key: "defense", label: "방어", increment: 1 }),
]);

function statCard(definition, value, { canAllocate, disabled, onAllocate }) {
  const card = createElement("article", { className: "account-stat-card" }, [
    createElement("span", { className: "account-stat-card__label", text: definition.label }),
    createElement("strong", { className: "account-stat-card__value", text: definition.key === "hp" ? formatCombatValue(value) : value }),
  ]);
  if (canAllocate) {
    const increment = definition.key === "hp" ? formatCombatValue(definition.increment) : definition.increment;
    const button = createButton(`${definition.label} +${increment}`, onAllocate, "ghost");
    button.classList.add("account-stat-card__allocate");
    button.disabled = disabled;
    button.setAttribute(
      "aria-label",
      definition.key === "hp"
        ? "미사용 포인트로 최대 체력 100 올리기"
        : `미사용 포인트로 ${definition.label} 스탯 1 올리기`,
    );
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
  let unsubscribeSave = null;
  let busyAction = null;
  let actionError = null;
  let progressSyncing = false;
  let nicknameDraft = null;
  let nicknameError = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let reconnecting = false;
  let removeReconnectListeners = null;

  return {
    mount(root, params = {}, { signal } = {}) {
      mounted = true;
      const service = context.services.account;
      let sessionExpectedFromCallback = params.authCallback === "success"
        && !service.getState().authenticated;
      let recoveryPending = sessionExpectedFromCallback;
      const scene = createElement("section", {
        className: "scene scene--panel account-scene",
        attributes: { "aria-labelledby": "account-title" },
      });
      const heading = createElement("h2", {
        className: "visually-hidden",
        text: "내 계정",
        attributes: { id: "account-title" },
      });
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
      const localSeenStoryIds = () => (
        context.services.save?.getSeenStoryIds?.() ?? []
      );

      const clearReconnectTimer = () => {
        if (reconnectTimer === null) return;
        globalThis.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      };

      let scheduleReconnect = () => {};
      const runConnectionCheck = async ({ manual = false } = {}) => {
        if (!mounted || signal?.aborted || reconnecting) return service.getState();
        clearReconnectTimer();
        reconnecting = true;
        if (manual) {
          busyAction = "connection";
          actionError = null;
          render(service.getState());
        }
        try {
          return await service.refreshSession();
        } catch (error) {
          if (manual && mounted && !signal?.aborted) {
            actionError = error instanceof Error
              ? error.message
              : "계정 연결을 다시 확인하지 못했습니다.";
          }
          return service.getState();
        } finally {
          reconnecting = false;
          if (manual && busyAction === "connection") busyAction = null;
          if (mounted && !signal?.aborted) {
            render(service.getState());
            scheduleReconnect(service.getState());
          }
        }
      };

      scheduleReconnect = (state) => {
        const retryableStatus = state.status === "unavailable"
          || (sessionExpectedFromCallback && state.status === "guest");
        const canRetry = mounted
          && !signal?.aborted
          && !recoveryPending
          && !isSeparateHostedOrigin()
          && !state.authenticated
          && retryableStatus;
        if (!canRetry) {
          clearReconnectTimer();
          if (state.authenticated || (state.status === "guest" && !sessionExpectedFromCallback)) {
            reconnectAttempt = 0;
          }
          return;
        }
        if (reconnecting || reconnectTimer !== null) return;
        const delayMs = ACCOUNT_RECONNECT_DELAYS_MS[
          Math.min(reconnectAttempt, ACCOUNT_RECONNECT_DELAYS_MS.length - 1)
        ];
        reconnectTimer = globalThis.setTimeout(() => {
          reconnectTimer = null;
          reconnectAttempt += 1;
          void runConnectionCheck();
        }, delayMs);
      };

      const retryWhenBrowserReturns = () => {
        const state = service.getState();
        if (
          state.status !== "unavailable"
          && !(sessionExpectedFromCallback && state.status === "guest")
        ) return;
        reconnectAttempt = 0;
        void runConnectionCheck();
      };
      const handleVisibilityChange = () => {
        if (!globalThis.document?.hidden) retryWhenBrowserReturns();
      };
      globalThis.addEventListener?.("online", retryWhenBrowserReturns);
      globalThis.document?.addEventListener?.("visibilitychange", handleVisibilityChange);
      removeReconnectListeners = () => {
        globalThis.removeEventListener?.("online", retryWhenBrowserReturns);
        globalThis.document?.removeEventListener?.("visibilitychange", handleVisibilityChange);
      };

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

      const runNicknameUpdate = async () => {
        if (busyAction || progressSyncing) return;
        const validation = validateAccountNickname(nicknameDraft ?? "");
        if (!validation.valid) {
          nicknameError = validation.error;
          render(service.getState());
          return;
        }
        nicknameDraft = validation.nickname;
        busyAction = "nickname";
        actionError = null;
        nicknameError = null;
        render(service.getState());
        try {
          const user = await service.updateNickname(validation.nickname);
          nicknameDraft = user?.nickname ?? user?.name ?? validation.nickname;
          nicknameError = null;
          if (mounted) showToast(context, "닉네임을 저장했습니다.");
        } catch (error) {
          nicknameError = error instanceof Error ? error.message : "닉네임을 저장하지 못했습니다.";
        } finally {
          busyAction = null;
          if (mounted) render(service.getState());
        }
      };

      const render = (state) => {
        if (!mounted) return;
        const nodes = [];
        if (params.authCallback === "success") {
          if (state.authenticated) {
            nodes.push(notice("Google 로그인이 확인되었습니다. 계정 정보를 불러왔습니다."));
          } else if (recoveryPending || state.status === "idle" || state.status === "loading") {
            nodes.push(notice(
              "Google 인증이 완료되었습니다. 로그인 세션을 자동으로 확인하고 있습니다.",
              "info",
            ));
          } else {
            nodes.push(notice(
              state.available
                ? "Google 인증은 완료됐지만 이 브라우저에서 로그인 세션을 찾지 못했습니다. 아래 버튼으로 다시 로그인해 주세요."
                : accountConnectionMessage(state),
              "error",
            ));
          }
        } else if (params.notice) {
          nodes.push(notice(params.notice, params.noticeTone));
        }
        if (actionError) nodes.push(notice(actionError, "error"));
        if (progressSyncing) nodes.push(notice("이 브라우저의 진행 기록을 계정에 옮기고 있습니다."));

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
          nicknameDraft = null;
          nicknameError = null;
          const separateAccountOrigin = isSeparateHostedOrigin();
          const loginLink = createElement("a", {
            className: "button button--primary",
            text: "Google로 로그인",
            attributes: {
              href: separateAccountOrigin
                ? `${ACCOUNT_ORIGIN}/api/auth/google`
                : service.getLoginUrl(),
            },
          });
          const actions = createElement("div", { className: "button-row" }, [loginLink]);
          if (!state.available || sessionExpectedFromCallback) {
            const retryButton = createButton(
              busyAction === "connection" ? "연결 확인 중…" : "연결 다시 확인",
              () => void runConnectionCheck({ manual: true }),
              "ghost",
            );
            retryButton.classList.add("account-connection-retry");
            retryButton.disabled = Boolean(busyAction) || progressSyncing;
            actions.prepend(retryButton);
          }
          if (separateAccountOrigin || isLikelyEmbeddedBrowser()) {
            actions.append(
              createElement("a", {
                className: "button button--ghost",
                text: isLikelyEmbeddedBrowser()
                  ? "Chrome/Edge에서 열기"
                  : "운영 주소에서 열기",
                attributes: {
                  href: ACCOUNT_ORIGIN,
                  target: "_blank",
                  rel: "noopener noreferrer",
                },
              }),
            );
          }
          nodes.push(createElement("div", { className: "account-empty" }, [
            createElement("strong", { text: "현재 게스트로 플레이 중입니다." }),
            createElement("span", {
              className: "muted",
              text: state.available
                ? "로그인하면 클리어 기록과 전투 스탯을 서버에 저장할 수 있습니다."
                : accountConnectionMessage(state),
            }),
            createElement("span", {
              className: "account-privacy-note",
              text: "스토리 진행도를 로그인하여 계정에 연결합니다. Google 계정 식별자와 이메일은 로그인 연결에만 사용하며 이 외에는 공개하지 않습니다.",
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
        const savedNickname = state.user?.nickname ?? state.user?.name ?? "";
        if (nicknameDraft === null) nicknameDraft = savedNickname;
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
            createElement("dt", { text: "레벨" }),
            createElement("dd", { text: `Lv. ${stats.level}` }),
          ]),
          createElement("div", {}, [
            createElement("dt", { text: "경험치 / 다음 레벨" }),
            createElement("dd", {
              text: stats.nextLevelExperience === null
                ? `${stats.experience}`
                : `${Math.max(0, stats.experience - (stats.level - 1) * stats.level * 50)} / ${stats.nextLevelExperience}`,
            }),
          ]),
          createElement("div", {}, [
            createElement("dt", { text: "사후게임 누적 클리어" }),
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
        const nicknameInput = createElement("input", {
          className: "account-nickname-form__input",
          disabled: Boolean(busyAction) || progressSyncing,
          attributes: {
            id: "account-nickname",
            name: "nickname",
            type: "text",
            value: nicknameDraft,
            minlength: "2",
            autocomplete: "off",
            "aria-describedby": nicknameError
              ? "account-nickname-help account-nickname-error"
              : "account-nickname-help",
            "aria-invalid": nicknameError ? "true" : "false",
          },
        });
        nicknameInput.addEventListener("input", () => {
          nicknameDraft = nicknameInput.value;
        });
        const nicknameSave = createElement("button", {
          className: "button button--primary",
          text: busyAction === "nickname" ? "저장 중…" : "닉네임 저장",
          type: "submit",
          disabled: Boolean(busyAction) || progressSyncing,
        });
        const nicknameFormChildren = [
          createElement("div", { className: "account-nickname-form__heading" }, [
            createElement("label", {
              className: "account-nickname-form__label",
              text: "닉네임",
              attributes: { id: "account-nickname-title", for: "account-nickname" },
            }),
            createElement("span", {
              className: "muted account-nickname-form__help",
              text: "2~16자 · 다른 사용자와 같아도 됩니다.",
              attributes: { id: "account-nickname-help" },
            }),
          ]),
          createElement("div", { className: "account-nickname-form__controls" }, [
            nicknameInput,
            nicknameSave,
          ]),
        ];
        if (nicknameError) {
          nicknameFormChildren.push(createElement("p", {
            className: "account-nickname-form__error",
            text: nicknameError,
            attributes: { id: "account-nickname-error", role: "alert" },
          }));
        }
        const nicknameForm = createElement("form", {
          className: "account-nickname-form",
          attributes: { "aria-labelledby": "account-nickname-title" },
        }, nicknameFormChildren);
        nicknameForm.addEventListener("submit", (event) => {
          event.preventDefault();
          void runNicknameUpdate();
        });
        nodes.push(
          createElement("div", { className: "account-profile" }, [
            createElement("span", { className: "status-badge", text: "SIGNED IN" }),
            createElement("h3", { text: `${state.user?.name ?? "플레이어"} 님` }),
          ]),
          nicknameForm,
          ...(isFestivalOpen(context) ? [createElement("section", { className: "account-hair-color" }, [
            createElement("h3", { text: "머리색" }),
            createHairColorChoices({ selected: state.user?.hairColor ?? "purple", disabled: Boolean(busyAction) || progressSyncing,
              onSelect: async (hairColor) => {
                if (busyAction || !isFestivalOpen(context)) return;
                busyAction = "hair-color";
                actionError = null;
                render(service.getState());
                try { await service.updateHairColor(hairColor); }
                catch { actionError = "머리색을 저장하지 못했습니다. 다시 시도해 주세요."; }
                finally { busyAction = null; if (mounted) render(service.getState()); }
              },
            }),
          ])] : []),
          recordGrid,
          createElement("div", { className: "account-section-heading" }, [
            createElement("h3", { text: "기본 전투 스탯" }),
            createElement("span", {
              className: "status-badge",
              text: canAllocate ? `사용 가능 ${stats.unspentPoints}` : "포인트 없음",
            }),
          ]),
          statGrid,
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
        const accountStoryIds = new Set(state.seenStoryIds ?? []);
        const pendingStoryIds = localSeenStoryIds().filter(
          (storyId) => !accountStoryIds.has(storyId),
        );
        if (pendingGameIds.length === 0 && pendingStoryIds.length === 0) return;

        progressSyncing = true;
        actionError = null;
        render(state);
        try {
          const [gameResult] = await Promise.all([
            pendingGameIds.length > 0
              ? service.importCompletedGameIds(pendingGameIds)
              : Promise.resolve({ importedGameIds: [] }),
            pendingStoryIds.length > 0
              ? service.importSeenStoryIds(pendingStoryIds)
              : Promise.resolve(null),
          ]);
          if (mounted && gameResult.importedGameIds.length > 0) {
            showToast(context, `게스트 클리어 ${gameResult.importedGameIds.length}개를 계정에 옮겼습니다.`);
          }
        } catch (error) {
          actionError = error instanceof Error
            ? error.message
            : "이 브라우저의 진행 기록을 계정에 옮기지 못했습니다.";
        } finally {
          progressSyncing = false;
          if (mounted) render(service.getState());
        }
      };

      unsubscribe = service.subscribe((state) => {
        if (state.authenticated) sessionExpectedFromCallback = false;
        render(state);
        void syncLocalProgress(state);
        scheduleReconnect(state);
      });
      unsubscribeSave = context.services.save?.subscribe?.(() => render(service.getState()), { emitCurrent: false });
      if (params.authCallback === "success" && !service.getState().authenticated) {
        void recoverSessionAfterAuth(service, { signal })
          .catch((error) => {
            if (!mounted || signal?.aborted) return;
            actionError = error instanceof Error
              ? error.message
              : "로그인 상태를 다시 확인하지 못했습니다.";
          })
          .finally(() => {
            recoveryPending = false;
            if (mounted && !signal?.aborted) {
              render(service.getState());
              scheduleReconnect(service.getState());
            }
          });
      } else if (service.getState().status === "idle") {
        void service.refreshSession();
      }
    },
    unmount() {
      mounted = false;
      globalThis.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      removeReconnectListeners?.();
      removeReconnectListeners = null;
      unsubscribe?.();
      unsubscribe = null;
      unsubscribeSave?.();
      unsubscribeSave = null;
    },
  };
}

export default createAccountScene;
