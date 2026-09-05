import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

import { COLLIDES, LAYER } from "../../../physics.ts";
import { capsulePart, joint, type Part } from "../../../rig.ts";
import { TERMINAL_WHIP } from "../../config.ts";
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
import { beadShell } from "../shell.ts";
import { RigidStrike } from "../striker.ts";

/**
 * The whip: six stone beads on five spherical joints, welded to the end of a wrist.
 *
 * **It is physics rather than control**, which is the session plan's frozen choice and is worth
 * stating as what it rules out: no lash controller, no per-segment target, no stroke of its own,
 * and no new driven axis. The wrist flicks and the beads do what beads do. That also makes it
 * the one terminal whose behaviour is not a function of its own file -- what a lash does is
 * decided by `TERMINAL_WHIP`'s damping, its joint cone and the chain's roll rate, and by nothing
 * that could be called a decision at run time.
 *
 * **The first bead is welded and the rest are jointed**, which is why this is offered on the
 * wrist chain and nowhere else. A whip hung off a spherical joint at the wrist hangs straight
 * down whatever the arm does, and `roll` would move nothing at all. Welded, the first bead is the
 * arm's, and `roll` is which way the lash starts -- which is the only sentence the overview's
 * terminal table has to say about this one.
 *
 * ## `velocityAt`, which is the question this file exists to answer carefully
 *
 * `AGENTS.md` records that `linear + w x r` is right for a blade and wrong for a projectile, and
 * the distinction is **not** rigidity. It is whether the rotation was there before the contact.
 * An arrow has none in flight, so any `w` at its contact point was put there *by* the contact,
 * and over a 0.36 m half-shaft that is a systematic error rather than noise: fired at 48 m/s, the
 * three readings were 38.4 (the body's linear velocity), 48.0 (the last control step) and **5.6**
 * for `linear + w x r`, and the damage model was being handed the last one.
 *
 * A whip bead is the opposite case in its strongest form. It is turning about the joint above it
 * precisely *because* the lash is cracking; that turn is put there by the chain that drives it;
 * and it is the entire reason the end of a whip goes faster than the hand. So a bead is scored
 * the way a blade is, through `RigidStrike`, and the ordinary post-contact exclusion window --
 * 0.25 s, mandatory for any tip-speed reading here -- is what keeps the frame *after* a hit out
 * of the numbers.
 *
 * ## Two readings this terminal makes meaningless, said here rather than discovered later
 *
 * - **"Tip to command" is not a tracking error for a whip.** `commandedEnd` answers where a
 *   *rigid* extension of the arm 1.64 m long would have its far end, and a lash is not one. The
 *   number it produces is the lash's droop, which is near a metre at rest and is a property of
 *   the whip rather than a fault in the chain. The chain's own tracking reading is `anchorStray`.
 * - **A whip's peak tip speed is a reading about the lash and not about the drive**, and it is
 *   the one figure here that is genuinely interesting: a bead goes far faster than the wrist that
 *   flicked it, which is the whole point of the terminal and the reason the exclusion windows
 *   matter more here than anywhere else on the shelf.
 */
export const whipTerminal = defineTerminal({
  id: "whip",
  sockets: 1,
  bite: "mass",
  label: "whip",
  massKg: TERMINAL_WHIP.segments * TERMINAL_WHIP.segmentMass,
  // **Elevation, and nothing else.** A lash has no pose it cannot reach -- it hangs -- so this is
  // not about the whip's kinematics at all, it is about the room under the shoulder, and the
  // table beside `TERMINAL_WHIP.limits` is the arithmetic. The beads themselves pass through
  // their owner exactly as a blade does, which is the layer table's decision and not this file's.
  limits: TERMINAL_WHIP.limits,

  build(ctx: ModuleBuild, onto: ChainWeld): BuiltTerminal {
    const W = TERMINAL_WHIP;
    const name = `${ctx.name}.whip`;
    const stone = materialForGolemRole(ctx.materials, "shell");

    // Built in the frame the weld demands and hung straight out along the limb, which is where
    // `LIMB_MOUNT.perp` points. Every bead is built in the *same* frame at joint angle exactly
    // zero: a chain of five joints built with any of them out of true is five violations the
    // solver clears at once, and the tell would be a lash that leaves the wrist at speed on the
    // first step of a stand that is doing nothing.
    const rotation = weldRotation(onto.mount, onto.rotation);
    const along = new Vector3();
    new Vector3(0, 1, 0).rotateByQuaternionToRef(rotation, along);

    const beads: Part[] = [];
    for (let index = 0; index < W.segments; index += 1) {
      const centre = onto.world.add(along.scale(W.segmentLength * (index + 0.5)));
      const bead = capsulePart(ctx.scene, {
        name: `${name}.${index}`,
        position: centre,
        rotation,
        height: W.segmentLength,
        radius: W.segmentRadius,
        mass: W.segmentMass,
        layer: ctx.layers.strike,
        collidesWith: ctx.layers.strikeCollidesWith,
        material: stone,
      });
      bead.body.setLinearDamping(W.linearDamping);
      bead.body.setAngularDamping(W.angularDamping);
      beads.push(bead);
    }

    // The near end of each bead in its own local frame, and the far end of the one before it.
    const nearEnd = new Vector3(0, -W.segmentLength / 2, 0);
    const farEnd = new Vector3(0, W.segmentLength / 2, 0);
    const cone = { min: -W.jointCone, max: W.jointCone };
    const twist = { min: -W.jointTwist, max: W.jointTwist };

    let joints: (Physics6DoFConstraint | null)[] = [
      // The first bead is **welded**: every axis locked, so the lash starts where the wrist
      // points it. See the header for why that is the whole of what `roll` means here.
      joint(ctx.scene, onto.link, beads[0], {
        pivotParent: onto.pivot,
        pivotChild: nearEnd,
        axisParent: onto.mount.axis,
        axisChild: new Vector3(1, 0, 0),
        perpParent: onto.mount.perp,
        perpChild: new Vector3(0, 1, 0),
        swing: {},
      }),
    ];
    for (let index = 1; index < beads.length; index += 1) {
      // Limited rather than free: a bead pair with no limit folds back through itself, and
      // adjacent beads are on a layer whose collide mask does not contain that layer, so nothing
      // downstream would stop it. `y` is the twist about the lash's own axis and is tighter,
      // because a twist there moves nothing visible and only costs the solver work.
      joints.push(joint(ctx.scene, beads[index - 1], beads[index], {
        pivotParent: farEnd,
        pivotChild: nearEnd,
        swing: { x: cone, y: twist, z: cone },
      }));
    }

    // **The last few beads bite, the far one first.** `BuiltTerminal.strikers` is ordered with
    // the business end at the head, because that is where the tip and the edge are read from --
    // and `edgeDirection` is never asked of this one, because a whip's `bite` is mass.
    const hand = effectorSlot(ctx.socket.slot);
    const striking = Math.min(W.strikingSegments, beads.length);
    const strikers: RigidStrike[] = [];
    for (let back = 0; back < striking; back += 1) {
      const index = beads.length - 1 - back;
      strikers.push(new RigidStrike(beads[index], {
        kind: "club",
        effectorId: `${name}.${index}.lash`,
        hand,
        tipAlong: W.segmentLength / 2,
      }));
    }

    const parts: readonly GolemPart[] = Object.freeze(beads.map((bead) => Object.freeze({
      id: bead.name,
      part: bead,
      shell: Object.freeze([
        bead.mesh,
        ...beadShell(ctx.scene, {
          name: bead.name, host: bead.mesh, radius: W.segmentRadius,
          at: W.segmentLength / 2, materials: ctx.materials,
        }),
      ]),
      health: W.health,
      vitalityWeight: W.vitalityWeight,
      fatal: false,
    })));

    return Object.freeze({
      parts,
      strikers: Object.freeze(strikers),
      tipOffset: W.segmentLength * beads.length,
      gripStray: () => null,
      sever: () => {
        for (const striker of strikers) striker.sever();
        // Every bead relayers, and each on **its own leaf**: a whip is the one terminal here with
        // more than one body, and a session that relayered only the first would leave five
        // capsules on the golem's own strike layer with nothing holding them.
        for (const bead of beads) {
          bead.shape.filterMembershipMask = LAYER.DEBRIS;
          bead.shape.filterCollideMask = COLLIDES.DEBRIS;
        }
      },
      dispose: () => {
        for (const striker of strikers) striker.sever();
        // **Constraints first, from the far end back.** `PhysicsBody.dispose` releases the Havok
        // body and walks straight past whatever is constraining it, so a bead disposed before its
        // own joints leaves a constraint pointing at freed memory -- and with five of them a
        // whip is where that would first be noticed. From the end back rather than from the
        // start, so no constraint is ever left holding a body that has already gone.
        for (let index = joints.length - 1; index >= 0; index -= 1) {
          joints[index]?.dispose();
          joints[index] = null;
        }
        joints = [];
        for (let index = beads.length - 1; index >= 0; index -= 1) {
          const bead = beads[index];
          bead.body.dispose();
          bead.shape.dispose();
          // `false, false`, so each bead's shell goes with it and the palette's materials stand.
          bead.mesh.dispose(false, false);
        }
        beads.length = 0;
      },
    });
  },
});
