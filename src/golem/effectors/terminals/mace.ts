import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

import { COLLIDES, LAYER } from "../../../physics.ts";
import { capsulePart, joint } from "../../../rig.ts";
import { TERMINAL_MACE } from "../../config.ts";
import { materialForGolemRole } from "../../materials.ts";
import {
  defineTerminal,
  effectorSlot,
  weldRotation,
  type BuiltTerminal,
  type ChainWeld,
  type GolemPart,
  type ModuleBuild,
} from "../../module.ts";
import { barShell } from "../shell.ts";
import { RigidStrike } from "../striker.ts";

/**
 * The mace: a heavy bar out along the limb from one weld, and nothing else.
 *
 * **Rebuilt on the blade's pattern by the matchup set's Session 02.** Session 04's mace was a bar
 * across both effector sockets, a closed kinematic loop with one driven grip and one carried, and
 * it did what the loop made it do: it pinned the chain's yaw, roll and bend, its second arm added
 * mass and no force, and it scored 8.3 damage a bout against a blade's 72.6. The loop and its
 * arguments live on in `maul.ts`, where the two hands hold *one* grip and both anchors drive it;
 * this file is the one-handed weapon the owner asked for, and it is deliberately the simplest
 * terminal on the shelf after the fist.
 *
 * It reads no `HandIntent`, like every terminal, and takes nothing from the chain: `limits` is
 * null. What makes it a mace rather than a blade is `TERMINAL_MACE.mass` -- fourteen times the
 * blade's -- the balance point out toward the head, and the `club` bite row, which since
 * 2026-09-06 is `blunt`: the striker publishes the bar's own mass and the score is the energy
 * that arrives. Against a golem's trunk core an 18 kg head at 9 m/s is 645 J and 5.6 points of
 * wound, where the Warrior's 3.4 kg club at the same speed is 1.1; against a 9.4 kg limb the
 * same head is 2.2, because a limb that light gets out of the way of anything heavy. "A club
 * has no edge, so there is nothing to align with and no way to hold it wrong. Everything it does
 * is speed" -- and now, mass, and what the mass meets.
 *
 * **One leaf.** The bar is a single capsule of the haft's radius, so the layer masks go on the
 * shape itself and `sever` can rewrite them. The head is drawn by the shell, wider than the
 * collider, which is stated beside `TERMINAL_MACE.headDiameter` together with what it costs.
 */
export const maceTerminal = defineTerminal({
  id: "mace",
  sockets: 1,
  bite: "mass",
  label: "mace",
  massKg: TERMINAL_MACE.mass,
  // One socket, one body, and only the wrist's bend taken away: a mace on the end of an arm
  // reaches everywhere the arm does and swings and rolls with it. The two-socket bar this
  // replaced pinned the swing and the roll as well; getting those back is the whole of the
  // rebuild, and why the bend stays pinned is beside `TERMINAL_MACE.limits`.
  limits: TERMINAL_MACE.limits,

  build(ctx: ModuleBuild, onto: ChainWeld): BuiltTerminal {
    const M = TERMINAL_MACE;
    const name = `${ctx.name}.mace`;
    const half = M.length / 2;
    /** Where the drawn head sits along the bar's own +Y, from its centre. */
    const headAt = half - M.headDiameter / 2;
    /** Where the drawn grip collar sits: just past the weld, at the butt. */
    const gripAt = -half + M.haftRadius * 1.5;

    // The rotation the weld is about to demand, rather than the golem's own; the bar's origin
    // is its centre, so it is built half a length beyond the weld point along its own +Y, which
    // after the rotation is `onto.mount.perp` carried into the world. `blade.ts`, exactly.
    const rotation = weldRotation(onto.mount, onto.rotation);
    const along = new Vector3();
    new Vector3(0, 1, 0).rotateByQuaternionToRef(rotation, along);
    const position = onto.world.add(along.scale(half));

    const part = capsulePart(ctx.scene, {
      name,
      position,
      rotation,
      height: M.length,
      radius: M.haftRadius,
      mass: M.mass,
      layer: ctx.layers.strike,
      collidesWith: ctx.layers.strikeCollidesWith,
      material: materialForGolemRole(ctx.materials, "shell"),
      // Out toward the head, which is the number that gives the weapon its character:
      // `CONFIG.club.balancePoint` makes the same argument in metres.
      centerOfMass: new Vector3(0, M.balanceFraction * M.length - half, 0),
    });
    part.body.setLinearDamping(M.linearDamping);
    part.body.setAngularDamping(M.angularDamping);

    let weld: Physics6DoFConstraint | null = joint(ctx.scene, onto.link, part, {
      pivotParent: onto.pivot,
      pivotChild: new Vector3(0, -half, 0),
      axisParent: onto.mount.axis,
      axisChild: new Vector3(1, 0, 0),
      perpParent: onto.mount.perp,
      perpChild: new Vector3(0, 1, 0),
      // Every axis locked, through the one constraint type the whole rig uses.
      swing: {},
    });

    const striker = new RigidStrike(part, {
      kind: "club",
      effectorId: `${name}.head`,
      hand: effectorSlot(ctx.socket.slot),
      tipAlong: half,
      // The mass behind the blow is the bar's own, the way the fist publishes its ball's. The
      // arm behind it is the chain's and is not counted.
      impactMassKg: M.mass,
    });

    const parts: readonly GolemPart[] = Object.freeze([
      Object.freeze({
        id: name,
        part,
        shell: Object.freeze([
          part.mesh,
          ...barShell(ctx.scene, {
            name, host: part.mesh, headDiameter: M.headDiameter, headAt,
            grips: [gripAt], haftRadius: M.haftRadius, materials: ctx.materials,
          }),
        ]),
        health: M.health,
        vitalityWeight: M.vitalityWeight,
        fatal: false,
      }),
    ]);

    return Object.freeze({
      parts,
      strikers: Object.freeze([striker]),
      // Weld to the far side of the head: the whole bar, and an honest number for the first time
      // on a mace -- the two-socket bar's `tipOffset` was an upper bound with a paragraph.
      tipOffset: M.length,
      // One socket, so there is no trailing grip to be away from anything.
      gripStray: () => null,
      sever: () => {
        striker.sever();
        // On the leaf, which for a one-capsule bar is the shape itself.
        part.shape.filterMembershipMask = LAYER.DEBRIS;
        part.shape.filterCollideMask = COLLIDES.DEBRIS;
      },
      dispose: () => {
        striker.sever();
        // The weld is the one constraint no part owns, so it is the one nothing else would
        // take down; see `blade.ts`.
        weld?.dispose();
        weld = null;
        part.body.dispose();
        part.shape.dispose();
        part.mesh.dispose(false, false);
      },
    });
  },
});
