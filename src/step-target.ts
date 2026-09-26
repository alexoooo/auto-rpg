// The step target's executor (skill ceiling session 06, the command surface): a ground point and
// a time to be there by, turned into the gait's forward and strafe fractions for one control step.
//
// **The actuator is the carrier**, as it is for `forward` and `strafe`: this does not place a foot,
// it asks the carrier for the velocity that arrives on time, inside the same ceilings a person's
// keys are inside (`VirtualLocomotionCarrier.propose`). So a step asked for faster than the body
// walks arrives late, and the timing is a target rather than an order.
//
// Pure and free of Babylon, like `src/scoring.ts`, so its arithmetic is argued with in
// `tests/step-target.test.mjs` and its behaviour in the solver on `research/step-bench.mjs`.
import type { StepCommand } from "./body-command.ts";

/** What the executor reads of the carrier: where it is, which way it faces, its ceilings. */
export interface StepCarrier {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export interface StepCeilings {
  readonly maxSpeedMps: number;
  readonly maxAccelerationMps2: number;
  readonly backSpeedMps?: number;
  readonly strafeSpeedMps?: number;
}

/**
 * The executor's two constants.
 *
 * - `arrivedM`: inside this the carrier is asked for nothing. At the stone biped's 2.4 m/s one
 *   120 Hz control step is 20 mm, and the approach below is slowing long before that.
 * - `brakeShare`: the share of the carrier's acceleration the executor plans to stop with,
 *   `speed <= sqrt(2 * share * a * distance)`, so the last stretch is a constant deceleration
 *   that ends on the point in a finite time. Below 1 because the carrier's acceleration also turns
 *   the velocity, not only shrinks it.
 *
 * The first version closed the last stretch at `distance / 0.25 s` instead, an exponential
 * approach, and arrived 0.14 to 0.34 s after `within` on every reachable cell of the step bench
 * (`research/step-bench.mjs`, Node locomotion bench): an exponential never gets anywhere, so the
 * arrival band was reached on its tail.
 *
 * With the brake, 2026-09-26 (Node locomotion bench, `research/step-bench.mjs`, 1 s settle then 3 s
 * with the point; 0.6 and 1.5 m at four bearings). `keys` is the naive mind the channel replaces:
 * the unit vector to the point on `forward` and `strafe` until it is inside 10 mm.
 *
 * | build            | dist m | within s | step arrives s | step overshoot / miss mm | keys arrives s | keys overshoot / miss mm |
 * |------------------|--------|----------|----------------|--------------------------|----------------|--------------------------|
 * | default          | 0.6    | 0.5      | 0.51           | 0 / 1                    | 0.36 to 0.41   | 144 to 503 / 7 to 49     |
 * | default          | 0.6    | 1.0      | 0.95           | 0 / 1                    | (as above)     |                          |
 * | default          | 1.5    | 0.5      | 0.77 to 0.93   | 0 / 0 to 1               | 0.63 to 0.88   | 147 to 527 / 15 to 49    |
 * | default          | 1.5    | 1.0      | 1.02           | 0 / 1                    | (as above)     |                          |
 * | skeleton-warrior | all    |          | as default     | 0 / 0 to 1               | as default     | 144 to 527 / 7 to 49     |
 * | wheel            | 0.6    | 0.5, 1.0 | 0.48, 0.95     | 0 / 0                    | 0.29 to 0.36   | 81 to 307 / 12 to 34     |
 * | wheel            | 1.5    | 0.5, 1.0 | 0.64 to 0.85, 0.99 | 0 / 0                | 0.56 to 0.84   | 68 to 313 / 21 to 35     |
 * | multileg         | 0.6    | 0.5      | 0.56 to 0.78   | 0 / 1                    | 0.51 to 0.77   | 0 to 100 / 0 to 42       |
 * | multileg         | 1.5    | either   | 1.19 to 1.90   | 0 / 1                    | 1.15 to 1.90   | 0 to 98 / 0 to 49        |
 *
 * A step inside the carrier's ceilings arrives within 0.05 s of its time; one outside them (1.5 m in
 * 0.5 s, or anything far on the multileg's 1.4 m/s) arrives as soon as the ceiling allows, a few
 * hundredths after the keys, and stops on the point where the keys overshoot it by up to half a
 * metre. Sole slip is lower on the step than on the keys in every cell but one (multileg, 1.5 m behind:
 * 455 against 453 mm/s). No cell fell.
 */
export const STEP_TARGET = Object.freeze({ arrivedM: 0.01, brakeShare: 0.8 });

/**
 * The gait fractions that carry the body toward `step`, with `remainingS` left to get there.
 * Writes `out.forward` and `out.strafe` and returns the distance left, metres.
 *
 * **Each local axis is divided by its own ceiling, then the pair is scaled as one**, so the
 * velocity the carrier makes of it points exactly at the target. The carrier scales ahead, back and
 * sideways by different ceilings (the ellipse in AGENTS.md), and a planner that hands it a
 * direction as a unit vector gets a direction a few degrees off, which on a wall is a move into it.
 */
export function stepTravel(step: StepCommand, remainingS: number, carrier: StepCarrier, ceilings: StepCeilings,
  out: { forward: number; strafe: number }): number {
  const dx = step.x - carrier.x, dz = step.z - carrier.z;
  const distance = Math.hypot(dx, dz);
  if (!(distance > STEP_TARGET.arrivedM)) {
    out.forward = 0; out.strafe = 0;
    return Number.isFinite(distance) ? distance : 0;
  }
  // On time, the speed that covers what is left in what is left; late, as fast as it can still stop.
  const onTime = Number.isFinite(remainingS) && remainingS > 0 ? distance / remainingS : Number.POSITIVE_INFINITY;
  const speed = Math.min(onTime, Math.sqrt(2 * STEP_TARGET.brakeShare * ceilings.maxAccelerationMps2 * distance));
  const vx = (dx / distance) * speed, vz = (dz / distance) * speed;
  // World to the body's frame: ahead is (sin yaw, cos yaw), right is (cos yaw, -sin yaw).
  const sin = Math.sin(carrier.yaw), cos = Math.cos(carrier.yaw);
  const ahead = vx * sin + vz * cos;
  const right = vx * cos - vz * sin;
  let forward = ahead / (ahead >= 0 ? ceilings.maxSpeedMps : (ceilings.backSpeedMps ?? ceilings.maxSpeedMps));
  let strafe = right / (ceilings.strafeSpeedMps ?? ceilings.maxSpeedMps);
  const size = Math.hypot(forward, strafe);
  if (size > 1) { forward /= size; strafe /= size; }
  out.forward = forward; out.strafe = strafe;
  return distance;
}
