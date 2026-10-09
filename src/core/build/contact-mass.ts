import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Vec3 } from "../spec/quantity.ts";
import type { BuiltBody, BuiltJoint, BuiltSegment } from "./build-body.ts";
import { jointAngles, motionAxesToRef } from "./joint-state.ts";
import { hypot } from "../math/real.ts";

/**
 * **The mass a contact meets**: at a point on a body, along a direction, the mass that an impulse
 * there moves as if it were a point, 1 / (n' J M^-1 J' n), with J the point's velocity in the
 * body's speeds and M the body's mass matrix in them. Both sides of a blow have one, and a blow's
 * energy is taken from the two together (`src/core/rules/impact.ts`).
 *
 * **The joints are free and the body floats.** A blow lasts a few milliseconds, less than a muscle
 * takes to answer it, so no joint resists within its freedoms; nothing holds the body's root, so a
 * blow on the trunk moves the whole body, and one on a hand moves the hand, and the arm and trunk
 * as far as the joints couple them. A joint at its limit is taken as free too, and the ground is
 * not there.
 *
 * **Muscles that hold through it** (`yielding`, `contactGive`) are the exception. A muscle does
 * not answer a blow, but one already pulling keeps pulling: a freedom whose muscles are given a
 * ceiling (`Hold`) does not turn until the blow asks more angular impulse of it than that ceiling
 * over the contact's time, and turns past it against the ceiling. So a braced arm meets a blow
 * with the body behind it, and a limp one with the hand alone.
 *
 * The speeds are the root's velocity and spin, then every freedom's (`dynamics.ts` has how a
 * freedom's speed turns what its joint carries, about its motion axis through the joint's centre).
 * Each segment's rigid body (`rigid.ts`) is read as it stands, from its node's `position` and
 * `rotationQuaternion` (Babylon's world matrix is cached per render id): its centre from its node,
 * its inertia turned with it.
 *
 * `update` takes the pose; every answer after it is for that pose, until the next `update`, so one
 * pose can be asked about while the body moves on.
 */
export interface ContactMass {
  /** Take the body's pose as it stands. */
  update(): void;
  /**
   * The mass met at `point` (world, on `segment`, as the pose stood at `update`) along `normal`
   * (world, any length; its direction is what counts), kg.
   */
  along(segment: BuiltSegment, point: Vec3, normal: Vec3): number;
  /**
   * The point's velocity change for a unit impulse there, as the pose stood: J M^-1 J', rows, 1/kg.
   * `along` is 1 over n' of it n.
   */
  mobility(segment: BuiltSegment, point: Vec3): number[][];
  /**
   * How the body gives at `point` on `segment` to an impulse pushing it along `direction`, with
   * `holds` holding for one second (`Yield`).
   */
  yielding(segment: BuiltSegment, point: Vec3, direction: Vec3, holds: readonly Hold[]): Yield;
}

/** A freedom whose muscles hold through a contact: its joint, its index there, and the torque they can give toward each sense, N m. */
export interface Hold {
  readonly joint: BuiltJoint;
  readonly index: number;
  readonly negative: number;
  readonly positive: number;
}

/**
 * **How a body gives to an impulse at a point**, its holds lasting one second: the point's
 * velocity change along the push, against the impulse, piecewise linear from no impulse.
 * `impulse` and `change` are its corners (N s, m/s), and `slope` its rise past the last, which is
 * one over the free mass (`along`). Over a contact of T seconds the holds give T times the
 * angular impulse, and the change at impulse P is T times this one's at P / T: the problem is the
 * same one scaled.
 */
interface Yield {
  readonly impulse: readonly number[];
  readonly change: readonly number[];
  readonly slope: number;
}

export function contactMass(built: BuiltBody): ContactMass {
  const segments = [...built.segments.values()], joints = [...built.joints.values()];
  const index = new Map(segments.map((segment, i) => [segment, i]));
  const jointIndex = new Map(joints.map((joint, j) => [joint, j]));
  const byChild = new Map(joints.map((joint, j) => [joint.child, j]));
  const roots = segments.filter((segment) => !byChild.has(segment));
  if (roots.length !== 1) throw new Error(`${built.spec.model} has ${roots.length} roots; a contact mass needs one`);
  const root = roots[0]!;
  // Each freedom's column, from 6; and each segment's freedoms, its joints' and its ancestors'.
  const firstColumn: number[] = [];
  let n = 6;
  for (const joint of joints) { firstColumn.push(n); n += joint.dofs.length; }
  const lineage = segments.map((segment) => {
    const out: number[] = [];
    for (let at = byChild.get(segment); at !== undefined; at = byChild.get(joints[at]!.parent)) out.push(at);
    return out;
  });
  const localCentre = segments.map((segment) => {
    const { origin, x, y, z } = segment.frame, c = segment.rigid.centre;
    const d = [c[0] - origin[0], c[1] - origin[1], c[2] - origin[2]];
    return new Vector3(d[0]! * x[0] + d[1]! * x[1] + d[2]! * x[2], d[0]! * y[0] + d[1]! * y[1] + d[2]! * y[2], d[0]! * z[0] + d[1]! * z[1] + d[2]! * z[2]);
  });
  const localPivot = joints.map((joint) => {
    const { origin, x, y, z } = joint.child.frame, c = joint.spec.centre.value;
    const d = [c[0] - origin[0], c[1] - origin[1], c[2] - origin[2]];
    return new Vector3(d[0]! * x[0] + d[1]! * x[1] + d[2]! * x[2], d[0]! * y[0] + d[1]! * y[1] + d[2]! * y[2], d[0]! * z[0] + d[1]! * z[1] + d[2]! * z[2]);
  });

  // The pose, as `update` took it.
  const centres = segments.map(() => [0, 0, 0] as [number, number, number]);
  const inertias = segments.map(() => [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  const pivots = joints.map(() => [0, 0, 0] as [number, number, number]);
  const axes: Vec3[][] = joints.map(() => []);
  const origin: [number, number, number] = [0, 0, 0];
  let factor: number[][] = [];
  const v = new Vector3(), q = new Quaternion(), carry = new Quaternion(), bodyAxes: [number, number, number][] = [];

  /** The rows of J at `point` on segment `i`: its velocity in the speeds, and (with `spin`) its segment's spin. */
  const jacobian = (i: number, point: Vec3, spin: boolean): number[][] => {
    const rows = (spin ? 6 : 3);
    const J = Array.from({ length: rows }, () => new Array<number>(n).fill(0));
    const r = [point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]];
    // The root's velocity, and its spin across the point: w x r = -r x w.
    for (let k = 0; k < 3; k++) J[k]![k] = 1;
    J[0]![4] = r[2]!; J[0]![5] = -r[1]!;
    J[1]![3] = -r[2]!; J[1]![5] = r[0]!;
    J[2]![3] = r[1]!; J[2]![4] = -r[0]!;
    if (spin) for (let k = 0; k < 3; k++) J[3 + k]![3 + k] = 1;
    for (const j of lineage[i]!) {
      const p = pivots[j]!, d = [point[0] - p[0], point[1] - p[1], point[2] - p[2]];
      axes[j]!.forEach((a, k) => {
        const col = firstColumn[j]! + k;
        J[0]![col] = a[1] * d[2]! - a[2] * d[1]!;
        J[1]![col] = a[2] * d[0]! - a[0] * d[2]!;
        J[2]![col] = a[0] * d[1]! - a[1] * d[0]!;
        if (spin) { J[3]![col] = a[0]; J[4]![col] = a[1]; J[5]![col] = a[2]; }
      });
    }
    return J;
  };
  /** M^-1 b, from the Cholesky factor. */
  const solve = (b: number[]): number[] => {
    const y = b.slice();
    for (let i = 0; i < n; i++) { let s = y[i]!; for (let k = 0; k < i; k++) s -= factor[i]![k]! * y[k]!; y[i] = s / factor[i]![i]!; }
    for (let i = n - 1; i >= 0; i--) { let s = y[i]!; for (let k = i + 1; k < n; k++) s -= factor[k]![i]! * y[k]!; y[i] = s / factor[i]![i]!; }
    return y;
  };
  const segmentIndex = (segment: BuiltSegment): number => {
    const i = index.get(segment);
    if (i === undefined) throw new Error(`${segment.spec.name} is not a segment of ${built.spec.model}`);
    return i;
  };
  const mobility = (segment: BuiltSegment, point: Vec3): number[][] => {
    const J = jacobian(segmentIndex(segment), point, false);
    const columns = J.map((row) => solve(row));
    return J.map((row) => columns.map((column) => row.reduce((sum, x, k) => sum + x * column[k]!, 0)));
  };

  return {
    update() {
      segments.forEach((segment, i) => {
        const rotation = segment.node.rotationQuaternion!;
        localCentre[i]!.applyRotationQuaternionToRef(rotation, v).addInPlace(segment.node.position);
        centres[i] = [v.x, v.y, v.z];
        // R T R' with R's columns the segment frame's axes as they are now.
        const T = segment.rigid.tensor;
        const local = [[T[0], T[3], T[4]], [T[3], T[1], T[5]], [T[4], T[5], T[2]]];
        const R = [0, 1, 2].map((k) => { v.set(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0).applyRotationQuaternionToRef(rotation, v); return [v.x, v.y, v.z]; });
        inertias[i] = [0, 1, 2].map((a) => [0, 1, 2].map((b) => {
          let s = 0;
          for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) s += R[k]![a]! * local[k]![l]! * R[l]![b]!;
          return s;
        }));
      });
      joints.forEach((joint, j) => {
        localPivot[j]!.applyRotationQuaternionToRef(joint.child.node.rotationQuaternion!, v).addInPlace(joint.child.node.position);
        pivots[j] = [v.x, v.y, v.z];
        // A body-frame axis as the parent now carries it: P P0^-1.
        Quaternion.InverseToRef(joint.parent.rest, q);
        joint.parent.node.rotationQuaternion!.multiplyToRef(q, carry);
        axes[j] = motionAxesToRef(joint, jointAngles(joint), bodyAxes).map((a) => {
          v.set(a[0], a[1], a[2]).applyRotationQuaternionToRef(carry, v);
          return [v.x, v.y, v.z] as Vec3;
        });
      });
      const c = centres[index.get(root)!]!;
      origin[0] = c[0]; origin[1] = c[1]; origin[2] = c[2];
      // M = sum of m Jv' Jv + Jw' I Jw over the segments, at their centres.
      const M = Array.from({ length: n }, () => new Array<number>(n).fill(0));
      segments.forEach((segment, i) => {
        const J = jacobian(i, centres[i]!, true), m = segment.rigid.mass, I = inertias[i]!;
        const Iw = [0, 1, 2].map((a) => J[3]!.map((_, col) => I[a]![0]! * J[3]![col]! + I[a]![1]! * J[4]![col]! + I[a]![2]! * J[5]![col]!));
        for (let a = 0; a < n; a++) {
          for (let b = a; b < n; b++) {
            const value = m * (J[0]![a]! * J[0]![b]! + J[1]![a]! * J[1]![b]! + J[2]![a]! * J[2]![b]!)
              + J[3]![a]! * Iw[0]![b]! + J[4]![a]! * Iw[1]![b]! + J[5]![a]! * Iw[2]![b]!;
            M[a]![b]! += value;
            if (b !== a) M[b]![a]! += value;
          }
        }
      });
      // Cholesky: M = L L'.
      factor = Array.from({ length: n }, () => new Array<number>(n).fill(0));
      for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
          let s = M[i]![j]!;
          for (let k = 0; k < j; k++) s -= factor[i]![k]! * factor[j]![k]!;
          if (i === j) {
            if (!(s > 0)) throw new Error(`${built.spec.model}'s mass matrix is not positive definite at speed ${i}`);
            factor[i]![i] = Math.sqrt(s);
          } else factor[i]![j] = s / factor[j]![j]!;
        }
      }
    },
    along(segment, point, normal) {
      const g = pushRow(segment, point, normal), x = solve(g);
      return 1 / g.reduce((sum, gi, k) => sum + gi * x[k]!, 0);
    },
    mobility,
    yielding(segment, point, direction, holds) {
      const g = pushRow(segment, point, direction), Ag = solve(g);
      const a = g.reduce((sum, gi, k) => sum + gi * Ag[k]!, 0);
      const held = holds.filter((hold) => hold.negative > 0 || hold.positive > 0).map((hold) => {
        const j = jointIndex.get(hold.joint);
        if (j === undefined) throw new Error(`${hold.joint.spec.name} is not a joint of ${built.spec.model}`);
        return { column: firstColumn[j]! + hold.index, low: -hold.negative, high: hold.positive };
      });
      // The held freedoms' block of M^-1, and the push's column of it there.
      const columns = held.map(({ column }) => { const e = new Array<number>(n).fill(0); e[column] = 1; return solve(e); });
      const K = held.map((_, i) => held.map(({ column }) => columns[i]![column]!));
      const c = held.map(({ column }) => Ag[column]!);
      return yieldPath(a, c, K, held.map(({ low }) => low), held.map(({ high }) => high));
    },
  };

  /** The push along `direction` at `point` on `segment` as a row of the body's speeds: n' J, with n of unit length. */
  function pushRow(segment: BuiltSegment, point: Vec3, direction: Vec3): number[] {
    const J = jacobian(segmentIndex(segment), point, false);
    const size = hypot(direction[0], direction[1], direction[2]);
    return J[0]!.map((_, col) => (direction[0] * J[0]![col]! + direction[1] * J[1]![col]! + direction[2] * J[2]![col]!) / size);
  }
}

/**
 * **The path of a push against freedoms that hold** (`Yield`), followed exactly as the impulse
 * grows. The point moves by `a` P + c' l along the push, and the held freedoms turn by c P + K l,
 * where l is what each held freedom's muscles give, within [`low`, `high`]. A freedom whose l is
 * inside its bounds does not turn; one at a bound turns the way the push takes it. With no impulse
 * every freedom holds; each leg of the path runs to the next freedom that reaches a bound or,
 * turning, comes to a stop, and changes it over, the first of equals first. K is a principal block
 * of the inverse of a mass matrix, positive definite, so there is one path.
 */
export function yieldPath(a: number, c: readonly number[], K: readonly (readonly number[])[], low: readonly number[], high: readonly number[]): Yield {
  const h = c.length, given = new Array<number>(h).fill(0), turning = new Array<number>(h).fill(0);
  // 0 holds; +1 gives at its high bound, -1 at its low.
  const at = new Array<number>(h).fill(0);
  const impulse = [0], change = [0];
  let P = 0;
  for (let leg = 0; leg <= 4 * h + 8; leg++) {
    const holding: number[] = [];
    for (let i = 0; i < h; i++) if (at[i] === 0) holding.push(i);
    // What the holding freedoms give per newton second: K_HH r = -c_H.
    const rate = spdSolve(holding.map((i) => holding.map((k) => K[i]![k]!)), holding.map((i) => -c[i]!));
    const dGiven = new Array<number>(h).fill(0), dTurning = new Array<number>(h).fill(0);
    holding.forEach((i, k) => { dGiven[i] = rate[k]!; });
    let slope = a;
    for (const i of holding) slope += c[i]! * dGiven[i]!;
    for (let i = 0; i < h; i++) {
      if (at[i] === 0) continue;
      let d = c[i]!;
      for (const k of holding) d += K[i]![k]! * dGiven[k]!;
      dTurning[i] = d;
    }
    let next = Infinity, which = -1;
    for (let i = 0; i < h; i++) {
      let t = Infinity;
      if (at[i] === 0) {
        if (dGiven[i]! > 0) t = (high[i]! - given[i]!) / dGiven[i]!;
        else if (dGiven[i]! < 0) t = (low[i]! - given[i]!) / dGiven[i]!;
      } else if (at[i]! > 0 ? dTurning[i]! > 0 : dTurning[i]! < 0) t = -turning[i]! / dTurning[i]!;
      if (t < next) { next = t; which = i; }
    }
    if (which < 0) return { impulse, change, slope };
    const t = Math.max(0, next);
    P += t;
    for (let i = 0; i < h; i++) { given[i] = given[i]! + dGiven[i]! * t; turning[i] = turning[i]! + dTurning[i]! * t; }
    if (at[which] === 0) { at[which] = dGiven[which]! > 0 ? 1 : -1; given[which] = at[which]! > 0 ? high[which]! : low[which]!; }
    else at[which] = 0;
    turning[which] = 0;
    if (t > 0) {
      let v = a * P;
      for (let i = 0; i < h; i++) v += c[i]! * given[i]!;
      impulse.push(P); change.push(v);
    }
  }
  throw new Error("a push against held freedoms changed them over more than four times as often as there are freedoms");
}

/** x with A x = b, A symmetric positive definite, by Cholesky. */
function spdSolve(A: readonly (readonly number[])[], b: readonly number[]): number[] {
  const m = b.length, L = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i]![j]!;
      for (let k = 0; k < j; k++) s -= L[i]![k]! * L[j]![k]!;
      if (i === j) {
        if (!(s > 0)) throw new Error("a held block of the mass matrix's inverse is not positive definite");
        L[i]![i] = Math.sqrt(s);
      } else L[i]![j] = s / L[j]![j]!;
    }
  }
  const y = b.slice();
  for (let i = 0; i < m; i++) { let s = y[i]!; for (let k = 0; k < i; k++) s -= L[i]![k]! * y[k]!; y[i] = s / L[i]![i]!; }
  for (let i = m - 1; i >= 0; i--) { let s = y[i]!; for (let k = i + 1; k < m; k++) s -= L[k]![i]! * y[k]!; y[i] = s / L[i]![i]!; }
  return y;
}

/** The change `y` makes at impulse `P` (`Yield`). */
export function changeAt(y: Yield, P: number): number {
  const last = y.impulse.length - 1;
  if (P >= y.impulse[last]!) return y.change[last]! + y.slope * (P - y.impulse[last]!);
  let k = 0;
  while (y.impulse[k + 1]! < P) k++;
  const P0 = y.impulse[k]!, P1 = y.impulse[k + 1]!;
  return y.change[k]! + (y.change[k + 1]! - y.change[k]!) * (P - P0) / (P1 - P0);
}

/** The impulse at which the changes of `a` and `b` together come to `v`: both rise, so there is one. */
function impulseFor(a: Yield, b: Yield, v: number): number {
  const corners = [...a.impulse, ...b.impulse].sort((x, y) => x - y);
  let P0 = 0, v0 = 0;
  for (const P1 of corners) {
    if (!(P1 > P0)) continue;
    const v1 = changeAt(a, P1) + changeAt(b, P1);
    if (v1 >= v) return P0 + (P1 - P0) * (v - v0) / (v1 - v0);
    P0 = P1; v0 = v1;
  }
  return P0 + (v - v0) / (a.slope + b.slope);
}

/**
 * **What two bodies pass between them in a blow, their muscles holding** (`Yield`): the impulse
 * that stops their closing at `closing` m/s, and the mass each side meets it with, that impulse
 * over the change it makes there. The holds last the contact's time, T = pi sqrt(mu / k), half the
 * period of the two masses on the contact's stiffness `stiffness` (N/m, the surfaces in series). mu
 * is what the holds make it, and the holds last what mu makes T: from the free masses up, each
 * answer raises the other, to where they agree. A contact with no compliance lasts no time, and
 * meets the free masses.
 */
export function contactGive(a: Yield, b: Yield, closing: number, stiffness: number): { readonly impulse: number; readonly aKg: number; readonly bKg: number } {
  if (!(closing > 0) || !(stiffness < Infinity)) return { impulse: 0, aKg: 1 / a.slope, bKg: 1 / b.slope };
  let mu = 1 / (a.slope + b.slope), x = 0, T = 0;
  for (let round = 0; round < 32; round++) {
    T = Math.PI * Math.sqrt(mu / stiffness);
    x = impulseFor(a, b, closing / T);
    const next = T * x / closing;
    if (!(next > mu)) break;
    mu = next;
  }
  // A side that holds nothing meets its free mass exactly.
  return { impulse: T * x, aKg: a.impulse.length > 1 ? x / changeAt(a, x) : 1 / a.slope, bKg: b.impulse.length > 1 ? x / changeAt(b, x) : 1 / b.slope };
}
