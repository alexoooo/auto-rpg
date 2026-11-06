import "@babylonjs/core/Engines/AbstractEngine/abstractEngine.timeQuery.js";
import "@babylonjs/core/Engines/Extensions/engine.query.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import "./frame-meter.css";

/**
 * A screen's frame counter and timing popover, which say where a frame goes:
 * - frames and completed physics steps a second, and the mean frame interval;
 * - `physics`: the world's steps a frame took -- the run's plan, the bodies' control and the solver
 *   (`World.advance`) -- with how many (x2 is 60 fps at 120 Hz; more means it is catching up);
 * - `other`: the rest of the render callback -- framing, the HUD, fog, and submitting the draw. Input handlers, garbage
 *   collection and the engine's own frame bookkeeping fall outside it, so the interval less these two is not idle;
 * - `gpu`: the GPU's time per frame, where the browser exposes a timer query (Firefox does not by default);
 * - `world`, in place of `physics` where a worker steps the world (`src/app/worker/`): the steps that arrived a frame,
 *   what each took in the worker, and how fast the world plays, 100% in real time.
 *
 * A frame whose drawing costs R ms, while physics takes a share p of every real second, lasts about R / (1 - p),
 * so the physics share multiplies the cost of everything drawn.
 */
export function frameMeter(engine: AbstractEngine, signal: AbortSignal) {
  const element = document.createElement("div"), summary = document.createElement("button"), output = document.createElement("div");
  element.className = "frame-meter";
  summary.type = "button";
  summary.title = "Rendered frames and completed physics steps per second; timing details";
  summary.setAttribute("aria-expanded", "false");
  output.popover = "auto";
  output.setAttribute("role", "group");
  output.setAttribute("aria-label", "Frame timing");
  summary.popoverTargetElement = output;
  summary.textContent = "FPS …";
  output.title = "Physics includes world control and simulation. Other includes camera, UI and draw submission. GPU timing depends on browser support.";
  element.append(summary, output);
  for (const type of ["pointerdown", "pointermove"]) element.addEventListener(type, event => event.stopPropagation(), { signal });
  summary.addEventListener("keydown", event => {
    if (event.key === " " || event.key === "Enter" || event.key === "Escape" && output.matches(":popover-open")) event.stopPropagation();
  }, { signal });
  const place = () => {
    if (!output.matches(":popover-open")) return;
    const box = summary.getBoundingClientRect();
    const below = box.bottom + 6;
    output.style.top = `${below + output.offsetHeight <= innerHeight - 8 ? below : Math.max(8, box.top - output.offsetHeight - 6)}px`;
    output.style.right = `${Math.max(8, Math.min(innerWidth - box.right, innerWidth - output.offsetWidth - 8))}px`;
  };
  output.addEventListener("toggle", () => {
    summary.setAttribute("aria-expanded", String(output.matches(":popover-open")));
    place();
  }, { signal });
  window.addEventListener("resize", place, { signal });
  document.addEventListener("scroll", place, { signal, capture: true });
  const timed = Boolean(engine.getCaps().timerQuery);
  // Other engine readers share this counter and keep their own deltas.
  if (timed) engine.captureGPUFrameTime(true);
  const gpu = timed ? engine.getGPUFrameTimeCounter() : null;
  let since = performance.now(), previous: number | null = null, frames = 0, cpu = 0, physics = 0, substeps = 0;
  const worker = { steps: 0, ms: 0, speed: null as number | null, hz: null as number | null };
  let gpuTotal = gpu?.total ?? 0, gpuCount = gpu?.count ?? 0;
  const sample = { frame: 0, interval: 0, physics: 0, worker: 0, steps: 0 };
  const reset = () => {
    since = performance.now(); previous = null; frames = cpu = physics = substeps = 0; worker.steps = worker.ms = 0;
    gpuTotal = gpu?.total ?? 0; gpuCount = gpu?.count ?? 0;
  };
  // A hidden tab renders nothing, and the first window back would otherwise divide its frames by the whole absence.
  document.addEventListener("visibilitychange", reset, { signal });
  signal.addEventListener("abort", () => element.remove(), { once: true });
  const show = (now: number) => {
    const span = now - since;
    if (span < 500 || frames === 0) return;
    const gained = gpu ? gpu.count - gpuCount : 0;
    const gpuMs = gpu && gained > 0 ? (gpu.total - gpuTotal) / gained / 1e6 : null;
    const fps = frames * 1000 / span;
    const stepRate = substeps * 1000 / span;
    summary.textContent = `${fps.toFixed(fps < 10 ? 1 : 0)} FPS`
      + (worker.hz === null ? "" : `\n${stepRate.toFixed(0)}/${worker.hz} steps/s`);
    output.textContent = `Frame   ${(span / frames).toFixed(1)} ms\n`
      + (worker.speed === null
        ? `Physics ${(physics / frames).toFixed(1)} ms (×${(substeps / frames).toFixed(1)} steps)\n`
          + `Per step ${substeps ? (physics / substeps).toFixed(2) + " ms" : "unavailable"}\n`
        : `World   ×${(worker.steps / frames).toFixed(1)} steps, ${(100 * worker.speed).toFixed(0)}% speed\n`
          + `Per step ${worker.steps ? (worker.ms / worker.steps).toFixed(2) + " ms in its worker" : "unavailable"}\n`)
      + `Other   ${((cpu - physics) / frames).toFixed(1)} ms\n`
      + `GPU     ${gpuMs === null ? "unavailable" : `${gpuMs.toFixed(1)} ms`}`;
    place();
    since = now; frames = cpu = physics = substeps = 0; worker.steps = worker.ms = 0;
    if (gpu) { gpuTotal = gpu.total; gpuCount = gpu.count; }
  };
  return {
    element, reset,
    /** Times `steps`, which steps the world and returns how many steps it took; inside `frame`. */
    physics(steps: () => number): void {
      const started = performance.now();
      sample.steps += steps();
      sample.physics += performance.now() - started;
    },
    /** Counts the steps a worker sent, the worker's time for them, ms, and the world's speed now; inside `frame`. */
    world(received: { readonly steps: number; readonly ms: number }, timing: { readonly speed: number; readonly hz: number }): void {
      sample.worker += received.ms; sample.steps += received.steps; worker.steps += received.steps; worker.ms += received.ms;
      worker.speed = timing.speed; worker.hz = timing.hz;
    },
    /** Runs one frame's work and counts it. */
    frame(work: () => void): Readonly<typeof sample> {
      const started = performance.now();
      sample.physics = sample.worker = sample.steps = 0;
      sample.interval = previous === null ? 0 : started - previous;
      previous = started;
      work();
      const now = performance.now();
      sample.frame = now - started;
      cpu += sample.frame; physics += sample.physics; substeps += sample.steps; frames += 1;
      show(now);
      return sample;
    },
  };
}
