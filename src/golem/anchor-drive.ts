import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import {
  PhysicsConstraintAxis,
  PhysicsConstraintAxisLimitMode,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { spherePart, type Part } from "../rig.ts";
import { ANCHOR_DRIVE } from "./config.ts";

const LINEAR = [
  PhysicsConstraintAxis.LINEAR_X,
  PhysicsConstraintAxis.LINEAR_Y,
  PhysicsConstraintAxis.LINEAR_Z,
] as const;

const ANGULAR = [
  PhysicsConstraintAxis.ANGULAR_X,
  PhysicsConstraintAxis.ANGULAR_Y,
  PhysicsConstraintAxis.ANGULAR_Z,
] as const;

/**
 * Step one number toward another, at most `rate` per second.
 *
 * The rate limit, as a scalar, so that a hinge's commanded angle and an anchor's commanded
 * point obey the same rule from the same line of code. Frozen rule 4 says targets are
 * rate-limited; this is what that sentence is, and stating it once is what keeps the pitch
 * chain's limiter from drifting away from the anchor's.
 *
 * A hard clamp rather than an exponential filter, deliberately. `1 - exp(-k*dt)` is what
 * `arm.ts` uses for reach and wrist bend and it is the right shape for a *response*: it never
 * arrives and it moves fastest when the error is largest. A rate limit is the other thing --
 * a ceiling on speed that is the same whether the command moved a millimetre or a metre --
 * and it is the ceiling that makes a flicked cursor read as a sweep instead of a snap.
 */
export function slewTowards(current: number, wanted: number, rate: number, dt: number): number {
  const step = rate * dt;
  if (wanted > current) return Math.min(wanted, current + step);
  return Math.max(wanted, current - step);
}

/** Which axes an anchor drives, and how hard. */
export interface AnchorDriveParameters {
  /** Which of the three linear axes are motorised. Empty means the anchor holds no position. */
  readonly linear: readonly PhysicsConstraintAxis[];
  /** Which of the three angular axes are motorised. */
  readonly angular: readonly PhysicsConstraintAxis[];
  /** Force ceiling on each driven linear axis, newtons. */
  readonly linearForce: number;
  /** Force ceiling on each driven angular axis, newton-metres. */
  readonly angularForce: number;
  /**
   * Ceiling on how fast the commanded point may move, metres per second.
   *
   * On the **point**, and not on each of its coordinates. Until 2026-09-05 this was applied
   * componentwise -- `slewTowards` on x, then y, then z -- which is a box and not a ball: a
   * diagonal move ran at up to sqrt(3) times this, and rung 2's bench read 8.39 m/s of hand
   * speed against a 5 m/s ceiling. Worse than the factor is what it was a factor of. The three
   * components are **world** axes, so the ceiling depended on which way the golem happened to be
   * facing: a golem turned 45 degrees got a measurably faster arm than the same golem facing
   * down an axis, for the same command. A limb's speed limit is a fact about the limb.
   */
  readonly linearRate: number;
  /** Ceiling on how fast the commanded frame may turn, radians per second. */
  readonly angularRate: number;
}

export const DEFAULT_ANCHOR_AXES: AnchorDriveParameters = Object.freeze({
  linear: LINEAR,
  angular: ANGULAR,
  linearForce: ANCHOR_DRIVE.linearForce,
  angularForce: ANCHOR_DRIVE.angularForce,
  linearRate: ANCHOR_DRIVE.linearRate,
  angularRate: ANCHOR_DRIVE.angularRate,
});

export interface AnchorDriveOptions {
  /** Name prefix for the anchor's own body, so two of them can be told apart. */
  readonly name: string;
  /** The body this anchor drags. */
  readonly target: Part;
  /** Physical reaction body for a position-only drive; omitted for a world-space anchor. */
  readonly reference?: Part;
  /** Where the reference receives the reaction force, in its own local frame. */
  readonly referencePivot?: Vector3;
  /** Where the anchor starts, in world space. */
  readonly position: Vector3;
  /**
   * The frame the anchor starts in.
   *
   * The target's own build frame, not the golem's: the constraint pins the two together and a
   * pair that starts a quarter turn apart starts with a violation the solver clears by
   * flinging the thing. `arm.ts`'s hand anchor carries the same comment and the same reason.
   */
  readonly rotation: Quaternion;
  /**
   * Which point *of the target* the anchor pins, in the target's own local frame.
   *
   * Defaults to the body's own origin, which is what `Arm`'s hand anchor does and what every
   * six-axis pin wants. A position-only anchor on the end of a limb wants the **end**: pinning
   * a forearm's centre and then asking where its far end went makes the commanded point a
   * function of the pose it is trying to command, which is a circle. Pinning the far end
   * directly makes the anchor's position the hand target and nothing else.
   *
   * `options.position` must be where this point is in world space at construction, or the
   * constraint starts with a violation -- the same rule as a weld whose two frames disagree,
   * and with the same remedy.
   */
  readonly pivot?: Vector3;
  readonly parameters: AnchorDriveParameters;
}

/**
 * A rate-limited, force-capped position drive with a world-space target marker.
 *
 * Articulated arms supply a physical reference body: linear motor targets are offsets in
 * that body's frame, so Havok solves the arm force and its reaction in the same step.
 * The marker stays massless, collision-free and unconnected to the driven body.
 *
 * Without a reference, the marker itself is the keyframed reaction body. That standalone
 * mode also supports angular motors. In either mode every constraint axis is free unless
 * motorised, and the finite force ceiling preserves lag and follow-through under load.
 * The commanded world point keeps the same vector rate limit in both modes.
 */
export class AnchorDrive {
  readonly anchor: Part;
  readonly constraint: Physics6DoFConstraint;

  private readonly parameters: AnchorDriveParameters;
  private readonly target: Part;
  private readonly reference: Part | undefined;
  private readonly referencePivot: Vector3;
  private readonly referenceFrame = Quaternion.Identity();
  private readonly inverseReferenceFrame = Quaternion.Identity();
  /** Which point of the target is pinned, in the target's own local frame. */
  private readonly pivot: Vector3;
  /** The rate-limited command: where the anchor is actually being sent this step. */
  private readonly commanded = new Vector3();
  private readonly commandedRotation = new Quaternion();
  /**
   * What is being spent right now, which a stroke moves and `parameters` does not.
   *
   * Two numbers rather than a mutable copy of the whole parameter block, because these are
   * exactly the two a stroke touches and a block that could be edited wholesale mid-run would
   * make "which axes does this anchor drive" a question with a time-dependent answer.
   */
  private linearForceNow: number;
  private linearRateNow: number;
  private readonly scratch = {
    stray: new Vector3(),
    pinned: new Vector3(),
    step: new Quaternion(),
    toTarget: new Vector3(),
    localTarget: new Vector3(),
    inverseReference: new Quaternion(),
  };
  private released = false;

  constructor(scene: Scene, options: AnchorDriveOptions) {
    if (options.reference && options.parameters.angular.length > 0) {
      throw new Error("A reference-body anchor supports position motors only; the wrist owns orientation.");
    }
    this.parameters = options.parameters;
    this.target = options.target;
    this.reference = options.reference;
    this.referencePivot = options.referencePivot?.clone() ?? Vector3.Zero();
    this.pivot = (options.pivot ?? Vector3.Zero()).clone();
    this.linearForceNow = options.parameters.linearForce;
    this.linearRateNow = options.parameters.linearRate;
    this.commanded.copyFrom(options.position);
    this.commandedRotation.copyFrom(options.rotation);
    if (this.reference) {
      (this.reference.mesh.rotationQuaternion ?? Quaternion.Identity())
        .conjugateToRef(this.scratch.inverseReference);
      this.scratch.inverseReference.multiplyToRef(options.rotation, this.referenceFrame);
      this.referenceFrame.conjugateToRef(this.inverseReferenceFrame);
    }

    this.anchor = spherePart(scene, {
      name: `${options.name}.anchor`,
      position: options.position,
      rotation: options.rotation,
      diameter: ANCHOR_DRIVE.markerDiameter,
      mass: 0,
      layer: 0,
      collidesWith: 0,
      motionType: PhysicsMotionType.ANIMATED,
      visible: false,
    });

    this.constraint = new Physics6DoFConstraint(
      {
        pivotA: this.referencePivot,
        pivotB: (options.pivot ?? Vector3.Zero()).clone(),
        axisA: new Vector3(1, 0, 0).applyRotationQuaternion(this.referenceFrame),
        axisB: new Vector3(1, 0, 0),
        perpAxisA: new Vector3(0, 1, 0).applyRotationQuaternion(this.referenceFrame),
        perpAxisB: new Vector3(0, 1, 0),
        collision: false,
      },
      [],
      scene,
    );
    // Solve the arm's force and the torso's reaction together. A world anchor whose target
    // follows the live torso instead feeds the torso's solver motion back through an
    // infinitely heavy body one substep later, sustaining violent oscillation at rest.
    // The unconnected anchor remains a world-space diagnostic marker in reference mode.
    (this.reference ?? this.anchor).body.addConstraint(this.target.body, this.constraint);

    for (const axis of [...LINEAR, ...ANGULAR]) {
      this.constraint.setAxisMode(axis, PhysicsConstraintAxisLimitMode.FREE);
    }
    for (const axis of [...this.parameters.linear, ...this.parameters.angular]) {
      this.constraint.setAxisMotorType(axis, PhysicsConstraintMotorType.POSITION);
      this.constraint.setAxisMotorTarget(axis, 0);
    }
    this.applyTuning();
    this.updateReferenceTarget();
  }

  private updateReferenceTarget(): void {
    if (!this.reference) return;
    const mount = this.reference.mesh;
    (mount.rotationQuaternion ?? Quaternion.Identity()).conjugateToRef(this.scratch.inverseReference);
    this.commanded.subtractToRef(mount.position, this.scratch.toTarget);
    this.scratch.toTarget.rotateByQuaternionToRef(this.scratch.inverseReference, this.scratch.localTarget);
    this.scratch.localTarget.subtractInPlace(this.referencePivot);
    // Preserve the original anchor's motor axes (and therefore its per-axis force budget),
    // expressed in the physical reference instead of replacing them with the torso's axes.
    this.scratch.localTarget.rotateByQuaternionToRef(this.inverseReferenceFrame, this.scratch.localTarget);
    const local = this.scratch.localTarget;
    for (const axis of this.parameters.linear) {
      this.constraint.setAxisMotorTarget(axis,
        axis === PhysicsConstraintAxis.LINEAR_X ? local.x :
          axis === PhysicsConstraintAxis.LINEAR_Y ? local.y : local.z);
    }
  }

  /**
   * Push the current parameters into the solver objects.
   *
   * Separate from the constructor for the reason `Arm.applyTuning` is: motor ceilings are set
   * on native solver objects at construction, so a number changed from the console does not
   * reach them until something calls this. Guarded on `released`, because writing into a freed
   * constraint is the way this takes the page down.
   */
  applyTuning(): void {
    if (this.released) return;
    for (const axis of this.parameters.linear) {
      this.constraint.setAxisMotorMaxForce(axis, this.linearForceNow);
    }
    for (const axis of this.parameters.angular) {
      this.constraint.setAxisMotorMaxForce(axis, this.parameters.angularForce);
    }
  }

  /**
   * Move the linear force ceiling, mid-stroke.
   *
   * **This is what a velocity event is made of on an anchor-driven chain.** Rung 1 switches its
   * hinge motor to VELOCITY mode and drops the torque so the limb coasts through on its own
   * momentum; an anchor has no velocity mode, so its follow-through is the same thing said the
   * other way round -- the command holds and the *ceiling* drops, and the limb decelerates
   * against gravity rather than against the motor. A pose sequence has no equivalent, which is
   * the whole distinction.
   *
   * Not a second copy of the parameter: `parameters.linearForce` stays the chain's tuned setting,
   * which is what a sweep moves and what `config.ts` carries the table for, and this is what is
   * being spent right now.
   */
  setLinearForce(newtons: number): void {
    this.linearForceNow = newtons;
    this.applyTuning();
  }

  /** The ceiling on how fast the commanded point may move, moved for the length of a stroke. */
  setLinearRate(metresPerSecond: number): void {
    this.linearRateNow = metresPerSecond;
  }

  /**
   * Where the anchor is being sent, **after** the rate limit, into a ref this drive owns.
   *
   * The number a readout wants when it asks what the command is: the mapping's answer is where
   * the cursor points and this is what the solver was actually given, and on a chain whose whole
   * character is that its command is rate-limited those two are different for most of every move.
   * Publishing the mapping's would report a step the limb never had to follow.
   */
  commandedPoint(): Vector3 {
    return this.commanded;
  }

  /**
   * Send the anchor toward a point and a frame, at no more than the rate limit.
   *
   * Call once per physics substep, from `scene.onBeforePhysicsObservable`. Driving this from
   * the render loop refreshes the target on one substep in four and the driven thing coasts
   * through the rest -- measured on the Warrior at close to four metres of wander.
   */
  drive(dt: number, target: Vector3, rotation: Quaternion): void {
    if (this.released) return;
    const p = this.parameters;

    // **The linear rate limit, on the point rather than on its coordinates.** Three scalar
    // slews would bound each world axis separately, which bounds the point inside a box: the
    // corner of that box is sqrt(3) times the edge, so a diagonal command moved half again as
    // fast as a straight one and, because the axes are the world's, the same command moved at
    // different speeds depending on which way the golem faced. See `linearRate` above.
    //
    // `slewTowards` still states the rule and this is the same rule in three dimensions: walk
    // toward the target along the straight line to it, at most `rate * dt` of the way, and stop
    // on it rather than past it.
    const rate = this.linearRateNow;
    const step = rate * dt;
    target.subtractToRef(this.commanded, this.scratch.toTarget);
    const distance = this.scratch.toTarget.length();
    if (distance <= step || distance < 1e-12) {
      this.commanded.copyFrom(target);
    } else {
      this.commanded.addInPlace(this.scratch.toTarget.scaleInPlace(step / distance));
    }

    // The angular rate limit, as a fraction of the way round: `Quaternion.Dot` gives the
    // cosine of half the angle between two unit quaternions, so this is the turn the command
    // is asking for and `Slerp` walks at most `angularRate * dt` of it. Sign-corrected first,
    // or a turn of 10 degrees expressed the long way round reads as 350.
    const dot = Quaternion.Dot(this.commandedRotation, rotation);
    const half = Math.acos(Math.min(1, Math.abs(dot)));
    const turn = 2 * half;
    const allowed = p.angularRate * dt;
    if (turn <= allowed || turn < 1e-9) {
      this.commandedRotation.copyFrom(rotation);
    } else {
      Quaternion.SlerpToRef(this.commandedRotation, rotation, allowed / turn, this.scratch.step);
      this.commandedRotation.copyFrom(this.scratch.step);
    }

    this.anchor.body.setTargetTransform(this.commanded, this.commandedRotation);
    this.updateReferenceTarget();
  }

  /**
   * Hold whatever the solver achieved, and stop commanding anything new.
   *
   * `Arm.stopFighting`'s half that a golem needs. Zeroing the velocities as well as the target
   * matters: a keyframed body carries the velocity its last `setTargetTransform` gave it, and
   * a bench paused with the command still moving would go on dragging the limb.
   */
  hold(): void {
    if (this.released) return;
    const achieved = this.anchor.mesh.rotationQuaternion ?? Quaternion.Identity();
    this.commanded.copyFrom(this.anchor.mesh.position);
    this.commandedRotation.copyFrom(achieved);
    this.anchor.body.setLinearVelocity(Vector3.Zero());
    this.anchor.body.setAngularVelocity(Vector3.Zero());
    this.anchor.body.setTargetTransform(this.commanded, this.commandedRotation);
    this.updateReferenceTarget();
  }

  /**
   * Where the pinned point of the target actually is, into a ref this drive owns.
   *
   * The pivot carried into the world through the target's own transform, so that a chain asking
   * "where did my hand get to" and this class asking "how far is it from its anchor" are one
   * piece of arithmetic rather than two that can disagree. `mesh.position` and
   * `mesh.rotationQuaternion` and nothing else: a world matrix stamps the render id as a side
   * effect of being read, and this is read on the control step.
   */
  pinned(): Vector3 {
    this.pivot.rotateByQuaternionToRef(
      this.target.mesh.rotationQuaternion ?? Quaternion.Identity(), this.scratch.pinned,
    );
    return this.scratch.pinned.addInPlace(this.target.mesh.position);
  }

  /**
   * How far the driven body is from its own anchor, metres.
   *
   * The reading `AGENTS.md` says to take first when a driven limb is not where it was pointed:
   * a limb that is not within a few millimetres of its own anchor is not posed wrongly, it is
   * stuck on something. Reads `mesh.position` on both sides and nothing else, so it stamps no
   * render id.
   */
  stray(): number {
    return this.scratch.stray
      .copyFrom(this.pinned())
      .subtractInPlace(this.anchor.mesh.position)
      .length();
  }

  /**
   * Let go of the driven body without disposing the anchor.
   *
   * A severed module must stop being dragged around the arena at full force, which for the
   * Warrior was the difference between a dismemberment and a haunting.
   */
  release(): void {
    if (this.released) return;
    this.released = true;
    this.constraint.dispose();
  }

  dispose(): void {
    this.release();
    this.anchor.mesh.dispose(false, false);
  }
}
