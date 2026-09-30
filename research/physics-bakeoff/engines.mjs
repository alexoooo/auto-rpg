/**
 * Loads each candidate engine in Node and hands out a factory per engine (`src/physics-bench/`).
 */
import { createMujoco } from "../../src/physics-bench/engines/mujoco.ts";
import { createRapier } from "../../src/physics-bench/engines/rapier.ts";

export const ENGINES = ["mujoco", "mujoco-mt", "rapier", "rapier-simd"];

/** Load `name` and time it; returns { factory, initMs, module }. */
export async function load(name) {
  const t0 = performance.now();
  switch (name) {
    case "mujoco":
    case "mujoco-mt": {
      // The threaded build: Emscripten pthreads, worker_threads under Node; a page needs cross-origin isolation.
      const mj = await (await import(name === "mujoco" ? "@mujoco/mujoco" : "@mujoco/mujoco/mt")).default();
      return { initMs: performance.now() - t0, module: mj, factory: (scene, settings) => createMujoco(mj, scene, settings) };
    }
    case "rapier":
    case "rapier-simd": {
      const R = (await import(name === "rapier" ? "@dimforge/rapier3d-compat" : "@dimforge/rapier3d-simd-compat")).default;
      await R.init();
      return { initMs: performance.now() - t0, module: R, factory: (scene, settings) => createRapier(R, scene, settings) };
    }
    default: throw new Error(`unknown engine ${name}`);
  }
}
