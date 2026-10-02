/**
 * **The bearing solve**: a body borne on the ground through limbs. A limb is a chain of freedoms
 * from the root to a segment, with a task at a point of that segment: to bear there on a patch of
 * the ground, or to move free. `carryRoot` finds the root's acceleration its caller aims for and
 * the patches can give; `bearLimbs`, once the servo has solved the rest of the body around it, the
 * limbs' torques. It knows no foot: which segment a limb ends in, where its point is and what it
 * bears on are its caller's to say (the stance, `stance.ts`; a rise, `src/core/mind/rise/limbs.ts`).
 *
 * A limb need not begin at the root: the freedoms between the root and its chain are its stem
 * (`Limb.stem`; the trunk's, for an arm), which limbs may share and none owns.
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltSegment } from "../build/build-body.ts";
import type { BodyDynamics } from "../build/dynamics.ts";
import { boundedLeastSquares, fixedSolve, solveLinear } from "../math/linalg.ts";
import type { MuscleDriver } from "../muscle/driver.ts";
import type { Assist } from "./assist.ts";
import { shareGroundWrench, type Patch } from "./contact-wrench.ts";
import type { ServoWork } from "./servo.ts";
import { LEG_DAMPING } from "./stance-tuning.ts";
import { GROUND_FRICTION } from "./support.ts";

/**
 * A task's row: weights on the six a point's motion has (its segment's spin's three, world, then
 * its velocity's three), in the order they are summed.
 */
export type Row = readonly (readonly [row: number, weight: number])[];

/** **A limb's task for a step**, as the plan above the solve asks it: plain data, kept in its caller's state. */
export interface LimbTask {
  /** Whether the solve drives the limb this step. */
  on: boolean;
  /** Whether it bears on the ground. */
  bearing: boolean;
  /** The point's asked acceleration, and the segment's spin's, world. */
  readonly linear: Vector3;
  readonly angular: Vector3;
  /** The limb's freedoms' accelerations, as the solve leaves them. */
  readonly accel: Float64Array;
}

/** **What a step's task is solved with**: written by the plan before the solve reads it, and no memory. */
interface LimbWork {
  /** The point of the segment the task is asked at, world. */
  readonly at: Vector3;
  /** The rows of the six that are asked; null, all six as they are. */
  rows: readonly Row[] | null;
  /** For each of the limb's freedoms, an acceleration asked ahead of the task, or NaN: the others take the task (`fixedSolve`). */
  readonly ahead: number[];
  /**
   * For each of the limb's freedoms, the acceleration it is asked beneath the task: where more
   * freedoms take the task than it has rows, of the motions that give the task, theirs is the
   * one nearest these (`nearSolve`). Null, the least motion.
   */
  toward: number[] | null;
  /** Where it bears, while it bears. */
  patch: Patch | null;
  /**
   * Its part of the load against the other bearing limbs', where the ground's wrench can be shared
   * among them more ways than one (`shareGroundWrench`); 1 each, they bear alike.
   */
  share: number;
}

/** **A limb**: the chain of freedoms from the root to `segment`, and the task of a point of it. */
export interface Limb {
  readonly segment: BuiltSegment;
  /** The chain's freedoms as muscle channels, root outward. */
  readonly memory: { channels: number[] };
  /**
   * The freedoms between the root and the limb's own chain, as muscle channels: none where the
   * chain begins at the root. The servo asks their motion, which the limb's task counts as known;
   * they carry its patch's share of the ground's wrench, so their torques are the solve's
   * (`bearLimbs`), for the motion the servo asked.
   */
  readonly stem: readonly number[];
  /** The length a spin's miss is weighed at against a point's, m (`boundFree`). */
  readonly reach: number;
  readonly task: LimbTask;
  readonly work: LimbWork;
}

/** **What the solve works in**: each value is written by a call before that call reads it. */
interface BearingScratch {
  /** The ground's wrench as the bearing limbs' patches share it, in the bearing limbs' order, and what of it they cannot give. */
  readonly shares: { readonly force: Vector3; readonly moment: Vector3 }[];
  readonly missed: { readonly force: Vector3; readonly moment: Vector3 };
  /** Each limb's stem's freedoms' accelerations as the servo asked them (`carryRoot`), in the limbs' order. */
  readonly stems: number[][];
  readonly lin: Vector3;
  readonly ang: Vector3;
  readonly at: Vector3;
  readonly force: Vector3;
  readonly moment: Vector3;
}

/**
 * **What the solve is handed**: the limbs, the assist, and where it leaves what it finds, each the
 * caller's own record: the root's acceleration, what the assist is asked, the freedoms held at a
 * torque, and what of the ground's wrench the patches cannot give.
 */
export interface Bearing {
  readonly assist: Assist | null;
  readonly limbs: readonly Limb[];
  readonly root: Float64Array;
  readonly helped: { readonly force: Vector3; readonly moment: Vector3 };
  readonly held: { channels: number[]; z0: number[]; Z: number[][] };
  readonly shortfall: { readonly force: Vector3; readonly moment: Vector3 };
  readonly scratch: BearingScratch;
}

/** The solve of `limbs`, with `assist` giving what their patches miss, leaving what it finds in `out`'s records. */
export function makeBearing(assist: Assist | null, limbs: readonly Limb[],
  out: Pick<Bearing, "root" | "helped" | "held" | "shortfall">): Bearing {
  return {
    assist, limbs, root: out.root, helped: out.helped, held: out.held, shortfall: out.shortfall,
    scratch: {
      shares: limbs.map(() => ({ force: new Vector3(), moment: new Vector3() })),
      missed: { force: new Vector3(), moment: new Vector3() },
      stems: limbs.map((limb) => limb.stem.map(() => 0)),
      lin: new Vector3(), ang: new Vector3(), at: new Vector3(), force: new Vector3(), moment: new Vector3(),
    },
  };
}

/**
 * A limb the solve drives, solved for a step: its freedoms' accelerations are `y0 - Y a_root`, its
 * point's asked motion, less its drift and what the root's motion gives it, through the limb.
 */
interface Solved {
  readonly limb: Limb;
  readonly y0: number[];
  readonly Y: number[][];
}

/** The Jacobian of `channels` at `point`, world: a segment they carry's spin's rows, then the point's velocity's, a column a freedom. */
function jacobian(channels: readonly number[], point: Vector3, driver: MuscleDriver): number[][] {
  const dynamics = driver.dynamics;
  return [0, 1, 2, 3, 4, 5].map((row) => channels.map((i) => {
    const axis = dynamics.axis(i), pivot = dynamics.pivot(i);
    if (row < 3) return axis[row]!;
    const d = [point.x - pivot[0], point.y - pivot[1], point.z - pivot[2]];
    return row === 3 ? axis[1] * d[2]! - axis[2] * d[1]! : row === 4 ? axis[2] * d[0]! - axis[0] * d[2]! : axis[0] * d[1]! - axis[1] * d[0]!;
  }));
}

/**
 * The `x` of `rows x = y` nearest `toward`, with `ahead`'s entries held (`fixedSolve`): `toward`,
 * and the least motion that gives the task what `toward` leaves of it. A posture asked so is a
 * task beneath the point's, in its null space (Siciliano and Slotine 1991).
 */
function nearSolve(rows: readonly (readonly number[])[], y: readonly number[], ahead: readonly number[], toward: readonly number[]): number[] {
  const left = y.map((v, r) => toward.reduce((sum, p, k) => (Number.isNaN(ahead[k]!) ? sum - rows[r]![k]! * p : sum), v));
  return fixedSolve(rows, left, ahead, LEG_DAMPING).map((x, k) => (Number.isNaN(ahead[k]!) ? x + toward[k]! : x));
}

/**
 * `limb` solved for its task (`Solved`) at its point (`LimbWork.at`); `p0` is the root's centre, and
 * `asked` every freedom's acceleration as the servo asks it, which the limb's stem moves at.
 */
function solveLimb(b: Bearing, limb: Limb, muscles: MuscleDriver, p0: readonly [number, number, number], asked: Float64Array): Solved {
  const { task, work } = limb, { at, ahead } = work, { lin, ang } = b.scratch;
  const J = jacobian(limb.memory.channels, at, muscles);
  muscles.dynamics.driftToRef(limb.segment, at, lin, ang);
  const r = [at.x - p0[0], at.y - p0[1], at.z - p0[2]];
  const k0 = [task.angular.x - ang.x, task.angular.y - ang.y, task.angular.z - ang.z, task.linear.x - lin.x, task.linear.y - lin.y, task.linear.z - lin.z];
  if (limb.stem.length) {
    // What the stem's motion gives the point is known, and comes off what the chain is asked.
    const S = jacobian(limb.stem, at, muscles), stem = b.scratch.stems[b.limbs.indexOf(limb)]!;
    limb.stem.forEach((i, c) => {
      stem[c] = asked[i]!;
      for (let row = 0; row < 6; row++) k0[row] = k0[row]! - S[row]![c]! * stem[c]!;
    });
  }
  // B a_root: the point's motion from the root's, its spin and a + alpha x r.
  const B = [0, 1, 2, 3, 4, 5].map((row) => [0, 1, 2, 3, 4, 5].map((col) => {
    if (row < 3) return col === row ? 1 : 0;
    if (col >= 3) return col === row ? 1 : 0;
    // (alpha x r)_i = -[r]x alpha
    const i = row - 3, j = col;
    return i === j ? 0 : [[0, r[2]!, -r[1]!], [-r[2]!, 0, r[0]!], [r[1]!, -r[0]!, 0]][i]![j]!;
  }));
  let rows: readonly (readonly number[])[] = J, y: readonly number[] = k0, Bs: readonly (readonly number[])[] = B;
  if (work.rows) {
    // Each asked row is the sum of its weighted rows of the six, in the order written.
    const asked = work.rows;
    const keep = (m: readonly (readonly number[])[]) => asked.map((row) => m[0]!.map((_, c) => {
      let sum = row[0]![1] * m[row[0]![0]]![c]!;
      for (let k = 1; k < row.length; k++) sum += row[k]![1] * m[row[k]![0]]![c]!;
      return sum;
    }));
    rows = keep(J);
    Bs = keep(B);
    y = keep(k0.map((v) => [v])).map((row) => row[0]!);
  }
  const y0 = work.toward ? nearSolve(rows, y, ahead, work.toward) : fixedSolve(rows, y, ahead, LEG_DAMPING);
  const still = ahead.map((v) => Number.isNaN(v) ? NaN : 0);
  const columns = [0, 1, 2, 3, 4, 5].map((c) => fixedSolve(rows, Bs.map((row) => row[c]!), still, LEG_DAMPING));
  return { limb, y0, Y: limb.memory.channels.map((_, row) => columns.map((col) => col[row]!)) };
}

/**
 * The root's rows as the root accelerates: W = P a_root + w0, the wrench the ground gives about
 * the root's centre, with `solved`'s freedoms moving as their limbs' tasks have them. The body's
 * other freedoms are the caller's to add.
 */
function rootRows(R: BodyDynamics["root"], solved: readonly Solved[]): { P: number[][]; w0: number[] } {
  const P = [0, 1, 2, 3, 4, 5].map((r) => [0, 1, 2, 3, 4, 5].map((c) => R.mass[r]![c]!));
  const w0 = [0, 1, 2, 3, 4, 5].map((r) => R.bias[r]! - R.gravity[r]!);
  for (const { limb, y0, Y } of solved) limb.memory.channels.forEach((i, k) => {
    for (let r = 0; r < 6; r++) {
      const C = R.coupling[r]![i]!;
      w0[r] = w0[r]! + C * y0[k]!;
      for (let c = 0; c < 6; c++) P[r]![c] = P[r]![c]! - C * Y[k]![c]!;
    }
  });
  return { P, w0 };
}

/**
 * The freedoms held at a torque (`ServoWork.fixed` outside the limbs: a strike's pushes) move as
 * that torque moves them, and the root's acceleration changes how: from M_FF q''_F = torque_F -
 * bias_F + gravity_F - C_F' a_root - M_F,rest q''_rest, q''_F = z0 + Z a_root. Taken as at
 * rest, a strike's arm and trunk would be carried by a ground that gave the whole body their
 * momentum.
 *
 * Found here, kept in the caller's `held`, and added to the root's rows (`P`, `w0`). `inLimb`
 * marks the freedoms of `solved`.
 */
function heldFreedoms(b: Bearing, solved: readonly Solved[], inLimb: Uint8Array, dynamics: BodyDynamics, work: ServoWork,
  P: number[][], w0: number[]): void {
  const { held } = b, R = dynamics.root, n = inLimb.length;
  const { mass, gravity: weight, bias } = dynamics;
  const F: number[] = [];
  for (let i = 0; i < n; i++) if (work.fixed[i] && !inLimb[i]) F.push(i);
  held.channels = F;
  if (F.length) {
    const limbOf = new Map<number, { y0: number; Y: readonly number[] }>();
    for (const { limb, y0, Y } of solved) limb.memory.channels.forEach((i, k) => limbOf.set(i, { y0: y0[k]!, Y: Y[k]! }));
    const MFF = F.map((i) => F.map((j) => mass[i]![j]!));
    held.z0 = solveLinear(MFF, F.map((i) => {
      let t = work.torque[i]! - bias[i]! + weight[i]!;
      for (let j = 0; j < n; j++) {
        if (work.fixed[j] && !inLimb[j]) continue;
        const own = limbOf.get(j);
        t -= mass[i]![j]! * (own ? own.y0 : work.accel[j]!);
      }
      return t;
    }));
    const columns = [0, 1, 2, 3, 4, 5].map((c) => solveLinear(MFF, F.map((i) => {
      let t = -R.coupling[c]![i]!;
      for (const [j, own] of limbOf) t += mass[i]![j]! * own.Y[c]!;
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
 * `aim` as the root's acceleration, into the caller's `root`: its angular acceleration, and its
 * centre's that gives the centre of mass its aim (the ground's force is M c'' less gravity's).
 */
function rootAim(b: Bearing, aim: { readonly spin: Vector3; readonly centre: Vector3 }, R: BodyDynamics["root"], P: number[][], w0: number[]): Float64Array {
  const a = aim.spin, root = b.root;
  root[0] = a.x; root[1] = a.y; root[2] = a.z;
  const centre = [aim.centre.x, aim.centre.y, aim.centre.z];
  const linear = solveLinear([3, 4, 5].map((r) => [3, 4, 5].map((c) => P[r]![c]!)),
    [3, 4, 5].map((r, k) => R.mass[3]![3]! * centre[k]! - R.gravity[r]! - w0[r]! - P[r]![0]! * a.x - P[r]![1]! * a.y - P[r]![2]! * a.z));
  root[3] = linear[0]!; root[4] = linear[1]!; root[5] = linear[2]!;
  return root;
}

/**
 * What the bearing limbs' patches can give of the wrench the root's acceleration asks; where they
 * cannot give it all, the root's acceleration is the one the wrench they can give makes, with what
 * the assist gives of the rest.
 */
function limitToPatches(b: Bearing, solved: readonly Solved[], P: number[][], w0: number[], p0: readonly [number, number, number], lever: number): void {
  const { assist, root, shortfall, helped } = b, { at, force, moment, shares, missed } = b.scratch;
  const bearing = solved.filter(({ limb }) => limb.task.bearing).map(({ limb }) => limb);
  const W = [0, 1, 2, 3, 4, 5].map((r) => w0[r]! + P[r]!.reduce((sum, v, c) => sum + v * root[c]!, 0));
  if (bearing.length) {
    force.set(W[3]!, W[4]!, W[5]!);
    moment.set(W[0]!, W[1]!, W[2]!);
    shareGroundWrench(bearing.map((limb) => limb.work.patch!), at.set(p0[0], p0[1], p0[2]), force, moment, GROUND_FRICTION, lever, shares, missed,
      bearing.map((limb) => limb.work.share));
    // `missed` is what the patches give beyond what was asked; the shortfall is its opposite.
    shortfall.force.copyFrom(missed.force).scaleInPlace(-1);
    shortfall.moment.copyFrom(missed.moment).scaleInPlace(-1);
    // What the patches cannot give, the assist may, up to its ceiling: the root is then asked
    // for the motion the two give together.
    if (assist?.on) {
      assist.clipToRef(shortfall.force, shortfall.moment, helped.force, helped.moment);
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
 * The root's acceleration that gives the centre of mass `aim.centre` and the root's spin `aim.spin`,
 * as nearly as the bearing limbs' patches can give the wrench for it, with the driven limbs moving
 * as their tasks have them and the rest of the body as `work` asks: into `b.root`, and returned.
 * `lever` weighs a missed moment against a missed force (`shareGroundWrench`).
 */
export function carryRoot(b: Bearing, muscles: MuscleDriver, work: ServoWork,
  aim: { readonly spin: Vector3; readonly centre: Vector3 }, lever: number): Float64Array {
  const dynamics = muscles.dynamics, R = dynamics.root, p0 = R.centre, n = muscles.channels.length;
  const solved: Solved[] = [];
  const inLimb = new Uint8Array(n);
  for (const limb of b.limbs) {
    if (!limb.task.on) continue;
    solved.push(solveLimb(b, limb, muscles, p0, work.accel));
    for (const i of limb.memory.channels) inLimb[i] = 1;
  }
  // The root's rows, W = P a_root + w0: the limbs' freedoms as their tasks have them, those held
  // at a torque as it moves them, and the rest at the servo's asks.
  const { P, w0 } = rootRows(R, solved);
  heldFreedoms(b, solved, inLimb, dynamics, work, P, w0);
  for (let i = 0; i < n; i++) if (!inLimb[i] && !(work.fixed[i])) for (let r = 0; r < 6; r++) w0[r] = w0[r]! + R.coupling[r]![i]! * work.accel[i]!;
  const root = rootAim(b, aim, R, P, w0);
  limitToPatches(b, solved, P, w0, p0, lever);
  for (const { limb, y0, Y } of solved) for (let k = 0; k < y0.length; k++) limb.task.accel[k] = y0[k]! - Y[k]!.reduce((sum, v, c) => sum + v * root[c]!, 0);
  return root;
}

/**
 * What the servo's solve takes from the bearing solve, once `carryRoot` has run and before
 * `servoSolve` does: the driven limbs' freedoms move at their tasks' accelerations, written into
 * `work`, and `moved` marks them and their stems. The servo then solves the rest of the body
 * around that motion and holds none of those freedoms at its strength: their torques are
 * `bearLimbs`'. A servoed freedom that hangs from a limb's chain (a foot from a leg that bears on
 * its knee), or that a limb hangs from (its stem), is carried wrongly without it.
 */
export function limbMotion(b: Bearing, work: ServoWork, moved: Uint8Array): void {
  moved.fill(0);
  for (const limb of b.limbs) {
    if (!limb.task.on) continue;
    limb.memory.channels.forEach((i, k) => {
      work.fixed[i] = 0;
      work.accel[i] = limb.task.accel[k]!;
      moved[i] = 1;
    });
    for (const i of limb.stem) moved[i] = 1;
  }
}

/**
 * A free limb's accelerations are the nearest to its task that its muscles can give, all its
 * freedoms at once (`boundedLeastSquares`): clipped one at a time, a hip at its strength leaves
 * the knee's torque asking for thigh motion it does not get, and the knee drives the foot into
 * the ground. A hip turning faster than its muscles shorten has no strength that way at all.
 * Few swings ask past strength, but those decide a walk.
 * Measured: `docs/reference/stance-tuning.md#bounded-swing`.
 *
 * `accel` is every freedom's acceleration, which this limb's are written into, with its task's.
 */
function boundFree(limb: Limb, muscles: MuscleDriver, accel: Float64Array, root: Float64Array): void {
  const { task } = limb, dynamics = muscles.dynamics, R = dynamics.root, n = muscles.channels.length;
  const { mass, gravity: weight, bias } = dynamics;
  const channels = limb.memory.channels;
  // Each freedom's torque with the limb's own accelerations at zero, and the limb's mass matrix.
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
  // The limb's task missed, weighed: its point's acceleration, and its segment's turn's at its
  // reach, for a torque's miss through M^-1.
  const J = jacobian(limb.memory.channels, limb.work.at, muscles);
  const massInverse = channels.map((_, c) => solveLinear(M, channels.map((_i, r) => (r === c ? 1 : 0))));
  const G = J.map((row, r) => massInverse.map((column) => row.reduce((sum, v, b) => sum + v * column[b]!, 0) * (r < 3 ? limb.reach : 1)));
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
function groundWrench(R: BodyDynamics["root"], root: Float64Array, accel: Float64Array, n: number): number[] {
  return [0, 1, 2, 3, 4, 5].map((r) => {
    let sum = R.bias[r]! - R.gravity[r]!;
    for (let c = 0; c < 6; c++) sum += R.mass[r]![c]! * root[c]!;
    for (let i = 0; i < n; i++) sum += R.coupling[r]![i]! * accel[i]!;
    return sum;
  });
}

/**
 * Each driven limb's freedoms' torques, given to the muscles as torque sources: its inverse dynamics
 * at `accel` and the root's acceleration, less, for a bearing limb, the ground's wrench on it (its
 * patch's share, in `bearing`'s order), carried from its point. A stem's freedoms' likewise, less
 * the share of every bearing limb that hangs from them.
 */
function limbTorques(b: Bearing, muscles: MuscleDriver, accel: Float64Array, bearing: readonly Limb[]): void {
  const { root } = b, { shares } = b.scratch;
  const dynamics = muscles.dynamics, R = dynamics.root, n = muscles.channels.length;
  const { mass, gravity: weight, bias } = dynamics;
  /** Freedom `i`'s torque for the body's motion, the ground giving it nothing. */
  const inverse = (i: number): number => {
    let torque = bias[i]! - weight[i]!;
    for (let r = 0; r < 6; r++) torque += R.coupling[r]![i]! * root[r]!;
    for (let j = 0; j < n; j++) torque += mass[i]![j]! * accel[j]!;
    return torque;
  };
  /** The ground's wrench on `limb` (`share`, at its point), carried along freedom `i`'s motion. */
  const carried = (i: number, limb: Limb, share: { readonly force: Vector3; readonly moment: Vector3 }): number => {
    const m = dynamics.axis(i), p = dynamics.pivot(i), x = limb.work.at;
    const d = [x.x - p[0], x.y - p[1], x.z - p[2]];
    const swept = [m[1] * d[2]! - m[2] * d[1]!, m[2] * d[0]! - m[0] * d[2]!, m[0] * d[1]! - m[1] * d[0]!];
    return m[0] * share.moment.x + m[1] * share.moment.y + m[2] * share.moment.z
      + swept[0]! * share.force.x + swept[1]! * share.force.y + swept[2]! * share.force.z;
  };
  const give = (i: number, torque: number): void => {
    const sense = torque >= 0 ? 1 : -1, strength = muscles.strength(i, sense);
    muscles.velocity[i] = sense * Infinity;
    muscles.activation[i] = strength > 0 ? Math.min(1, Math.abs(torque) / strength) : 0;
  };
  const stems = new Set<number>();
  for (const limb of b.limbs) {
    const { task } = limb;
    if (!task.on) continue;
    const share = task.bearing ? shares[bearing.indexOf(limb)]! : null;
    limb.memory.channels.forEach((i) => {
      let torque = inverse(i);
      if (share) torque -= carried(i, limb, share);
      give(i, torque);
    });
    for (const i of limb.stem) stems.add(i);
  }
  for (const i of stems) {
    let torque = inverse(i);
    bearing.forEach((limb, k) => { if (limb.stem.includes(i)) torque -= carried(i, limb, shares[k]!); });
    give(i, torque);
  }
}

/**
 * The driven limbs' torques, given to their muscles as torque sources, once the servo has solved
 * the rest of the body around the root: each limb's inverse dynamics, less, where it bears, its
 * patch's share of the ground's wrench. `bounded` keeps a free limb within its muscles' strength
 * (`boundFree`).
 */
export function bearLimbs(b: Bearing, muscles: MuscleDriver, work: ServoWork, lever: number, bounded: boolean): void {
  const { assist, limbs, held, helped, root } = b, { at, force, moment, shares, missed } = b.scratch;
  const R = muscles.dynamics.root, n = muscles.channels.length;
  // Every freedom's acceleration: the limbs' from their tasks, the rest as the servo left them:
  // a stem's as it was asked (`limbMotion` marks it moved), the others' as solved.
  const accel = work.accel;
  for (const limb of limbs) if (limb.task.on) limb.memory.channels.forEach((i, k) => { accel[i] = limb.task.accel[k]!; });
  // The freedoms held at a torque, as the plan has them move at this root.
  held.channels.forEach((i, k) => { accel[i] = held.z0[k]! + held.Z[k]!.reduce((sum, v, c) => sum + v * root[c]!, 0); });
  for (const limb of limbs) if (bounded && limb.task.on && !limb.task.bearing) boundFree(limb, muscles, accel, root);
  // The ground's wrench for it all, and each bearing patch's share of it.
  const W = groundWrench(R, root, accel, n);
  const bearing = limbs.filter((limb) => limb.task.on && limb.task.bearing);
  if (bearing.length) {
    force.set(W[3]!, W[4]!, W[5]!);
    moment.set(W[0]!, W[1]!, W[2]!);
    // The ground is asked for the wrench less what the assist gives.
    if (assist?.on) { force.subtractInPlace(helped.force); moment.subtractInPlace(helped.moment); }
    at.set(R.centre[0], R.centre[1], R.centre[2]);
    shareGroundWrench(bearing.map((limb) => limb.work.patch!), at, force, moment, GROUND_FRICTION, lever, shares, missed,
      bearing.map((limb) => limb.work.share));
  }
  limbTorques(b, muscles, accel, bearing);
  if (assist?.on) assist.ask(helped.force, helped.moment);
}
