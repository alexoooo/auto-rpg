import "@babylonjs/core/Physics/joinedPhysicsEngineComponent.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { HavokPhysicsWithBindings } from "@babylonjs/havok";
import { STANDARD_GRAVITY } from "../spec/constants.ts";
import { sourced, type Quantity } from "../spec/quantity.ts";

/**
 * The core's physics world: Havok on a scene, with standard gravity (`STANDARD_GRAVITY`) and a
 * fixed step.
 *
 * The side-effect import above is load-bearing (H02): without it the tree-shaken build has no
 * `scene.enablePhysics`. The Havok instance is handed in, loaded by the caller, because loading
 * differs between a browser and Node (H25).
 *
 * The solver is told to expect exactly the step it is handed; nothing here conditions it. If a
 * body needs conditioning, it is named, measured and added as such (the plan's rule), not folded
 * into a body's numbers.
 */

/** The fixed step's rate: physics and control run at 120 Hz. */
export const PHYSICS_HZ: Quantity<number> = sourced(120, "Hz", "owner-physics-rate",
  "physics and control at 120 Hz from the release of 2026-09-25");

/** Bring Havok up on `scene` with the core's gravity and fixed step. Call before any body exists (H01). */
export function attachHavok(scene: Scene, havok: HavokPhysicsWithBindings): HavokPlugin {
  const plugin = new HavokPlugin(true, havok);
  if (!scene.enablePhysics(new Vector3(0, -STANDARD_GRAVITY.value, 0), plugin)) {
    throw new Error("Havok loaded but the scene has no physics engine attached.");
  }
  scene.getPhysicsEngine()!.setSubTimeStep(1000 / PHYSICS_HZ.value);
  return plugin;
}
