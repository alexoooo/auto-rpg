import type { ViewportRect } from "./geometry.js";

/** Provisional centre-to-edge hand travel pending Arena 10's foreground calibration. */
export const CURSOR_HAND_SPAN_ARM_LENGTHS = 1;

export type CssRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export type ArenaHandCursorSample = Readonly<{
  qx: number;
  qy: number;
  /** The point after the unit-disc clamp, in CSS client coordinates. */
  clientX: number;
  clientY: number;
  saturated: boolean;
}>;

/**
 * Reduce one ordinary cursor position into the active viewport's unit disc.
 *
 * There is deliberately no retained state. An edge cannot accumulate motion
 * the OS cursor did not make, and revisiting one point always revisits one
 * result whatever samples came between.
 */
export class ArenaHandCursor {
  sample(
    clientX: number,
    clientY: number,
    canvas: CssRect,
    viewport: ViewportRect,
  ): ArenaHandCursorSample | null {
    const values = [clientX, clientY, canvas.left, canvas.top, canvas.width, canvas.height,
      viewport.x, viewport.y, viewport.width, viewport.height];
    if (!values.every(Number.isFinite) || canvas.width <= 0 || canvas.height <= 0
      || viewport.width <= 0 || viewport.height <= 0) return null;

    const left = canvas.left + viewport.x * canvas.width;
    const top = canvas.top + viewport.y * canvas.height;
    const width = viewport.width * canvas.width;
    const height = viewport.height * canvas.height;
    let qx = 2 * (clientX - left) / width - 1;
    let qy = 1 - 2 * (clientY - top) / height;
    const magnitude = Math.hypot(qx, qy);
    const saturated = magnitude > 1;
    if (saturated) {
      qx /= magnitude;
      qy /= magnitude;
    }
    return Object.freeze({
      qx,
      qy,
      clientX: left + (qx + 1) * width / 2,
      clientY: top + (1 - qy) * height / 2,
      saturated,
    });
  }
}
