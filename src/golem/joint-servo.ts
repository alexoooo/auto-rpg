import { PhysicsConstraintAxis, PhysicsConstraintMotorType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

// Awake whole-body sweep: 5/s settles slowly; 10/s removes error without residual ring;
// 20 and 40/s amplify small solver errors. Units are inverse seconds, not motor strength.
const POSITION_RESPONSE = 10;

/**
 * The fraction of its table's ceiling every actuator that shares this record may spend.
 *
 * One per golem, written by the golem and read by each actuator at every `drive`: a knocked-down
 * body whose locomotion says so goes limp above the legs by lowering this, and every ceiling a
 * caller passes -- a stroke's, a wrist's, a neck's -- is scaled on its way to the solver. A module
 * built outside a golem (a bench stand) is handed `FULL_TONE`.
 */
export interface MotorTone { readonly scale: number }

export const FULL_TONE: MotorTone = Object.freeze({ scale: 1 });

/** Physical output only. No callbacks or target generator: exactly one caller owns an axis. */
export class JointActuator {
  private readonly joint: Physics6DoFConstraint;
  private readonly axis: PhysicsConstraintAxis;
  private readonly tone: MotorTone;
  private force = -1;
  private enabled = false;
  private released = false;

  /** `tone` has no default, so a new actuator states which body's tone it follows. */
  constructor(joint: Physics6DoFConstraint, axis: PhysicsConstraintAxis, tone: MotorTone) {
    // A caller in plain JS is not type-checked, and without this the omission surfaces on the
    // first drive as a read of `scale` on undefined.
    if (typeof tone?.scale !== "number") {
      throw new Error("a joint actuator needs its body's MotorTone -- FULL_TONE for one with none");
    }
    this.joint = joint;
    this.axis = axis;
    this.tone = tone;
  }

  /** A continuous relative velocity, limited by actual motor effort, not a body velocity edit. */
  drive(velocity: number, maxForce: number): void {
    if (this.released) return;
    if (!Number.isFinite(velocity) || !Number.isFinite(maxForce) || maxForce < 0) {
      throw new Error("Joint actuator commands must be finite with nonnegative effort");
    }
    if (!this.enabled) {
      this.joint.setAxisMotorType(this.axis, PhysicsConstraintMotorType.VELOCITY);
      this.enabled = true;
    }
    const force = maxForce * this.tone.scale;
    if (force !== this.force) {
      this.joint.setAxisMotorMaxForce(this.axis, force);
      this.force = force;
    }
    this.joint.setAxisMotorTarget(this.axis, velocity);
  }

  /** Call before disposing the constraint. Later commands cannot re-arm a severed axis. */
  release(): void {
    if (this.released) return;
    this.joint.setAxisMotorMaxForce(this.axis, 0);
    this.released = true;
  }
}

/**
 * Replaceable position controller above a velocity actuator. Havok brakes relative velocity
 * inside the solver, including the equal reaction on the parent. Unlike a bare position motor,
 * the requested correction has an explicit time scale. There is no integral to wind up under
 * obstruction, and no world-space damping that fights a body carrying the joint through space.
 * A future policy can drive the actuator directly instead of calling track; neither runs itself.
 */
export class JointServo {
  readonly actuator: JointActuator;
  private readonly measure: () => number;
  private previous: number;
  private readonly response: number;

  constructor(actuator: JointActuator, measure: () => number, initialTarget = 0, response = POSITION_RESPONSE) {
    this.actuator = actuator;
    this.measure = measure;
    this.previous = initialTarget;
    this.response = response;
  }

  track(target: number, dt: number, maxForce: number): void {
    if (!Number.isFinite(target) || !Number.isFinite(dt) || dt < 0) {
      throw new Error("Joint servo targets and timesteps must be finite; timesteps cannot be negative");
    }
    const velocity = dt > 0 ? (target - this.previous) / dt : 0;
    this.actuator.drive(velocity + this.response * (target - this.measure()), maxForce);
    this.previous = target;
  }

  /** Synchronize after a different controller owned the actuator, without a derivative kick. */
  seed(target: number): void { this.previous = target; }
}
