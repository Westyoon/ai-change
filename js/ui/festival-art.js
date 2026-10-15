import { createElement } from "../scenes/scene-utils.js";

// Set this to the supplied Eiai sprite later; the same slot is used throughout.
export const EIAI_IMAGE_SRC = null;

export function createEiaiArt({ wandering = false } = {}) {
  const body = EIAI_IMAGE_SRC
    ? createElement("img", { className: "eiai-art__image", attributes: { src: EIAI_IMAGE_SRC, alt: "" } })
    : createElement("span", { className: "eiai-art__flame", attributes: { "aria-hidden": "true" } }, [
        createElement("span", { className: "eiai-art__face", text: "• ᴗ •" }),
      ]);
  return createElement("div", { className: `eiai-art${wandering ? " eiai-art--wandering" : ""}`, attributes: { role: "img", "aria-label": "이아이" } }, [
    body, createElement("span", { className: "eiai-art__name", text: "이아이" }),
  ]);
}

export function createFestivalLights() {
  return createElement("div", { className: "festival-lights", attributes: { "aria-hidden": "true" } },
    Array.from({ length: 9 }, (_, i) => createElement("span", { dataset: { bulb: String(i % 3) } })));
}
