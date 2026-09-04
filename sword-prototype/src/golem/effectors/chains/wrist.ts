import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

import type { HandIntent } from "../../../mind.ts";
import { capsulePart, joint } from "../../../rig.ts";
import { slewTowards } from "../../anchor-drive.ts";
import { CHAIN_REACH, CHAIN_WRIST } from "../../config.ts";
import { materialForGolemRole } from "../../materials.ts";
import {
  defineChain,
  type BuiltChain,
  type EffectorAxisView,
  type GolemPart,
  type ModuleAxisEnvelope,
  type ModuleBuild,
  type ModuleEnvelope,
} from "../../module.ts";
import { ballShell, boneShell } from "../shell.ts";
import { ARM_STROKES, LIMB_MOUNT, buildArmCore } from "./arm-core.ts";

const HINGE = PhysicsConstraintAxis.ANGULAR_X;

/**
 * Which way a positive `wristBend` flexes the terminal.
 *
 * The bend hinge turns about the roll ring's own +X, and a positive turn about +X carries the
 * link's -Y toward -Z, which at the build pose is *backwards*. A wrist that curls the blade away
 * from where the limb is pointing is a wrist held the wrong way round, so the joint target is the
 * negative of the flexion and this is that, as one named number rather than a minus sign in the
 * middle of an expression. 2026-09-04.
 */
const BEND_SIGN = -1;

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

/**
 * Rung 3, `wrist`: rung 2 plus roll and bend, with orientation owned by two motors and nothing
 * else.
 *
 * **Ownership is split by axis, not doubled, and that sentence is the whole design.** The
 * shoulder and elbow stay on the position-only anchor from `arm-core.ts`; the wrist's two angular
 * motors are the only owners of orientation; and there is no six-axis hand pin anywhere in a
 * golem. The Warrior's wrist was left angularly *free* precisely because its grip motor already
 * owned orientation and the two fought -- and when a roll sign was wrong the shoulder cone
 * refused the twist and the solver paid for the orientation out of the position: 504 mm of
 * hand-to-anchor stray, which does not look like a hand held wrong, it looks like an arm coming
 * apart. Here the anchor drives three linear axes and no angular ones, and the wrist drives two
 * angular axes and no linear ones, so there is no axis for the two to disagree about.
 *
 * Five driven axes against a five-number command -- a point, a roll and a bend -- so frozen rule
 * 2 still holds and every reachable target still has exactly one pose.
 *
 * **Two hinges in series rather than one two-axis wrist**, for the reason `arm-core.ts` gives
 * about the shoulder plus one of its own: a `Physics6DoFConstraint` with two free angular axes
 * decomposes the relative rotation in an order this directory has never established, and a
 * decomposition that is gimbal-locked somewhere in the working range would be a wrist that stops
 * answering at one particular roll. A hinge cannot be.
 *
 * **What `roll` means is the terminal's business; this chain only turns the last link.** With the
 * blade on, +X is the edge and the roll ring is what points it -- so the edge alignment that
 * `src/scoring.ts` multiplies by speed becomes controllable for the first time on the ladder, and
 * the bench readout prints it. At roll 0 the edge is exactly where rung 2 leaves it, because both
 * chains weld through the same `LIMB_MOUNT`.
 */
export const wristChain = defineChain({
  id: "wrist",
  axes: 5,
  label: "wrist - reach plus roll and bend",
  massKg: CHAIN_REACH.collarMass + CHAIN_REACH.upperMass + CHAIN_REACH.foreMass
    + CHAIN_WRIST.ringMass + CHAIN_WRIST.wristMass,

  build(ctx: ModuleBuild): BuiltChain {
    const R = CHAIN_REACH;
    const W = CHAIN_WRIST;
    const core = buildArmCore(ctx);
    const outboard = ctx.socket.outboard;
    // The **forearm's** build frame, which is not the golem's: the core builds its arm bent, and
    // both wrist links are built at joint angle zero against the link they hang from.
    const facing = core.buildRotation;
    const stone = materialForGolemRole(ctx.materials, "shell");

    // Built continuing straight out along the forearm, in the forearm's own frame -- **not the
    // golem's**, because the core builds its arm with the elbow already bent and a link built in
    // the socket's frame would sit a radian and a half out of its own joint. A joint whose two
    // frames disagree at construction is a violation the solver clears by throwing the limb, so
    // both of these are built at joint angle exactly zero.
    const along = core.buildDirection;
    const beyond = (out: number): Vector3 => core.handWorld.add(along.scale(out));

    const ring = capsulePart(ctx.scene, {
      name: `${ctx.name}.rollRing`,
      position: beyond(W.ringLength / 2),
      rotation: facing,
      height: W.ringLength,
      radius: W.ringRadius,
      mass: W.ringMass,
      layer: ctx.layers.body,
      collidesWith: ctx.layers.bodyCollidesWith,
      material: stone,
      visible: false,
    });
    const link = capsulePart(ctx.scene, {
      name: `${ctx.name}.wrist`,
      position: beyond(W.ringLength + W.wristLength / 2),
      rotation: facing,
      height: W.wristLength,
      radius: W.wristRadius,
      mass: W.wristMass,
      layer: ctx.layers.body,
      collidesWith: ctx.layers.bodyCollidesWith,
      material: stone,
      visible: false,
    });
    for (const part of [ring, link]) {
      part.body.setLinearDamping(W.linearDamping);
      part.body.setAngularDamping(W.angularDamping);
    }

    // The roll: a hinge about the forearm's **own long axis**, handed to `joint` as `axisParent`
    // so that this constraint's ANGULAR_X is the roll and every other axis is locked.
    let rollJoint: Physics6DoFConstraint | null = joint(ctx.scene, core.fore, ring, {
      pivotParent: core.handPivot,
      pivotChild: new Vector3(0, W.ringLength / 2, 0),
      axisParent: new Vector3(0, 1, 0),
      axisChild: new Vector3(0, 1, 0),
      perpParent: new Vector3(0, 0, 1),
      perpChild: new Vector3(0, 0, 1),
      swing: { x: { min: W.rollMin - W.jointMargin, max: W.rollMax + W.jointMargin } },
      damping: W.motorDamping,
    });

    // The bend: a hinge about the ring's lateral, which the roll has already turned -- so a bend
    // flexes in whatever plane the roll chose, which is what a wrist is.
    let bendJoint: Physics6DoFConstraint | null = joint(ctx.scene, ring, link, {
      pivotParent: new Vector3(0, -W.ringLength / 2, 0),
      pivotChild: new Vector3(0, W.wristLength / 2, 0),
      swing: {
        x: BEND_SIGN < 0
          ? { min: BEND_SIGN * W.bendMax - W.jointMargin, max: W.jointMargin }
          : { min: -W.jointMargin, max: BEND_SIGN * W.bendMax + W.jointMargin },
      },
      damping: W.motorDamping,
    });
    rollJoint.setAxisMotorType(HINGE, PhysicsConstraintMotorType.POSITION);
    rollJoint.setAxisMotorTarget(HINGE, 0);
    bendJoint.setAxisMotorType(HINGE, PhysicsConstraintMotorType.POSITION);
    bendJoint.setAxisMotorTarget(HINGE, 0);

    const parts: readonly GolemPart[] = Object.freeze([
      ...core.parts,
      Object.freeze({
        id: ring.name,
        part: ring,
        shell: ballShell(ctx.scene, {
          name: ring.name, host: ring.mesh, radius: W.ringRadius,
          // Along the limb, because that is the axis this bearing turns about. A band drawn
          // across it would say the joint turns somewhere it does not.
          band: "along", materials: ctx.materials,
        }),
        health: W.ringHealth,
        vitalityWeight: W.ringVitalityWeight,
        fatal: false,
      }),
      Object.freeze({
        id: link.name,
        part: link,
        shell: boneShell(ctx.scene, {
          name: link.name, host: link.mesh, length: W.wristLength,
          radius: W.wristRadius, taper: 0.26, materials: ctx.materials,
        }),
        health: W.wristHealth,
        vitalityWeight: W.wristVitalityWeight,
        fatal: false,
      }),
    ]) as readonly GolemPart[];

    // --- the command ------------------------------------------------------------------------
    //
    // **Mirrored by axis, and only where the mirror is real.** A roll is a rotation about the
    // limb's own long axis, and the mirror image of a roll of `r` is a roll of `-r`, so the
    // socket's outboard sign multiplies it. A bend is a rotation about the arm plane's lateral,
    // which is a motion *inside* that plane, and the mirror of it is itself -- so the bend is not
    // mirrored, and multiplying it by the outboard sign would flex one wrist backwards.
    // `tests/golem-bench.test.mjs` drives one intent into both sockets and asserts the two tips
    // come out as mirror images, which is what pins both halves of that paragraph.
    let wantedRoll = 0;
    let wantedBend = 0;
    let commandedRoll = 0;
    let commandedBend = 0;
    let severed = false;

    const wristAxes = [
      { id: "roll", commanded: 0, achieved: 0 },
      { id: "bend", commanded: 0, achieved: 0 },
    ];
    const axes: readonly EffectorAxisView[] = Object.freeze([...core.axes, ...wristAxes]);

    const wristEnvelopeAxes: readonly ModuleAxisEnvelope[] = Object.freeze([
      ...core.envelopeAxes,
      Object.freeze({
        id: "roll", unit: "rad" as const, min: W.rollMin, max: W.rollMax, rate: W.rollRate,
      }),
      Object.freeze({
        id: "bend", unit: "rad" as const, min: W.bendMin, max: W.bendMax, rate: W.bendRate,
      }),
    ]);

    const span = R.reachMax + W.ringLength + W.wristLength;
    const envelope: ModuleEnvelope = Object.freeze({
      axes: wristEnvelopeAxes,
      reach: span,
      strokes: ARM_STROKES,
      reachable: core.reachable,
      settledBand: R.settledBand,
    });

    const scratch = {
      ringX: new Vector3(),
      ringY: new Vector3(),
      ringZ: new Vector3(),
      foreX: new Vector3(),
      foreZ: new Vector3(),
      wristDown: new Vector3(),
      rolled: new Vector3(),
      wristDir: new Vector3(),
      cross: new Vector3(),
      end: new Vector3(),
    };
    // Hoisted, because these five readings run 240 times a second per effector and a fresh
    // `Vector3` per axis per step is exactly the per-view allocation `describeFighter` was
    // rewritten to stop making.
    const AXIS_X = Object.freeze(new Vector3(1, 0, 0));
    const AXIS_Y = Object.freeze(new Vector3(0, 1, 0));
    const AXIS_DOWN = Object.freeze(new Vector3(0, -1, 0));
    const AXIS_Z = Object.freeze(new Vector3(0, 0, 1));
    const rotate = (local: Vector3, by: Quaternion | null, into: Vector3): Vector3 => {
      local.rotateByQuaternionToRef(by ?? Quaternion.Identity(), into);
      return into;
    };

    /**
     * The roll the ring actually achieved, radians.
     *
     * The ring's own +X expressed in the forearm's frame is `(cos r, 0, -sin r)` for a rotation
     * of `r` about the shared +Y, so two dot products and an `atan2` recover it with no
     * convention left to get backwards -- and both come out of `mesh.rotationQuaternion`, which
     * stamps no render id.
     */
    const achievedRoll = (): number => {
      rotate(AXIS_X, ring.mesh.rotationQuaternion, scratch.ringX);
      rotate(AXIS_X, core.fore.mesh.rotationQuaternion, scratch.foreX);
      rotate(AXIS_Z, core.fore.mesh.rotationQuaternion, scratch.foreZ);
      return Math.atan2(
        -Vector3.Dot(scratch.ringX, scratch.foreZ), Vector3.Dot(scratch.ringX, scratch.foreX),
      );
    };

    /** The bend the link achieved, as a joint angle about the ring's +X. Same construction. */
    const achievedBendJoint = (): number => {
      rotate(AXIS_DOWN, link.mesh.rotationQuaternion, scratch.wristDown);
      rotate(AXIS_Y, ring.mesh.rotationQuaternion, scratch.ringY);
      rotate(AXIS_Z, ring.mesh.rotationQuaternion, scratch.ringZ);
      return Math.atan2(
        -Vector3.Dot(scratch.wristDown, scratch.ringZ),
        -Vector3.Dot(scratch.wristDown, scratch.ringY),
      );
    };

    return Object.freeze({
      parts,

      weld: Object.freeze({
        link,
        pivot: new Vector3(0, -W.wristLength / 2, 0),
        world: beyond(W.ringLength + W.wristLength),
        rotation: facing.clone(),
        mount: LIMB_MOUNT,
      }),
      ownTerminal: null,
      reach: span,

      command(next: HandIntent): void {
        if (severed) return;
        core.command(next);
        wantedRoll = clamp(next.roll * outboard, W.rollMin, W.rollMax);
        wantedBend = clamp(next.wristBend, 0, 1) * W.bendMax;
      },

      step(dt: number): void {
        if (severed) return;
        core.step(dt);
        // Rate-limited, like every other command in a golem: the ceiling is what makes a flicked
        // key a turn rather than a snap, and it is the same `slewTowards` the anchor and rung 1's
        // hinge both use so the three cannot drift apart.
        commandedRoll = slewTowards(commandedRoll, wantedRoll, W.rollRate, dt);
        commandedBend = slewTowards(commandedBend, wantedBend, W.bendRate, dt);
        if (rollJoint) {
          rollJoint.setAxisMotorTarget(HINGE, commandedRoll);
          rollJoint.setAxisMotorMaxForce(HINGE, W.rollTorque);
        }
        if (bendJoint) {
          bendJoint.setAxisMotorTarget(HINGE, BEND_SIGN * commandedBend);
          bendJoint.setAxisMotorMaxForce(HINGE, W.bendTorque);
        }
        wristAxes[0].commanded = commandedRoll;
        wristAxes[0].achieved = achievedRoll();
        wristAxes[1].commanded = commandedBend;
        // Published as a flexion magnitude rather than as a joint angle, so the envelope's
        // `[0, bendMax]` and the readout's two columns are in the same units as the intent.
        wristAxes[1].achieved = BEND_SIGN * achievedBendJoint();
      },

      envelope: () => envelope,
      axes: () => axes,
      stroke: () => core.stroke(),
      anchor: () => core.anchorPoint(),
      anchorStray: () => core.anchorStray(),

      /**
       * Where the commanded tip is, through the wrist.
       *
       * The ring is collinear with the forearm -- a roll turns the link about its own axis and
       * moves nothing -- so the ring's length is carried along the commanded forearm, and only
       * what is past the bend hinge is carried along the bent direction. That bent direction is
       * Rodrigues about the **rolled** lateral: `w = f cos d + (k x f) sin d`, with `k` the arm
       * plane's lateral turned by the commanded roll about the forearm's own axis.
       */
      commandedEnd(distanceFromSocket: number): Vector3 {
        const forearm = scratch.wristDir.copyFrom(core.commandedForearm());
        // **The roll axis is the forearm's own +Y, which points *up* the limb** -- the negative
        // of the direction the limb points. Rodrigues about `-f` therefore turns the lateral
        // toward `lateral x f` and not toward `f x lateral`, and getting that cross product the
        // other way round is a roll that turns the edge the wrong way on both sockets at once,
        // which is the one failure that looks like a chain fault rather than a mirror fault.
        Vector3.CrossToRef(core.commandedLateral(), forearm, scratch.cross);
        scratch.rolled
          .copyFrom(core.commandedLateral())
          .scaleInPlace(Math.cos(commandedRoll))
          .addInPlace(scratch.cross.scaleInPlace(Math.sin(commandedRoll)));
        const bend = BEND_SIGN * commandedBend;
        Vector3.CrossToRef(scratch.rolled, forearm, scratch.cross);
        scratch.end
          .copyFrom(forearm)
          .scaleInPlace(Math.cos(bend))
          .addInPlace(scratch.cross.scaleInPlace(Math.sin(bend)));
        const past = distanceFromSocket - R.reachMax - W.ringLength;
        return scratch.end
          .scaleInPlace(past)
          .addInPlace(forearm.scaleInPlace(W.ringLength))
          .addInPlace(core.commandedHand());
      },

      sever(): void {
        if (severed) return;
        severed = true;
        core.sever();
        rollJoint?.dispose();
        rollJoint = null;
        bendJoint?.dispose();
        bendJoint = null;
      },

      dispose(): void {
        severed = true;
        rollJoint?.dispose();
        rollJoint = null;
        bendJoint?.dispose();
        bendJoint = null;
        for (const part of [link, ring]) {
          part.body.dispose();
          part.shape.dispose();
          part.mesh.dispose(false, false);
        }
        core.dispose();
      },
    });
  },
});
