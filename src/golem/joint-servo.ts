import { PhysicsConstraintAxis, PhysicsConstraintMotorType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

import { CONFIG } from "../config.ts";

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
 * **Every drive in the tree was tuned at a 240 Hz control step, and three things in a servo are
 * counted in steps rather than in seconds.** At 240 all three below are exactly what the servo
 * always did; at any other step they hold what it did at 240 per second rather than per step.
 * The rate they are held to is `CONFIG.world.solverTuningHz`, the same "rate the tuning was done
 * at" Havok's ideal step is held to, so one number says it.
 *
 * - **The lead** (`servoLead`). `track` corrects towards the target this step is sent to, not the
 *   one it starts from. On a moving command that is a lead: the joint settles one step *ahead* of
 *   its command, which is v x dt. At 240 that is 1/240 s, and it is what every cover, stroke and
 *   parry was tuned against; at 120 it doubled to 1/120 s, the chain arrived early by twice as
 *   much and overshot a stop by more (wrist blade parry overshoot 145.8 -> 223.6 mm, paired
 *   +77.8 +- 3.8). So the correction is aimed that far along the step's motion and no further.
 * - **The gain** (`servoGain`). One step of `response` removes `response x dt` of the error, and
 *   one step of 1/120 s is not two of 1/240: the compounded decay of the 240 servo is
 *   `(1 - response / 240)^2` per 1/120 s, which a gain of 36.7/s gives where 40 gives more.
 * - **The command filter** runs at the tuning rate inside a longer step: see `stepToward` in
 *   `src/golem/effectors/chains/arm-core.ts`.
 *
 * Node golem bench, 200 perturbed trials per cell, paired 120 - 240 (the shipped servo at 240 is
 * the reference; stray against the point the servo is steering to, `anchorStray`):
 *
 * | measure                               | shipped servo at 120 | lead only     | lead, gain and filter |
 * |---------------------------------------|---------------------:|--------------:|----------------------:|
 * | wrist blade parry overshoot (mm)      |        +77.8 +- 3.8  | +16.3 +- 1.4  |          -2.9 +- 0.7  |
 * | plate parry overshoot (mm)            |        +16.4 +- 1.0  |  +3.7 +- 0.5  |          -0.0 +- 0.3  |
 * | skeletal blade parry overshoot (mm)   |        +26.0 +- 3.4  |  -3.1 +- 0.8  |          -7.7 +- 0.3  |
 * | wrist blade cut stray (mm)            |         +3.0 +- 0.7  |  -0.2 +- 0.3  |          -2.0 +- 0.2  |
 * | x2-weight mace cut stray (mm)         |        +13.9 +- 2.1  |  -0.9 +- 2.2  |          -3.0 +- 1.8  |
 * | fist / plate punch stray (mm)         | +10.7 / +9.0         | +3.1 / +4.5   |          +1.0 / +1.2  |
 * | whip stroke stray (mm)                |        +18.0 +- 0.2  |  +4.3 +- 0.6  |          +1.8 +- 0.3  |
 * | wrist blade cut peak tip (m/s)        |        +0.83 +- 0.07 | -0.31 +- 0.04 |         -0.60 +- 0.03 |
 * | whip scripted-lash peak (m/s)         |        +1.20 +- 0.45 | -0.18 +- 0.49 |         -0.79 +- 0.48 |
 *
 * The exact discretisation of branch `physics-rate-servo-tuning` (a gain of
 * `(1 - e^(-k dt)) / dt` and an exactly integrated filter) was measured beside these and is not
 * the form here: it changes the arm at 240 as well, and at 120 it is slower than 240 by -0.79
 * m/s of cut peak and -1.43 of lash. `docs/analysis/2026-09-25-release-120.md` has every row.
 */
const tuningStep = (): number => 1 / CONFIG.world.solverTuningHz;

/**
 * The fraction of this step's commanded motion a servo corrects towards: 1 at the tuning rate,
 * where it is the target itself, and `(1 / solverTuningHz) / dt` of the way from the previous
 * target at a longer step, so the lead is the tuning rate's step in seconds.
 */
export function servoLead(dt: number): number {
  if (!(dt > 0)) return 1;
  const steps = dt / tuningStep();
  return Math.abs(steps - 1) < 1e-9 ? 1 : Math.min(1, 1 / steps);
}

/**
 * The gain that removes, in one step of `dt`, the share of an error `response` removes over the
 * same time in steps of `1 / solverTuningHz`: `response` itself at the tuning rate.
 */
export function servoGain(response: number, dt: number): number {
  if (!(dt > 0)) return response;
  const step = tuningStep();
  const steps = dt / step;
  if (Math.abs(steps - 1) < 1e-9) return response;
  return (1 - Math.max(0, 1 - response * step) ** steps) / dt;
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
    // Aimed `servoLead` of the way along this step's motion, at the tuning rate's gain; at the
    // tuning rate that is `target` and `response` exactly. See `servoLead` above.
    const lead = servoLead(dt);
    const aim = lead === 1 ? target : this.previous + (target - this.previous) * lead;
    this.actuator.drive(velocity + servoGain(this.response, dt) * (aim - this.measure()), maxForce);
    this.previous = target;
  }

  /** Synchronize after a different controller owned the actuator, without a derivative kick. */
  seed(target: number): void { this.previous = target; }
}
