function clampVector(x, y) {
  const length = Math.hypot(x, y);
  if (length > 1) return { x: x / length, y: y / length };
  return { x, y };
}

export class VirtualJoystick {
  #pointerId = null;
  #boundDown;
  #boundMove;
  #boundEnd;

  constructor({ element, knob = null, onChange = () => {}, deadZone = 0.12 } = {}) {
    if (!element?.addEventListener) {
      throw new Error("VirtualJoystick requires an element.");
    }
    this.element = element;
    this.knob = knob;
    this.onChange = typeof onChange === "function" ? onChange : () => {};
    this.deadZone = Math.max(0, Math.min(0.9, Number.isFinite(deadZone) ? deadZone : 0.12));
    this.#boundDown = this.#handleDown.bind(this);
    this.#boundMove = this.#handleMove.bind(this);
    this.#boundEnd = this.#handleEnd.bind(this);
    element.addEventListener("pointerdown", this.#boundDown);
    element.addEventListener("pointermove", this.#boundMove);
    element.addEventListener("pointerup", this.#boundEnd);
    element.addEventListener("pointercancel", this.#boundEnd);
    element.addEventListener("lostpointercapture", this.#boundEnd);
  }

  reset() {
    this.#pointerId = null;
    if (this.knob) {
      this.knob.style.transform = "translate(0px, 0px)";
    }
    this.onChange({ x: 0, y: 0 });
  }

  destroy() {
    this.element.removeEventListener("pointerdown", this.#boundDown);
    this.element.removeEventListener("pointermove", this.#boundMove);
    this.element.removeEventListener("pointerup", this.#boundEnd);
    this.element.removeEventListener("pointercancel", this.#boundEnd);
    this.element.removeEventListener("lostpointercapture", this.#boundEnd);
    this.reset();
  }

  #handleDown(event) {
    if (this.#pointerId !== null || (event.isPrimary === false && event.pointerType !== "touch")) return;
    this.#pointerId = event.pointerId;
    event.preventDefault();
    this.element.setPointerCapture?.(event.pointerId);
    this.#update(event);
  }

  #handleMove(event) {
    if (event.pointerId !== this.#pointerId) return;
    event.preventDefault();
    this.#update(event);
  }

  #handleEnd(event) {
    if (event.pointerId !== this.#pointerId) return;
    this.reset();
  }

  #update(event) {
    const rect = this.element.getBoundingClientRect();
    const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
    const raw = clampVector(
      (event.clientX - (rect.left + rect.width / 2)) / radius,
      (event.clientY - (rect.top + rect.height / 2)) / radius,
    );
    const magnitude = Math.hypot(raw.x, raw.y);
    const vector = magnitude < this.deadZone ? { x: 0, y: 0 } : raw;
    if (this.knob) {
      const travel = radius * 0.48;
      this.knob.style.transform = `translate(${vector.x * travel}px, ${vector.y * travel}px)`;
    }
    this.onChange(vector);
  }
}

export default VirtualJoystick;
