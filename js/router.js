export class SceneRouter {
  constructor({ root, routes, context }) {
    if (!root) {
      throw new Error("SceneRouter requires a root element.");
    }

    this.root = root;
    this.routes = new Map(Object.entries(routes));
    this.context = context;
    this.current = null;
    this.transitioning = false;
    this.pendingRoute = null;
    this.generation = 0;
    this.controller = null;
    this.preparingController = null;
  }

  async start(sceneId, params = {}) {
    return this.navigate(sceneId, params, { replace: true });
  }

  async navigate(sceneId, params = {}, options = {}) {
    if (!this.routes.has(sceneId)) {
      throw new Error(`등록되지 않은 scene입니다: ${sceneId}`);
    }

    if (this.transitioning) {
      this.pendingRoute = { sceneId, params, options };
      this.preparingController?.abort();
      return false;
    }

    this.transitioning = true;
    this.context.state.transitioning = true;
    this.context.services?.input?.clear?.();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.preparingController = controller;

    try {
      const previousScene = this.current?.id ?? null;
      const sceneFactory = this.routes.get(sceneId);
      const scene = sceneFactory(this.context);
      this.root.setAttribute?.("aria-busy", "true");
      // Resource-heavy scenes prepare detached layers while the old view remains visible.
      await scene.prepare?.(params, { signal: controller.signal, replace: Boolean(options.replace) });
      if (generation !== this.generation || controller.signal.aborted) return false;
      this.controller?.abort();
      this.controller = controller;
      this.preparingController = null;
      if (this.current?.scene?.unmount) {
        await this.current.scene.unmount();
      }

      if (generation !== this.generation) {
        return false;
      }

      this.root.replaceChildren();
      this.root.removeAttribute("aria-busy");
      this.root.dataset.scene = sceneId;
      document.body.dataset.scene = sceneId;

      this.context.state.previousScene = previousScene;
      this.context.state.scene = sceneId;
      this.current = { id: sceneId, scene, params };

      await scene.mount(this.root, params, {
        signal: controller.signal,
        replace: Boolean(options.replace),
      });

      if (generation !== this.generation) {
        return false;
      }

      try {
        globalThis.scrollTo?.(0, 0);
      } catch {
        // Scroll restoration is a progressive enhancement; a patched browser API
        // must not turn an otherwise successful scene mount into a route failure.
      }
      requestAnimationFrame(() => this.root.focus({ preventScroll: true }));
      return true;
    } catch (error) {
      if (error?.name === "AbortError") {
        return false;
      }

      if (sceneId === "error") {
        this.root.replaceChildren();
        const fallback = document.createElement("p");
        fallback.textContent = "오류 화면을 불러오지 못했습니다. 페이지를 새로고침해 주세요.";
        this.root.append(fallback);
        console.error(error);
        return false;
      }

      console.error(error);
      this.pendingRoute = {
        sceneId: "error",
        params: {
          code: "SCENE_TRANSITION_FAILED",
          message: "화면을 준비하지 못했습니다.",
          detail: error instanceof Error ? error.message : String(error),
          retryScene: sceneId,
          retryParams: params,
        },
        options: { replace: true },
      };
      return false;
    } finally {
      if (generation === this.generation) {
        this.root.removeAttribute("aria-busy");
        this.preparingController = null;
        this.transitioning = false;
        this.context.state.transitioning = false;
      }

      const pending = this.pendingRoute;
      this.pendingRoute = null;
      if (pending) {
        void this.navigate(pending.sceneId, pending.params, pending.options);
      }
    }
  }

  destroy() {
    this.preparingController?.abort();
    this.controller?.abort();
    this.generation += 1;
    this.pendingRoute = null;
    this.current?.scene?.unmount?.();
    this.current = null;
  }
}
