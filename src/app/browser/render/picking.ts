import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";

/**
 * Where `pointer` is on `engine`'s canvas, whose box on the page is `rect`, in the input space
 * Babylon picks in: it scales picking inputs itself, so viewport coordinates are converted once.
 */
export function pickingCoordinates(engine: AbstractEngine, { clientX, clientY }: { readonly clientX: number; readonly clientY: number },
  rect: { left: number; top: number; width: number; height: number }): { x: number; y: number } {
  const scaling = engine.getHardwareScalingLevel();
  return { x: (clientX - rect.left) * engine.getRenderWidth() * scaling / rect.width,
    y: (clientY - rect.top) * engine.getRenderHeight() * scaling / rect.height };
}
