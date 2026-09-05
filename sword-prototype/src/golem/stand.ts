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
}

/**
 * Where each slot's socket frame sits in the block's own local frame, and which way is outboard.
 *
 * A `Record` over `GolemSlot` rather than a chain of comparisons, so a slot added to the union
 * without a frame here is a compile error rather than a socket that silently lands at the right
 * shoulder -- which is what the first version of this function did for every slot that was not
 * `secondary`.
 *
 * `torso` and `head` are **provisional and are Session 07's to move.** They are filled in here
 * only because a total `Record` is what makes the check above worth anything; nothing builds
 * against them yet.
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
    case "torso":
      return { local: new Vector3(0, 0, 0), outboard: 1 };
    case "head":
      return { local: new Vector3(0, S.height / 2, 0), outboard: 1 };
    default: {
      const unplaced: never = slot;
      throw new Error(`no stand socket frame for slot ${String(unplaced)}`);
    }
  }
};

/**
 * The bench stand: a kinematic block with one socket frame on each side.
 *
 * Frozen by the session plan: an `ANIMATED` stone block at Warrior torso height with one socket
 * frame at shoulder height on each side. It does not move, lean or fall, and that is the point
 * -- the bench exists to judge one module in isolation, so everything that is not the module
 * has to be incapable of contributing to what is being looked at. Session 05 puts a real torso
 * under the socket; the socket frame contract does not change.
 *
 * `ANIMATED` rather than a zero-mass static body, so that the solver treats it as infinitely
 * heavy and a limb pushing against it simply stops, and so that a later torso can move the same
 * frames without the modules hanging off them being rebuilt.
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
  const centreHeight = carrying ? L.socketHeight + S.height / 2 : S.centreHeight;

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
