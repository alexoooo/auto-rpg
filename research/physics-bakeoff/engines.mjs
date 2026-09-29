/**
 * Loads each candidate engine in Node and hands out a factory per engine (`src/physics-bench/`).
 * Havok is built from its wasm bytes (AGENTS.md, H25); one Havok instance per process, worlds made
 * and disposed one at a time (one arena per worker realm).
 */
import { readFile } from "node:fs/promises";
import HavokPhysics from "@babylonjs/havok";
import { createHavok } from "../../src/physics-bench/engines/havok.ts";
import { createMujoco } from "../../src/physics-bench/engines/mujoco.ts";
import { createRapier } from "../../src/physics-bench/engines/rapier.ts";

const havokWasm = new URL("../../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);

export const ENGINES = ["havok", "mujoco", "mujoco-mt", "rapier", "rapier-simd"];

/** Load `name` and time it; returns { factory, initMs, module }. */
export async function load(name) {
  const t0 = performance.now();
  switch (name) {
    case "havok": {
      const hk = await HavokPhysics({ wasmBinary: await readFile(havokWasm) });
      return { initMs: performance.now() - t0, module: hk, factory: (scene, settings) => createHavok(hk, scene, settings) };
    }
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
