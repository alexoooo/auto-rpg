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
  /** Ceiling on how fast the commanded point may move, metres per second. */
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
  readonly parameters: AnchorDriveParameters;
}

/**
 * A massless keyframed frame that drags a body about, with a finite force budget.
 *
 * **A copy-and-cut of what `src/arm.ts` does** in its `handAnchor` construction, `driveAnchor`
 * and `applyTuning`, standing on its own so that a golem chain can have one without importing
 * `Arm`. It does not import `Arm`, and it must not: `Arm` is a Warrior's three-bone chain with
 * a weapon welded into a fist and a shield-clearance routine bolted to the side of it, and a
 * golem has none of those things.
 *
 * What was copied, and why each piece is load-bearing:
 *
 * - **Massless, `ANIMATED`, on no collision layer.** It exists only to be a frame the solver
 *   can pull the target toward. A body with mass here would be a second thing to simulate; a
 *   body on a layer would be a second thing to collide with.
 * - **Every axis FREE, the chosen ones motorised toward zero offset with a force ceiling.**
 *   These are ceilings, not stiffnesses. The lag, overshoot and follow-through that make a
 *   heavy thing read as heavy come from the ceiling being finite -- from the motor simply
 *   being unable to drag it instantly -- rather than from a tuned spring. That is frozen
 *   rule 4 and it is also the measured finding behind every number in `CONFIG.arm`.
 * - **`setTargetTransform` rather than writing the transform node.** It gives a keyframed body
 *   a real velocity, so the constraint sees motion instead of a jump and the driven thing
 *   trails properly when the command sweeps. Note this is exactly the call that does *nothing*
 *   against a DYNAMIC body -- see `arrow.ts` -- and everything against a keyframed one.
 *
 * What was deliberately **not** copied: `Arm.driveAnchor` also derives the commanded angular
 * velocity from consecutive bases, purely so that `dampGrip` can bleed off the difference
 * between how a sword is turning and how it was told to turn. That is a *weapon* damper on a
 * body a hand is holding; a golem terminal is welded, so there is no grip to damp and no
 * second body to damp it against. If a later chain wants it, it wants it with its own
 * measurement.
 *
 * What is new here and is not in `Arm`: the target is **rate-limited**. A Warrior's anchor is
 * teleported to wherever the cursor says, which is exactly why a Warrior arm keyframes onto
 * its commanded pose on the first control step and reads 77 m/s of tip speed while standing
 * still. See `ANCHOR_DRIVE.linearRate`.
 */
export class AnchorDrive {
  readonly anchor: Part;
  readonly constraint: Physics6DoFConstraint;

  private readonly parameters: AnchorDriveParameters;
  private readonly target: Part;
  /** The rate-limited command: where the anchor is actually being sent this step. */
  private readonly commanded = new Vector3();
  private readonly commandedRotation = new Quaternion();
  private readonly scratch = {
    stray: new Vector3(),
    step: new Quaternion(),
  };
  private released = false;

  constructor(scene: Scene, options: AnchorDriveOptions) {
    this.parameters = options.parameters;
    this.target = options.target;
    this.commanded.copyFrom(options.position);
    this.commandedRotation.copyFrom(options.rotation);

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
        pivotA: Vector3.Zero(),
        pivotB: Vector3.Zero(),
        axisA: new Vector3(1, 0, 0),
        axisB: new Vector3(1, 0, 0),
        perpAxisA: new Vector3(0, 1, 0),
        perpAxisB: new Vector3(0, 1, 0),
        collision: false,
      },
      [],
      scene,
    );
    this.anchor.body.addConstraint(this.target.body, this.constraint);

    for (const axis of [...LINEAR, ...ANGULAR]) {
      this.constraint.setAxisMode(axis, PhysicsConstraintAxisLimitMode.FREE);
    }
    for (const axis of [...this.parameters.linear, ...this.parameters.angular]) {
      this.constraint.setAxisMotorType(axis, PhysicsConstraintMotorType.POSITION);
      this.constraint.setAxisMotorTarget(axis, 0);
    }
    this.applyTuning();
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
      this.constraint.setAxisMotorMaxForce(axis, this.parameters.linearForce);
    }
    for (const axis of this.parameters.angular) {
      this.constraint.setAxisMotorMaxForce(axis, this.parameters.angularForce);
    }
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

    this.commanded.set(
      slewTowards(this.commanded.x, target.x, p.linearRate, dt),
      slewTowards(this.commanded.y, target.y, p.linearRate, dt),
      slewTowards(this.commanded.z, target.z, p.linearRate, dt),
    );

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
      .copyFrom(this.target.mesh.position)
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
