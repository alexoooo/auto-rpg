import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

import { COLLIDES, LAYER } from "../../../physics.ts";
import { joint, spherePart } from "../../../rig.ts";
import { TERMINAL_FIST } from "../../config.ts";
import {
  defineTerminal,
  effectorSlot,
  weldRotation,
  type BuiltTerminal,
  type ChainWeld,
  type GolemPart,
  type ModuleBuild,
} from "../../module.ts";
import { ballShell } from "../shell.ts";
import { RigidStrike } from "../striker.ts";

/**
 * The fist: a stone knuckle on the end of whatever chain hands it a weld.
 *
 * **What it is for.** Rung 0's cap is a fist too -- 3.5 kg of capsule that registers a shove --
 * but a cap is bolted to the socket and the socket never moves, so the only speed it ever has
 * is the carrier's walk. This is the same idea put on a chain that can throw it: the chain owns
 * the punch, the way it owns the blade's cut, and the terminal owns a ball, a mass, a striker
 * and a shell. It has no control code, for the reason `blade.ts` gives.
 *
 * **Scored by what arrives.** The striker's kind is `empty`, the Warrior's own bare hand, and
 * the bite row for that kind is `blunt`: damage is `0.5 * mu * v^2` over `crushJoulesPerDamage`,
 * with `mu` the reduced mass of the ball and whatever it hits. A Warrior's punch publishes its
 * 0.65 kg hand and this one publishes `TERMINAL_FIST.mass`, 8 kg of stone -- so against a golem's
 * trunk core the same punch at the same speed is worth about twelve of the Warrior's, and against
 * a 9.4 kg limb about five, because a light limb gets out of the way of both. The row in
 * `docs/measurements.md` under Session 03 of the style set says what it measured against a blade
 * on the same chain.
 *
 * **One leaf.** `spherePart` builds a single `PhysicsShapeSphere`, so the layer masks go on the
 * shape itself and `sever` can rewrite them; a compound would take them on a container that
 * ignores them (`blade.ts` has the numbers). The collider is drawn by the shell rather than by
 * itself, because a six-segment sphere reads as a die and a stone ball does not.
 */
export const fistTerminal = defineTerminal({
  id: "fist",
  sockets: 1,
  bite: "mass",
  label: "fist",
  massKg: TERMINAL_FIST.mass,
  // One socket, one body, nothing taken away: a fist on the end of an arm reaches everywhere
  // the arm does, and its whole length is the ball's own diameter.
  limits: null,

  build(ctx: ModuleBuild, onto: ChainWeld): BuiltTerminal {
    const F = TERMINAL_FIST;
    const name = `${ctx.name}.fist`;

    const rotation = weldRotation(onto.mount, onto.rotation);
    // The ball's origin is its centre, so it is built one radius beyond the weld point along its
    // own +Y, which after the rotation above is `onto.mount.perp` carried into the world.
    const along = new Vector3();
    new Vector3(0, 1, 0).rotateByQuaternionToRef(rotation, along);
    const position = onto.world.add(along.scale(F.radius));

    const part = spherePart(ctx.scene, {
      name,
      position,
      rotation,
      diameter: F.radius * 2,
      mass: F.mass,
      layer: ctx.layers.strike,
      collidesWith: ctx.layers.strikeCollidesWith,
      visible: false,
    });

    let weld: Physics6DoFConstraint | null = joint(ctx.scene, onto.link, part, {
      pivotParent: onto.pivot,
      pivotChild: new Vector3(0, -F.radius, 0),
      axisParent: onto.mount.axis,
      axisChild: new Vector3(1, 0, 0),
      perpParent: onto.mount.perp,
      perpChild: new Vector3(0, 1, 0),
      // Every axis locked, through the one constraint type the whole rig uses.
      swing: {},
    });

    const striker = new RigidStrike(part, {
      kind: "empty",
      effectorId: `${name}.knuckle`,
      hand: effectorSlot(ctx.socket.slot),
      // The far face of the ball, along the limb: where a punch lands.
      tipAlong: F.radius,
      // The mass behind the blow is the ball's own. The arm behind the ball is not counted,
      // because a chain's links are the chain's and the scoring model is handed what the
      // terminal knows; the plate on the ram head does the same with its own number.
      impactMassKg: F.mass,
    });

    const parts: readonly GolemPart[] = Object.freeze([
      Object.freeze({
        id: name,
        part,
        // The collider hidden under a stone ball with a bronze band round the wrist; `along`,
        // because the band is a bracelet about the limb's own axis and not a bearing across it.
        shell: Object.freeze([
          part.mesh,
          ...ballShell(ctx.scene, {
            name, host: part.mesh, radius: F.radius, band: "along", materials: ctx.materials,
          }),
        ]),
        health: F.health,
        vitalityWeight: F.vitalityWeight,
        fatal: false,
      }),
    ]);

    return Object.freeze({
      parts,
      strikers: Object.freeze([striker]),
      // Weld to the far face: the whole diameter.
      tipOffset: F.radius * 2,
      gripStray: () => null,
      sever: () => {
        striker.sever();
        // On the leaf, which for a one-sphere terminal is the shape itself.
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
        // `false, false`, so the shell goes with its parent and the palette's materials stand.
        part.mesh.dispose(false, false);
      },
    });
  },
});
