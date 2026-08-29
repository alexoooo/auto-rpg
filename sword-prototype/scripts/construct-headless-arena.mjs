import { readFile } from "node:fs/promises";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import HavokPhysics from "@babylonjs/havok";

import { CONFIG } from "../src/config.ts";
import { populateConstructLabArena } from "../src/construct/lab-arena.ts";
import { attachPhysics } from "../src/physics.ts";

const wasmPath = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const wasmBinary = await readFile(wasmPath);

/** The physics-bearing subset of the page arena, with a fresh Havok instance per authoritative job. */
export async function createConstructHeadlessArena() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  attachPhysics(scene, await HavokPhysics({ wasmBinary }));
  scene.getPhysicsEngine().setSubTimeStep(1000 / CONFIG.world.physicsHz);

  populateConstructLabArena(scene);

  return Object.freeze({
    scene,
    dispose: () => { scene.dispose(); engine.dispose(); },
  });
}
