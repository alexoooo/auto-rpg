import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
// Side effect, and a load-bearing one. Babylon's tree-shakeable build does not
// put `enablePhysics` on Scene until this component registers it, and without it
// the failure surfaces much later as "No Physics Engine available" from whatever
// happens to build the first body.
import "@babylonjs/core/Physics/joinedPhysicsEngineComponent.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { HavokPhysicsWithBindings } from "@babylonjs/havok";

import { CONFIG } from "./config.ts";

/**
 * Collision layers, per side of the ring.
 *
 * There used to be a `HERO` layer and a `DUMMY` layer, which was the right shape
 * for one fighter and one thing to hit and the wrong shape for a bout. Two
 * fighters of the same kind need the same exemptions twice over, so the layers
 * are named for which side of the fight they belong to rather than for what role
 * that side is playing -- and there is consequently nowhere in the collision
 * filter that says which one the player is driving.
 *
 * Two exemptions matter, and they are different in kind.
 *
 * A side's own blade does not collide with its own body. Die by the Sword lets
 * you cut yourself and it is one of the things people remember about it, but
 * every measured number in `config.ts`'s `arm` block was taken with the blade
 * passing freely through its owner, so turning it on is a change to the feel of
 * the weapon and needs its own before-and-after. It is a decision, not an
 * oversight.
 *
 * A side's body parts do not collide with each other either, which is the rule
 * `HERO` already carried and the old `DUMMY` did not. Adjacent capsules in a
 * jointed chain overlap at every joint by construction -- `rig.ts`'s `joint()`
 * turns off contact for each linked pair for exactly that reason -- and once the
 * chain is also being driven by position motors, a contact between two limbs
 * that are two joints apart is a fight between the contact solver and the motor
 * and reads as buzz. The dummy could afford self-collision because nothing drove
 * it; a fighter cannot.
 */
export const LAYER = {
  WORLD: 1 << 0,
  LEFT_BODY: 1 << 1,
  LEFT_SWORD: 1 << 2,
  RIGHT_BODY: 1 << 3,
  RIGHT_SWORD: 1 << 4,
  DEBRIS: 1 << 5,
} as const;

const EVERY_FIGHTER =
  LAYER.LEFT_BODY | LAYER.LEFT_SWORD | LAYER.RIGHT_BODY | LAYER.RIGHT_SWORD;

export const COLLIDES = {
  WORLD: EVERY_FIGHTER | LAYER.DEBRIS,
  LEFT_BODY: LAYER.WORLD | LAYER.RIGHT_BODY | LAYER.RIGHT_SWORD | LAYER.DEBRIS,
  LEFT_SWORD: LAYER.WORLD | LAYER.RIGHT_BODY | LAYER.RIGHT_SWORD | LAYER.DEBRIS,
  RIGHT_BODY: LAYER.WORLD | LAYER.LEFT_BODY | LAYER.LEFT_SWORD | LAYER.DEBRIS,
  RIGHT_SWORD: LAYER.WORLD | LAYER.LEFT_BODY | LAYER.LEFT_SWORD | LAYER.DEBRIS,
  // A piece that has come off is nobody's any more: it collides with everything,
  // including the fighter it was cut from, because a severed arm lying against
  // its owner's shin is a truer picture than one sunk into it.
  DEBRIS: LAYER.WORLD | EVERY_FIGHTER | LAYER.DEBRIS,
} as const;

/** Which side of the ring a fighter stands on. Everything symmetric keys off it. */
export type Side = "left" | "right";

/** The two masks a fighter needs, chosen by side rather than by role. */
export const layersFor = (side: Side) =>
  side === "left"
    ? {
        body: LAYER.LEFT_BODY,
        bodyCollides: COLLIDES.LEFT_BODY,
        sword: LAYER.LEFT_SWORD,
        swordCollides: COLLIDES.LEFT_SWORD,
      }
    : {
        body: LAYER.RIGHT_BODY,
        bodyCollides: COLLIDES.RIGHT_BODY,
        sword: LAYER.RIGHT_SWORD,
        swordCollides: COLLIDES.RIGHT_SWORD,
      };

/**
 * Bring the solver up on a scene, with the settings the whole prototype was
 * tuned against.
 *
 * **It is handed an already-loaded Havok rather than loading one**, and that
 * split is load-bearing rather than tidy. Fetching the wasm is the one part of
 * this that differs between a browser and Node: the browser needs Vite's
 * `?url` import of `HavokPhysics.wasm`, which Node's resolver rejects outright
 * -- `Package subpath './lib/esm/HavokPhysics.wasm?url' is not defined by
 * "exports"` -- and Node needs `{ wasmBinary: await readFile(...) }`, because
 * Havok's emscripten glue calls `fetch()` and Node cannot fetch a `file://`
 * URL. One line of difference used to sit at the top of this module and made
 * every file that imports it, `fighter.ts` and `combat.ts` included,
 * unloadable outside a bundler. It now sits in `arena.ts`, which is the
 * browser's half of the directory.
 *
 * What that buys is that a headless harness gets *these* settings rather than a
 * copy of them. The velocity ceiling and the expected step size are exactly the
 * sort of number that would be transcribed once, drift, and produce a
 * measurement of a slightly different simulator than the one being played.
 */
export function attachPhysics(scene: Scene, havok: HavokPhysicsWithBindings): HavokPlugin {
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
