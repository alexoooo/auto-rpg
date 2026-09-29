import type { MuscleDriver } from "../muscle/driver.ts";

/**
 * **The joint servo**: freedoms pulled toward goal angles by their own muscles, each as a
 * critically damped second-order motion of its angle,
 *
 *     angle'' = n^2 (goal - angle) - 2 n angle',   n = 1 / (time constant)
 *
 * taken one sub-step at a time, with the torques the body's dynamics say that motion takes
 * (computed torque), bounded by the muscles.
 *
 * **In the joints' angles.** A freedom's angle is Havok's, and its rate is not the speed its motor
 * drives (`src/core/build/joint-state.ts`). The change of rate each freedom asks for over the step
 * becomes a change of speed through the joint's turning (`turningToRef`). Asking each motor for its
 * own freedom's change, as this servo once did, is right only near the reference pose: with the
 * shoulder flexed past a quarter turn, abduction's motor axis has turned past square to the angle's,
 * and the servo pushed abduction away from its goal. The Rogue's right arm alone, upper trunk held,
 * servoed to shoulder flexion 2.5, abduction 0.5 and elbow 1.6 rad for 0.8 s (Node stand, gravity,
 * self-contact off), ended with its shoulder at flexion -0.78, abduction 1.55 and internal rotation
 * -2.39 at 120 Hz, and 2.61, 1.41 and 0.96 at 960 Hz; this servo ends at 2.54, 0.49 and 0.01 at
 * both; `tests/core-servo.test.mjs` holds it to that at a nearby pose.
 *
 * **As torques.** The servoed freedoms' torques are M a + bias - gravity (`bodyDynamics`), where a
 * is the change of speed asked over the step and bias what the motion under way asks, and each is given to the driver as a torque source: a speed
 * no joint reaches, at the activation that makes its ceiling that torque. Freedoms the goal leaves
 * be (a push) keep their command, whose torque the servo takes to be its ceiling toward its target,
 * and a servoed torque beyond what its muscles can give is held at their strength; the rest are
 * solved around both, so a servoed joint is not flung by what the others do.
 *
 * Why torques: Havok's velocity motor builds its impulse over several solver steps when what it
 * turns carries other bodies, and rings, and it does so by step, not by time. A rod on a pin
 * carrying a second, held rod five times its mass, asked for 1 rad/s from rest, turned at 0.08,
 * 0.58, 1.19, 1.69, 1.94, 1.86 rad/s on successive steps, the same to 0.01 at 120 Hz and 1920 Hz
 * (Node stand). At 1920 Hz that is over in 3 ms; at 120 Hz it spans 50 ms, the servo's own time
 * scale, and a servo asking a velocity motor for its speeds ran behind, then overshot. Havok
 * delivers a torque source exactly, though: the same rod pushed by a saturated motor gained speed
 * at the rate its torque over the chain's inertia gives, within a few per cent, from the first step.
 * Havok has no solver setting but the ideal step (`HP_World_SetIdealStepTime`), and holding that
 * below the step made the chain ring harder, and below half the step weakened every motor.
 *
 * Measured, the velocity servo against this one (Node stand, self-contact off): the arm above,
 * returning to zero, hand peak 4.74 against 3.53 m/s at 120 Hz and 960 Hz, and 4.67 against 4.66;
 * the whole Rogue (lower trunk held, gravity), guard to a searched chamber and back, hand peak
 * 3.71 against 2.02 at 120 Hz and 1920 Hz, and 2.36 against 2.28. On the lab's straights the fist
 * agrees across rates to 2.2 % until the elbow meets its stop (`src/core/muscle/driver.ts`). The
 * servo costs 0.06 ms a step on the whole human at 120 Hz, of 0.86 ms a step in all.
 *
 * Rejected:
 * - **Asking the velocity motor for the goal's speed at once**, (goal - angle) / t. Where it braked
 *   hard it asked for a speed tens of rad/s away, and the motor rang about it: at 120 Hz a
 *   Warrior's elbow, opening at 34 rad/s, reversed to 22 rad/s in one step.
 * - **Each joint's torque from its own inertia**, the inertia beyond it times its acceleration,
 *   plus gravity's moment. It ignores how joints turn each other: a light middle trunk between two
 *   driven trunk joints turned at up to 12 rad/s, reversing every step, while each joint sized its
 *   torque for the whole body above it. The mass matrix carries those couplings.
 * - **Reading the load** (gravity, contact and the rest) from the last step, as the torque applied
 *   less M times the change it made. It divides a change of speed by the step, and on the Rogue's
 *   arm it spun the wrist at up to 14 rad/s and never reached the chamber at 1920 Hz. Gravity is
 *   known, and is computed; contact is left to the angle's error.
 *
 * **The motion under way** (`BodyDynamics.bias`, the part that goes as the square of the speeds)
 * was left out until a searched blow showed its size. Without it the servo holds a joint only
 * through its angle's error, and the error builds too slowly for a light segment at the end of a
 * fast chain: the Rogue's forearm, driven straight, threw her servoed hand about the wrist at 83
 * rad/s while the servo asked the wrist for next to nothing, and the hand's whip made 4.6 m/s of
 * her fist's 8.7 (Node stand, 120 Hz).
 *
 * Not modelled: the root's own acceleration (the lab carries its pelvis). It leaves the motion off
 * the damped one it asks for, alike at every rate, and the goal's error takes it up.
 *
 * Havok's own residues, which no servo setting moves:
 * - **A slow body is braked.** A body whose centre moves under about 0.12 m/s loses speed at a
 *   steady 0.3 m/s^2 until it stops, at every rate and mass, awake or not, whatever the world's
 *   speed limits, the joint's friction, the body's damping or its motor; a pure spin about the
 *   centre is not touched. A rod pinned at one end and let fall under gravity began at 2.1 rad/s^2
 *   against 3.16. A servo stops where its pull no longer beats the brake: the whole Rogue, lower
 *   trunk held, servoed to the guard at 0.1 s, stood still with its elbows 0.013 rad and its wrists
 *   0.031 rad short at 120 Hz, and 0.011 and 0.029 at 960 Hz; at 0.05 s and 960 Hz, 0.003 and
 *   0.008 (Node stand). Where in the band a joint stops depends on how it came: before the servo
 *   asked for the motion under way the same hold read 0.022 and 0.026 at 120 Hz. The band goes as
 *   the square of the time constant.
 * - **The wrist's pronation flickers at 120 Hz**: its solver speed turns over from step to step
 *   while its angle holds within 0.01 rad, and a joint coming back to a hold jolts it by 0.03 rad
 *   for a step.
 * - **A time constant needs ten steps.** Stiffer, the wrists ring about pronation, thrown by their
 *   other two freedoms' motors: at nine steps (0.075 s at 120 Hz, 0.0375 s at 240 Hz) the whole
 *   Rogue's (lower trunk held, no ground, Node stand) turned at 6-7 rad/s, and at ten (0.083 s,
 *   0.042 s) they held; six steps rang at 120, 240 and 480 Hz alike, and twelve held. Like the
 *   motor's lag, it is counted in steps. At twelve steps the torque the dynamics say each step's
 *   change took is the torque given, to 0.05 N m at an elbow given 0.9 and 0.007 at a wrist given
 *   0.13; ringing, a wrist's is 5 N m off. Taking the driver's reach off the torque sources made
 *   it worse (41 rad/s at six steps), so the reach bounds the ring rather than making it. Why ten
 *   is not known.
 *
 * A goal that leaves a channel be (returns undefined) has set that channel's command before it
 * returns: the servo reads the command then, as the torque it solves around.
 */
export function servo(driver: MuscleDriver, goal: (channel: number) => number | undefined, seconds: number, dt: number): void {
  const n = 1 / seconds, count = driver.channels.length;
  const { mass, gravity, bias } = driver.dynamics;
  let work = scratch.get(driver);
  if (!work) scratch.set(driver, (work = { change: new Float64Array(count), accel: new Float64Array(count),
    torque: new Float64Array(count), fixed: new Uint8Array(count) }));
  const { change, accel, torque, fixed } = work;

  // The change of each freedom's rate asked over the step; NaN where the goal leaves a channel be,
  // whose torque is then its command's.
  for (let i = 0; i < count; i++) {
    const g = goal(i);
    fixed[i] = g === undefined ? 1 : 0;
    change[i] = g === undefined ? NaN : dt * (n * n * (g - driver.angle(i)) - 2 * n * driver.rate(i));
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

interface Work { change: Float64Array; accel: Float64Array; torque: Float64Array; fixed: Uint8Array }
const scratch = new WeakMap<MuscleDriver, Work>();

/**
 * With M u' + bias = torque + gravity: the fixed freedoms' accelerations from their torques and the
 * free ones' accelerations, then the free ones' torques. Writes `torque` for the free freedoms and
 * `accel` for the fixed ones. M restricted to the fixed freedoms is positive definite (a mass
 * matrix), so it is solved by Cholesky.
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
