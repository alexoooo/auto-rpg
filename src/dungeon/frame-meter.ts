import "@babylonjs/core/Engines/AbstractEngine/abstractEngine.timeQuery.js";
import "@babylonjs/core/Engines/Extensions/engine.query.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { Scene } from "@babylonjs/core/scene.js";

/**
 * The frame counter in the dungeon's top bar, which says where a frame goes:
 * - frames a second, and the mean interval between them;
 * - `physics`: the solver and the golems' control, which run in the fixed-step accumulator before every
 *   substep, with the substeps a frame took (x4 is 60 fps at 240 Hz; more means it is catching up);
 * - `other`: the rest of the render callback -- framing, the HUD, fog, and submitting the draw. Input handlers, garbage
 *   collection and the engine's own frame bookkeeping fall outside it, so the interval less these two is not idle;
 * - `gpu`: the GPU's time per frame, where the browser exposes a timer query (Firefox does not by default).
 *
 * A frame whose drawing costs R ms, while physics takes a share p of every real second, lasts about R / (1 - p),
 * so the physics share multiplies the cost of everything drawn.
 */
export function frameMeter(engine: AbstractEngine, element: HTMLElement) {
  const timed = Boolean(engine.getCaps().timerQuery);
  // The engine's counter is shared with `__dungeon.look.gpuTime`, which reads its own deltas from it.
  if (timed) engine.captureGPUFrameTime(true);
  const gpu = timed ? engine.getGPUFrameTimeCounter() : null;
  let since = performance.now(), frames = 0, cpu = 0, physics = 0, substeps = 0;
  let gpuTotal = gpu?.total ?? 0, gpuCount = gpu?.count ?? 0;
  // A hidden tab renders nothing, and the first window back would otherwise divide its frames by the whole absence.
  document.addEventListener("visibilitychange", () => { since = performance.now(); frames = cpu = physics = substeps = 0; });
  const show = (now: number) => {
    const span = now - since;
    if (span < 500 || frames === 0) return;
    const gained = gpu ? gpu.count - gpuCount : 0;
    const gpuMs = gpu && gained > 0 ? (gpu.total - gpuTotal) / gained / 1e6 : null;
    const fps = frames * 1000 / span;
    element.textContent = `${fps.toFixed(fps < 10 ? 1 : 0)} fps · ${(span / frames).toFixed(1)} ms`
      + ` · physics ${(physics / frames).toFixed(1)} (x${(substeps / frames).toFixed(1)})`
      + ` · other ${((cpu - physics) / frames).toFixed(1)}` + (gpuMs === null ? "" : ` · gpu ${gpuMs.toFixed(1)}`);
    since = now; frames = cpu = physics = substeps = 0;
    if (gpu) { gpuTotal = gpu.total; gpuCount = gpu.count; }
  };
  return {
    /** Times the substeps of one scene; the returned function stops watching it. */
    watch(scene: Scene): () => void {
      let started = 0;
      const before = scene.onBeforePhysicsObservable.add(() => { started = performance.now(); }, undefined, true);
      const after = scene.onAfterPhysicsObservable.add(() => { physics += performance.now() - started; substeps += 1; });
      return () => { scene.onBeforePhysicsObservable.remove(before); scene.onAfterPhysicsObservable.remove(after); };
    },
    /** Runs one frame's work and counts it. */
    frame(work: () => void): void {
      const started = performance.now();
      work();
      const now = performance.now();
      cpu += now - started; frames += 1;
      show(now);
    },
  };
}
