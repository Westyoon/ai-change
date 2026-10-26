import { createElement } from "../scenes/scene-utils.js";

export const EIAI_IMAGE_SRC = "./assets/images/eiai-pixel.png";

export function createEiaiArt({ wandering = false } = {}) {
  const body = createElement("img", { className: "eiai-art__image", attributes: {
    src: EIAI_IMAGE_SRC, alt: "", width: "256", height: "256", decoding: "async", draggable: "false",
  } });
  return createElement("div", { className: `eiai-art${wandering ? " eiai-art--wandering" : ""}`, attributes: { role: "img", "aria-label": "이아이" } }, [
    body, createElement("span", { className: "eiai-art__name", text: "이아이" }),
  ]);
}

export function createFestivalLights() {
  return createElement("div", { className: "festival-lights", attributes: { "aria-hidden": "true" } },
    Array.from({ length: 9 }, (_, i) => createElement("span", { dataset: { bulb: String(i % 3) } })));
}
