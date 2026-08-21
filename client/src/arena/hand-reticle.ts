import type { ViewportRect } from "./geometry.js";

export const HAND_RETICLE_INSET_CSS_PX = 8;

export function clampReticlePoint(
  point: readonly [number, number],
  viewport: ViewportRect,
  width: number,
  height: number,
): Readonly<{ point: readonly [number, number]; offscreen: boolean }> | null {
  if (![...point, viewport.x, viewport.y, viewport.width, viewport.height, width, height]
    .every(Number.isFinite) || width <= 0 || height <= 0 || viewport.width <= 0
    || viewport.height <= 0) return null;
  const insetX = Math.min(viewport.width / 2, HAND_RETICLE_INSET_CSS_PX / width);
  const insetY = Math.min(viewport.height / 2, HAND_RETICLE_INSET_CSS_PX / height);
  const lowX = viewport.x + insetX;
  const highX = viewport.x + viewport.width - insetX;
  const lowY = viewport.y + insetY;
  const highY = viewport.y + viewport.height - insetY;
  const centreX = viewport.x + viewport.width / 2;
  const centreY = viewport.y + viewport.height / 2;
  if (point[0] >= lowX && point[0] <= highX && point[1] >= lowY && point[1] <= highY) {
    return Object.freeze({ point: Object.freeze([point[0], point[1]] as const), offscreen: false });
  }
  const dx = point[0] - centreX;
  const dy = point[1] - centreY;
  if (dx === 0 && dy === 0) {
    return Object.freeze({ point: Object.freeze([centreX, centreY] as const), offscreen: true });
  }
  const candidates = [
    dx > 0 ? (highX - centreX) / dx : dx < 0 ? (lowX - centreX) / dx : Infinity,
    dy > 0 ? (highY - centreY) / dy : dy < 0 ? (lowY - centreY) / dy : Infinity,
  ].filter((value) => value >= 0);
  const scale = Math.min(...candidates);
  return Object.freeze({
    point: Object.freeze([centreX + dx * scale, centreY + dy * scale] as const),
    offscreen: true,
  });
}

/** Presentation-only marker for the stored desired hand target. */
export interface HandReticle {
  update(
    point: readonly [number, number] | null,
    powered: boolean,
    viewport?: ViewportRect,
    canvasSize?: readonly [number, number],
    saturated?: boolean,
  ): void;
  clear(): void;
  dispose(): void;
}

export function createHandReticle(host: HTMLElement): HandReticle {
  const marker = document.createElement("div");
  marker.className = "arena-hand-reticle";
  marker.setAttribute("aria-hidden", "true");
  host.append(marker);

  const clear = (): void => {
    marker.hidden = true;
    marker.classList.remove("captured");
    marker.classList.remove("offscreen");
    marker.classList.remove("saturated");
  };
  clear();

  return Object.freeze({
    update(point: readonly [number, number] | null, powered: boolean,
      viewport: ViewportRect = { x: 0, y: 0, width: 1, height: 1 },
      canvasSize: readonly [number, number] = [host.clientWidth || 1, host.clientHeight || 1],
      saturated = false): void {
      marker.classList.toggle("captured", powered);
      if (point === null) {
        clear();
        return;
      }
      const clamped = clampReticlePoint(point, viewport, canvasSize[0], canvasSize[1]);
      if (clamped === null) { clear(); return; }
      marker.hidden = false;
      marker.classList.toggle("offscreen", clamped.offscreen);
      marker.classList.toggle("saturated", saturated);
      marker.style.left = `${clamped.point[0] * 100}%`;
      marker.style.top = `${clamped.point[1] * 100}%`;
    },
    clear,
    dispose(): void { marker.remove(); },
  });
}
