import { SaveManager } from "../core/save-manager.js";
import { validateScaffoldContent } from "../core/config-validator.js";
import { createElement, createScene } from "./scene-utils.js";

const COMMON_CONTENT_IDS = [
  "departments-data",
  "minigames-data",
  "battles-data",
  "map-data",
  "main-story-data",
  "npc-dialogues-data",
  "minigame-outros-data",
  "app-logo",
];

function collection(value, key) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.[key]) ? value[key] : [];
}

function progressPercent(progress) {
  if (typeof progress === "number") return Math.max(0, Math.min(100, progress * 100));
  if (progress?.total > 0) return (progress.loaded / progress.total) * 100;
  if (typeof progress?.ratio === "number") return progress.ratio * 100;
  return 0;
}

const AUTH_QUERY_KEYS = Object.freeze(["login", "error", "auth_error", "reason", "error_description"]);
const AUTH_SESSION_RETRY_DELAYS_MS = Object.freeze([150, 500, 1_000]);

function waitForAuthRetry(delayMs, signal) {
  if (signal?.aborted) return Promise.resolve(false);
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

function authErrorMessage(code) {
  if (code === "access_denied" || code === "cancelled") {
    return "로그인이 취소되었습니다. 원할 때 다시 시도할 수 있습니다.";
  }
  if (code === "state_mismatch" || code === "invalid_state") {
    return "로그인 요청이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.";
  }
  return "로그인을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function consumeAuthCallback(locationRef = globalThis.location, historyRef = globalThis.history) {
  const search = locationRef?.search ?? "";
  const params = new URLSearchParams(search);
  const login = params.get("login");
  const error = params.get("auth_error") ?? params.get("error") ?? params.get("reason");
  if (!login && !error) return null;

  for (const key of AUTH_QUERY_KEYS) params.delete(key);
  const remaining = params.toString();
  const cleanUrl = `${locationRef.pathname ?? "/"}${remaining ? `?${remaining}` : ""}${locationRef.hash ?? ""}`;
  historyRef?.replaceState?.(historyRef.state ?? null, "", cleanUrl);

  if (login === "success" && !error) {
    return Object.freeze({
      authCallback: "success",
      notice: "Google 인증 응답을 받았습니다. 계정 연결을 확인하고 있습니다.",
      noticeTone: "info",
    });
  }
  return Object.freeze({
    authCallback: "error",
    notice: authErrorMessage(error ?? login),
    noticeTone: "error",
  });
}

export async function refreshSessionAfterAuth(
  service,
  {
    authCallback = false,
    signal = null,
    wait = waitForAuthRetry,
    retryDelaysMs = AUTH_SESSION_RETRY_DELAYS_MS,
  } = {},
) {
  let state = await service.refreshSession();
  if (!authCallback) return state;

  for (const delayMs of retryDelaysMs) {
    if (state.authenticated || signal?.aborted) return state;
    if (!await wait(delayMs, signal)) return state;
    state = await service.refreshSession();
  }
  return state;
}

export function createLoadingScene(context) {
  let mounted = false;

  return {
    async mount(root, _params, { signal }) {
      mounted = true;
      const authCallback = consumeAuthCallback();
      const sessionRefresh = refreshSessionAfterAuth(context.services.account, {
        authCallback: authCallback?.authCallback === "success",
        signal,
      });
      root.setAttribute("aria-busy", "true");
      const scene = createScene({
        className: "scene--centered",
        eyebrow: "제2회 인공지능대학 축제",
        description: "게임 데이터와 계정 연결을 준비하고 있습니다.",
      });
      const loadingLogo = createElement("img", {
        className: "scene-brand-logo scene-brand-logo--loading",
        attributes: {
          src: "./assets/images/main%20logo.png",
          width: "4335",
          height: "2368",
          alt: "",
          decoding: "async",
        },
      });
      const accessibleTitle = createElement("h1", {
        className: "visually-hidden",
        text: "인지사전게임",
      });
      scene.querySelector(".muted")?.before(loadingLogo, accessibleTitle);
      const track = createElement("div", {
        className: "loading-track",
        attributes: { role: "progressbar", "aria-label": "콘텐츠 로딩", "aria-valuemin": "0", "aria-valuemax": "100" },
      });
      const bar = createElement("div", { className: "loading-bar" });
      const status = createElement("p", { className: "muted", text: "0% · manifest 확인" });
      track.append(bar);
      scene.append(track, status);
      root.append(scene);

      await context.services.assets.loadGroup("common", {
        signal,
        onProgress(progress) {
          const percent = Math.round(progressPercent(progress));
          bar.style.width = `${percent}%`;
          track.setAttribute("aria-valuenow", String(percent));
          status.textContent = `${percent}% · 공통 콘텐츠 로딩`;
        },
      });

      if (signal.aborted || !mounted) return;
      for (const id of COMMON_CONTENT_IDS) {
        if (context.services.assets.get(id) === undefined) {
          throw new Error(`공통 asset이 manifest에서 준비되지 않았습니다: ${id}`);
        }
      }

      const departmentsData = context.services.assets.get("departments-data");
      const miniGamesData = context.services.assets.get("minigames-data");
      const battlesData = context.services.assets.get("battles-data");
      const mapData = context.services.assets.get("map-data");
      const scriptGroups = [
        context.services.assets.get("main-story-data"),
        context.services.assets.get("npc-dialogues-data"),
        context.services.assets.get("minigame-outros-data"),
      ];

      context.content.departments = collection(departmentsData, "departments");
      context.content.minigames = collection(miniGamesData, "minigames");
      context.content.battles = collection(battlesData, "battles");
      context.content.maps = collection(mapData, "maps");
      context.content.scripts = scriptGroups.flatMap((group) => collection(group, "scripts"));

      const validation = validateScaffoldContent({
        appConfig: context.config,
        manifest: context.manifest,
        departments: context.content.departments,
        minigames: context.content.minigames,
        battles: context.content.battles,
        maps: context.content.maps,
        scripts: context.content.scripts,
      });
      if (validation.errors.length > 0) {
        throw new Error(validation.errors.join(" / "));
      }
      for (const warning of validation.warnings) {
        console.warn(`[ai-change scaffold] ${warning}`);
      }

      context.services.save = new SaveManager({
        appId: context.config.appId,
        storageChannel: context.config.storageChannel,
        miniGameIds: context.content.minigames.map((game) => game.id),
        defaults: { settings: context.config.audio },
        legacyStorageChannels:
          context.config.storageChannel === "production" ? ["development"] : [],
      });
      const saveState = context.services.save.load();
      context.services.audio.applySettings?.(saveState.settings);
      void sessionRefresh.then((accountState) => {
        if (!accountState.authenticated) return null;
        return context.services.account.importCompletedGameIds(
          context.services.save.getCompletedMiniGameIds(),
        );
      }).catch((error) => {
        console.warn(
          "Guest progress sync failed",
          error instanceof Error ? error.message : "unknown error",
        );
      });

      bar.style.width = "100%";
      track.setAttribute("aria-valuenow", "100");
      status.textContent = "100% · 게임 준비 완료";
      await context.router.navigate(authCallback ? "account" : "main-menu", authCallback ?? {});
    },
    unmount() {
      mounted = false;
    },
  };
}
