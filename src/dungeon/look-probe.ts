import "@babylonjs/core/Engines/AbstractEngine/abstractEngine.timeQuery.js";
import "@babylonjs/core/Engines/Extensions/engine.query.js";
import { EngineInstrumentation } from "@babylonjs/core/Instrumentation/engineInstrumentation.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { DungeonLighting, LookSwitches } from "./lighting.ts";

/** `frameMs` is the mean interval between frames, which a display holds at its refresh rate: without `gpuMs` it
 * says only whether a setting drops frames, not what the GPU spent. */
export interface FrameCost { frames: number; gpuMs: number | null; frameMs: number; look: LookSwitches }

/**
 * `__dungeon.look` on the page: switches that remove render work, and a frame-cost reading, so the owner can
 * measure on their own machine what each piece of the look costs. My tab paints no frames, so nothing here is
 * read by me. A hidden tab renders nothing either, and the reading rejects rather than waits for ever.
 */
/**
 * Whether everything the frame draws has compiled. Not `scene.isReady()`: that also asks the invisible colliders,
 * which carry no material, so it asks for a default material that is never drawn and never compiles, and it stays
 * false for the life of the level.
 */
function drawnReady(scene: Scene): boolean {
  return scene.meshes.every(mesh => !mesh.isEnabled() || !mesh.isVisible || mesh.isReady(true))
    && (scene.activeCamera?._postProcesses ?? []).every(post => !post || post.isReady());
}

export function lookProbe(engine: AbstractEngine, current: () => { scene: Scene; lighting: DungeonLighting } | null) {
  const need = () => { const now = current(); if (!now) throw new Error("No dungeon is running."); return now; };
  return {
    set(change: Partial<LookSwitches>): LookSwitches { const { lighting } = need(); lighting.setLook(change); return lighting.look; },
    /** Mean GPU time per frame in milliseconds, where the timer extension exists, and the mean frame interval. */
    gpuTime(frames = 240, timeoutMs = 20000): Promise<FrameCost> {
      const { scene, lighting } = need();
      const timed = Boolean(engine.getCaps().timerQuery);
      return new Promise((resolve, reject) => {
        let instrumentation: EngineInstrumentation | null = null, seen = 0, settled = 0, frameSum = 0, counted = 0;
        let total = 0, samples = 0;
        const finish = (error?: Error) => {
          clearTimeout(timer); scene.onAfterRenderObservable.remove(observer);
          // The counter belongs to the engine and outlives this reading, so only what it gained since the reading began
          // counts. It is in nanoseconds, and gains a sample only when a query resolves, which is not every frame.
          const gpu = instrumentation?.gpuFrameTimeCounter, gained = gpu ? gpu.count - samples : 0;
          const gpuMs = gpu && gained > 0 ? (gpu.total - total) / gained / 1e6 : null;
          // `dispose` leaves the engine's own timer queries running on every later frame; the switch stops them.
          if (instrumentation) instrumentation.captureGPUFrameTime = false;
          instrumentation?.dispose();
          if (error) reject(error);
          else resolve({ frames: counted, gpuMs, frameMs: frameSum / Math.max(1, counted), look: lighting.look });
        };
        // A switch changes material defines, so shaders recompile: wait for what is drawn to be ready, then thirty
        // frames more, before anything counts.
        const observer = scene.onAfterRenderObservable.add(() => {
          seen += 1;
          if (settled < 30) {
            settled = drawnReady(scene) ? settled + 1 : 0;
            if (settled === 30 && timed) {
              instrumentation = new EngineInstrumentation(engine); instrumentation.captureGPUFrameTime = true;
              total = instrumentation.gpuFrameTimeCounter.total; samples = instrumentation.gpuFrameTimeCounter.count;
            }
            return;
          }
          frameSum += engine.getDeltaTime(); counted += 1;
          if (counted >= frames) finish();
        });
        const timer = setTimeout(() => finish(new Error(settled < 30 && seen >= 60
          ? `${seen} frames rendered in ${timeoutMs} ms and the drawn meshes never came ready.`
          : `Only ${seen} frames rendered in ${timeoutMs} ms: is the tab hidden?`)), timeoutMs);
      });
    },
  };
}
