import type { GroundPoint } from "../../../skills/framework/movement.ts";
import type { PlayerLead } from "../../../game/player-input.ts";

/** How long a finger rests before it orders, ms. A second finger that lands within it makes the two a camera gesture, and nothing is ordered. */
const TOUCH_BEAT_MS = 120;

/**
 * Clicks and held pointers give the same order; keys steer relative to the camera. A lone finger
 * orders as the left button does: a tap when it lifts, a hold after a beat (`TOUCH_BEAT_MS`). Two
 * fingers order nothing: they are the camera's (`cameraControls`).
 */
export function playerControls<T>(canvas: HTMLCanvasElement, options: {
  readonly signal: AbortSignal;
  readonly enabled: () => boolean;
  readonly select?: (point: { clientX: number; clientY: number }, extend: boolean) => boolean;
  readonly pick: (point: { clientX: number; clientY: number }) => T | null;
  readonly order: (point: T) => void;
}) {
  const { signal } = options;
  const state = { keys: new Set<string>(), pointer: null as { clientX: number; clientY: number } | null,
    pressed: null as number | null, sent: "", from: 0 };
  /** Each finger down on the canvas. */
  const fingers = new Set<number>();
  const release = () => {
    const id = state.pressed;
    state.pressed = null; state.sent = "";
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  };
  const reset = () => { release(); state.keys.clear(); state.pointer = null; fingers.clear(); };
  const point = () => {
    if (state.pressed === null || !state.pointer || !options.enabled() || performance.now() < state.from) return;
    const picked = options.pick(state.pointer);
    if (picked === null) return;
    const sent = JSON.stringify(picked);
    if (sent === state.sent) return;
    state.sent = sent; options.order(picked);
  };
  canvas.addEventListener("pointerdown", event => {
    if (event.pointerType !== "mouse") {
      fingers.add(event.pointerId);
      // The first finger stays captured while it is down: only its order is dropped.
      if (fingers.size > 1) { state.pressed = null; state.sent = ""; return; }
    }
    if (event.button !== 0 || !options.enabled()) return;
    canvas.focus();
    if (options.select?.(event, event.shiftKey)) return;
    state.pointer = { clientX: event.clientX, clientY: event.clientY };
    state.pressed = event.pointerId; state.sent = "";
    state.from = event.pointerType === "mouse" ? 0 : performance.now() + TOUCH_BEAT_MS;
    canvas.setPointerCapture(event.pointerId);
    point();
  }, { signal });
  canvas.addEventListener("pointermove", event => {
    state.pointer = { clientX: event.clientX, clientY: event.clientY };
    if (!(event.buttons & 1)) release();
  }, { signal });
  canvas.addEventListener("pointerup", event => {
    fingers.delete(event.pointerId);
    if (event.button !== 0 || event.pointerId !== state.pressed) return;
    state.pointer = { clientX: event.clientX, clientY: event.clientY };
    state.from = 0; point(); release();
  }, { signal });
  canvas.addEventListener("pointercancel", event => { fingers.delete(event.pointerId); release(); }, { signal });
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
