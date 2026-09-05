import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { layersFor, type Side } from "../physics.ts";
import { boxPart, type Part } from "../rig.ts";
import { BENCH_STAND } from "./config.ts";
import { golemMaterials, materialForGolemRole, type GolemMaterialPalette } from "./materials.ts";
import { effectorSlot, type GolemLayers, type GolemSlot, type GolemSocket } from "./module.ts";

/**
 * Which layers a golem's own bodies belong to and collide with.
 *
 * Derived from the existing per-side table rather than given new bits, and the derivation is
 * what buys the frozen rule "a golem's own parts never collide with each other" **by
 * construction rather than by aspiration**:
 *
 * - Structural links sit on the side's `arm` layer, whose collide mask is world, the far side
 *   and debris. It does not contain the arm layer, so two links never touch; it does not
 *   contain the trunk layer, so a link never touches the stand it hangs from.
 * - A terminal sits on the side's `sword` layer, whose mask is the same shape. A blade
 *   therefore passes through its owner, which is what the layer table already argues for and
 *   what the overview's rule 5 restates for golems.
 *
 * So zero self-contact is an assertion here and not a hope, and
 * `tests/golem-bench.test.mjs` counts it over the whole scripted sequence rather than
 * trusting this paragraph. Note the second half of that lesson from the construct experiment:
 * a self-contact count of zero proves nothing about pairs the filters never admitted -- which
 * is exactly the case here, and is why the count is reported as what it is (a check that no
 * pair was admitted by accident) rather than as evidence of physicality.
 */
export const golemLayers = (side: Side): GolemLayers => {
  const layers = layersFor(side);
  return Object.freeze({
    body: layers.arm,
    bodyCollidesWith: layers.armCollides,
    strike: layers.sword,
    strikeCollidesWith: layers.swordCollides,
  });
};

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
}

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

  const block = boxPart(scene, {
    name: `${name}.block`,
    position: new Vector3(ground.x, ground.y + S.centreHeight, ground.z),
    rotation: facing,
    size: new Vector3(S.width, S.height, S.depth),
    mass: S.mass,
    layer: layers.trunk,
    collidesWith: layers.trunkCollides,
    material: materialForGolemRole(materials, "shell"),
    motionType: PhysicsMotionType.ANIMATED,
  });

  const socketFor = (slot: GolemSlot): GolemSocket => {
    // Primary to the golem's own right, which is the +X side of its own frame, exactly as
    // `CONFIG.fighter.shoulderSide` is positive on the sword side.
    const outboard = slot === "secondary" ? -1 : 1;
    // **An effector hangs off the side; everything else bolts to the top face.** One rule, and it
    // falls out of what the stand is for: the block stands in for whatever is *below* the module
    // being benched, so an arm hangs from the shoulder line at `socketSide` and a torso or a head
    // sits on the block's own top. `socketHeight` is already half the block's height -- 1.03 plus
    // 0.39 is the 1.42 m shoulder line -- so the top face needs no second number, and Session 03's
    // rung geometry is untouched because nothing about the effector branch moved.
    const sideways = effectorSlot(slot) ? S.socketSide * outboard : 0;
    const local = new Vector3(sideways, S.socketHeight, effectorSlot(slot) ? S.socketFront : 0);
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
