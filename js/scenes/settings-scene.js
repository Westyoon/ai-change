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
  let mounted=false;
  let resetPending=false;
  return {
    mount(root) {
      mounted=true;
      const save = context.services.save;
      const settings = { ...context.config.audio, ...(currentState(save).settings ?? {}) };
      const scene = createScene({
        className: "scene--panel",
        eyebrow: "SETTINGS",
        title: "설정",
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

      const resetButton=createButton("진행 초기화",async()=>{
        if(resetPending)return;
        const approved=window.confirm("스토리와 학과 미니게임 진행을 처음부터 시작할까요? 로그인한 계정의 진행도 초기화됩니다. 음량과 계정 스탯은 유지됩니다.");
        if(!approved)return;
        resetPending=true;resetButton.disabled=true;
        try {
          await context.services.account?.resetProgress?.();
          save.resetProgress?.({includeSettings:false});
          try {
            const keys=[];
            for(let i=0;i<sessionStorage.length;i++){const key=sessionStorage.key(i);if(key?.startsWith("ai-change:campus-position:"))keys.push(key);}
            for(const key of keys)sessionStorage.removeItem(key);
          } catch { /* Position storage is optional. */ }
          showToast(context,"진행 기록을 초기화했습니다.");
          if(mounted)await context.router.navigate("main-menu");
        } catch(error) { showToast(context,error.message); }
        finally {resetPending=false;if(mounted)resetButton.disabled=false;}
      },"danger");
      const actions = createElement("div", { className: "button-row" }, [
        resetButton,
        createBackButton(context),
      ]);
      scene.append(list, actions);
      root.append(scene);
    },
    unmount(){mounted=false;},
  };
}
