/**
 * **The whole-body solve**: one body's accelerations, every freedom's and its root's, that give
 * what it is asked, as nearly as its muscles, its assist and the ground can give them, and the
 * torques that make them, given to the muscles as torque sources. It is the bearing solve
 * (`bearing.ts`) and the servo's solve (`servo.ts`) in one problem: every ask is a row of one
 * weighted least-squares problem in the accelerations x = (a_root, u'),
 *
 *     minimize sum_r w_r (A_r x - y_r)^2 + d |x|^2
 *
 * whose rows are the root's spin's aim and the centre of mass's, each driven limb's point's motion
 * (`Limb`, as the stance asks it: its sole held still, its swinging foot on its path, a freedom
 * asked ahead of the task; as a strike asks it, a hand's point driven), a limb's freedoms drawn
 * beneath its task toward what they are asked (`LimbWork.toward`) and a pushed freedom's torque;
 * `d` is a small damping that keeps a straight knee from asking for unbounded accelerations. The
 * unknowns are the root's six and the freedoms a limb moves or a push holds; every other freedom
 * moves as the servo's posture asks it (`ServoWork`), known, as the bearing solve takes the
 * servo's. A limb's stem is among the unknowns while it bears, its freedoms carrying the patch's
 * share of the ground's wrench; a limb that does not bear (a hand driven from the trunk) is moved
 * on its stem as the posture moves it. The bounds:
 *
 * - **The ground.** The wrench the root's rows ask for the motion found is shared among the bearing
 *   limbs' patches within their contact wrench cones (`shareGroundWrench`); what they cannot give
 *   is the shortfall.
 * - **The assist.** It is asked for the shortfall, within its ceiling (`Assist.clipToRef`): the
 *   muscles and the ground are spent before it. What the two cannot give together, the root's rows
 *   are then held to, and the body solved again around what the ground gives.
 * - **The muscles.** Each freedom's torque is its inverse dynamics at the motion found, less the
 *   ground's wrench carried through it from each patch it bears (`carried`); one past its strength
 *   is pinned there as a row of its own and the rest solved again around it, as the servo does, up
 *   to `PASSES` times. A bearing limb's is given at its strength and not pinned, as the bearing
 *   solve gives it: a row holding its torque would conflict with the rows holding its foot and the
 *   root, and the foot would go.
 * - **The ranges.** A freedom a limb moves that stands at a stop of its range and is found
 *   accelerating into it is held there, its acceleration known and none, and the rest solved again
 *   around it: the stop refuses the motion, and a solve that counts on it misses its task by what
 *   the freedom would have given (an ankle on its dorsiflexion stop, asked to lift a swinging
 *   sole's middle, leaves the sole low and its toes catch the ground short of the landing).
 *
 * It works in arrays made with the solve (`makeWholeBody`), sized from the body and its limbs; a
 * call writes every entry it reads, and keeps nothing: a sole's torque lag is the limb's own
 * (`LimbTask.given`, `soleTorque`).
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { MuscleDriver } from "../muscle/driver.ts";
import type { Assist } from "./assist.ts";
import { bearsNow, carried, give, jacobianTo, keepRows, soleTorque, type Limb, type Row } from "./bearing.ts";
import { groundWrenchWork, patchPlace, shareGroundWrench, type GroundWrenchWork, type Patch } from "./contact-wrench.ts";
import type { ServoWork } from "./servo.ts";
import { GROUND_FRICTION } from "./support.ts";
import { linearWork, solveLinearTo, type LinearWork } from "../math/flat.ts";

/**
 * **What the solve is asked for a step**, and where it leaves what it finds, each its caller's own
 * record (the stance's, `StanceControl.ask`): the root's aims, the limbs with their tasks, and the
 * lever a missed moment is weighed against a missed force at; then the root's acceleration found,
 * what the assist is asked, what the ground could not give, and each limb's share of the ground's
 * wrench, in the limbs' order.
 */
export interface WholeBodyAsk {
  readonly aim: { readonly spin: Vector3; readonly centre: Vector3 };
  readonly limbs: readonly Limb[];
  lever: number;
  readonly root: Float64Array;
  readonly helped: { readonly force: Vector3; readonly moment: Vector3 };
  readonly shortfall: { readonly force: Vector3; readonly moment: Vector3 };
  readonly asked: readonly { readonly at: Vector3; readonly force: Vector3; readonly moment: Vector3 }[];
}

/** **What the solve works in**: each value is written by a call before that call reads it. */
interface WholeBody {
  /** The freedoms, and the unknowns: six for the root, then one a freedom. */
  readonly count: number;
  readonly size: number;
  /** The rows it has room for, each `size` wide, their targets and weights. */
  readonly capacity: number;
  readonly A: Float64Array;
  readonly y: Float64Array;
  readonly w: Float64Array;
  /** By column: the acceleration known of it, or NaN for an unknown's; the unknowns' columns; and the accelerations found, every column's. */
  readonly known: Float64Array;
  readonly unknown: Int32Array;
  readonly x: Float64Array;
  /** The problem's Hessian over the unknowns, its Cholesky factor, its gradient, a triangular solve's answer and the unknowns found. */
  readonly H: Float64Array;
  readonly L: Float64Array;
  readonly g: Float64Array;
  readonly z: Float64Array;
  readonly xs: Float64Array;
  /**
   * By freedom: whether a driven limb moves it, whether a bearing one does, whether a driven point's
   * limb does (`pinFree`), whether it is held at a stop, the torque it is pinned at (NaN, none), the
   * ground's wrench carried through it, and its torque.
   */
  readonly inLimb: Uint8Array;
  readonly free: Uint8Array;
  readonly carries: Uint8Array;
  readonly stopped: Uint8Array;
  readonly pinned: Float64Array;
  readonly contact: Float64Array;
  readonly torque: Float64Array;
  /** The wrench the root's rows ask of the ground, and the one they are held to. */
  readonly W: Float64Array;
  readonly given: Float64Array;
  /** The root's block of the mass matrix (6 by 6), the wrench missed, the root's motion it changes as the body moves rigidly, and a solve's work. */
  readonly rigid: Float64Array;
  readonly lost: Float64Array;
  readonly turn: Float64Array;
  readonly linear: LinearWork;
  /** A limb's Jacobian at its point (6 by its chain), its stem's, the root's B, the point's asked motion less its drift, and the rows of each the task keeps. */
  readonly J: Float64Array;
  readonly S: Float64Array;
  readonly B: Float64Array;
  readonly k0: Float64Array;
  readonly rowsJ: Float64Array;
  readonly rowsS: Float64Array;
  readonly rowsB: Float64Array;
  readonly rowsK: Float64Array;
  /** The share of the ground's wrench: the bearing limbs, their patches and parts, their shares and the miss. */
  readonly wrench: GroundWrenchWork;
  readonly bearing: Limb[];
  readonly patches: Patch[];
  readonly parts: number[];
  readonly shares: { readonly force: Vector3; readonly moment: Vector3 }[];
  readonly missed: { readonly force: Vector3; readonly moment: Vector3 };
  readonly at: Vector3;
  readonly force: Vector3;
  readonly moment: Vector3;
  readonly lin: Vector3;
  readonly ang: Vector3;
}

/** The solve of a body of `count` freedoms driven through up to `limbs` limbs that may bear and `free` more that never do. */
export function makeWholeBody(count: number, limbs: number, free = 0): WholeBody {
  const size = 6 + count, f = (n: number) => new Float64Array(n);
  // Six root aims, six a limb and one ahead and one toward a freedom of it, a torque row a pushed
  // freedom, six root rows held, and a pinned row a freedom.
  const capacity = 6 + 8 * (limbs + free) * count + count + 6 + count;
  return {
    count, size, capacity, A: f(capacity * size), y: f(capacity), w: f(capacity),
    known: f(size), unknown: new Int32Array(size), x: f(size), H: f(size * size), L: f(size * size), g: f(size), z: f(size), xs: f(size),
    inLimb: new Uint8Array(count), free: new Uint8Array(count), carries: new Uint8Array(count), stopped: new Uint8Array(count), pinned: f(count), contact: f(count), torque: f(count), W: f(6), given: f(6), rigid: f(36), lost: f(6), turn: f(6), linear: linearWork(6),
    J: f(6 * count), S: f(6 * count), B: f(36), k0: f(6), rowsJ: f(6 * count), rowsS: f(6 * count), rowsB: f(36), rowsK: f(6),
    wrench: groundWrenchWork(limbs, 0), bearing: [], patches: [], parts: [],
    shares: Array.from({ length: limbs }, () => ({ force: new Vector3(), moment: new Vector3() })),
    missed: { force: new Vector3(), moment: new Vector3() },
    at: new Vector3(), force: new Vector3(), moment: new Vector3(), lin: new Vector3(), ang: new Vector3(),
  };
}

/**
 * The rows' weights, each a miss's cost per unit squared, ranked as the bearing solve and the
 * servo rank them. The root's aims (its spin's and the centre of mass's), the root held to a
 * wrench (in the body's weight) and a freedom asked ahead of its limb's task are what those give
 * exactly: one weight, well above a limb's point's motion (m/s^2 and rad/s^2), which the bearing
 * solve gives by least squares in the limb's own freedoms beneath them. A torque held (in its
 * strength: a push's, or a freedom's pinned at its strength) is not an ask but what the muscle
 * will give, so it ranks above everything: a solve that bends it plans the rest of the body against
 * a torque that never comes (a strike's chamber, its trunk pinned and then planned 40 % past its
 * strength, turned the pelvis at twice the rate planned). Numeric settings, not anatomy; the
 * ranking was found on the Warrior's stand, shoves, walk and the assist reference's pulls against
 * the bearing solve.
 *
 * The root held to the wrench the ground gives aims its spin beneath every task (`spin`) at the
 * turn that wrench gives the body moving rigidly (`rigidTurn`): the body's momentum is then what
 * the ground gives, and of the motions that give it, where the limbs leave a choice, the one that
 * turns the root with the body. Without it the light root takes the whole of what is missed (a
 * chamber's trunk pinned at its strength rolled the pelvis 0.3 rad, and a guard's arms swung in a
 * walk); aimed at the spin first asked instead, a shove that turns the body fells it; at the feet's
 * weight or above, it bends a walk's swing to hold the root, and its stops fall (the stop battery
 * of `research/core-stance-sweep.mjs`, Node stand, Rapier, 120 Hz: 2 falls of 96 at this weight
 * and without it, 3 at 1e-5).
 *
 * A limb's freedoms drawn toward what they are asked (`toward`, rad/s^2) rank beneath its point's
 * motion: where its task leaves them free (a hand's point has three rows and its arm seven
 * freedoms), they go as the posture asks them, not by the least motion, which leaves an arm
 * swinging as it was.
 */
const WEIGHT = { foot: 1e-4, ahead: 1e-2, torque: 1e4, root: 1, aim: 1, spin: 1e-6, toward: 1e-6 };
/**
 * The damping on the accelerations, (rad/s^2)^-2, against a foot's weight: a straight knee is a
 * singular leg, and without it a root asked to rise over one asks the leg for unbounded
 * accelerations. A numeric setting, the bearing solve's (`LEG_DAMPING` squared) against the
 * foot's weight.
 */
const DAMPING = 4e-8;
/** How many times the body is solved again around what the ground gives and the muscles pinned at their strength. */
const PASSES = 4;
/** How many more it may be solved, a point driven, around its limb's freedoms pinned before the ground is asked (`pinFree`). */
const FREE_PASSES = 3;
/** No limb bearing: a torque read with no share of the ground's wrench. */
const NONE: readonly Limb[] = Object.freeze([]);
/**
 * How near a stop of its range a freedom stands at it, rad: a numeric setting, about the angle a
 * joint at its limit reads past or short of it.
 */
const STOP_NEAR = 5e-3;
/** A miss of the wrench below this, squared, N^2 and (N m)^2, is none. */
const MISSED = 1e-12;

/**
 * The step's solve: the body's accelerations for `ask`, around the posture `work` asks and the
 * torques it holds, within the ground's, the assist's and the muscles' bounds, and every freedom
 * no push holds given its torque. `assist` is asked for what the ground misses.
 */
export function solveBody(b: WholeBody, muscles: MuscleDriver, work: ServoWork, ask: WholeBodyAsk, assist: Assist | null): void {
  const dynamics = muscles.dynamics, R = dynamics.root, n = b.count, { inLimb, free, carries, pinned, known, x } = b;
  inLimb.fill(0);
  free.fill(0);
  carries.fill(0);
  let freed = false;
  for (const limb of ask.limbs) {
    if (!limb.task.on) continue;
    for (const i of limb.memory.channels) { inLimb[i] = 1; if (limb.task.bearing) carries[i] = 1; }
    if (limb.task.bearing) for (const i of limb.stem) { inLimb[i] = 1; carries[i] = 1; }
    if (!limb.task.bearing && limb.work.toward) {
      freed = true;
      for (const i of limb.memory.channels) free[i] = 1;
    }
  }
  pinned.fill(NaN);
  b.stopped.fill(0);
  // The unknowns: the root, and every freedom a limb moves or a push holds; the rest move as the
  // posture asks, known.
  known.fill(NaN, 0, 6);
  for (let i = 0; i < n; i++) known[6 + i] = inLimb[i] || work.fixed[i] ? NaN : work.accel[i]!;
  const base = baseRows(b, muscles, work, ask);
  const bearing = bearingLimbs(b, ask.limbs);
  // Nothing bearing (a run's flight), the ground gives no wrench and the root goes as gravity
  // and the limbs have it: its rows are held to none from the first pass.
  let held = bearing.length === 0, asked = false;
  b.given.fill(0);
  const passes = PASSES + (freed ? FREE_PASSES : 0);
  for (let pass = 0; pass < passes; pass++) {
    let rows = base;
    // The root held to a wrench: its rows stand in for the aims' (the first six), its spin's
    // aimed at the turn the wrench given makes (`rigidTurn`) beneath every task (`WEIGHT.spin`),
    // and with nothing bearing, nothing.
    for (let r = 0; r < 6; r++) b.w[r] = held ? (r < 3 && bearing.length ? WEIGHT.spin : 0) : WEIGHT.aim;
    if (held) rows = rootRows(b, rows, R, ask.lever);
    for (let i = 0; i < n; i++) if (!Number.isNaN(pinned[i]!)) { known[6 + i] = NaN; rows = torqueRow(b, rows, muscles, i, pinned[i]!, b.contact[i]!); }
    solveRows(b, rows);
    while (holdStops(b, muscles)) solveRows(b, rows);
    groundWrenchTo(b, R);
    const last = pass === passes - 1;
    if (!asked && freed && !last && pinFree(b, muscles, work)) continue;
    if (bearing.length) {
      // What the asks need of the ground is read once, from the body solved for them; a pass
      // around what the ground gives or a pinned torque shares only for the torques.
      if (!asked && !shortfall(b, bearing, R, ask, assist) && !last) {
        // The root is asked for the motion the ground and the assist give together.
        held = true; asked = true;
        const { force, moment } = b.missed, { W, given } = b;
        given[0] = W[0]! + moment.x; given[1] = W[1]! + moment.y; given[2] = W[2]! + moment.z;
        given[3] = W[3]! + force.x; given[4] = W[4]! + force.y; given[5] = W[5]! + force.z;
        rigidTurn(b, R, x);
        continue;
      }
      asked = true;
      // The ground is asked for the wrench less what the assist gives.
      b.force.set(b.W[3]! - ask.helped.force.x, b.W[4]! - ask.helped.force.y, b.W[5]! - ask.helped.force.z);
      b.moment.set(b.W[0]! - ask.helped.moment.x, b.W[1]! - ask.helped.moment.y, b.W[2]! - ask.helped.moment.z);
      shareAmong(b, bearing, R, ask.lever);
    } else {
      ask.shortfall.force.setAll(0); ask.shortfall.moment.setAll(0);
      ask.helped.force.setAll(0); ask.helped.moment.setAll(0);
    }
    torques(b, muscles, bearing);
    let clipped = false;
    for (let i = 0; i < n; i++) {
      if ((work.fixed[i] && !inLimb[i]) || !Number.isNaN(pinned[i]!) || b.carries[i] || b.stopped[i]) continue;
      const t = b.torque[i]!, sense = t >= 0 ? 1 : -1, strength = muscles.strength(i, sense);
      if (Math.abs(t) > strength) { pinned[i] = sense * strength; clipped = true; }
    }
    if (!clipped || last) break;
  }
  // The commands: every freedom but a pushed one, a bearing sole's leg's through its lag.
  for (let i = 0; i < n; i++) if (!(work.fixed[i] && !inLimb[i])) give(muscles, i, b.torque[i]!);
  for (let k = 0; k < ask.limbs.length; k++) {
    const limb = ask.limbs[k]!, { task } = limb, channels = limb.memory.channels, out = ask.asked[k]!;
    const share = bearsNow(limb) ? b.shares[b.bearing.indexOf(limb)]! : null;
    const sole = share !== null && limb.segment.spec.surface?.sole !== undefined;
    for (let c = 0; c < channels.length; c++) {
      const i = channels[c]!;
      task.accel[c] = x[6 + i]!;
      if (sole) give(muscles, i, soleTorque(task, c, b.torque[i]!));
    }
    if (!sole) task.given.fill(NaN);
    if (share) { out.at.copyFrom(patchPlace(limb.work.patch!)); out.force.copyFrom(share.force); out.moment.copyFrom(share.moment); }
    else { out.force.setAll(0); out.moment.setAll(0); }
  }
  for (let r = 0; r < 6; r++) ask.root[r] = x[r]!;
  for (let i = 0; i < n; i++) work.accel[i] = x[6 + i]!;
  if (assist?.on) assist.ask(ask.helped.force, ask.helped.moment);
}

/**
 * Each freedom a limb moves, not pinned, found accelerating into a stop of its range
 * that it stands at (`STOP_NEAR`), held there: its acceleration known, none (`stopped`). Whether
 * any was.
 */
function holdStops(b: WholeBody, muscles: MuscleDriver): boolean {
  const { inLimb, stopped, pinned, known, x } = b;
  let held = false;
  for (let i = 0; i < b.count; i++) {
    if (!inLimb[i] || stopped[i] || !Number.isNaN(pinned[i]!)) continue;
    const { min, max } = muscles.channels[i]!.dof.spec, angle = muscles.angle(i), a = x[6 + i]!;
    if ((a > 0 && angle >= max.value - STOP_NEAR) || (a < 0 && angle <= min.value + STOP_NEAR)) { stopped[i] = 1; known[6 + i] = 0; held = true; }
  }
  return held;
}

/**
 * Each freedom of a driven point's chain (`free`, which carries no share of the ground's wrench)
 * whose torque for the motion found is past its strength, pinned there, before the ground is asked
 * for the motion: a point asked more than the muscles give (a fist driven flat out) would otherwise
 * ask the ground for the wrench of a motion the arm never makes, and the root be held short of it.
 * Its stem is not pinned: a pinned freedom is an unknown, and a trunk of unknowns lets the root
 * spin to give the point what the arm does not. Whether any was.
 */
function pinFree(b: WholeBody, muscles: MuscleDriver, work: ServoWork): boolean {
  const { free, inLimb, pinned, stopped, torque } = b;
  torques(b, muscles, NONE);
  let clipped = false;
  for (let i = 0; i < b.count; i++) {
    if (!free[i] || (work.fixed[i] && !inLimb[i]) || !Number.isNaN(pinned[i]!) || stopped[i]) continue;
    const t = torque[i]!, sense = t >= 0 ? 1 : -1, strength = muscles.strength(i, sense);
    if (Math.abs(t) > strength) { pinned[i] = sense * strength; clipped = true; }
  }
  return clipped;
}

/** The driven limbs that bear, in the limbs' order, into the scratch's `bearing`. */
function bearingLimbs(b: WholeBody, limbs: readonly Limb[]): Limb[] {
  const { bearing } = b;
  let count = 0;
  for (const limb of limbs) if (bearsNow(limb)) bearing[count++] = limb;
  bearing.length = count;
  return bearing;
}

/** Row `r` of `A` zeroed, with target `y` and weight `w`: the next row to write. */
function openRow(b: WholeBody, r: number, y: number, w: number): number {
  if (r >= b.capacity) throw new Error(`a solve of more than ${b.capacity} rows`);
  b.A.fill(0, r * b.size, (r + 1) * b.size);
  b.y[r] = y;
  b.w[r] = w;
  return r * b.size;
}

/**
 * The rows every pass solves, from the first: the root's aims, the limbs' tasks and the pushed
 * freedoms' torques. Returns how many.
 */
function baseRows(b: WholeBody, muscles: MuscleDriver, work: ServoWork, ask: WholeBodyAsk): number {
  const dynamics = muscles.dynamics, R = dynamics.root, n = b.count, { A, inLimb } = b;
  let rows = 0;
  // The root's spin, and the centre of mass: the root's linear rows are the whole body's momentum's,
  // M c'' = root.mass a_root + coupling u' + root.bias.
  const { spin, centre } = ask.aim, mass = R.mass[3]![3]!;
  for (let k = 0; k < 3; k++) {
    const at = openRow(b, rows++, k === 0 ? spin.x : k === 1 ? spin.y : spin.z, WEIGHT.aim);
    A[at + k] = 1;
  }
  for (let k = 0; k < 3; k++) {
    const aim = k === 0 ? centre.x : k === 1 ? centre.y : centre.z, r = 3 + k;
    const at = openRow(b, rows++, aim - R.bias[r]! / mass, WEIGHT.aim);
    for (let c = 0; c < 6; c++) A[at + c] = R.mass[r]![c]! / mass;
    const coupling = R.coupling[r]!;
    for (let i = 0; i < n; i++) A[at + 6 + i] = coupling[i]! / mass;
  }
  for (const limb of ask.limbs) if (limb.task.on) rows = limbRows(b, rows, muscles, R, limb);
  // A pushed freedom's torque, the ground giving it nothing (no limb carries it); the rest of the
  // body is the posture's, known.
  for (let i = 0; i < n; i++) if (!inLimb[i] && work.fixed[i]) rows = torqueRow(b, rows, muscles, i, work.torque[i]!, 0);
  return rows;
}

/**
 * `limb`'s task's rows: its point's motion, B a_root + S u'_stem + J u'_chain = asked - drift, the
 * rows the task keeps of the six; each freedom asked ahead of the task held to it; and with
 * `toward`, each of the others drawn toward it.
 */
function limbRows(b: WholeBody, rows: number, muscles: MuscleDriver, R: MuscleDriver["dynamics"]["root"], limb: Limb): number {
  const { task, work } = limb, { at, ahead } = work, channels = limb.memory.channels, stem = limb.stem, m = channels.length, s = stem.length;
  const { A, J, S, B, k0, lin, ang } = b, p0 = R.centre;
  jacobianTo(channels, at, muscles, J);
  if (s) jacobianTo(stem, at, muscles, S);
  muscles.dynamics.driftToRef(limb.segment, at, lin, ang);
  k0[0] = task.angular.x - ang.x; k0[1] = task.angular.y - ang.y; k0[2] = task.angular.z - ang.z;
  k0[3] = task.linear.x - lin.x; k0[4] = task.linear.y - lin.y; k0[5] = task.linear.z - lin.z;
  // B a_root: the point's motion from the root's, its spin and a + alpha x r; (alpha x r)_i = -[r]x alpha.
  const r0 = at.x - p0[0], r1 = at.y - p0[1], r2 = at.z - p0[2];
  B.fill(0);
  for (let i = 0; i < 6; i++) B[i * 6 + i] = 1;
  B[3 * 6 + 1] = r2; B[3 * 6 + 2] = -r1;
  B[4 * 6 + 0] = -r2; B[4 * 6 + 2] = r0;
  B[5 * 6 + 0] = r1; B[5 * 6 + 1] = -r0;
  let Jr = J, Sr = S, Br = B, y = k0, q = 6;
  if (work.rows) {
    q = work.rows.length;
    keepRows(work.rows, J, m, b.rowsJ);
    if (s) keepRows(work.rows, S, s, b.rowsS);
    keepRows(work.rows, B, 6, b.rowsB);
    keepRows(work.rows, k0, 1, b.rowsK);
    Jr = b.rowsJ; Sr = b.rowsS; Br = b.rowsB; y = b.rowsK;
  }
  for (let r = 0; r < q; r++) {
    // A spin's row is weighed at the limb's reach, as the motion it gives a point there.
    const k = (work.rows ? spinRow(work.rows[r]!) : r < 3) ? limb.reach : 1, at = openRow(b, rows++, y[r]! * k, WEIGHT.foot);
    for (let c = 0; c < 6; c++) A[at + c] = Br[r * 6 + c]! * k;
    for (let c = 0; c < m; c++) A[at + 6 + channels[c]!] = Jr[r * m + c]! * k;
    for (let c = 0; c < s; c++) A[at + 6 + stem[c]!] = Sr[r * s + c]! * k;
  }
  for (let c = 0; c < m; c++) {
    const asked = ahead[c]!;
    if (Number.isNaN(asked)) continue;
    const at = openRow(b, rows++, asked, WEIGHT.ahead);
    A[at + 6 + channels[c]!] = 1;
  }
  const toward = work.toward;
  if (toward) for (let c = 0; c < m; c++) {
    if (!Number.isNaN(ahead[c] ?? NaN)) continue;
    const at = openRow(b, rows++, toward[c]!, WEIGHT.toward);
    A[at + 6 + channels[c]!] = 1;
  }
  return rows;
}

/** Whether a kept row (`keepRows`) is of the spin's rows alone: the first three of the six. */
function spinRow(row: Row): boolean {
  for (const [r] of row) if (r >= 3) return false;
  return true;
}

/**
 * Freedom `i`'s torque held at `torque`, as a row: C_i' a_root + M_i u' = torque - bias_i +
 * gravity_i + contact_i, in units of its strength (the greater way, or 1 with none).
 */
function torqueRow(b: WholeBody, rows: number, muscles: MuscleDriver, i: number, torque: number, contact: number): number {
  const dynamics = muscles.dynamics, R = dynamics.root, n = b.count, { A } = b;
  const scale = 1 / (Math.max(muscles.strength(i, 1), muscles.strength(i, -1)) || 1);
  const at = openRow(b, rows++, (torque - dynamics.bias[i]! + dynamics.gravity[i]! + contact) * scale, WEIGHT.torque);
  for (let r = 0; r < 6; r++) A[at + r] = R.coupling[r]![i]! * scale;
  const row = dynamics.mass[i]!;
  for (let j = 0; j < n; j++) A[at + 6 + j] = row[j]! * scale;
  return rows;
}

/**
 * The root's rows held to the wrench `given`: root.mass a_root + coupling u' = given + gravity -
 * bias, each in the body's weight, a moment's at `lever`.
 */
function rootRows(b: WholeBody, rows: number, R: MuscleDriver["dynamics"]["root"], lever: number): number {
  const n = b.count, { A, given } = b, g = R.gravity;
  const weight = Math.sqrt(g[3]! * g[3]! + g[4]! * g[4]! + g[5]! * g[5]!);
  for (let r = 0; r < 6; r++) {
    const scale = 1 / (r < 3 ? weight * lever : weight);
    const at = openRow(b, rows++, (given[r]! + R.gravity[r]! - R.bias[r]!) * scale, WEIGHT.root);
    for (let c = 0; c < 6; c++) A[at + c] = R.mass[r]![c]! * scale;
    const coupling = R.coupling[r]!;
    for (let i = 0; i < n; i++) A[at + 6 + i] = coupling[i]! * scale;
  }
  return rows;
}

/**
 * The least of the `rows` rows' weighted misses over the unknowns, into `x` with the known: H =
 * A' W A + d E over the unknowns' columns by Cholesky, each row's target less what its known
 * columns give.
 */
function solveRows(b: WholeBody, rows: number): void {
  const N = b.size, { A, y, w, H, L, g, z, x, xs, known, unknown } = b;
  let m = 0;
  for (let c = 0; c < N; c++) if (Number.isNaN(known[c]!)) unknown[m++] = c;
  H.fill(0, 0, m * m);
  g.fill(0, 0, m);
  for (let r = 0; r < rows; r++) {
    const at = r * N, weight = w[r]!;
    let target = y[r]!;
    for (let c = 0; c < N; c++) {
      const ac = A[at + c]!;
      if (ac !== 0 && !Number.isNaN(known[c]!)) target -= ac * known[c]!;
    }
    for (let i = 0; i < m; i++) {
      const ai = A[at + unknown[i]!]!;
      if (ai === 0) continue;
      const wi = weight * ai;
      g[i] = g[i]! + wi * target;
      for (let j = 0; j <= i; j++) {
        const aj = A[at + unknown[j]!]!;
        if (aj !== 0) H[i * m + j] = H[i * m + j]! + wi * aj;
      }
    }
  }
  for (let i = 0; i < m; i++) H[i * m + i] = H[i * m + i]! + DAMPING;
  for (let i = 0; i < m; i++) for (let j = 0; j <= i; j++) {
    let sum = H[i * m + j]!;
    for (let k = 0; k < j; k++) sum -= L[i * m + k]! * L[j * m + k]!;
    L[i * m + j] = i === j ? Math.sqrt(sum) : sum / L[j * m + j]!;
  }
  for (let i = 0; i < m; i++) { let sum = g[i]!; for (let k = 0; k < i; k++) sum -= L[i * m + k]! * z[k]!; z[i] = sum / L[i * m + i]!; }
  for (let i = m - 1; i >= 0; i--) { let sum = z[i]!; for (let k = i + 1; k < m; k++) sum -= L[k * m + i]! * xs[k]!; xs[i] = sum / L[i * m + i]!; }
  for (let c = 0; c < N; c++) x[c] = known[c]!;
  for (let i = 0; i < m; i++) x[unknown[i]!] = xs[i]!;
}

/**
 * The root's spin's aim with the ground holding it short, into the first three rows' targets: the
 * spin found, `x`, turned as the wrench missed (the scratch's `missed`) turns the body moving as a
 * rigid one, the root's block of the mass matrix the body's inertia.
 */
function rigidTurn(b: WholeBody, R: MuscleDriver["dynamics"]["root"], x: Float64Array): void {
  const { rigid, lost, turn, missed } = b;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) rigid[r * 6 + c] = R.mass[r]![c]!;
  lost[0] = missed.moment.x; lost[1] = missed.moment.y; lost[2] = missed.moment.z;
  lost[3] = missed.force.x; lost[4] = missed.force.y; lost[5] = missed.force.z;
  solveLinearTo(b.linear, rigid, lost, 6, turn);
  for (let r = 0; r < 3; r++) b.y[r] = x[r]! + turn[r]!;
}

/** The wrench the ground must give for the motion found, about the root's centre, into `W`: the root's rows less gravity's. */
function groundWrenchTo(b: WholeBody, R: MuscleDriver["dynamics"]["root"]): void {
  const n = b.count, { x, W } = b;
  for (let r = 0; r < 6; r++) {
    let sum = R.bias[r]! - R.gravity[r]!;
    for (let c = 0; c < 6; c++) sum += R.mass[r]![c]! * x[c]!;
    const coupling = R.coupling[r]!;
    for (let i = 0; i < n; i++) sum += coupling[i]! * x[6 + i]!;
    W[r] = sum;
  }
}

/** `bearing`'s patches' shares of the scratch's `force` and `moment` about the root's centre, into its `shares` and `missed`. */
function shareAmong(b: WholeBody, bearing: readonly Limb[], R: MuscleDriver["dynamics"]["root"], lever: number): void {
  const { wrench, patches, parts, shares, missed, at } = b;
  for (let k = 0; k < bearing.length; k++) { patches[k] = bearing[k]!.work.patch!; parts[k] = bearing[k]!.work.share; }
  patches.length = bearing.length;
  parts.length = bearing.length;
  at.set(R.centre[0], R.centre[1], R.centre[2]);
  shareGroundWrench(wrench, patches, at, b.force, b.moment, GROUND_FRICTION, lever, shares, missed, parts);
}

/**
 * What the patches miss of the wrench asked (`W`), into the ask's shortfall, and what the assist
 * gives of it into its `helped`; the scratch's `missed` is left as what the two give beyond what
 * was asked. Returns whether the two give it all.
 */
function shortfall(b: WholeBody, bearing: readonly Limb[], R: MuscleDriver["dynamics"]["root"], ask: WholeBodyAsk, assist: Assist | null): boolean {
  const { W, missed } = b;
  b.force.set(W[3]!, W[4]!, W[5]!);
  b.moment.set(W[0]!, W[1]!, W[2]!);
  shareAmong(b, bearing, R, ask.lever);
  // `missed` is what the patches give beyond what was asked; the shortfall is its opposite.
  ask.shortfall.force.copyFrom(missed.force).scaleInPlace(-1);
  ask.shortfall.moment.copyFrom(missed.moment).scaleInPlace(-1);
  if (assist?.on) {
    assist.clipToRef(ask.shortfall.force, ask.shortfall.moment, ask.helped.force, ask.helped.moment);
    missed.force.addInPlace(ask.helped.force);
    missed.moment.addInPlace(ask.helped.moment);
  } else { ask.helped.force.setAll(0); ask.helped.moment.setAll(0); }
  return missed.force.lengthSquared() + missed.moment.lengthSquared() <= MISSED;
}

/**
 * Every freedom's torque for the motion found, into the scratch's `torque`: its inverse dynamics,
 * less the ground's wrench on each bearing limb that carries it, from its patch (`contact`).
 */
function torques(b: WholeBody, muscles: MuscleDriver, bearing: readonly Limb[]): void {
  const dynamics = muscles.dynamics, R = dynamics.root, n = b.count, { x, contact, torque, shares } = b;
  contact.fill(0);
  for (let k = 0; k < bearing.length; k++) {
    const limb = bearing[k]!, share = shares[k]!;
    for (const i of limb.memory.channels) contact[i] = contact[i]! + carried(dynamics, i, limb, share);
    for (const i of limb.stem) contact[i] = contact[i]! + carried(dynamics, i, limb, share);
  }
  for (let i = 0; i < n; i++) {
    let t = dynamics.bias[i]! - dynamics.gravity[i]!;
    for (let r = 0; r < 6; r++) t += R.coupling[r]![i]! * x[r]!;
    const row = dynamics.mass[i]!;
    for (let j = 0; j < n; j++) t += row[j]! * x[6 + j]!;
    torque[i] = t - contact[i]!;
  }
}
