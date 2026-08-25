import { createBackButton, createButton, createElement, createScene, showToast } from "./scene-utils.js";

function currentState(saveManager) {
  return saveManager?.getState?.() ?? saveManager?.state ?? { settings: {} };
}

function volumeRow(label, key, value, onChange) {
  const output = createElement("output", { text: Math.round(value * 100) });
  const input = createElement("input", {
    attributes: { type: "range", min: "0", max: "1", step: "0.05", value: String(value), "aria-label": label },
    on: {
      input(event) {
        const next = Number(event.currentTarget.value);
        output.textContent = String(Math.round(next * 100));
        onChange(key, next);
      },
    },
  });
  return createElement("div", { className: "settings-row" }, [createElement("label", { text: label }), input, output]);
}

export function createSettingsScene(context) {
  return {
    mount(root) {
      const save = context.services.save;
      const settings = { ...context.config.audio, ...(currentState(save).settings ?? {}) };
      const scene = createScene({
        className: "scene--panel",
        eyebrow: "SETTINGS",
        title: "설정",
        description: "변경값은 development 저장 채널에만 기록됩니다.",
      });
      const list = createElement("div", { className: "settings-list" });
      const update = (key, value) => {
        settings[key] = value;
        save.updateSettings?.({ [key]: value });
        context.services.audio.applySettings?.(settings);
      };
      list.append(
        volumeRow("전체 음량", "masterVolume", settings.masterVolume ?? 1, update),
        volumeRow("배경음", "bgmVolume", settings.bgmVolume ?? 0.7, update),
        volumeRow("효과음", "sfxVolume", settings.sfxVolume ?? 0.8, update),
      );

      const mute = createElement("input", {
        attributes: { type: "checkbox", "aria-label": "전체 음소거" },
        on: { change: (event) => update("muted", event.currentTarget.checked) },
      });
      mute.checked = Boolean(settings.muted);
      list.append(createElement("label", { className: "settings-row" }, [createElement("span", { text: "전체 음소거" }), mute]));

      const actions = createElement("div", { className: "button-row" }, [
        createButton("진행 초기화", () => {
          const approved = window.confirm("학과 방문 및 미니게임 진행 기록을 초기화할까요? 음량 설정은 유지됩니다.");
          if (!approved) return;
          save.resetProgress?.({ includeSettings: false });
          showToast(context, "진행 기록을 초기화했습니다.");
        }, "danger"),
        createBackButton(context),
      ]);
      scene.append(list, actions);
      root.append(scene);
    },
  };
}
