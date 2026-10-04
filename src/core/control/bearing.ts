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
 *
 * It works in arrays made with the solve (`makeBearing`), each sized from its limbs, a matrix its
 * rows end to end; a call writes every entry it reads.
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltSegment } from "../build/build-body.ts";
import type { BodyDynamics } from "../build/dynamics.ts";
import { boundedLeastSquaresTo, boundedWork, fixedSolveTo, fixedWork, linearWork, solveLinearTo, type BoundedWork, type FixedWork, type LinearWork } from "../math/flat.ts";
import { solveLinear } from "../math/linalg.ts";
import type { MuscleDriver } from "../muscle/driver.ts";
import type { Assist } from "./assist.ts";
import { groundWrenchWork, shareGroundWrench, type GroundWrenchWork, type Patch, type ShareEffort } from "./contact-wrench.ts";
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
  /** The limb's freedoms' accelerations, as the solve leaves them: one a freedom of its chain. */
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
   * one nearest these (`nearSolveTo`). Null, the least motion.
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
  /** The chain's freedoms as muscle channels, root outward: as many as its task's `accel`. */
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

/**
 * **What a limb is solved in**, for a chain of `m` freedoms and a stem of `s`. Its task solved is
 * `y0` and `Y`: its freedoms' accelerations are `y0 - Y a_root`, its point's asked motion, less its
 * drift and what the root's motion gives it, through the limb.
 */
interface LimbSolve {
  /** The chain's Jacobian at the point (6 by m), the stem's (6 by s), and the root's B (6 by 6). */
  readonly J: Float64Array;
  readonly S: Float64Array;
  readonly B: Float64Array;
  /** The point's asked motion less what it has: six. */
  readonly k0: Float64Array;
  /** The asked rows of J, of B and of k0, where the task asks fewer than six. */
  readonly rowsJ: Float64Array;
  readonly rowsB: Float64Array;
  readonly rowsK: Float64Array;
  /** A column of the asked rows of B, the motion at rest a freedom held ahead keeps, and a solve's answer. */
  readonly column: Float64Array;
  readonly still: Float64Array;
  readonly x: Float64Array;
  /** The task solved: y0 (m), Y (m by 6). */
  readonly y0: Float64Array;
  readonly Y: Float64Array;
  readonly fixed: FixedWork;
  /** A free limb kept within its strength (`boundFree`): its torques at rest, its mass matrix and its inverse (by columns), the asked torques, their bounds. */
  readonly rest: Float64Array;
  readonly M: Float64Array;
  readonly inverse: Float64Array;
  readonly unit: Float64Array;
  readonly asked: Float64Array;
  readonly lo: Float64Array;
  readonly hi: Float64Array;
  readonly G: Float64Array;
  readonly A: Float64Array;
  readonly torque: Float64Array;
  readonly linear: LinearWork;
  readonly bounded: BoundedWork;
}

function limbSolve(m: number, s: number): LimbSolve {
  const f = (size: number) => new Float64Array(size);
  return {
    J: f(6 * m), S: f(6 * s), B: f(36), k0: f(6), rowsJ: f(6 * m), rowsB: f(36), rowsK: f(6), column: f(6), still: f(m), x: f(m),
    y0: f(m), Y: f(6 * m), fixed: fixedWork(6, m),
    rest: f(m), M: f(m * m), inverse: f(m * m), unit: f(m), asked: f(m), lo: f(m), hi: f(m), G: f(6 * m), A: f(m * m), torque: f(m),
    linear: linearWork(m), bounded: boundedWork(m),
  };
}

/** **What the solve works in**: each value is written by a call before that call reads it. */
interface BearingScratch {
  /** The ground's wrench as the bearing limbs' patches share it, in the bearing limbs' order, and what of it they cannot give. */
  readonly shares: { readonly force: Vector3; readonly moment: Vector3 }[];
  readonly missed: { readonly force: Vector3; readonly moment: Vector3 };
  /** What the share works in, made for every limb bearing on a sole, and the bearing limbs, their patches and parts as it is handed them. */
  readonly wrench: GroundWrenchWork;
  readonly bearing: Limb[];
  readonly patches: Patch[];
  readonly parts: number[];
  /** Each limb's stem's freedoms' accelerations as the servo asked them (`carryRoot`), in the limbs' order. */
  readonly stems: number[][];
  /** Each limb's solve, in the limbs' order. */
  readonly solves: readonly LimbSolve[];
  /** The root's rows, W = P a_root + w0 (6 by 6, and six), the wrench they give, and what the patches give of it. */
  readonly P: Float64Array;
  readonly w0: Float64Array;
  readonly W: Float64Array;
  readonly given: Float64Array;
  /** The root's linear rows (3 by 3), their right-hand side and answer, and a solve of up to six rows. */
  readonly P3: Float64Array;
  readonly y3: Float64Array;
  readonly x3: Float64Array;
  readonly linear: LinearWork;
  /** The freedoms a driven limb moves, one a freedom of the body, made at the first call. */
  inLimb: Uint8Array;
  /**
   * What the bearing limbs' shares ask of the muscles that carry them (`weighEffort`), where the
   * solve weighs it, and the freedoms it has a row for, one a freedom of the body, made at the
   * first call.
   */
  readonly effort: ShareEffort | null;
  rowed: Uint8Array;
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

/**
 * The solve of `limbs`, with `assist` giving what their patches miss, leaving what it finds in
 * `out`'s records. With `effort`, the ground's wrench is shared among the bearing limbs as the
 * muscles that carry it can most easily give it (`weighEffort`), besides as their shares ask.
 */
export function makeBearing(assist: Assist | null, limbs: readonly Limb[],
  out: Pick<Bearing, "root" | "helped" | "held" | "shortfall">, { effort = false }: { readonly effort?: boolean } = {}): Bearing {
  const carriers = new Set(limbs.flatMap((limb) => [...limb.memory.channels, ...limb.stem])).size;
  return {
    assist, limbs, root: out.root, helped: out.helped, held: out.held, shortfall: out.shortfall,
    scratch: {
      shares: limbs.map(() => ({ force: new Vector3(), moment: new Vector3() })),
      missed: { force: new Vector3(), moment: new Vector3() },
      wrench: groundWrenchWork(limbs.length, 0), bearing: [], patches: [], parts: [],
      stems: limbs.map((limb) => limb.stem.map(() => 0)),
      solves: limbs.map((limb) => limbSolve(limb.task.accel.length, limb.stem.length)),
      P: new Float64Array(36), w0: new Float64Array(6), W: new Float64Array(6), given: new Float64Array(6),
      P3: new Float64Array(9), y3: new Float64Array(3), x3: new Float64Array(3), linear: linearWork(6),
      inLimb: new Uint8Array(0),
      effort: effort ? { count: 0, C: new Float64Array(carriers * 6 * limbs.length), t0: new Float64Array(carriers) } : null,
      rowed: new Uint8Array(0),
      lin: new Vector3(), ang: new Vector3(), at: new Vector3(), force: new Vector3(), moment: new Vector3(),
    },
  };
}

/** The Jacobian of `channels` at `point`, world, into `out` (6 by the channels): a segment they carry's spin's rows, then the point's velocity's, a column a freedom. */
function jacobianTo(channels: readonly number[], point: Vector3, driver: MuscleDriver, out: Float64Array): Float64Array {
  const dynamics = driver.dynamics, m = channels.length;
  for (let c = 0; c < m; c++) {
    const i = channels[c]!, axis = dynamics.axis(i), pivot = dynamics.pivot(i);
    const d0 = point.x - pivot[0], d1 = point.y - pivot[1], d2 = point.z - pivot[2];
    out[c] = axis[0]; out[m + c] = axis[1]; out[2 * m + c] = axis[2];
    out[3 * m + c] = axis[1] * d2 - axis[2] * d1;
    out[4 * m + c] = axis[2] * d0 - axis[0] * d2;
    out[5 * m + c] = axis[0] * d1 - axis[1] * d0;
  }
  return out;
}

/**
 * The `x` of `rows x = y` nearest `toward`, with `ahead`'s entries held (`fixedSolve`): `toward`,
 * and the least motion that gives the task what `toward` leaves of it. A posture asked so is a
 * task beneath the point's, in its null space (Siciliano and Slotine 1991). `rows` is `q` by `m`.
 */
function nearSolveTo(solve: LimbSolve, rows: Float64Array, y: Float64Array, q: number, m: number, ahead: readonly number[], toward: readonly number[], x: Float64Array): void {
  const left = solve.column;
  for (let r = 0; r < q; r++) {
    let sum = y[r]!;
    for (let k = 0; k < m; k++) if (Number.isNaN(ahead[k]!)) sum = sum - rows[r * m + k]! * toward[k]!;
    left[r] = sum;
  }
  fixedSolveTo(solve.fixed, rows, left, q, m, ahead, LEG_DAMPING, x);
  for (let k = 0; k < m; k++) if (Number.isNaN(ahead[k]!)) x[k] = x[k]! + toward[k]!;
}

/** The rows `asked` of `from` (6 by `width`), into `out` (the rows asked by `width`): each the sum of its weighted rows, in the order written. */
function keepRows(asked: readonly Row[], from: Float64Array, width: number, out: Float64Array): void {
  for (let a = 0; a < asked.length; a++) {
    const row = asked[a]!;
    for (let c = 0; c < width; c++) {
      let sum = row[0]![1] * from[row[0]![0] * width + c]!;
      for (let k = 1; k < row.length; k++) sum += row[k]![1] * from[row[k]![0] * width + c]!;
      out[a * width + c] = sum;
    }
  }
}

/**
 * `limb` solved for its task at its point (`LimbWork.at`), into its solve's `y0` and `Y`; `p0` is
 * the root's centre, and `asked` every freedom's acceleration as the servo asks it, which the
 * limb's stem moves at.
 */
function solveLimb(b: Bearing, index: number, muscles: MuscleDriver, p0: readonly [number, number, number], asked: Float64Array): void {
  const limb = b.limbs[index]!, solve = b.scratch.solves[index]!;
  const { task, work } = limb, { at, ahead } = work, { lin, ang } = b.scratch, channels = limb.memory.channels, m = channels.length;
  const { J, B, k0 } = solve;
  jacobianTo(channels, at, muscles, J);
  muscles.dynamics.driftToRef(limb.segment, at, lin, ang);
  const r0 = at.x - p0[0], r1 = at.y - p0[1], r2 = at.z - p0[2];
  k0[0] = task.angular.x - ang.x; k0[1] = task.angular.y - ang.y; k0[2] = task.angular.z - ang.z;
  k0[3] = task.linear.x - lin.x; k0[4] = task.linear.y - lin.y; k0[5] = task.linear.z - lin.z;
  if (limb.stem.length) {
    // What the stem's motion gives the point is known, and comes off what the chain is asked.
    const S = jacobianTo(limb.stem, at, muscles, solve.S), stem = b.scratch.stems[index]!, s = limb.stem.length;
    for (let c = 0; c < s; c++) {
      stem[c] = asked[limb.stem[c]!]!;
      for (let row = 0; row < 6; row++) k0[row] = k0[row]! - S[row * s + c]! * stem[c]!;
    }
  }
  // B a_root: the point's motion from the root's, its spin and a + alpha x r; (alpha x r)_i = -[r]x alpha.
  B.fill(0);
  for (let i = 0; i < 6; i++) B[i * 6 + i] = 1;
  B[3 * 6 + 1] = r2; B[3 * 6 + 2] = -r1;
  B[4 * 6 + 0] = -r2; B[4 * 6 + 2] = r0;
  B[5 * 6 + 0] = r1; B[5 * 6 + 1] = -r0;
  let rows = J, y = k0, Bs = B, q = 6;
  if (work.rows) {
    q = work.rows.length;
    keepRows(work.rows, J, m, solve.rowsJ);
    keepRows(work.rows, B, 6, solve.rowsB);
    keepRows(work.rows, k0, 1, solve.rowsK);
    rows = solve.rowsJ; Bs = solve.rowsB; y = solve.rowsK;
  }
  const { y0, Y, still, column, x } = solve;
  if (work.toward) nearSolveTo(solve, rows, y, q, m, ahead, work.toward, y0);
  else fixedSolveTo(solve.fixed, rows, y, q, m, ahead, LEG_DAMPING, y0);
  for (let k = 0; k < m; k++) still[k] = Number.isNaN(ahead[k]!) ? NaN : 0;
  for (let c = 0; c < 6; c++) {
    for (let r = 0; r < q; r++) column[r] = Bs[r * 6 + c]!;
    fixedSolveTo(solve.fixed, rows, column, q, m, still, LEG_DAMPING, x);
    for (let k = 0; k < m; k++) Y[k * 6 + c] = x[k]!;
  }
}

/**
 * The root's rows as the root accelerates, into the scratch's `P` and `w0`: W = P a_root + w0, the
 * wrench the ground gives about the root's centre, with the driven limbs' freedoms moving as their
 * tasks have them. The body's other freedoms are the caller's to add.
 */
function rootRows(b: Bearing, R: BodyDynamics["root"]): void {
  const { P, w0, solves } = b.scratch;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) P[r * 6 + c] = R.mass[r]![c]!;
  for (let r = 0; r < 6; r++) w0[r] = R.bias[r]! - R.gravity[r]!;
  for (let l = 0; l < b.limbs.length; l++) {
    const limb = b.limbs[l]!;
    if (!limb.task.on) continue;
    const { y0, Y } = solves[l]!, channels = limb.memory.channels;
    for (let k = 0; k < channels.length; k++) {
      const i = channels[k]!;
      for (let r = 0; r < 6; r++) {
        const C = R.coupling[r]![i]!;
        w0[r] = w0[r]! + C * y0[k]!;
        for (let c = 0; c < 6; c++) P[r * 6 + c] = P[r * 6 + c]! - C * Y[k * 6 + c]!;
      }
    }
  }
}

/**
 * The freedoms held at a torque (`ServoWork.fixed` outside the limbs: a strike's pushes) move as
 * that torque moves them, and the root's acceleration changes how: from M_FF q''_F = torque_F -
 * bias_F + gravity_F - C_F' a_root - M_F,rest q''_rest, q''_F = z0 + Z a_root. Taken as at
 * rest, a strike's arm and trunk would be carried by a ground that gave the whole body their
 * momentum.
 *
 * Found here, kept in the caller's `held`, and added to the root's rows (the scratch's `P` and
 * `w0`). `inLimb` marks the driven limbs' freedoms. Few steps hold one, and this reads as it is
 * written.
 */
function heldFreedoms(b: Bearing, inLimb: Uint8Array, dynamics: BodyDynamics, work: ServoWork): void {
  const { held } = b, { P, w0, solves } = b.scratch, R = dynamics.root, n = inLimb.length;
  const { mass, gravity: weight, bias } = dynamics;
  const F: number[] = [];
  for (let i = 0; i < n; i++) if (work.fixed[i] && !inLimb[i]) F.push(i);
  held.channels = F;
  if (F.length) {
    const limbOf = new Map<number, { y0: number; Y: Float64Array; at: number }>();
    b.limbs.forEach((limb, l) => {
      if (!limb.task.on) return;
      const { y0, Y } = solves[l]!;
      limb.memory.channels.forEach((i, k) => limbOf.set(i, { y0: y0[k]!, Y, at: k * 6 }));
    });
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
      for (const [j, own] of limbOf) t += mass[i]![j]! * own.Y[own.at + c]!;
      return t;
    })));
    held.Z = F.map((_, k) => columns.map((column) => column[k]!));
    F.forEach((i, k) => {
      for (let r = 0; r < 6; r++) {
        const C = R.coupling[r]![i]!;
        w0[r] = w0[r]! + C * held.z0[k]!;
        for (let c = 0; c < 6; c++) P[r * 6 + c] = P[r * 6 + c]! + C * held.Z[k]![c]!;
      }
    });
  }
}

/**
 * `aim` as the root's acceleration, into the caller's `root`: its angular acceleration, and its
 * centre's that gives the centre of mass its aim (the ground's force is M c'' less gravity's).
 */
function rootAim(b: Bearing, aim: { readonly spin: Vector3; readonly centre: Vector3 }, R: BodyDynamics["root"]): Float64Array {
  const a = aim.spin, root = b.root, { P, w0, P3, y3, x3, linear } = b.scratch;
  root[0] = a.x; root[1] = a.y; root[2] = a.z;
  for (let k = 0; k < 3; k++) {
    const r = 3 + k, centre = k === 0 ? aim.centre.x : k === 1 ? aim.centre.y : aim.centre.z;
    for (let c = 0; c < 3; c++) P3[k * 3 + c] = P[r * 6 + 3 + c]!;
    y3[k] = R.mass[3]![3]! * centre - R.gravity[r]! - w0[r]! - P[r * 6]! * a.x - P[r * 6 + 1]! * a.y - P[r * 6 + 2]! * a.z;
  }
  solveLinearTo(linear, P3, y3, 3, x3);
  root[3] = x3[0]!; root[4] = x3[1]!; root[5] = x3[2]!;
  return root;
}

/** The driven limbs that bear, in the limbs' order, into the scratch's `bearing`. */
function bearingLimbs(b: Bearing): Limb[] {
  const { bearing } = b.scratch;
  let count = 0;
  for (const limb of b.limbs) if (limb.task.on && limb.task.bearing) bearing[count++] = limb;
  bearing.length = count;
  return bearing;
}

/**
 * `bearing`'s patches' shares of `force` and `moment` about `at` (`shareGroundWrench`), into the
 * scratch's `shares` and `missed`, weighing what they ask of the muscles where `effort` says it.
 */
function shareAmong(b: Bearing, bearing: readonly Limb[], at: Vector3, force: Vector3, moment: Vector3, lever: number, effort?: ShareEffort): void {
  const { wrench, patches, parts, shares, missed } = b.scratch;
  for (let k = 0; k < bearing.length; k++) { patches[k] = bearing[k]!.work.patch!; parts[k] = bearing[k]!.work.share; }
  patches.length = bearing.length;
  parts.length = bearing.length;
  shareGroundWrench(wrench, patches, at, force, moment, GROUND_FRICTION, lever, shares, missed, parts, effort);
}

/**
 * What `bearing`'s shares ask of the muscles that carry them, into the scratch's `effort`: a row
 * for each freedom of their chains and stems, its torque for the body's motion (`b.root`,
 * `accel`) less the ground's wrench on each bearing limb it carries (`limbTorques`' rule), over
 * its strength (the two sides' geometric mean), times the body's weight: a freedom asked its
 * strength weighs as the body's weight borne on a patch does. A freedom with no strength either
 * way has no row.
 */
function weighEffort(b: Bearing, muscles: MuscleDriver, accel: Float64Array, bearing: readonly Limb[]): ShareEffort {
  const effort = b.scratch.effort!, n = muscles.channels.length;
  if (b.scratch.rowed.length !== n) b.scratch.rowed = new Uint8Array(n);
  const rowed = b.scratch.rowed.fill(0);
  effort.count = 0;
  for (const limb of bearing) {
    for (const i of limb.memory.channels) effortRow(b, muscles, accel, bearing, rowed, i);
    for (const i of limb.stem) effortRow(b, muscles, accel, bearing, rowed, i);
  }
  return effort;
}

/** Freedom `i`'s row of `weighEffort`, the next of the scratch's `effort`, unless `rowed` has it or it has no strength. */
function effortRow(b: Bearing, muscles: MuscleDriver, accel: Float64Array, bearing: readonly Limb[], rowed: Uint8Array, i: number): void {
  if (rowed[i]) return;
  rowed[i] = 1;
  const strong = Math.sqrt(muscles.strength(i, 1) * muscles.strength(i, -1));
  if (!(strong > 0)) return;
  const effort = b.scratch.effort!, { C, t0 } = effort, dynamics = muscles.dynamics, width = 6 * bearing.length;
  const g = dynamics.root.gravity, weight = Math.sqrt(g[3]! * g[3]! + g[4]! * g[4]! + g[5]! * g[5]!);
  const k = weight / strong, r = effort.count++, axis = dynamics.axis(i), pivot = dynamics.pivot(i);
  t0[r] = k * inverseTorque(dynamics, b.root, accel, muscles.channels.length, i);
  for (let s = 0; s < bearing.length; s++) {
    const limb = bearing[s]!, at = r * width + 6 * s;
    if (!limb.memory.channels.includes(i) && !limb.stem.includes(i)) {
      C.fill(0, at, at + 6);
      continue;
    }
    // The wrench's carry along the freedom (`carried`): (axis x (x - pivot)) . force + axis . moment.
    const x = limb.work.at, d0 = x.x - pivot[0], d1 = x.y - pivot[1], d2 = x.z - pivot[2];
    C[at] = k * (axis[1] * d2 - axis[2] * d1);
    C[at + 1] = k * (axis[2] * d0 - axis[0] * d2);
    C[at + 2] = k * (axis[0] * d1 - axis[1] * d0);
    C[at + 3] = k * axis[0];
    C[at + 4] = k * axis[1];
    C[at + 5] = k * axis[2];
  }
}

/**
 * What the bearing limbs' patches can give of the wrench the root's acceleration asks; where they
 * cannot give it all, the root's acceleration is the one the wrench they can give makes, with what
 * the assist gives of the rest.
 */
function limitToPatches(b: Bearing, p0: readonly [number, number, number], lever: number): void {
  const { assist, root, shortfall, helped } = b, { at, force, moment, missed, P, w0, W, given } = b.scratch;
  const bearing = bearingLimbs(b);
  for (let r = 0; r < 6; r++) {
    let sum = 0;
    for (let c = 0; c < 6; c++) sum = sum + P[r * 6 + c]! * root[c]!;
    W[r] = w0[r]! + sum;
  }
  if (bearing.length) {
    force.set(W[3]!, W[4]!, W[5]!);
    moment.set(W[0]!, W[1]!, W[2]!);
    shareAmong(b, bearing, at.set(p0[0], p0[1], p0[2]), force, moment, lever);
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
      given[0] = W[0]! + missed.moment.x - w0[0]!; given[1] = W[1]! + missed.moment.y - w0[1]!; given[2] = W[2]! + missed.moment.z - w0[2]!;
      given[3] = W[3]! + missed.force.x - w0[3]!; given[4] = W[4]! + missed.force.y - w0[4]!; given[5] = W[5]! + missed.force.z - w0[5]!;
      solveLinearTo(b.scratch.linear, P, given, 6, root);
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
  const dynamics = muscles.dynamics, R = dynamics.root, p0 = R.centre, n = muscles.channels.length, { scratch } = b;
  if (scratch.inLimb.length !== n) scratch.inLimb = new Uint8Array(n);
  const inLimb = scratch.inLimb.fill(0);
  for (let l = 0; l < b.limbs.length; l++) {
    const limb = b.limbs[l]!;
    if (!limb.task.on) continue;
    solveLimb(b, l, muscles, p0, work.accel);
    for (const i of limb.memory.channels) inLimb[i] = 1;
  }
  // The root's rows, W = P a_root + w0: the limbs' freedoms as their tasks have them, those held
  // at a torque as it moves them, and the rest at the servo's asks.
  rootRows(b, R);
  heldFreedoms(b, inLimb, dynamics, work);
  const { w0 } = scratch;
  for (let i = 0; i < n; i++) if (!inLimb[i] && !(work.fixed[i])) for (let r = 0; r < 6; r++) w0[r] = w0[r]! + R.coupling[r]![i]! * work.accel[i]!;
  const root = rootAim(b, aim, R);
  limitToPatches(b, p0, lever);
  for (let l = 0; l < b.limbs.length; l++) {
    const { task } = b.limbs[l]!, { y0, Y } = scratch.solves[l]!;
    if (!task.on) continue;
    for (let k = 0; k < b.limbs[l]!.memory.channels.length; k++) {
      let sum = 0;
      for (let c = 0; c < 6; c++) sum = sum + Y[k * 6 + c]! * root[c]!;
      task.accel[k] = y0[k]! - sum;
    }
  }
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
function boundFree(limb: Limb, solve: LimbSolve, muscles: MuscleDriver, accel: Float64Array, root: Float64Array): void {
  const { task } = limb, dynamics = muscles.dynamics, R = dynamics.root, n = muscles.channels.length;
  const { mass, gravity: weight, bias } = dynamics;
  const channels = limb.memory.channels, m = channels.length;
  const { rest: still, M, asked, lo, hi } = solve;
  // Each freedom's torque with the limb's own accelerations at zero, and the limb's mass matrix.
  for (let a = 0; a < m; a++) {
    const i = channels[a]!;
    let torque = bias[i]! - weight[i]!;
    for (let r = 0; r < 6; r++) torque += R.coupling[r]![i]! * root[r]!;
    for (let j = 0; j < n; j++) if (!channels.includes(j)) torque += mass[i]![j]! * accel[j]!;
    still[a] = torque;
  }
  for (let a = 0; a < m; a++) for (let c = 0; c < m; c++) M[a * m + c] = mass[channels[a]!]![channels[c]!]!;
  let within = true;
  for (let a = 0; a < m; a++) {
    let sum = 0;
    for (let c = 0; c < m; c++) sum = sum + M[a * m + c]! * task.accel[c]!;
    asked[a] = still[a]! + sum;
    lo[a] = -muscles.strength(channels[a]!, -1);
    hi[a] = muscles.strength(channels[a]!, 1);
  }
  for (let a = 0; a < m; a++) if (!(asked[a]! >= lo[a]! && asked[a]! <= hi[a]!)) { within = false; break; }
  if (within) return;
  // The limb's task missed, weighed: its point's acceleration, and its segment's turn's at its
  // reach, for a torque's miss through M^-1 (`inverse` by columns: column c at c m).
  const { J, inverse, unit, x, G, A, torque } = solve;
  jacobianTo(channels, limb.work.at, muscles, J);
  for (let c = 0; c < m; c++) {
    for (let r = 0; r < m; r++) unit[r] = r === c ? 1 : 0;
    solveLinearTo(solve.linear, M, unit, m, x);
    for (let r = 0; r < m; r++) inverse[c * m + r] = x[r]!;
  }
  for (let r = 0; r < 6; r++) for (let a = 0; a < m; a++) {
    let sum = 0;
    for (let c = 0; c < m; c++) sum = sum + J[r * m + c]! * inverse[a * m + c]!;
    G[r * m + a] = sum * (r < 3 ? limb.reach : 1);
  }
  for (let a = 0; a < m; a++) for (let c = 0; c < m; c++) {
    let sum = 0;
    for (let r = 0; r < 6; r++) sum = sum + G[r * m + a]! * G[r * m + c]!;
    A[a * m + c] = sum;
  }
  boundedLeastSquaresTo(solve.bounded, A, asked, lo, hi, m, torque);
  for (let a = 0; a < m; a++) {
    let sum = 0;
    for (let c = 0; c < m; c++) sum = sum + inverse[c * m + a]! * (torque[c]! - still[c]!);
    accel[channels[a]!] = sum;
    task.accel[a] = accel[channels[a]!]!;
  }
}

/**
 * The wrench the ground must give, about the root's centre, into `W`: what the whole body's motion
 * asks of the root's rows, less gravity's. `n` is the count of freedoms.
 */
function groundWrenchTo(R: BodyDynamics["root"], root: Float64Array, accel: Float64Array, n: number, W: Float64Array): Float64Array {
  for (let r = 0; r < 6; r++) {
    let sum = R.bias[r]! - R.gravity[r]!;
    for (let c = 0; c < 6; c++) sum += R.mass[r]![c]! * root[c]!;
    for (let i = 0; i < n; i++) sum += R.coupling[r]![i]! * accel[i]!;
    W[r] = sum;
  }
  return W;
}

/** Freedom `i`'s torque for the body's motion (`root`, `accel`), the ground giving it nothing. */
function inverseTorque(dynamics: BodyDynamics, root: Float64Array, accel: Float64Array, n: number, i: number): number {
  const R = dynamics.root;
  let torque = dynamics.bias[i]! - dynamics.gravity[i]!;
  for (let r = 0; r < 6; r++) torque += R.coupling[r]![i]! * root[r]!;
  for (let j = 0; j < n; j++) torque += dynamics.mass[i]![j]! * accel[j]!;
  return torque;
}

/** The ground's wrench on `limb` (`share`, at its point), carried along freedom `i`'s motion. */
function carried(dynamics: BodyDynamics, i: number, limb: Limb, share: { readonly force: Vector3; readonly moment: Vector3 }): number {
  const m = dynamics.axis(i), p = dynamics.pivot(i), x = limb.work.at;
  const d0 = x.x - p[0], d1 = x.y - p[1], d2 = x.z - p[2];
  const s0 = m[1] * d2 - m[2] * d1, s1 = m[2] * d0 - m[0] * d2, s2 = m[0] * d1 - m[1] * d0;
  return m[0] * share.moment.x + m[1] * share.moment.y + m[2] * share.moment.z
    + s0 * share.force.x + s1 * share.force.y + s2 * share.force.z;
}

/** Freedom `i` given `torque` as a torque source. */
function give(muscles: MuscleDriver, i: number, torque: number): void {
  const sense = torque >= 0 ? 1 : -1, strength = muscles.strength(i, sense);
  muscles.velocity[i] = sense * Infinity;
  muscles.activation[i] = strength > 0 ? Math.min(1, Math.abs(torque) / strength) : 0;
}

/**
 * Each driven limb's freedoms' torques, given to the muscles as torque sources: its inverse dynamics
 * at `accel` and the root's acceleration, less, for a bearing limb, the ground's wrench on it (its
 * patch's share, in `bearing`'s order), carried from its point. A stem's freedoms' likewise, less
 * the share of every bearing limb that hangs from them.
 */
function limbTorques(b: Bearing, muscles: MuscleDriver, accel: Float64Array, bearing: readonly Limb[]): void {
  const { root, limbs } = b, { shares } = b.scratch;
  const dynamics = muscles.dynamics, n = muscles.channels.length;
  let bearingAt = 0;
  for (const limb of limbs) {
    const { task } = limb;
    if (!task.on) continue;
    const share = task.bearing ? shares[bearingAt++]! : null;
    for (const i of limb.memory.channels) {
      let torque = inverseTorque(dynamics, root, accel, n, i);
      if (share) torque -= carried(dynamics, i, limb, share);
      give(muscles, i, torque);
    }
  }
  // Each stem's freedom once, where a driven limb first names it.
  for (let l = 0; l < limbs.length; l++) {
    if (!limbs[l]!.task.on) continue;
    for (const i of limbs[l]!.stem) {
      if (stemmedBefore(limbs, l, i)) continue;
      let torque = inverseTorque(dynamics, root, accel, n, i);
      for (let k = 0; k < bearing.length; k++) if (bearing[k]!.stem.includes(i)) torque -= carried(dynamics, i, bearing[k]!, shares[k]!);
      give(muscles, i, torque);
    }
  }
}

/** Whether a driven limb before the `l`-th of `limbs` hangs from freedom `i`. */
function stemmedBefore(limbs: readonly Limb[], l: number, i: number): boolean {
  for (let k = 0; k < l; k++) if (limbs[k]!.task.on && limbs[k]!.stem.includes(i)) return true;
  return false;
}

/**
 * The driven limbs' torques, given to their muscles as torque sources, once the servo has solved
 * the rest of the body around the root: each limb's inverse dynamics, less, where it bears, its
 * patch's share of the ground's wrench. `bounded` keeps a free limb within its muscles' strength
 * (`boundFree`).
 */
export function bearLimbs(b: Bearing, muscles: MuscleDriver, work: ServoWork, lever: number, bounded: boolean): void {
  const { assist, limbs, held, helped, root } = b, { at, force, moment, W, solves } = b.scratch;
  const R = muscles.dynamics.root, n = muscles.channels.length;
  // Every freedom's acceleration: the limbs' from their tasks, the rest as the servo left them:
  // a stem's as it was asked (`limbMotion` marks it moved), the others' as solved.
  const accel = work.accel;
  for (const limb of limbs) {
    if (!limb.task.on) continue;
    const channels = limb.memory.channels;
    for (let k = 0; k < channels.length; k++) accel[channels[k]!] = limb.task.accel[k]!;
  }
  // The freedoms held at a torque, as the plan has them move at this root.
  for (let k = 0; k < held.channels.length; k++) {
    const Z = held.Z[k]!;
    let sum = 0;
    for (let c = 0; c < 6; c++) sum = sum + Z[c]! * root[c]!;
    accel[held.channels[k]!] = held.z0[k]! + sum;
  }
  for (let l = 0; l < limbs.length; l++) {
    const limb = limbs[l]!;
    if (bounded && limb.task.on && !limb.task.bearing) boundFree(limb, solves[l]!, muscles, accel, root);
  }
  // The ground's wrench for it all, and each bearing patch's share of it.
  groundWrenchTo(R, root, accel, n, W);
  const bearing = bearingLimbs(b);
  if (bearing.length) {
    force.set(W[3]!, W[4]!, W[5]!);
    moment.set(W[0]!, W[1]!, W[2]!);
    // The ground is asked for the wrench less what the assist gives.
    if (assist?.on) { force.subtractInPlace(helped.force); moment.subtractInPlace(helped.moment); }
    at.set(R.centre[0], R.centre[1], R.centre[2]);
    shareAmong(b, bearing, at, force, moment, lever, b.scratch.effort ? weighEffort(b, muscles, accel, bearing) : undefined);
  }
  limbTorques(b, muscles, accel, bearing);
  if (assist?.on) assist.ask(helped.force, helped.moment);
}
