/**
 * The stance's inverse dynamics, a step's: what `carry` and `bear` (`stanceControl`) solve, each
 * part a function handed the stance. `carry` finds the root's acceleration the stance asks for and
 * the soles can give; `bear`, once the servo has solved the rest of the body around it, the legs'
 * torques.
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyDynamics } from "../build/dynamics.ts";
import { boundedLeastSquares, fixedSolve, solveLinear } from "../math/linalg.ts";
import type { MuscleDriver } from "../muscle/driver.ts";
import { shareGroundWrench } from "./contact-wrench.ts";
import type { ServoWork } from "./servo.ts";
import type { FootTask, Stance } from "./stance-state.ts";
import { LEG_DAMPING } from "./stance-tuning.ts";
import { GROUND_FRICTION, bearingSole, soleMiddleToRef, type FootState } from "./support.ts";

/**
 * A leg the stance drives, solved for a step: its freedoms' accelerations are `y0 - Y a_root`, its
 * foot's asked motion, less its drift and what the root's motion gives it, through the leg.
 */
export interface Leg {
  readonly foot: FootState;
  readonly task: FootTask;
  readonly y0: number[];
  readonly Y: number[][];
}

/** `foot`'s leg's Jacobian at `point`, world: its spin's rows, then the point's velocity's, a column a freedom. */
function legJacobian(foot: FootState, point: Vector3, driver: MuscleDriver): number[][] {
  const dynamics = driver.dynamics;
  return [0, 1, 2, 3, 4, 5].map((row) => foot.memory.channels.map((i) => {
    const axis = dynamics.axis(i), pivot = dynamics.pivot(i);
    if (row < 3) return axis[row]!;
    const d = [point.x - pivot[0], point.y - pivot[1], point.z - pivot[2]];
    return row === 3 ? axis[1] * d[2]! - axis[2] * d[1]! : row === 4 ? axis[2] * d[0]! - axis[0] * d[2]! : axis[0] * d[1]! - axis[1] * d[0]!;
  }));
}

/** The point of `foot` its task is asked at, into `out`: bearing, where it bears, as last read; swinging, its sole's middle, now. */
function pointOf(foot: FootState, task: FootTask, out: Vector3): Vector3 {
  return task.bearing ? out.copyFrom(foot.memory.rolled ? foot.edge : foot.middle) : soleMiddleToRef(foot, out);
}

/**
 * The lever a missed moment of the ground's wrench is weighed against a missed force at
 * (`shareGroundWrench`): the height of the root's centre, where the wrench is taken, over the
 * soles, at least a sole's half-length. A moment the soles miss is a force they miss at the
 * root's height. No fixed lever serves both humans better: `docs/reference/stance-tuning.md#wrench-lever`.
 */
export function leverOf(s: Stance, height: number): number {
  return Math.max(s.feet[0]!.reach, height - s.state.reading.support.y);
}

/** `foot`'s leg solved for its `task` (`Leg`); `p0` is the root's centre. */
export function solveLeg(s: Stance, foot: FootState, task: FootTask, muscles: MuscleDriver, p0: readonly [number, number, number]): Leg {
  const { reading, step } = s.state, { bend, spare, gait, seconds } = s.tuning, { lin, ang, at } = s.scratch.idScratch;
  const dynamics = muscles.dynamics;
  pointOf(foot, task, at);
  const J = legJacobian(foot, at, muscles);
  dynamics.driftToRef(foot.segment, at, lin, ang);
  const r = [at.x - p0[0], at.y - p0[1], at.z - p0[2]];
  const k0 = [task.angular.x - ang.x, task.angular.y - ang.y, task.angular.z - ang.z, task.linear.x - lin.x, task.linear.y - lin.y, task.linear.z - lin.z];
  // B a_root: the foot's motion from the root's, its spin and a + alpha x r.
  const B = [0, 1, 2, 3, 4, 5].map((row) => [0, 1, 2, 3, 4, 5].map((col) => {
    if (row < 3) return col === row ? 1 : 0;
    if (col >= 3) return col === row ? 1 : 0;
    // (alpha x r)_i = -[r]x alpha
    const i = row - 3, j = col;
    return i === j ? 0 : [[0, r[2]!, -r[1]!], [-r[2]!, 0, r[0]!], [r[1]!, -r[0]!, 0]][i]![j]!;
  }));
  // A knee past straight is on the Jacobian's other branch, where the leg shortens by extending
  // the knee further, into its stop. That knee is asked back toward `STANCE_KNEE_BEND`,
  // critically damped at the height's constant, ahead of the foot's task, and the leg's other
  // freedoms take the task (`fixedSolve`).
  const fixed = new Array<number>(foot.memory.channels.length).fill(NaN);
  if (bend !== null) {
    const k = foot.chain[0]!.dofs.length, i = foot.memory.channels[k]!, flexed = muscles.angle(i) - foot.straight, m = 1 / seconds.height;
    if (flexed < 0) fixed[k] = m * m * (bend - flexed) - 2 * m * muscles.rate(i);
  }
  let rows: readonly (readonly number[])[] = J, y: readonly number[] = k0, Bs: readonly (readonly number[])[] = B;
  if (task.bearing && foot.memory.rolled && spare !== null) {
    // Rolled, the foot's turn about its front edge is free and the ankle is held at its stop
    // less the spare, critically damped at the height's constant: the leg pivots on the edge.
    const e = foot.edgeAxis, w = Vector3.Cross(e, Vector3.UpReadOnly);
    const keep = (m: readonly (readonly number[])[]) => [
      m[0]!.map((_, c) => w.x * m[0]![c]! + w.y * m[1]![c]! + w.z * m[2]![c]!), m[1]!, m[3]!, m[4]!, m[5]!];
    rows = keep(J);
    Bs = keep(B);
    y = [w.x * k0[0]! + w.y * k0[1]! + w.z * k0[2]!, k0[1]!, k0[3]!, k0[4]!, k0[5]!];
    const pre = step.swing;
    if (gait.preswing !== undefined && reading.phase === "shift" && pre?.transfer && pre.foot === foot.side) {
      const k = foot.chain[0]!.dofs.length, i = foot.memory.channels[k]!, m = 1 / gait.preswing.seconds;
      fixed[k] = m * m * (gait.preswing.knee - (muscles.angle(i) - foot.straight)) - 2 * m * muscles.rate(i);
    } else {
      const k = foot.chain[0]!.dofs.length + foot.chain[1]!.dofs.length, i = foot.memory.channels[k]!, m = 1 / seconds.height;
      fixed[k] = m * m * (foot.chain[2]!.dofs[0]!.spec.max.value - spare - muscles.angle(i)) - 2 * m * muscles.rate(i);
    }
  }
  const y0 = fixedSolve(rows, y, fixed, LEG_DAMPING), still = fixed.map((v) => Number.isNaN(v) ? NaN : 0);
  const columns = [0, 1, 2, 3, 4, 5].map((c) => fixedSolve(rows, Bs.map((row) => row[c]!), still, LEG_DAMPING));
  return { foot, task, y0, Y: [0, 1, 2, 3, 4, 5].map((row) => columns.map((col) => col[row]!)) };
}

/**
 * The root's rows as the root accelerates: W = P a_root + w0, the wrench the ground gives about
 * the root's centre, with `legs`' freedoms moving as their feet's tasks have them. The body's other
 * freedoms are the caller's to add.
 */
export function rootRows(R: BodyDynamics["root"], legs: readonly Leg[]): { P: number[][]; w0: number[] } {
  const P = [0, 1, 2, 3, 4, 5].map((r) => [0, 1, 2, 3, 4, 5].map((c) => R.mass[r]![c]!));
  const w0 = [0, 1, 2, 3, 4, 5].map((r) => R.bias[r]! - R.gravity[r]!);
  for (const { foot, y0, Y } of legs) foot.memory.channels.forEach((i, k) => {
    for (let r = 0; r < 6; r++) {
      const C = R.coupling[r]![i]!;
      w0[r] = w0[r]! + C * y0[k]!;
      for (let c = 0; c < 6; c++) P[r]![c] = P[r]![c]! - C * Y[k]![c]!;
    }
  });
  return { P, w0 };
}

/**
 * The freedoms held at a torque (`ServoWork.fixed` outside the legs: a strike's pushes) move as
 * that torque moves them, and the root's acceleration changes how: from M_FF q''_F = torque_F -
 * bias_F + gravity_F - C_F' a_root - M_F,rest q''_rest, q''_F = z0 + Z a_root. Taken as at
 * rest, a strike's arm and trunk would be carried by a ground that gave the whole body their
 * momentum.
 *
 * Found here, kept in the state's `held`, and added to the root's rows (`P`, `w0`). `inLeg` marks
 * the freedoms of `legs`.
 */
export function heldFreedoms(s: Stance, legs: readonly Leg[], inLeg: Uint8Array, dynamics: BodyDynamics, work: ServoWork,
  P: number[][], w0: number[]): void {
  const { held } = s.state, R = dynamics.root, n = inLeg.length;
  const { mass, gravity: weight, bias } = dynamics;
  const F: number[] = [];
  for (let i = 0; i < n; i++) if (work.fixed[i] && !inLeg[i]) F.push(i);
  held.channels = F;
  if (F.length) {
    const legOf = new Map<number, { y0: number; Y: readonly number[] }>();
    for (const { foot, y0, Y } of legs) foot.memory.channels.forEach((i, k) => legOf.set(i, { y0: y0[k]!, Y: Y[k]! }));
    const MFF = F.map((i) => F.map((j) => mass[i]![j]!));
    held.z0 = solveLinear(MFF, F.map((i) => {
      let t = work.torque[i]! - bias[i]! + weight[i]!;
      for (let j = 0; j < n; j++) {
        if (work.fixed[j] && !inLeg[j]) continue;
        const leg = legOf.get(j);
        t -= mass[i]![j]! * (leg ? leg.y0 : work.accel[j]!);
      }
      return t;
    }));
    const columns = [0, 1, 2, 3, 4, 5].map((c) => solveLinear(MFF, F.map((i) => {
      let t = -R.coupling[c]![i]!;
      for (const [j, leg] of legOf) t += mass[i]![j]! * leg.Y[c]!;
      return t;
    })));
    held.Z = F.map((_, k) => columns.map((column) => column[k]!));
    F.forEach((i, k) => {
      for (let r = 0; r < 6; r++) {
        const C = R.coupling[r]![i]!;
        w0[r] = w0[r]! + C * held.z0[k]!;
        for (let c = 0; c < 6; c++) P[r]![c] = P[r]![c]! + C * held.Z[k]![c]!;
      }
    });
  }
}

/**
 * The aims as the root's acceleration, into the state's `aim.root`: its angular acceleration, and
 * its centre's that gives the centre of mass its aim (the ground's force is M c'' less gravity's).
 */
export function rootAim(s: Stance, R: BodyDynamics["root"], P: number[][], w0: number[]): Float64Array {
  const { aim } = s.state, a = aim.spin;
  const root = aim.root;
  root[0] = a.x; root[1] = a.y; root[2] = a.z;
  const centre = [aim.centre.x, aim.centre.y, aim.centre.z];
  const linear = solveLinear([3, 4, 5].map((r) => [3, 4, 5].map((c) => P[r]![c]!)),
    [3, 4, 5].map((r, k) => R.mass[3]![3]! * centre[k]! - R.gravity[r]! - w0[r]! - P[r]![0]! * a.x - P[r]![1]! * a.y - P[r]![2]! * a.z));
  root[3] = linear[0]!; root[4] = linear[1]!; root[5] = linear[2]!;
  return root;
}

/**
 * What the bearing soles can give of the wrench the root's acceleration asks; where they cannot
 * give it all, the root's acceleration is the one the wrench they can give makes, with what the
 * assist gives of the rest.
 */
export function limitToSoles(s: Stance, legs: readonly Leg[], P: number[][], w0: number[], p0: readonly [number, number, number]): void {
  const { assist } = s, { root } = s.state.aim, { reading, helped } = s.state, { soleMargin } = s.tuning, { idScratch, shares, missed } = s.scratch, { at } = idScratch;
  const bearing = legs.filter((leg) => leg.task.bearing).map((leg) => leg.foot);
  const W = [0, 1, 2, 3, 4, 5].map((r) => w0[r]! + P[r]!.reduce((sum, v, c) => sum + v * root[c]!, 0));
  if (bearing.length) {
    idScratch.force.set(W[3]!, W[4]!, W[5]!);
    idScratch.moment.set(W[0]!, W[1]!, W[2]!);
    shareGroundWrench(bearing.map((foot) => bearingSole(foot, 1 - soleMargin)), at.set(p0[0], p0[1], p0[2]), idScratch.force, idScratch.moment,
      GROUND_FRICTION, leverOf(s, p0[1]), shares, missed);
    // `missed` is what the soles give beyond what was asked; the shortfall is its opposite.
    reading.shortfall.force.copyFrom(missed.force).scaleInPlace(-1);
    reading.shortfall.moment.copyFrom(missed.moment).scaleInPlace(-1);
    // What the soles cannot give, the assist may, up to its ceiling: the root is then asked
    // for the motion the two give together.
    if (assist?.on) {
      assist.clipToRef(reading.shortfall.force, reading.shortfall.moment, helped.force, helped.moment);
      missed.force.addInPlace(helped.force);
      missed.moment.addInPlace(helped.moment);
    }
    if (missed.force.lengthSquared() + missed.moment.lengthSquared() > 1e-12) {
      const given = [W[0]! + missed.moment.x, W[1]! + missed.moment.y, W[2]! + missed.moment.z, W[3]! + missed.force.x, W[4]! + missed.force.y, W[5]! + missed.force.z];
      root.set(solveLinear(P, given.map((v, r) => v - w0[r]!)));
    }
  }
}

/**
 * A swinging leg's accelerations are the nearest to its task that its muscles can give, all its
 * freedoms at once (`boundedLeastSquares`): clipped one at a time, a hip at its strength leaves
 * the knee's torque asking for thigh motion it does not get, and the knee drives the foot into
 * the ground. A hip turning faster than its muscles shorten has no strength that way at all.
 * Few swings ask past strength, but those decide a walk.
 * Measured: `docs/reference/stance-tuning.md#bounded-swing`.
 *
 * `accel` is every freedom's acceleration, which this leg's are written into, with its task's.
 */
export function boundSwing(s: Stance, foot: FootState, task: FootTask, muscles: MuscleDriver, accel: Float64Array, root: Float64Array): void {
  const { idScratch } = s.scratch, dynamics = muscles.dynamics, R = dynamics.root, n = muscles.channels.length;
  const { mass, gravity: weight, bias } = dynamics;
  const channels = foot.memory.channels;
  // Each freedom's torque with the leg's own accelerations at zero, and the leg's mass matrix.
  const still = channels.map((i) => {
    let torque = bias[i]! - weight[i]!;
    for (let r = 0; r < 6; r++) torque += R.coupling[r]![i]! * root[r]!;
    for (let j = 0; j < n; j++) if (!channels.includes(j)) torque += mass[i]![j]! * accel[j]!;
    return torque;
  });
  const M = channels.map((i) => channels.map((j) => mass[i]![j]!));
  const asked = channels.map((_, a) => still[a]! + channels.reduce((sum, _j, b) => sum + M[a]![b]! * task.accel[b]!, 0));
  const lo = channels.map((i) => -muscles.strength(i, -1)), hi = channels.map((i) => muscles.strength(i, 1));
  if (asked.every((t, a) => t >= lo[a]! && t <= hi[a]!)) return;
  // The foot's task missed, weighed: its sole's middle's acceleration, and its turn's at the
  // sole's end (half its length), for a torque's miss through M^-1.
  const J = legJacobian(foot, soleMiddleToRef(foot, idScratch.at), muscles);
  const massInverse = channels.map((_, c) => solveLinear(M, channels.map((_i, r) => (r === c ? 1 : 0))));
  const G = J.map((row, r) => massInverse.map((column) => row.reduce((sum, v, b) => sum + v * column[b]!, 0) * (r < 3 ? foot.reach : 1)));
  const A = channels.map((_, a) => channels.map((_b, b) => G.reduce((sum, row) => sum + row[a]! * row[b]!, 0)));
  const torque = boundedLeastSquares(A, asked, lo, hi);
  channels.forEach((i, a) => {
    accel[i] = massInverse.reduce((sum, column, b) => sum + column[a]! * (torque[b]! - still[b]!), 0);
    task.accel[a] = accel[i]!;
  });
}

/**
 * The wrench the ground must give, about the root's centre: what the whole body's motion asks of
 * the root's rows, less gravity's. `n` is the count of freedoms.
 */
export function groundWrench(R: BodyDynamics["root"], root: Float64Array, accel: Float64Array, n: number): number[] {
  return [0, 1, 2, 3, 4, 5].map((r) => {
    let sum = R.bias[r]! - R.gravity[r]!;
    for (let c = 0; c < 6; c++) sum += R.mass[r]![c]! * root[c]!;
    for (let i = 0; i < n; i++) sum += R.coupling[r]![i]! * accel[i]!;
    return sum;
  });
}

/**
 * Each driven leg's freedoms' torques, given to the muscles as torque sources: its inverse dynamics
 * at `accel` and the root's acceleration, less, for a bearing foot, the ground's wrench on it (its
 * share, in `bearing`'s order).
 */
export function legTorques(s: Stance, muscles: MuscleDriver, accel: Float64Array, bearing: readonly FootState[]): void {
  const { feet } = s, { tasks } = s.state, { shares } = s.scratch, root = s.state.aim.root;
  const dynamics = muscles.dynamics, R = dynamics.root, n = muscles.channels.length;
  const { mass, gravity: weight, bias } = dynamics;
  feet.forEach((foot, f) => {
    const task = tasks[f]!;
    if (!task.on) return;
    const share = task.bearing ? shares[bearing.indexOf(foot)]! : null;
    foot.memory.channels.forEach((i) => {
      let torque = bias[i]! - weight[i]!;
      for (let r = 0; r < 6; r++) torque += R.coupling[r]![i]! * root[r]!;
      for (let j = 0; j < n; j++) torque += mass[i]![j]! * accel[j]!;
      if (share) {
        // Less the ground's wrench on the foot, carried along the freedom's motion.
        const m = dynamics.axis(i), p = dynamics.pivot(i), x = foot.memory.rolled ? foot.edge : foot.middle;
        const d = [x.x - p[0], x.y - p[1], x.z - p[2]];
        const swept = [m[1] * d[2]! - m[2] * d[1]!, m[2] * d[0]! - m[0] * d[2]!, m[0] * d[1]! - m[1] * d[0]!];
        torque -= m[0] * share.moment.x + m[1] * share.moment.y + m[2] * share.moment.z
          + swept[0]! * share.force.x + swept[1]! * share.force.y + swept[2]! * share.force.z;
      }
      const sense = torque >= 0 ? 1 : -1, strength = muscles.strength(i, sense);
      muscles.velocity[i] = sense * Infinity;
      muscles.activation[i] = strength > 0 ? Math.min(1, Math.abs(torque) / strength) : 0;
    });
  });
}
