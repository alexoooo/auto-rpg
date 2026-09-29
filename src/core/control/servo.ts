import type { MuscleDriver } from "../muscle/driver.ts";

/**
 * **The joint servo**: a freedom pulled toward a goal angle by its own muscles, as a critically
 * damped second-order motion,
 *
 *     acceleration = n^2 (goal - angle) - 2 n speed,   n = 1 / (time constant)
 *
 * taken one sub-step at a time. The motor is asked for the speed that acceleration reaches by the
 * end of the step, `speed + dt acceleration`, with the muscles' full ceiling (activation 1), so the
 * muscles bound it (`src/core/muscle/driver.ts`) and Havok's solver finds the torque.
 *
 * Two servos were measured and rejected (Node stand, the lab routine):
 * - **Asking for the goal's speed at once**, (goal - angle) / t. Where it braked hard it asked for
 *   a speed tens of rad/s away, and Havok's velocity motor rings about a target it has torque to
 *   spare for. At 120 Hz a Warrior's elbow, opening at 34 rad/s, reversed to 22 rad/s in one step
 *   and the fist read 12.2 m/s, against 6.4 at 480 Hz.
 * - **Asking for a torque**, the limb's inertia times the acceleration above, plus gravity's
 *   moment, on a saturated motor. It was steady on a chain of rods and chattered on the body at
 *   every step: an explicit torque is stable only against the lightest segment it acts on, and a
 *   light middle trunk between two driven trunk joints turned at up to 12 rad/s, reversing every
 *   step, while each joint sized its torque for the whole body above it.
 * A velocity motor is solved inside the constraint, so it is stable across light segments, and
 * holds a limb against gravity without being told its weight. Asked for a speed a step's
 * acceleration away, it has only that far to ring.
 */
export function servoToward(driver: MuscleDriver, i: number, goal: number, seconds: number, dt: number): void {
  const n = 1 / seconds, speed = driver.speed(i);
  driver.velocity[i] = speed + dt * (n * n * (goal - driver.angle(i)) - 2 * n * speed);
  driver.activation[i] = 1;
}
