import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

import type { HandCursor, HandIntent } from "../../../mind.ts";
import { capsulePart, joint } from "../../../rig.ts";
import { slewTowards } from "../../anchor-drive.ts";
import { CHAIN_REACH, CHAIN_WRIST } from "../../config.ts";
import { materialForGolemRole } from "../../materials.ts";
import {
  defineChain,
  rodInertia,
  type BuiltChain,
  type ChainCrossing,
  type ChainLimits,
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

/**
 * How many passes the aim solve takes, and why it is a small odd number rather than a tolerance.
 *
 * The correction moves the hand by up to a fifth of a metre and the forearm turns as it moves,
 * so one pass leaves a residual. Measured on the stroke bench, the residual falls by about a
 * tenth each pass, so three is already below the millimetre the readout can see -- and a fixed
 * count costs the same every frame, which a tolerance loop does not. A solve that cost a
 * different amount on different frames would show up as jitter in a rate-limited anchor.
 */
const AIM_PASSES = 3;

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
  // Unloaded: what a wrist under a blade weighs. Under a heavier terminal the ring and the link
  // are cast up to `CHAIN_WRIST.carryRatio` of it, and this figure does not follow them.
  massKg: CHAIN_REACH.collarMass + CHAIN_REACH.upperMass + CHAIN_REACH.foreMass
    + CHAIN_WRIST.ringMass + CHAIN_WRIST.wristMass,
  // The reach chain's two links, then the roll ring and the wrist link beyond the forearm. Like
  // `massKg` this is the **unloaded** figure and does not follow the casting-up that
  // `CHAIN_WRIST.carryRatio` does to the ring under a heavy terminal, which understates a mace's
  // cost on this rung by about a tenth. Stated rather than hidden; the bench prints the truth.
  swingInertia: rodInertia(CHAIN_REACH.upperMass, 0, CHAIN_REACH.upperLength)
    + rodInertia(CHAIN_REACH.foreMass, CHAIN_REACH.upperLength,
      CHAIN_REACH.upperLength + CHAIN_REACH.foreLength)
    + rodInertia(CHAIN_WRIST.ringMass, CHAIN_REACH.upperLength + CHAIN_REACH.foreLength,
      CHAIN_REACH.upperLength + CHAIN_REACH.foreLength + CHAIN_WRIST.ringLength)
    + rodInertia(CHAIN_WRIST.wristMass,
      CHAIN_REACH.upperLength + CHAIN_REACH.foreLength + CHAIN_WRIST.ringLength,
      CHAIN_REACH.upperLength + CHAIN_REACH.foreLength + CHAIN_WRIST.ringLength
        + CHAIN_WRIST.wristLength),

  build(
    ctx: ModuleBuild, limits: ChainLimits | null, crossing: ChainCrossing | null, carriedKg: number,
  ): BuiltChain {
    const R = CHAIN_REACH;
    const W = CHAIN_WRIST;
    // **Cast to the load.** The ring and the link weigh what the config says or
    // `carryRatio` of the terminal, whichever is more: the mass ratio across a locked hinge is
    // what the solver can or cannot hold, and the argument is beside `CHAIN_WRIST.carryRatio`.
    // A blade is under the floor and gets the config's figures unchanged.
    const ringMass = Math.max(W.ringMass, W.carryRatio * carriedKg);
    const wristMass = Math.max(W.wristMass, W.carryRatio * carriedKg);
    const core = buildArmCore(ctx, limits, crossing);
    // **A terminal may take the wrist away and may not give it more.** A mace is a rigid bar
    // between two arms, and a roll of the driven wrist swings the *other* arm's grip through an
    // arc the length of the bar -- so a two-socket terminal pins both of these at zero and the
    // overview's terminal table already says what that means: on a mace, `roll` means nothing.
    // Min against the chain's own number, so a narrowing cannot widen a stop.
    const rollLimit = limits?.rollMax === null || limits?.rollMax === undefined
      ? W.rollMax : Math.min(W.rollMax, Math.abs(limits.rollMax));
    const bendLimit = limits?.bendMax === null || limits?.bendMax === undefined
      ? W.bendMax : Math.min(W.bendMax, Math.abs(limits.bendMax));
    const outerReach = core.reachable.reachMax;
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
      mass: ringMass,
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
      mass: wristMass,
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
      // **The stop follows the narrowing, by the margin.** A terminal that pins the roll or the
      // bend has said the motor holds zero, and a stop left at the chain's own full range would
      // leave a 60 Nm motor alone against whatever the terminal weighs: a maul's 48 kg at 0.66 m
      // is 310 Nm, and the wrist under it bent to its full stop and hung the head at a right
      // angle. With the stop at the pinned limit plus the margin, the constraint carries the
      // load and the motor only tidies. The yaw hinge in `arm-core.ts` follows the same rule
      // outward for a crossing. 2026-09-06.
      swing: { x: { min: -rollLimit - W.jointMargin, max: rollLimit + W.jointMargin } },
      damping: W.motorDamping,
    });

    // The bend: a hinge about the ring's lateral, which the roll has already turned -- so a bend
    // flexes in whatever plane the roll chose, which is what a wrist is.
    let bendJoint: Physics6DoFConstraint | null = joint(ctx.scene, ring, link, {
      pivotParent: new Vector3(0, -W.ringLength / 2, 0),
      pivotChild: new Vector3(0, W.wristLength / 2, 0),
      swing: {
        x: BEND_SIGN < 0
          ? { min: BEND_SIGN * bendLimit - W.jointMargin, max: W.jointMargin }
          : { min: -W.jointMargin, max: BEND_SIGN * bendLimit + W.jointMargin },
      },
      damping: W.motorDamping,
    });
    rollJoint.setAxisMotorType(HINGE, PhysicsConstraintMotorType.POSITION);
    rollJoint.setAxisMotorTarget(HINGE, 0);
    rollJoint.setAxisMotorMaxForce(HINGE, W.rollTorque);
    bendJoint.setAxisMotorType(HINGE, PhysicsConstraintMotorType.POSITION);
    bendJoint.setAxisMotorTarget(HINGE, 0);
    bendJoint.setAxisMotorMaxForce(HINGE, W.bendTorque);

    const parts: readonly GolemPart[] = Object.freeze([
      ...core.parts,
      Object.freeze({
        id: ring.name,
        part: ring,
        shell: ballShell(ctx.scene, {
          name: ring.name, host: ring.mesh, radius: W.ringRadius,
          axleLength: W.ringLength,
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
        id: "roll", unit: "rad" as const, min: -rollLimit, max: rollLimit, rate: W.rollRate,
      }),
      Object.freeze({
        id: "bend", unit: "rad" as const, min: W.bendMin, max: bendLimit, rate: W.bendRate,
      }),
    ]);

    const span = outerReach + W.ringLength + W.wristLength;

    /**
     * The vector from the hand to the tip at a given hand point, roll and bend.
     *
     * The same geometry `commandedEnd` publishes, factored out so the readout and the *command*
     * cannot drift apart -- which is the point of this whole correction: until now one of them
     * was an exact model and the other was a straight line, and nothing compared them.
     *
     * The ring is collinear with the forearm, so a roll turns it about its own axis and moves
     * nothing; only what is past the bend hinge swings. `past` is a link length and not a pose,
     * which is why it is computed once against `outerReach`: the hand sits at full extension in
     * the frame `distanceFromSocket` was measured in.
     */
    const overhangAt = (hand: Vector3, roll: number, bend: number, past: number,
      into: Vector3): Vector3 => {
      core.basisAt(hand, aim.forearm, aim.lateral);
      // Rodrigues about the forearm's own +Y, which points **up** the limb -- so the lateral
      // turns toward `lateral x forearm`. The other order is a roll that points the edge the
      // wrong way on both sockets at once, which reads as a chain fault rather than a mirror one.
      Vector3.CrossToRef(aim.lateral, aim.forearm, aim.cross);
      aim.rolled
        .copyFrom(aim.lateral)
        .scaleInPlace(Math.cos(roll))
        .addInPlace(aim.cross.scaleInPlace(Math.sin(roll)));
      Vector3.CrossToRef(aim.rolled, aim.forearm, aim.cross);
      into
        .copyFrom(aim.forearm)
        .scaleInPlace(Math.cos(bend))
        .addInPlace(aim.cross.scaleInPlace(Math.sin(bend)))
        .scaleInPlace(past);
      return into.addInPlace(aim.forearm.scaleInPlace(W.ringLength));
    };

    /**
     * Aim the *tip* where the cursor asked, rather than the hand.
     *
     * **A bend moves where the blade lands, and nothing between the mind and the anchor knew.**
     * `reachForDistance` in `tactics.ts` models the overhang as radially collinear with
     * socket-to-mark, and `writeAim` never touches roll or bend; but this chain builds its bend
     * hinge about the ring's lateral, so at `cutBend` 0.14 of a 1.5708 stop with 0.94 m past the
     * hinge the tip sits about 0.2 m off the radial line -- and rolling sweeps that lever around
     * the forearm. The mind aims a straight arm and the physics delivers a bent one.
     *
     * That is also a violation of this file's own ownership rule. The header says the wrist's
     * two motors own **orientation** and the anchor owns **position**; a bend that moves the tip
     * is the wrist owning a piece of position, and the anchor has no way to know it happened.
     * Correcting it here is what makes the header true, which is why it belongs to the chain and
     * not to the mind: `wrist.ts:48-56` is the rule that the mind stays ignorant of the wrist.
     *
     * **Fed forward from the commanded pose, not corrected from the achieved one.** The roll and
     * the bend are known exactly -- they are this file's own slewed targets -- so the offset is
     * computed rather than measured and adds no lag and no loop. `commandWeldTo` just above is
     * the same pattern against the achieved transform, and says why that one is self-correcting.
     *
     * Solved rather than applied once, because the forearm turns with the hand: moving the hand
     * to make room for the bend changes the direction the bend is taken about. Three passes,
     * which is what the residual asked for -- the offset is a fifth of a metre and each pass
     * takes about a tenth of what is left.
     */
    const aimTipThrough = (asked: Vector3, out: Vector3): void => {
      out.copyFrom(asked);
      if (tipToSocket === null) return;
      if (commandedRoll === 0 && commandedBend === 0) return;
      const past = tipToSocket - outerReach - W.ringLength;
      if (past <= 0) return;
      const bend = BEND_SIGN * commandedBend;
      // Where a straight wrist would have put the tip: the pose the mind's reach model assumes,
      // and therefore the point it is actually asking for.
      aim.hand.copyFrom(asked);
      // **Along the forearm, not radially**, and that is the one choice in here that decides
      // whether this helps at all. Targeting the socket-to-mark ray is what `reachForDistance`
      // models, so it looks like the right line -- but the arm is built bent, the forearm and the
      // radial direction are not the same line, and a target on the radial ray therefore moves
      // the hand *even at zero bend*, by the blade's whole length times the gap between the two
      // directions. That is not a correction, it is a second error: measured, it took the miss to
      // 0.45 m and cut the speed at the mark from 20 m/s to 5. Along the forearm the correction
      // is exactly zero when the wrist is straight, which is the property a correction has to
      // have; the residual radial error is the mind's own model and is not this chain's to fix.
      core.basisAt(aim.hand, aim.forearm, aim.lateral);
      aim.target
        .copyFrom(aim.forearm)
        .scaleInPlace(W.ringLength + past)
        .addInPlace(aim.hand);
      for (let pass = 0; pass < AIM_PASSES; pass += 1) {
        overhangAt(aim.hand, commandedRoll, bend, past, aim.over);
        aim.hand.copyFrom(aim.target).subtractInPlace(aim.over);
      }
      out.copyFrom(aim.hand);
    };
    // Installed once. The stage answers `asked` unchanged until a terminal declares how far past
    // the ring its tip sits, so a chain with no terminal on it is untouched by having one.
    core.adjustPoint(aimTipThrough);
    const envelope: ModuleEnvelope = Object.freeze({
      axes: wristEnvelopeAxes,
      reach: span,
      strokes: ARM_STROKES,
      reachable: core.reachable,
      settledBand: R.settledBand,
    });

    const aim = {
      hand: new Vector3(),
      target: new Vector3(),
      over: new Vector3(),
      forearm: new Vector3(),
      lateral: new Vector3(),
      rolled: new Vector3(),
      cross: new Vector3(),
    };
    /** Set once by the module, because only the module knows how long the terminal is. */
    let tipToSocket: number | null = null;

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
      weldNow: new Vector3(),
      sendHand: new Vector3(),
    };
    // Hoisted, because these five readings run 240 times a second per effector and a fresh
    // `Vector3` per axis per step is exactly the per-view allocation `describeFighter` was
    // rewritten to stop making.
    const AXIS_X = Object.freeze(new Vector3(1, 0, 0));
    const AXIS_Y = Object.freeze(new Vector3(0, 1, 0));
    const AXIS_DOWN = Object.freeze(new Vector3(0, -1, 0));
    const AXIS_Z = Object.freeze(new Vector3(0, 0, 1));
    /** The weld point in the wrist link's own frame: its far end. Handed out as the weld's pivot
     *  and read live by `commandWeldTo`, so the two cannot disagree about where the weld is. */
    const WELD_PIVOT = Object.freeze(new Vector3(0, -W.wristLength / 2, 0));
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
        pivot: WELD_PIVOT.clone(),
        world: beyond(W.ringLength + W.wristLength),
        rotation: facing.clone(),
        mount: LIMB_MOUNT,
      }),
      ownTerminal: null,
      reach: span,

      command(next: HandIntent): void {
        if (severed) return;
        core.command(next);
        wantedRoll = clamp(next.roll * outboard, -rollLimit, rollLimit);
        wantedBend = clamp(next.wristBend, 0, 1) * bendLimit;
      },

      /**
       * The weld point is a wrist's length past the hand point, so the hand is sent to the
       * world point less that offset -- read **as it currently is**, from the wrist link's own
       * transform, rather than as the build pose. The offset turns with the roll and the bend,
       * and a fixed one would send the hand to where the weld would be if the wrist were
       * straight, which it is not for most of a stroke. Self-correcting rather than exact: the
       * offset is achieved and the target is commanded, and the two meet when the weld arrives.
       */
      commandWeldTo(world: Vector3): void {
        if (severed) return;
        rotate(WELD_PIVOT, link.mesh.rotationQuaternion, scratch.weldNow);
        scratch.weldNow.addInPlace(link.mesh.position);
        scratch.sendHand.copyFrom(world).subtractInPlace(scratch.weldNow).addInPlace(core.hand());
        core.commandPoint(scratch.sendHand);
      },

      aimThrough(distanceFromSocket: number): void { tipToSocket = distanceFromSocket; },

      /**
       * **Condition the weld: give the ring and the link an inertia in the load's league.**
       *
       * The mass cast above is the same idea one derivative early, and the measurement that
       * separates them is the fist. A fist and a blade weigh within four grams of each other
       * (1.296 kg and 1.300), hang off the same link by the same locked weld -- and the fist
       * reads 0.0 mm of unprovoked ring where the blade reads 66 to 108 mm. Mass explains
       * nothing there. Their inertias about the weld do: 3.2e-3 for the fist against 5.3e-2
       * for the blade, so the blade is 41 times the ring's own 1.3e-3 and the fist is 2.5.
       * A locked weld is a torque seam, and a torque seam is conditioned by inertia.
       *
       * Written on all three axes rather than the two across the blade. The roll axis is the
       * one a sword is thin about, so casting it costs the roll motor authority it did not
       * need -- and it is also the axis a hand genuinely resists, since a wrist does not spin
       * freely either. The measured table is beside `CHAIN_WRIST.gripInertiaRatio`.
       *
       * A floor, never a ceiling: `max` against the body's own tensor, so a light terminal
       * leaves the shipped link exactly as the capsule computed it.
       */
      castToCarried(inertiaKgM2: number): void {
        const want = W.gripInertiaRatio * inertiaKgM2;
        let lifted = 1;
        for (const part of [ring, link]) {
          const had = part.body.getMassProperties();
          const own = had.inertia;
          if (!own) continue;
          const cast = Math.max(own.x, own.y, own.z, want);
          if (cast <= own.x && cast <= own.y && cast <= own.z) continue;
          if (part === ring) lifted = cast / Math.max(own.x, own.y, own.z);
          part.body.setMassProperties({
            mass: had.mass,
            centerOfMass: had.centerOfMass,
            inertia: new Vector3(cast, cast, cast),
            inertiaOrientation: had.inertiaOrientation,
          });
        }
        // **And the motors that have to turn it, by the same factor, for the same reason.**
        // A torque ceiling is an authority *per inertia*: 60 N.m was picked against a ring of
        // 1.29e-3, and a ring cast to 2.67e-2 is the same motor twenty times too weak. Left
        // alone it shows up as the hinge missing its command -- the bend droops by 1.8 rad
        // during a stroke, and because the aim correction above feeds forward from the
        // *commanded* bend, the blade then lands where the correction put it and not where
        // the blade is. That is the whole of why the first cast bought stillness at the cost
        // of the aim: it was not a trade, it was a second constant left behind.
        //
        // Derived rather than swept, and the sweep beside `gripInertiaRatio` is what says it
        // may be: the measured knee is 16x and this law gives 20.7x, which is past it and on
        // the flat, where 16 / 32 / 64 read byte-identical. A terminal under the floor lifts
        // nothing and keeps the shipped ceiling exactly.
        //
        // **Only on a hinge that has somewhere to go**, which is the maul's correction. A
        // two-socket terminal pins `rollMax` and `bendMax` at zero, so both of its hinges are
        // holding a target they are already on -- and a motor with no range given twenty times
        // the authority is not a motor, it is a clamp. Two clamps at the ends of one rigid bar
        // fight, and the maul's ring went 417 mm to 733 mm on exactly that: the cast alone
        // helps it (448 -> 417) and the lift alone breaks it. The mace pins only its bend, so
        // its roll lifts and its bend does not, which is the same sentence read per axis.
        //
        // **And capped, because past `liftCeiling` the wrist out-runs the substep.** The
        // derivation says 20.7x for a blade and the solver cannot integrate that at 240 Hz: what
        // comes out is not a shaky blade but a bout decided by which body Havok visits second,
        // measured at 3 wins in 64 for the one built first. The table is beside the constant.
        const capped = Math.min(lifted, W.liftCeiling);
        if (capped <= 1) return;
        if (rollLimit > 0) rollJoint?.setAxisMotorMaxForce(HINGE, W.rollTorque * capped);
        if (bendLimit > 0) bendJoint?.setAxisMotorMaxForce(HINGE, W.bendTorque * capped);
      },
      step(dt: number): void {
        if (severed) return;
        // Rate-limited, like every other command in a golem: the ceiling is what makes a flicked
        // key a turn rather than a snap, and it is the same `slewTowards` the anchor and rung 1's
        // hinge both use so the three cannot drift apart.
        //
        // **Before the core steps, not after**, which is the whole of why this moved: the aim
        // correction below is a function of the roll and the bend, so a core stepped first would
        // spend the frame aiming through last frame's wrist.
        commandedRoll = slewTowards(commandedRoll, wantedRoll, W.rollRate, dt);
        commandedBend = slewTowards(commandedBend, wantedBend, W.bendRate, dt);
        core.step(dt);
        if (rollJoint) {
          rollJoint.setAxisMotorTarget(HINGE, commandedRoll);
        }
        if (bendJoint) {
          bendJoint.setAxisMotorTarget(HINGE, BEND_SIGN * commandedBend);
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
       * The core's two aiming axes, plus this rung's two orientation ones.
       *
       * Both inverses are the forward mappings in `command` read backwards, and both are
       * mirrored the way the forward one is: `roll` is multiplied by `outboard` going in, so it
       * is multiplied by `outboard` coming back out -- `outboard` is +-1, so the operation is its
       * own inverse. Getting that sign backwards does not look like a hand held wrong, it looks
       * like an arm coming apart, which is why it is spelled beside the mapping it inverts rather
       * than in the file doing the takeover.
       *
       * `bendLimit` can be zero -- a mace pins the bend -- so the division is guarded; a wrist
       * that cannot bend has one bend to command and any cursor commands it.
       */
      cursor: (): HandCursor => ({
        ...core.cursor(),
        roll: commandedRoll * outboard,
        wristBend: bendLimit > 0 ? clamp(commandedBend / bendLimit, 0, 1) : 0,
      }),

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
        const past = distanceFromSocket - outerReach - W.ringLength;
        return scratch.end
          .scaleInPlace(past)
          .addInPlace(forearm.scaleInPlace(W.ringLength))
          .addInPlace(core.commandedHand());
      },

      /**
       * Let go of the position drive and **keep the wrist motors on**.
       *
       * The one place a golem's `unmotorise` is not "turn everything off", and the reason is
       * a degree count rather than a preference: a trailing wrist left free adds two
       * unconstrained axes to a loop that three grip constraints already determine exactly, so
       * the last link would flop about inside a joint nothing was holding. The pair here owns
       * the link's *shape* and not its place, which is the half of the split rung 3's whole
       * design turns on -- and with a mace on the end both targets are pinned at zero anyway.
       */
      unmotorise(): void {
        core.unmotorise();
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
