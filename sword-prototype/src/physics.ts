import HavokPhysics from "@babylonjs/havok";
// Havok's solver is a WebAssembly module shipped beside its ESM bundle. Vite
// will not find it on its own, so hand it the resolved URL explicitly.
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
// Side effect, and a load-bearing one. Babylon's tree-shakeable build does not
// put `enablePhysics` on Scene until this component registers it, and without it
// the failure surfaces much later as "No Physics Engine available" from whatever
// happens to build the first body.
import "@babylonjs/core/Physics/joinedPhysicsEngineComponent.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { CONFIG } from "./config";

/**
 * Collision layers.
 *
 * The one that matters: the hero's own sword must not collide with the hero's
 * own body, or the arm spends every frame shoving its owner across the arena.
 */
export const LAYER = {
  WORLD: 1 << 0,
  HERO: 1 << 1,
  SWORD: 1 << 2,
  DUMMY: 1 << 3,
  DEBRIS: 1 << 4,
} as const;

export const COLLIDES = {
  WORLD: LAYER.HERO | LAYER.SWORD | LAYER.DUMMY | LAYER.DEBRIS,
  HERO: LAYER.WORLD | LAYER.DUMMY | LAYER.DEBRIS,
  SWORD: LAYER.WORLD | LAYER.DUMMY | LAYER.DEBRIS,
  DUMMY: LAYER.WORLD | LAYER.HERO | LAYER.SWORD | LAYER.DUMMY | LAYER.DEBRIS,
  DEBRIS: LAYER.WORLD | LAYER.HERO | LAYER.SWORD | LAYER.DUMMY | LAYER.DEBRIS,
} as const;

export async function startPhysics(scene: Scene): Promise<HavokPlugin> {
  const havok = await HavokPhysics({ locateFile: () => havokWasmUrl });
  const plugin = new HavokPlugin(true, havok);
  scene.enablePhysics(new Vector3(0, CONFIG.world.gravity, 0), plugin);

  // A sword tip travelling faster than the default clamp is exactly the case
  // this prototype exists to explore, so raise the ceiling out of the way.
  plugin.setVelocityLimits(220, 220);
  // Tells Havok what step size to expect, which its solver uses when tuning
  // constraint response. The world still steps by the real frame delta.
  plugin.setTimeStep(1 / 60);

  if (!scene.getPhysicsEngine()) {
    throw new Error("Havok loaded but the scene has no physics engine attached.");
  }
  return plugin;
}
