import {
  createButton,
  createElement,
  createScene,
  findDepartment,
  findMiniGame,
  findScript,
} from "./scene-utils.js";

function normalizeControls(config, key) {
  const direct = config?.controls?.[key];
  if (Array.isArray(direct)) return direct;
  const legacy = key === "pc" ? config?.pcControls : config?.mobileControls;
  return Array.isArray(legacy) ? legacy : [];
}

export function createMiniGameIntroScene(context) {
  let assetLease = null;

  return {
    async mount(root, { miniGameId }, { signal }) {
      const game = findMiniGame(context, miniGameId);
      if (!game) throw new Error(`미니게임을 찾을 수 없습니다: ${miniGameId}`);
      const department = findDepartment(context, game.departmentCode);
      assetLease = context.services.assets.acquireGroup
        ? await context.services.assets.acquireGroup(game.assetGroup, { signal })
        : null;
      if (!assetLease) {
        await context.services.assets.loadGroup(game.assetGroup, { signal });
      }
      if (signal.aborted) return;
      const config = context.services.assets.get(game.configAssetId);
      const thumbnail = context.services.assets.get(game.thumbnailAssetId);
      const intro = findScript(context, game.introScript);
      const introText = intro?.lines
        ?.map((line) => line?.text)
        .filter(Boolean)
        .join(" ");
      const objective = config?.goal ?? config?.objective ?? config?.scaffold?.objective ?? "실제 게임 목표는 후속 구현 단계에서 연결됩니다.";
      const implementationStatus = config?.implementationStatus ?? (game.scaffold ? "SCAFFOLD" : "MVP");
      const statusDescription = {
        MVP: "통합된 게임 규칙을 플레이할 수 있습니다.",
        PROTOTYPE: "검토 중인 규칙을 적용한 프로토타입입니다.",
        SCAFFOLD: "공통 lifecycle 확인용 스캐폴드입니다.",
      }[implementationStatus] ?? "개발 중인 미니게임입니다.";

      const scene = createScene({
        className: "scene--panel",
        eyebrow: `${game.departmentCode} · ${department?.displayName ?? game.department}`,
        title: game.title,
        description: introText ?? objective,
      });
      if (thumbnail instanceof HTMLImageElement) {
        const image = thumbnail.cloneNode(true);
        image.className = "minigame-thumbnail";
        image.alt = thumbnail.alt || `${game.title} 미리보기`;
        image.width = 640;
        image.height = 360;
        scene.append(image);
      }

      const columns = createElement("div", { className: "card-grid" });
      columns.append(createElement("section", { className: "info-card" }, [
        createElement("strong", { text: "게임 목표" }),
        createElement("span", { text: objective }),
      ]));
      for (const [label, key] of [["PC 조작", "pc"], ["모바일 조작", "mobile"]]) {
        const items = normalizeControls(config, key);
        const list = createElement("ul", { className: "control-list" },
          (items.length ? items : ["공통 개발 버튼으로 lifecycle을 확인합니다."]).map((item) => createElement("li", { text: item })),
        );
        columns.append(createElement("section", { className: "info-card" }, [createElement("strong", { text: label }), list]));
      }

      scene.append(
        createElement("p", {
          className: "status-badge",
          text: `${implementationStatus} · ${statusDescription}`,
        }),
        columns,
        createElement("div", { className: "button-row" }, [
          createButton(
            game.scaffold ? "스캐폴드 실행" : "미니게임 실행",
            () => context.router.navigate("minigame", { miniGameId }),
            "primary",
          ),
          createButton("맵으로", () => context.router.navigate("map"), "ghost"),
        ]),
      );
      root.append(scene);
    },
    unmount() {
      assetLease?.release?.();
      assetLease = null;
    },
  };
}
