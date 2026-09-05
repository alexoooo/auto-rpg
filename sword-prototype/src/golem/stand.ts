import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { golemLayersFor, layersFor, type Side } from "../physics.ts";
import { boxPart, type Part } from "../rig.ts";
import { BENCH_STAND, BENCH_STAND_LOCOMOTION as L } from "./config.ts";
import { golemMaterials, materialForGolemRole, type GolemMaterialPalette } from "./materials.ts";
import { type GolemLayers, type GolemSlot, type GolemSocket } from "./module.ts";

/**
 * Which layers a golem's own bodies belong to and collide with.
 *
 * **The decision and its whole argument live in `src/physics.ts`**, beside the table they are
 * about: golem modules reuse the existing `*_ARM` and `*_SWORD` side bits, take no
 * `*_GOLEM_*` bits, and a plate is deliberately refused the `*_SHIELD` bit because the only
 * thing that bit buys is the one pair a golem must not have. Session 04 moved it there rather
 * than restating it here, because a layer rule stated in two files is a layer rule that will
 * be edited in one of them.
 *
 * What is left here is the typing: `golemLayersFor` cannot name `GolemLayers` without
 * `physics.ts` importing `module.ts`, which imports `physics.ts` back for `Side`. So the
 * structural answer comes from there and the name is put on it here, which is a cycle avoided
 * rather than a second opinion.
 *
 * Zero self-contact is therefore an assertion rather than a hope, and
 * `tests/golem-bench.test.mjs` counts it over the whole scripted sequence rather than
 * trusting that paragraph. Note the second half of that lesson from the construct experiment:
 * a self-contact count of zero proves nothing about pairs the filters never admitted -- which
 * is exactly the case here, and is why the count is reported as what it is (a check that no
 * pair was admitted by accident) rather than as evidence of physicality.
 */
export const golemLayers = (side: Side): GolemLayers =>
  Object.freeze(golemLayersFor(side));

export interface GolemStand {
  readonly block: Part;
  readonly materials: GolemMaterialPalette;
  socket(slot: GolemSlot): GolemSocket;
  dispose(): void;
}

export interface GolemStandOptions {
  readonly side: Side;
  readonly name?: string;
  /** Where the stand's own centreline stands on the floor. Defaults to the origin. */
  readonly ground?: Vector3;
  /** Which way it faces. Defaults to facing +Z, which is the arena's own convention. */
  readonly facing?: Quaternion;
  /**
   * Which slot the module going on this stand will occupy. Appended by Session 05.
   *
   * **The stand is a fixed anchor for four of the five slots and a load for the fifth**, and that
   * is the whole of what this decides. An effector hangs from the block and pushes against it, so
   * the block is `ANIMATED`, massless and immovable; a locomotion module *is* the base and the
   * block is what it carries, so for that slot the block is `DYNAMIC`, weighs what a torso-sized
   * slab of stone weighs, and sits at the height a locomotion socket is expected at. The session
   * plan freezes it in one sentence: "the stand becomes a real torso block on top of the module
   * under test."
   *
   * Defaults to `primary`, so every existing caller keeps exactly the stand it had.
   */
  readonly slot?: GolemSlot;
  /**
   * Where the locomotion socket sits above the floor, metres. Appended by Session 06.
   *
   * **A locomotion module's stand height is the module's, not the fixture's**, and that is the
   * whole of what this adds. Session 05 froze `BENCH_STAND_LOCOMOTION.socketHeight` at 1.02 --
   * the biped's own segment sum -- and said a locomotion module has to reach the floor from it,
   * which was exactly right while the biped was the only one. Session 06's wheel stands at 1.16
   * and its multileg at 0.64, and those are not a bench detail: **the socket height is the trade**
   * -- a lower socket is a lower effector and a lower head, and a module that quietly built itself
   * to a fixture's number instead of its own would be hiding it. So the module declares
   * `heightRange.standM` and the stand puts the block there.
   *
   * Ignored for every slot but `locomotion`, where the block is the load rather than the anchor.
   * Absent means `BENCH_STAND_LOCOMOTION.socketHeight`, so the biped's stand is unchanged to the
   * digit and every reading Session 05 took through it still stands.
   */
  readonly socketHeight?: number;
}

/**
 * Where each slot's socket frame sits in the block's own local frame, and which way is outboard.
 *
 * A `Record` over `GolemSlot` rather than a chain of comparisons, so a slot added to the union
 * without a frame here is a compile error rather than a socket that silently lands at the right
 * shoulder -- which is what the first version of this function did for every slot that was not
 * `secondary`.
 *
 * **One rule, in three cases, and it is about which face of the block a module bolts to.** The
 * block stands in for whatever is *below* the module being benched, so:
 *
 * - an **effector** hangs off the shoulder line, which is the block's side at `socketHeight`;
 * - **locomotion** bolts to the block's **bottom** face and builds downward to the floor, because
 *   it is the thing the block stands on rather than a thing that hangs from it;
 * - the **torso** and the **head** bolt to the block's **top** face, because what a bench torso
 *   needs under it is a pelvis and what a bench head needs under it is a trunk.
 *
 * Sessions 05 and 07 wrote that rule at the same time and each got one case the other did not:
 * 05 knew locomotion goes underneath and left torso and head marked provisional, 07 put torso and
 * head on the top face and had no locomotion slot to place. This is the reconciliation, not the
 * two stacked -- 07's own spelling of the top face is `socketHeight` and 05's is `height / 2`,
 * which are the same 0.39 m and therefore the same point.
 */
const socketFrame = (slot: GolemSlot): { local: Vector3; outboard: number } => {
  const S = BENCH_STAND;
  switch (slot) {
    // Primary to the golem's own right, which is the +X side of its own frame, exactly as
    // `CONFIG.fighter.shoulderSide` is positive on the sword side.
    case "primary":
      return { local: new Vector3(S.socketSide, S.socketHeight, S.socketFront), outboard: 1 };
    case "secondary":
      return { local: new Vector3(-S.socketSide, S.socketHeight, S.socketFront), outboard: -1 };
    // The block's bottom face: a locomotion module builds downward from here to the floor, and
    // what sits above it is the load.
    case "locomotion":
      return { local: new Vector3(0, -S.height / 2, 0), outboard: 1 };
    // The block's top face. Session 05 had the torso at the block's centre as a placeholder it
    // said aloud was Session 07's to move; Session 07 moved it, and a trunk welded at the centre
    // of the slab it is supposed to sit on would be half buried in it.
    case "torso":
    case "head":
      return { local: new Vector3(0, S.height / 2, 0), outboard: 1 };
    default: {
      const unplaced: never = slot;
      throw new Error(`no stand socket frame for slot ${String(unplaced)}`);
    }
  }
};

/**
 * The bench stand: one stone block, with a socket frame for every slot.
 *
 * Frozen by the session plan: an `ANIMATED` stone block at Warrior torso height with one socket
 * frame at shoulder height on each side. It does not move, lean or fall, and that is the point
 * -- the bench exists to judge one module in isolation, so everything that is not the module
 * has to be incapable of contributing to what is being looked at.
 *
 * `ANIMATED` rather than a zero-mass static body, so that the solver treats it as infinitely
 * heavy and a limb pushing against it simply stops, and so that a later torso can move the same
 * frames without the modules hanging off them being rebuilt.
 *
 * **The one slot that inverts that is locomotion**, appended by Session 05: a locomotion module
 * is the base and the block is its load, so for that slot alone the block is `DYNAMIC`, weighs
 * what a torso-sized slab of stone weighs and stands at the height the locomotion socket is
 * expected at. `options.slot` is what decides it, and it is the *only* thing that does -- nothing
 * here asks what kind of module is being built.
 */
export function buildGolemStand(scene: Scene, options: GolemStandOptions): GolemStand {
  const S = BENCH_STAND;
  const name = options.name ?? `golem.${options.side}.stand`;
  const ground = options.ground ?? Vector3.Zero();
  const facing = options.facing ?? Quaternion.Identity();
  const layers = layersFor(options.side);
  const materials = golemMaterials(scene, options.side);
  // A locomotion module carries the block; every other slot hangs from it. The block's height,
  // mass and motion type all follow from that one distinction and nothing else does.
  const carrying = (options.slot ?? "primary") === "locomotion";
  // The module's own stand height when it has one, and the fixture's when it does not. See
  // `GolemStandOptions.socketHeight`: three locomotion options now stand at three different
  // heights, and which one the block sits at is a fact about the module rather than about the
  // bench.
  const centreHeight = carrying
    ? (options.socketHeight ?? L.socketHeight) + S.height / 2
    : S.centreHeight;

  const block = boxPart(scene, {
    name: `${name}.block`,
    position: new Vector3(ground.x, ground.y + centreHeight, ground.z),
    rotation: facing,
    size: new Vector3(S.width, S.height, S.depth),
    mass: carrying ? L.mass : S.mass,
    layer: layers.trunk,
    collidesWith: layers.trunkCollides,
    material: materialForGolemRole(materials, "shell"),
    motionType: carrying ? PhysicsMotionType.DYNAMIC : PhysicsMotionType.ANIMATED,
  });

  const socketFor = (slot: GolemSlot): GolemSocket => {
    // Every slot's frame comes from `socketFrame` above, which is a switch with a `never`
    // default: a slot added to the union without a frame is a compile error rather than a socket
    // that quietly lands on the right shoulder. Session 07 wrote the same rule inline here as a
    // pair of `effectorSlot` ternaries; the table is where it lives now, because the third case
    // -- locomotion, underneath -- has no ternary to hide in.
    const frame = socketFrame(slot);
    const outboard = frame.outboard;
    const local = frame.local;
    const world = new Vector3();
    // The block never turns on the bench, but the arithmetic is written for a frame that
    // might: a socket taken from `mesh.position` plus an untransformed offset is a socket that
    // is right for exactly one facing, and Session 05's torso does lean.
    local.rotateByQuaternionToRef(block.mesh.rotationQuaternion ?? Quaternion.Identity(), world);
    world.addInPlace(block.mesh.position);
    return Object.freeze({
      slot,
      mount: block,
      local,
      world,
      rotation: (block.mesh.rotationQuaternion ?? Quaternion.Identity()).clone(),
      outboard,
    });
  };

  const sockets = new Map<GolemSlot, GolemSocket>();
  return Object.freeze({
    block,
    materials,
    socket: (slot: GolemSlot): GolemSocket => {
      const known = sockets.get(slot);
      if (known) return known;
      const made = socketFor(slot);
      sockets.set(slot, made);
      return made;
    },
    dispose: () => {
      block.body.dispose();
      block.shape.dispose();
      block.mesh.dispose(false, false);
      materials.dispose();
    },
  });
}
