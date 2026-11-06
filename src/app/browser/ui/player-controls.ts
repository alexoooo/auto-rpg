import type { GroundPoint } from "../../../skills/intent/movement.ts";
import type { PlayerLead } from "../../../game/player-input.ts";

/** Clicks and held pointers give the same order; keys steer relative to the camera. */
export function playerControls<T>(canvas: HTMLCanvasElement, options: {
  readonly signal: AbortSignal;
  readonly enabled: () => boolean;
  readonly select?: (point: { clientX: number; clientY: number }, extend: boolean) => boolean;
  readonly pick: (point: { clientX: number; clientY: number }) => T | null;
  readonly order: (point: T) => void;
}) {
  const { signal } = options;
  const state = { keys: new Set<string>(), pointer: null as { clientX: number; clientY: number } | null,
    pressed: null as number | null, sent: "" };
  const release = () => {
    const id = state.pressed;
    state.pressed = null; state.sent = "";
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  };
  const reset = () => { release(); state.keys.clear(); state.pointer = null; };
  const point = () => {
    if (state.pressed === null || !state.pointer || !options.enabled()) return;
    const picked = options.pick(state.pointer);
    if (picked === null) return;
    const sent = JSON.stringify(picked);
    if (sent === state.sent) return;
    state.sent = sent; options.order(picked);
  };
  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !options.enabled()) return;
    canvas.focus();
    if (options.select?.(event, event.shiftKey)) return;
    state.pointer = { clientX: event.clientX, clientY: event.clientY };
    state.pressed = event.pointerId; state.sent = "";
    canvas.setPointerCapture(event.pointerId);
    point();
  }, { signal });
  canvas.addEventListener("pointermove", event => {
    state.pointer = { clientX: event.clientX, clientY: event.clientY };
    if (!(event.buttons & 1)) release();
  }, { signal });
  canvas.addEventListener("pointerup", event => {
    if (event.button !== 0) return;
    state.pointer = { clientX: event.clientX, clientY: event.clientY };
    point(); release();
  }, { signal });
  canvas.addEventListener("pointercancel", release, { signal });
  canvas.addEventListener("lostpointercapture", release, { signal });
  const movement = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
  window.addEventListener("keydown", event => {
    if (!options.enabled() || !movement.has(event.code)
      || event.target instanceof HTMLElement && event.target.matches("input, select, textarea, [contenteditable]")) return;
    event.preventDefault(); state.keys.add(event.code); state.sent = "";
  }, { signal });
  window.addEventListener("keyup", event => { if (state.keys.delete(event.code)) state.sent = ""; }, { signal });
  window.addEventListener("blur", reset, { signal });
  signal.addEventListener("abort", reset, { once: true });
  return {
    reset,
    /** Sample after positioning the camera so a held pointer keeps pointing at the floor under it. */
    sample(toward: GroundPoint): PlayerLead {
      if (!options.enabled()) { reset(); return { keys: null, walk: false }; }
      point();
      const held = (a: string, b: string) => Number(state.keys.has(a) || state.keys.has(b));
      const right = held("KeyD", "ArrowRight") - held("KeyA", "ArrowLeft"), up = held("KeyW", "ArrowUp") - held("KeyS", "ArrowDown");
      const norm = Math.hypot(right, up);
      return { keys: norm ? { x: (-right * toward.z - up * toward.x) / norm, z: (right * toward.x - up * toward.z) / norm } : null,
        walk: state.keys.has("ShiftLeft") || state.keys.has("ShiftRight") };
    },
  };
}
