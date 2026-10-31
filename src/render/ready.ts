import type { Scene } from "@babylonjs/core/scene.js";
import { readyFrames } from "../ui/readiness.ts";
import { paintLoading } from "../ui/screen.ts";

/** Invisible collision meshes have no drawn material and do not participate in visual readiness. */
export function drawnReady(scene: Scene): boolean {
  const texturesReady = scene.textures.every(texture => {
    if (texture.loadingError) throw new Error(`A required image could not load: ${texture.name}`);
    return texture.isReady();
  });
  return texturesReady && scene.getWaitingItemsCount() === 0
    && scene.meshes.every(mesh => !mesh.isEnabled() || !mesh.isVisible || mesh.isReady(true))
    && (!scene.shadowsEnabled || scene.lights.every(light => !light.isEnabled() || Array.from(light.getShadowGenerators()?.values() ?? []).every(generator =>
      generator.getShadowMap()?.isReadyForRendering() ?? true)))
    && (!scene.postProcessesEnabled || (scene.activeCamera?._postProcesses ?? []).every(post => !post || post.isReady()));
}

/** Compile and draw the opening view under an opaque overlay, without advancing its world. */
export async function warmScene(scene: Scene, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const state = { ready: false, elapsed: 0, resumed: performance.now(), visible: !document.hidden };
  const visibility = () => {
    if (state.visible) state.elapsed += performance.now() - state.resumed;
    state.resumed = performance.now(); state.visible = !document.hidden;
  };
  document.addEventListener("visibilitychange", visibility);
  const observer = scene.onAfterRenderObservable.add(() => { state.ready = drawnReady(scene); });
  try {
    await readyFrames({ signal,
      frame: () => { signal.throwIfAborted(); scene.getEngine().resize(); scene.render(); },
      ready: () => state.ready,
      next: async () => {
        // A hidden tab defers GPU preparation until it can actually render.
        if (document.hidden) await new Promise<void>((resolve, reject) => {
          const finish = () => { if (!document.hidden) { clean(); resolve(); } };
          const cancel = () => { clean(); reject(signal.reason); };
          const clean = () => { document.removeEventListener("visibilitychange", finish); signal.removeEventListener("abort", cancel); };
          document.addEventListener("visibilitychange", finish); signal.addEventListener("abort", cancel, { once: true });
        });
        await paintLoading(signal);
      },
      clock: () => state.elapsed + (state.visible ? performance.now() - state.resumed : 0),
    });
  } finally {
    document.removeEventListener("visibilitychange", visibility);
    scene.onAfterRenderObservable.remove(observer);
  }
}
