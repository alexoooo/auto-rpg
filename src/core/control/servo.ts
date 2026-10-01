import type { MuscleDriver } from "../muscle/driver.ts";

/**
 * **The joint servo**: freedoms pulled toward goal angles by their own muscles, each as a
 * critically damped second-order motion of its angle,
 *
 *     angle'' = n^2 (goal - angle) - 2 n angle',   n = 1 / (time constant)
 *
 * taken one world step at a time, with the torques the body's dynamics say that motion takes
 * (computed torque), bounded by the muscles.
 *
 * **In the joints' angles.** A freedom's angle is the engine's measure, and its rate is not the
 * speed its motor drives (`src/core/build/joint-state.ts`). The change of rate each freedom asks
 * for over the step becomes a change of speed through the joint's turning (`turningToRef`). Asking
 * each motor for its own freedom's change is right only near the reference pose: far from it the
 * motors' axes part from the angles', and a freedom is pushed away from its goal.
 * `tests/core-servo.test.mjs` holds the servo to a shoulder swung 1.9 rad.
 *
 * **As torques.** The servoed freedoms' torques are M a + bias - gravity (`bodyDynamics`), where a
 * is the change of speed asked over the step and bias what the motion under way asks, and each is
 * given to the driver as a torque source: an unbounded speed, which the driver holds to the
 * muscles' reach (`forceVelocityReach`), at the activation that makes its ceiling that torque.
 * Freedoms the goal leaves be (a push) keep their command, whose torque the servo takes to be its
 * ceiling toward its target, and a servoed torque beyond what its muscles can give is held at
 * their strength; the rest are solved around both, so a servoed joint is not flung by what the
 * others do.
 *
 * **The motion under way** (`BodyDynamics.bias`, the part that goes as the square of the speeds) is
 * needed at the end of a fast chain: without it the servo holds a joint only through its angle's
 * error, which builds too slowly for a light segment, and a forearm driven straight throws the hand
 * about the wrist.
 *
 * Rejected:
 * - **Asking the velocity motor for the goal's speed at once**, (goal - angle) / t. Braking hard,
 *   it asks for a speed far past what the damped motion's acceleration allows, and reverses a joint
 *   within a step.
 * - **Each joint's torque from its own inertia** and gravity's moment. It ignores how joints turn
 *   each other: a light segment between two driven joints is thrown back and forth. The mass matrix
 *   carries those couplings.
 * - **Reading the load** (gravity, contact and the rest) from the last step, as the torque applied
 *   less M times the change it made. It divides a change of speed by the step, and the noise spins
 *   light segments. Gravity is known and computed; contact is left to the angle's error.
 *
 * `servo` takes the root to be held; `servoSolve` with the root's acceleration carries it. What is
 * left out leaves the motion off the damped one it asks for, alike at every rate, and the goal's
 * error takes it up. A held freedom settles to within a few 1e-4 rad of its goal, and a time
 * constant as short as two steps does not ring (`docs/reference/servo-and-muscle.md#holding-a-pose`).
 *
 * A goal that leaves a channel be (returns undefined) has set that channel's command before it
 * returns: the servo reads the command then, as the torque it solves around. A goal that moves
 * hands in its rate and acceleration (`ServoFeed`), and is followed with the error's damped motion
 * about it.
 */
export function servo(driver: MuscleDriver, goal: (channel: number) => number | undefined, seconds: number, dt: number,
  feed?: ServoFeed): void {
  servoSolve(driver, servoAsk(driver, goal, seconds, dt, feed));
}

/**
 * The servo's first half: each servoed freedom's acceleration asked over the step, and each freedom
 * the goal leaves be marked fixed at its command's torque (`ServoWork`).
 */
export function servoAsk(driver: MuscleDriver, goal: (channel: number) => number | undefined, seconds: number, dt: number,
  feed?: ServoFeed): ServoWork {
  const n = 1 / seconds, count = driver.channels.length;
  let work = scratch.get(driver);
  if (!work) scratch.set(driver, (work = { change: new Float64Array(count), accel: new Float64Array(count),
    torque: new Float64Array(count), fixed: new Uint8Array(count), bias: new Float64Array(count) }));
  const { change, accel, torque, fixed } = work;

  // The change of each freedom's rate asked over the step; NaN where the goal leaves a channel be,
  // whose torque is then its command's.
  for (let i = 0; i < count; i++) {
    const g = goal(i);
    fixed[i] = g === undefined ? 1 : 0;
    change[i] = g === undefined ? NaN : feed
      ? dt * (feed.acceleration(i) + n * n * (g - driver.angle(i)) + 2 * n * (feed.rate(i) - driver.rate(i)))
      : dt * (n * n * (g - driver.angle(i)) - 2 * n * driver.rate(i));
    if (g === undefined) {
      const push = driver.velocity[i]! - driver.speed(i), sense = push >= 0 ? 1 : -1;
      torque[i] = sense * Math.max(0, Math.min(1, driver.activation[i]!)) * driver.strength(i, sense);
    }
  }
  // Each servoed freedom's acceleration: its joint's changes of rate, turned into its speed.
  for (let i = 0; i < count; i++) {
    if (fixed[i]) { accel[i] = 0; continue; }
    const c = driver.channels[i]!, first = i - c.index;
    let du = 0;
    for (let k = 0; k < c.joint.dofs.length; k++) {
      const asked = change[first + k]!;
      if (!Number.isNaN(asked)) du += driver.turning(i, k) * asked;
    }
    accel[i] = du / dt;
  }
  return work;
}

/**
 * The servo's second half: the torques that give the asked accelerations, solved around the fixed
 * freedoms, and the commands. With `root`, the root's acceleration (`RootDynamics`' order: its
 * angular acceleration and its centre's, world), each freedom carries its share of it; without, the
 * root is taken to be held. `work.accel` is left with every freedom's acceleration: the asked, and
 * the fixed freedoms' as their torques give them.
 */
export function servoSolve(driver: MuscleDriver, work: ServoWork, root?: ArrayLike<number>): void {
  const count = driver.channels.length;
  const { mass, gravity } = driver.dynamics;
  const { change, accel, torque, fixed } = work;
  // What the root's acceleration asks of each freedom goes with the motion under way.
  const bias = work.bias;
  bias.set(driver.dynamics.bias);
  if (root) {
    const coupling = driver.dynamics.root.coupling;
    for (let r = 0; r < 6; r++) { const a = root[r]!, row = coupling[r]!; if (a !== 0) for (let i = 0; i < count; i++) bias[i] += row[i]! * a; }
  }
  // The torques, solved around the fixed ones; a torque the muscles cannot give is held at their
  // strength and the rest solved again.
  for (let pass = 0; pass <= count; pass++) {
    solveAround(mass, gravity, bias, fixed, torque, accel, count);
    let clipped = false;
    for (let i = 0; i < count; i++) {
      if (fixed[i]) continue;
      const sense = torque[i]! >= 0 ? 1 : -1, strength = driver.strength(i, sense);
      if (Math.abs(torque[i]!) > strength) { torque[i] = sense * strength; fixed[i] = 1; clipped = true; }
    }
    if (!clipped) break;
  }
  for (let i = 0; i < count; i++) {
    if (!Number.isNaN(change[i]!)) {
      const sense = torque[i]! >= 0 ? 1 : -1, strength = driver.strength(i, sense);
      driver.velocity[i] = sense * Infinity;
      driver.activation[i] = strength > 0 ? Math.min(1, Math.abs(torque[i]!) / strength) : 0;
    }
  }
}

/**
 * A moving goal's rate (rad/s) and acceleration (rad/s^2) by channel, for a servoed channel: the
 * servo then asks for the goal's own acceleration, plus the damped pull on the error in angle and
 * in rate, so it follows a path rather than lagging it by a time constant.
 */
interface ServoFeed {
  rate(channel: number): number;
  acceleration(channel: number): number;
}

/**
 * The servo's working state between its halves, by channel: the change of rate asked (NaN where the
 * goal leaves the channel be), the acceleration, the torque, and whether it is fixed.
 */
export interface ServoWork { change: Float64Array; accel: Float64Array; torque: Float64Array; fixed: Uint8Array; bias: Float64Array }
const scratch = new WeakMap<MuscleDriver, ServoWork>();

/**
 * With M u' + bias = torque + gravity: the fixed freedoms' accelerations from their torques and the
 * free ones' accelerations, then the free ones' torques. Writes `torque` for the free freedoms and
 * `accel` for the fixed ones. M restricted to the fixed freedoms is positive definite (a mass
 * matrix), so it is solved by Cholesky in place on flat typed arrays rather than by
 * `solveSymmetric` (`src/core/math/linalg.ts`), which builds an array per row: this runs every
 * step.
 */
function solveAround(mass: readonly Float64Array[], gravity: Float64Array, bias: Float64Array, fixed: Uint8Array,
  torque: Float64Array, accel: Float64Array, count: number): void {
  const F: number[] = [], S: number[] = [];
  for (let i = 0; i < count; i++) (fixed[i] ? F : S).push(i);
  if (F.length) {
    // M_FF a_F = torque_F + gravity_F - bias_F - M_FS a_S
    const m = F.length, L = new Float64Array(m * m), b = new Float64Array(m);
    F.forEach((f, r) => {
      let rhs = torque[f]! + gravity[f]! - bias[f]!;
      for (const s of S) rhs -= mass[f]![s]! * accel[s]!;
      b[r] = rhs;
    });
    for (let r = 0; r < m; r++) for (let c = 0; c <= r; c++) {
      let sum = mass[F[r]!]![F[c]!]!;
      for (let k = 0; k < c; k++) sum -= L[r * m + k]! * L[c * m + k]!;
      L[r * m + c] = r === c ? Math.sqrt(sum) : sum / L[c * m + c]!;
    }
    for (let r = 0; r < m; r++) { let sum = b[r]!; for (let k = 0; k < r; k++) sum -= L[r * m + k]! * b[k]!; b[r] = sum / L[r * m + r]!; }
    for (let r = m - 1; r >= 0; r--) { let sum = b[r]!; for (let k = r + 1; k < m; k++) sum -= L[k * m + r]! * b[k]!; b[r] = sum / L[r * m + r]!; }
    F.forEach((f, r) => { accel[f] = b[r]!; });
  }
  for (const s of S) {
    let sum = bias[s]! - gravity[s]!;
    for (let j = 0; j < count; j++) sum += mass[s]![j]! * accel[j]!;
    torque[s] = sum;
  }
}
