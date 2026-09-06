import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

import { COLLIDES, LAYER } from "../../../physics.ts";
import { capsulePart, joint } from "../../../rig.ts";
import { TERMINAL_MAUL } from "../../config.ts";
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
 * The maul: one long bar, both hands on one grip, and the only terminal that claims both sockets.
 *
 * It reads no `HandIntent`, like every terminal. What makes it the hardest one on the shelf is
 * that **it is a closed kinematic loop with a motor at each end** -- two driven arms, one rigid
 * body -- and the argument for why that works when the two-grip mace did not is in
 * `effector.ts`'s header and beside `TERMINAL_MAUL`: two motors asked for different poses fight,
 * two motors asked for the same point add. The driven chain is commanded, the trailing chain is
 * sent to the driven chain's commanded weld every step, and this file's whole contribution to
 * control is to take the second grip once the second hand gets there.
 *
 * ## The grip is taken late, and that is a constraint's rule rather than a preference
 *
 * A constraint whose two frames disagree at construction is a violation the solver clears on
 * the first step by throwing whatever is lightest -- a bar at 48.3 m/s from a fighter standing
 * still, the last time a grip was built where a hand was not. The two chains are built mirrored
 * a socket-separation apart, so at construction the trailing hand is 0.68 m from the grip and a
 * joint built then would be born that far violated. So the bar is welded to the driven chain at
 * build, and `step` watches the trailing weld point close on the grip; on the first step it is
 * within `TERMINAL_MAUL.joinWithin` the ball joint is made, with its frames composed from where
 * the bar and the trailing link actually are on that step, so it is born satisfied to within the
 * join distance. Until then `gripStray` answers null -- a reading of the distance to a grip
 * nobody holds is not a stray -- and the bench records when it stops being null.
 *
 * A ball joint and not a weld, and the difference is a degree count: the trailing chain has
 * three axes and a point constraint spends exactly three, so the loop is determined, and the
 * driven chain's own roll and bend stay its own because a point constrains no orientation.
 *
 * ## Along the limb, like a blade, with the hands a third of the way up
 *
 * The bar runs out along the driven limb from the weld, which is the blade's frame unchanged,
 * and the weld is not at the butt: `TERMINAL_MAUL.gripFromButt` of haft stands *behind* the hands
 * as a counterweight and a thing to see. Local +Y runs butt to head, which is `RigidStrike`'s
 * base-to-point convention, so the striker's tip is the head and nothing needed a second frame.
 *
 * ## What it is worth when it arrives
 *
 * `club`, scored by `impulse` since this session with the bar's own 48 kg published: the same
 * speed the Warrior's club arrives at is worth fourteen of its blows. The mind's stroke for it is
 * the smash `STROKE_SHAPES.club` describes, and which of the two clubs a golem holds it learns
 * from `GolemCapabilities.pairedHands` rather than from this file's name.
 */
export const maulTerminal = defineTerminal({
  id: "maul",
  sockets: 2,
  bite: "mass",
  label: "maul",
  massKg: TERMINAL_MAUL.mass,
  limits: TERMINAL_MAUL.limits,
  crossing: TERMINAL_MAUL.crossing,

  build(ctx: ModuleBuild, onto: ChainWeld, trailing: ChainWeld | null): BuiltTerminal {
    const M = TERMINAL_MAUL;
    const name = `${ctx.name}.maul`;
    if (!trailing) {
      // `effector.ts` refuses this before it gets here; the second refusal is because a terminal
      // that silently built a one-handed bar when handed no second grip would be the "shield
      // that shipped as a club" failure with the sockets swapped.
      throw new Error(`${name}: a maul claims both effector sockets and was handed one weld`);
    }

    const half = M.length / 2;
    /** The grip, along the bar's own +Y from its centre: where the driven weld is and the
     *  trailing hand goes. */
    const gripAt = M.gripFromButt - half;
    const headAt = half - M.headDiameter / 2;

    // Built in the frame the weld demands, with the *grip* on the weld point rather than the
    // butt: the bar's centre is therefore `-gripAt` past the weld along its own +Y.
    const rotation = weldRotation(onto.mount, onto.rotation);
    const along = new Vector3();
    new Vector3(0, 1, 0).rotateByQuaternionToRef(rotation, along);
    const position = onto.world.add(along.scale(-gripAt));

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
      centerOfMass: new Vector3(0, M.balanceFraction * M.length - half, 0),
    });
    part.body.setLinearDamping(M.linearDamping);
    part.body.setAngularDamping(M.angularDamping);

    // --- the driven grip: a weld, at build --------------------------------------------------
    const gripLocal = new Vector3(0, gripAt, 0);
    let weld: Physics6DoFConstraint | null = joint(ctx.scene, onto.link, part, {
      pivotParent: onto.pivot,
      pivotChild: gripLocal,
      axisParent: onto.mount.axis,
      axisChild: new Vector3(1, 0, 0),
      perpParent: onto.mount.perp,
      perpChild: new Vector3(0, 1, 0),
      swing: {},
    });

    // --- the trailing grip: a ball joint, taken once the hand arrives --------------------------
    //
    // Everything below reads a world transform the only way anything in a golem does:
    // `mesh.position` and `mesh.rotationQuaternion`, because a world matrix stamps the render id
    // as a side effect of being read and this runs on the physics step. Allocated once.
    const scratch = {
      onBar: new Vector3(), onArm: new Vector3(),
      barX: new Vector3(), barY: new Vector3(), intoLink: new Quaternion(),
      gripAxis: new Vector3(), gripPerp: new Vector3(),
    };
    const identity = Quaternion.Identity();
    const gripWorld = (): Vector3 => {
      gripLocal.rotateByQuaternionToRef(part.mesh.rotationQuaternion ?? identity, scratch.onBar);
      return scratch.onBar.addInPlace(part.mesh.position);
    };
    const trailingWorld = (): Vector3 => {
      trailing.pivot.rotateByQuaternionToRef(
        trailing.link.mesh.rotationQuaternion ?? identity, scratch.onArm,
      );
      return scratch.onArm.addInPlace(trailing.link.mesh.position);
    };

    let grip: Physics6DoFConstraint | null = null;
    let severed = false;
    const takeGrip = (): void => {
      // Its two reference frames are built to agree **in world on this step**, which is the same
      // rule the weld obeys: the limits are measured from that reference, so a pair whose zero
      // was a quarter turn out would start against its own stop. The bar's axes are carried into
      // the *trailing link's* current frame for that reason.
      const barRotation = part.mesh.rotationQuaternion ?? identity;
      new Vector3(1, 0, 0).rotateByQuaternionToRef(barRotation, scratch.barX);
      new Vector3(0, 1, 0).rotateByQuaternionToRef(barRotation, scratch.barY);
      (trailing.link.mesh.rotationQuaternion ?? identity).conjugateToRef(scratch.intoLink);
      scratch.barX.rotateByQuaternionToRef(scratch.intoLink, scratch.gripAxis);
      scratch.barY.rotateByQuaternionToRef(scratch.intoLink, scratch.gripPerp);
      const cone = { min: -M.gripCone, max: M.gripCone };
      grip = joint(ctx.scene, trailing.link, part, {
        pivotParent: trailing.pivot,
        pivotChild: gripLocal,
        axisParent: scratch.gripAxis.clone(),
        axisChild: new Vector3(1, 0, 0),
        perpParent: scratch.gripPerp.clone(),
        perpChild: new Vector3(0, 1, 0),
        swing: { x: cone, y: cone, z: cone },
      });
    };

    const striker = new RigidStrike(part, {
      kind: "club",
      effectorId: `${name}.head`,
      hand: effectorSlot(ctx.socket.slot),
      tipAlong: half,
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
            // One collar, where both hands are.
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
      // From the driven weld -- the grip -- to the far side of the head, straight out along the
      // limb, which is an honest distance on this bar because the bar runs along the limb.
      tipOffset: M.length - M.gripFromButt,
      // Null until the grip is taken, then the constraint's own error: two points a joint is
      // holding together, and how far apart the solver let them get.
      gripStray: (): number | null => (grip ? Vector3.Distance(gripWorld(), trailingWorld()) : null),
      step: (): void => {
        if (severed || grip) return;
        if (Vector3.Distance(gripWorld(), trailingWorld()) <= M.joinWithin) takeGrip();
      },
      sever: () => {
        severed = true;
        striker.sever();
        // Both grips stay: severing a maul takes the bar and both arms off together, which is
        // what a two-socket module coming away actually is. On the leaf, which for a one-capsule
        // bar is the shape itself.
        part.shape.filterMembershipMask = LAYER.DEBRIS;
        part.shape.filterCollideMask = COLLIDES.DEBRIS;
      },
      dispose: () => {
        severed = true;
        striker.sever();
        // Both constraints, and before either link's body: `PhysicsBody.dispose` releases the
        // Havok body and walks straight past whatever is constraining it.
        grip?.dispose();
        grip = null;
        weld?.dispose();
        weld = null;
        part.body.dispose();
        part.shape.dispose();
        part.mesh.dispose(false, false);
      },
    });
  },
});
