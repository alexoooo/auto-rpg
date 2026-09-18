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
 * Each side has four layers rather than two, and the split is only there to buy
 * one pair: **a shield collides with its owner's trunk.** Everything else is
 * exactly the exemptions the two-layer version had.
 *
 * A side's own blade does not collide with its own body. Die by the Sword lets
 * you cut yourself and it is one of the things people remember about it, but
 * every measured number in `config.ts`'s `arm` block was taken with the blade
 * passing freely through its owner, so turning it on is a change to the feel of
 * the weapon and needs its own before-and-after. It is a decision, not an
 * oversight -- and it is why the shield gets its own bit instead of the blade
 * exemption simply being lifted. A shield cuts nothing; it exists to occupy a
 * rectangle, and a rectangle that can be commanded into its owner's chest is the
 * one failure a shield cannot have. This buys the guarantee without touching a
 * single number the sword was tuned against.
 *
 * **An arrow is on its side, not on its own.** It gets a fifth bit per side and
 * that bit joins a side's anatomy and held weapons, which is what buys the two things
 * an arrow has to be able to do without a line of code anywhere: it finds the
 * other fighter's trunk, arms and shield, because those are what collide with a
 * side; and **an enemy blade can bat it out of the air**, because a sword
 * collides with the whole of the far side and an arrow is now part of one. Its
 * own row is the sword's shape exactly -- world, the far side, and debris -- so
 * it passes through the archer who loosed it, which is the same exemption a
 * blade has always had and is why a bow can be drawn past one's own arm.
 *
 * Flying projectiles do not collide with projectiles from either side. Head-on authored
 * launchers otherwise manufacture an invisible shield: Havok spends both bolts at their
 * midpoint, but neither collision has a damageable target. Blades and shields still see the
 * opposing projectile bit, so physical interception remains available through visible hardware.
 *
 * It also means **two arrows on the same side never touch**, which is not a
 * nicety: a quiver parks a dozen of them in the same cubic centimetre, and a
 * stack that collided with itself would be a dozen bodies solving against each
 * other for the whole bout. They are parked on membership mask 0 as well, so
 * this is the second of two independent reasons rather than the only one.
 *
 * A side's body parts do not collide with each other, which is the rule `HERO`
 * already carried and the old `DUMMY` did not. Adjacent capsules in a jointed
 * chain overlap at every joint by construction -- `rig.ts`'s `joint()` turns off
 * contact for each linked pair for exactly that reason -- and once the chain is
 * also being driven by position motors, a contact between two limbs that are two
 * joints apart is a fight between the contact solver and the motor and reads as
 * buzz. The dummy could afford self-collision because nothing drove it; a
 * fighter cannot.
 *
 * That is also why the shield stops at the *trunk* and does not see its owner's
 * arms. The plate hangs 110 mm off the fist that holds it and its own forearm
 * sits inside that gap by construction, so a shield that collided with its own
 * arm would be in permanent contact with the chain that is driving it -- the
 * buzz above, with a 4 kg lever on it. The trunk is keyframed and infinitely
 * heavy, so a shield pressed against it simply stops.
 */
export const LAYER = {
  WORLD: 1 << 0,
  LEFT_TRUNK: 1 << 1,
  LEFT_ARM: 1 << 2,
  LEFT_SWORD: 1 << 3,
  LEFT_SHIELD: 1 << 4,
  RIGHT_TRUNK: 1 << 5,
  RIGHT_ARM: 1 << 6,
  RIGHT_SWORD: 1 << 7,
  RIGHT_SHIELD: 1 << 8,
  DEBRIS: 1 << 9,
  LEFT_ARROW: 1 << 10,
  RIGHT_ARROW: 1 << 11,
  SPENT_ARROW: 1 << 12,
  LEFT_SUPPORTED_TRUNK: 1 << 13,
  LEFT_SUPPORTED_ARM: 1 << 14,
  LEFT_SUPPORTED_LEG: 1 << 15,
  RIGHT_SUPPORTED_TRUNK: 1 << 16,
  RIGHT_SUPPORTED_ARM: 1 << 17,
  RIGHT_SUPPORTED_LEG: 1 << 18,
  LEFT_FIST_TRIGGER: 1 << 19,
  RIGHT_FIST_TRIGGER: 1 << 20,
} as const;

/** Everything one side owns, which is what the *other* side collides with. */
const LEFT_SIDE =
  LAYER.LEFT_TRUNK | LAYER.LEFT_ARM | LAYER.LEFT_SWORD | LAYER.LEFT_SHIELD | LAYER.LEFT_ARROW;
const RIGHT_SIDE =
  LAYER.RIGHT_TRUNK |
  LAYER.RIGHT_ARM |
  LAYER.RIGHT_SWORD |
  LAYER.RIGHT_SHIELD |
  LAYER.RIGHT_ARROW;

const LEFT_SIDE_WITHOUT_ARROW = LEFT_SIDE & ~LAYER.LEFT_ARROW;
const RIGHT_SIDE_WITHOUT_ARROW = RIGHT_SIDE & ~LAYER.RIGHT_ARROW;

const LEFT_SUPPORTED_ANATOMY =
  LAYER.LEFT_SUPPORTED_TRUNK | LAYER.LEFT_SUPPORTED_ARM | LAYER.LEFT_SUPPORTED_LEG;
const RIGHT_SUPPORTED_ANATOMY =
  LAYER.RIGHT_SUPPORTED_TRUNK | LAYER.RIGHT_SUPPORTED_ARM | LAYER.RIGHT_SUPPORTED_LEG;
const LEFT_DAMAGEABLE_ANATOMY = LAYER.LEFT_TRUNK | LAYER.LEFT_ARM | LEFT_SUPPORTED_ANATOMY;
const RIGHT_DAMAGEABLE_ANATOMY = LAYER.RIGHT_TRUNK | LAYER.RIGHT_ARM | RIGHT_SUPPORTED_ANATOMY;
const LEFT_STRIKERS = LAYER.LEFT_SWORD | LAYER.LEFT_SHIELD | LAYER.LEFT_ARROW;
const RIGHT_STRIKERS = LAYER.RIGHT_SWORD | LAYER.RIGHT_SHIELD | LAYER.RIGHT_ARROW;

const EVERY_FIGHTER = LEFT_SIDE | RIGHT_SIDE;
const EVERY_SUPPORTED_ANATOMY = LEFT_SUPPORTED_ANATOMY | RIGHT_SUPPORTED_ANATOMY;

export const COLLIDES = {
  WORLD: EVERY_FIGHTER | EVERY_SUPPORTED_ANATOMY | LAYER.DEBRIS | LAYER.SPENT_ARROW,
  LEFT_TRUNK: LAYER.WORLD | RIGHT_SIDE | RIGHT_SUPPORTED_ANATOMY | LAYER.LEFT_SHIELD | LAYER.DEBRIS,
  LEFT_ARM: LAYER.WORLD | RIGHT_SIDE | RIGHT_SUPPORTED_ANATOMY | LAYER.DEBRIS,
  LEFT_SWORD: LAYER.WORLD | RIGHT_SIDE | RIGHT_SUPPORTED_ANATOMY | LAYER.DEBRIS,
  LEFT_SHIELD: LAYER.WORLD | RIGHT_SIDE | RIGHT_SUPPORTED_ANATOMY |
    LAYER.LEFT_TRUNK | LAYER.LEFT_SUPPORTED_TRUNK | LAYER.DEBRIS,
  // The sword's row exactly. An arrow in flight is a small fast blade that
  // belongs to a side, and everything that follows from that is already written.
  LEFT_ARROW: LAYER.WORLD | RIGHT_SIDE_WITHOUT_ARROW | RIGHT_SUPPORTED_ANATOMY | LAYER.DEBRIS,
  RIGHT_TRUNK: LAYER.WORLD | LEFT_SIDE | LEFT_SUPPORTED_ANATOMY | LAYER.RIGHT_SHIELD | LAYER.DEBRIS,
  RIGHT_ARM: LAYER.WORLD | LEFT_SIDE | LEFT_SUPPORTED_ANATOMY | LAYER.DEBRIS,
  RIGHT_SWORD: LAYER.WORLD | LEFT_SIDE | LEFT_SUPPORTED_ANATOMY | LAYER.DEBRIS,
  RIGHT_SHIELD: LAYER.WORLD | LEFT_SIDE | LEFT_SUPPORTED_ANATOMY |
    LAYER.RIGHT_TRUNK | LAYER.RIGHT_SUPPORTED_TRUNK | LAYER.DEBRIS,
  RIGHT_ARROW: LAYER.WORLD | LEFT_SIDE_WITHOUT_ARROW | LEFT_SUPPORTED_ANATOMY | LAYER.DEBRIS,
  // Supported anatomy solves only against the arena, real combat geometry and
  // debris. The opposite body is represented to navigation by its pure
  // footprint, so two articulated piles never become one solver island.
  LEFT_SUPPORTED_TRUNK: LAYER.WORLD | RIGHT_SIDE | RIGHT_STRIKERS | LAYER.LEFT_SHIELD |
    LAYER.RIGHT_FIST_TRIGGER | LAYER.DEBRIS,
  LEFT_SUPPORTED_ARM: LAYER.WORLD | RIGHT_SIDE | RIGHT_STRIKERS | LAYER.RIGHT_FIST_TRIGGER | LAYER.DEBRIS,
  LEFT_SUPPORTED_LEG: LAYER.WORLD | RIGHT_SIDE | RIGHT_STRIKERS | LAYER.RIGHT_FIST_TRIGGER | LAYER.DEBRIS,
  RIGHT_SUPPORTED_TRUNK: LAYER.WORLD | LEFT_SIDE | LEFT_STRIKERS | LAYER.RIGHT_SHIELD |
    LAYER.LEFT_FIST_TRIGGER | LAYER.DEBRIS,
  RIGHT_SUPPORTED_ARM: LAYER.WORLD | LEFT_SIDE | LEFT_STRIKERS | LAYER.LEFT_FIST_TRIGGER | LAYER.DEBRIS,
  RIGHT_SUPPORTED_LEG: LAYER.WORLD | LEFT_SIDE | LEFT_STRIKERS | LAYER.LEFT_FIST_TRIGGER | LAYER.DEBRIS,
  // These leaves are sensors, not navigation proxies and not solver geometry.
  // Their bodies follow the real hands and collision callbacks retain the
  // hand's measured point and velocity for ordinary Combat scoring.
  LEFT_FIST_TRIGGER: RIGHT_DAMAGEABLE_ANATOMY,
  RIGHT_FIST_TRIGGER: LEFT_DAMAGEABLE_ANATOMY,
  // A piece that has come off is nobody's any more: it collides with everything,
  // including the fighter it was cut from, because a severed arm lying against
  // its owner's shin is a truer picture than one sunk into it.
  DEBRIS: LAYER.WORLD | EVERY_FIGHTER | EVERY_SUPPORTED_ANATOMY | LAYER.DEBRIS,
  // A first-hit projectile becomes world litter, not a scaffold or a second
  // striker. Reciprocity exists only with the arena.
  SPENT_ARROW: LAYER.WORLD,
} as const;

/** Which side of the ring a fighter stands on. Everything symmetric keys off it. */
export type Side = "left" | "right";

/** The five masks a fighter needs, chosen by side rather than by role. */
export const layersFor = (side: Side) =>
  side === "left"
    ? {
        trunk: LAYER.LEFT_TRUNK,
        trunkCollides: COLLIDES.LEFT_TRUNK,
        arm: LAYER.LEFT_ARM,
        armCollides: COLLIDES.LEFT_ARM,
        sword: LAYER.LEFT_SWORD,
        swordCollides: COLLIDES.LEFT_SWORD,
        shield: LAYER.LEFT_SHIELD,
        shieldCollides: COLLIDES.LEFT_SHIELD,
        arrow: LAYER.LEFT_ARROW,
        arrowCollides: COLLIDES.LEFT_ARROW,
      }
    : {
        trunk: LAYER.RIGHT_TRUNK,
        trunkCollides: COLLIDES.RIGHT_TRUNK,
        arm: LAYER.RIGHT_ARM,
        armCollides: COLLIDES.RIGHT_ARM,
        sword: LAYER.RIGHT_SWORD,
        swordCollides: COLLIDES.RIGHT_SWORD,
        shield: LAYER.RIGHT_SHIELD,
        shieldCollides: COLLIDES.RIGHT_SHIELD,
        arrow: LAYER.RIGHT_ARROW,
        arrowCollides: COLLIDES.RIGHT_ARROW,
      };

/** Assisted leaves installed only by the supported-locomotion production handshake. */
export const supportedLayersFor = (side: Side) =>
  side === "left"
    ? {
        trunk: LAYER.LEFT_SUPPORTED_TRUNK,
        trunkCollides: COLLIDES.LEFT_SUPPORTED_TRUNK,
        arm: LAYER.LEFT_SUPPORTED_ARM,
        armCollides: COLLIDES.LEFT_SUPPORTED_ARM,
        leg: LAYER.LEFT_SUPPORTED_LEG,
        legCollides: COLLIDES.LEFT_SUPPORTED_LEG,
        fistTrigger: LAYER.LEFT_FIST_TRIGGER,
        fistTriggerCollides: COLLIDES.LEFT_FIST_TRIGGER,
      }
    : {
        trunk: LAYER.RIGHT_SUPPORTED_TRUNK,
        trunkCollides: COLLIDES.RIGHT_SUPPORTED_TRUNK,
        arm: LAYER.RIGHT_SUPPORTED_ARM,
        armCollides: COLLIDES.RIGHT_SUPPORTED_ARM,
        leg: LAYER.RIGHT_SUPPORTED_LEG,
        legCollides: COLLIDES.RIGHT_SUPPORTED_LEG,
        fistTrigger: LAYER.RIGHT_FIST_TRIGGER,
        fistTriggerCollides: COLLIDES.RIGHT_FIST_TRIGGER,
      };

export interface CollisionLeaf {
  filterMembershipMask: number;
  filterCollideMask: number;
}

/** Havok filters compounds at their leaves. The container write is only an audit mirror. */
export function writeCollisionFilter(
  container: CollisionLeaf,
  leaves: readonly CollisionLeaf[],
  membership: number,
  collidesWith: number,
): void {
  if (leaves.length === 0) throw new Error("a collision filter requires at least one leaf");
  container.filterMembershipMask = membership;
  container.filterCollideMask = collidesWith;
  for (const leaf of leaves) {
    leaf.filterMembershipMask = membership;
    leaf.filterCollideMask = collidesWith;
  }
}

/** Refuse a container-only update instead of claiming an assisted body is filtered. */
export function collisionFilterIsExact(
  container: CollisionLeaf,
  leaves: readonly CollisionLeaf[],
  membership: number,
  collidesWith: number,
): boolean {
  return leaves.length > 0 && [container, ...leaves].every((shape) =>
    shape.filterMembershipMask === membership && shape.filterCollideMask === collidesWith);
}

/**
 * Which layers a **golem's** own bodies belong to and collide with.
 *
 * **The decision, taken in Session 04 and written here because this is the file that owns it:
 * golem modules reuse the existing `*_ARM` and `*_SWORD` side bits. They take no `*_GOLEM_*`
 * bits of their own, and a golem's plate deliberately does *not* take the `*_SHIELD` bit.**
 *
 * A structural link -- a collar, an upper arm, a forearm, a wrist -- is on the side's `arm`
 * layer, whose row is world, the far side, the far side's supported anatomy and debris. It does
 * not contain the arm layer, so two links of one golem never touch; it does not contain the
 * trunk layer, so a link never touches the torso it hangs from. A terminal -- blade, plate,
 * mace, whip -- is on the side's `sword` layer, whose row has the same shape. So the frozen
 * rule "a golem's own parts never collide with each other" is true **by construction rather
 * than by aspiration**, and a self-contact count above zero is a filter set wrongly rather than
 * a body plan that touches itself. It is also what makes a whip possible at all: eight capsules
 * on spherical joints overlap at every seam by construction, and they are on a layer whose
 * collide mask does not contain that layer.
 *
 * **Why the plate is refused the shield bit**, which is the only part of this that is a real
 * choice rather than a restatement. The four-layers-per-side split exists to buy exactly one
 * pair -- a shield collides with its owner's trunk -- and that pair is the one thing a golem
 * plate must not have. The held shield needed it because a *redundant* seven-axis arm could be
 * commanded into its owner's chest and something had to stop the board there. A golem effector
 * is a low-axis chain that publishes an envelope and clamps a command into it before the anchor
 * is ever handed a target, so the pose is not refused, it is not in the envelope at all. Taking
 * the shield bit would import a permanent contact between a heavy plate and the very chain
 * driving it, which is the friction the table above was written to prevent and which cost this
 * directory 1687 undetected contacts between a sword and its own upper arm. If the bench ever
 * shows a plate through its own torso on a legal command, the envelope is wrong and the chain
 * is where it is fixed.
 *
 * **Why no new bits.** There is room -- 21 of 31 usable bits are spoken for -- so this is not a
 * budget argument. It is the rule about second copies: a `*_GOLEM_STRIKE` row would be
 * `*_SWORD`'s row transcribed, and a transcribed row is a row that drifts, in the one table in
 * this directory where a wrong entry is invisible until somebody counts contacts. Nothing in
 * any filter here has ever asked "is this a golem", and until something does, a new bit would
 * be a distinction with no reader.
 *
 * The filter still goes on the **leaf**: every golem part is a single `PhysicsShapeBox`,
 * `PhysicsShapeCapsule` or `PhysicsShapeSphere` and never a `PhysicsShapeContainer`, because a
 * container's own mask is a shape nothing consults that reads back garbage. `collisionFilterIsExact`
 * above is what `tests/golem-bench.test.mjs` asks per part.
 */
export const golemLayersFor = (side: Side) => {
  const layers = layersFor(side);
  return {
    body: layers.arm,
    bodyCollidesWith: layers.armCollides,
    strike: layers.sword,
    strikeCollidesWith: layers.swordCollides,
  };
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
