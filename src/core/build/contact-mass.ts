import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Vec3 } from "../spec/quantity.ts";
import type { BuiltBody, BuiltSegment } from "./build-body.ts";
import { jointAngles, motionAxesToRef } from "./joint-state.ts";

/**
 * **The mass a contact meets**: at a point on a body, along a direction, the mass that an impulse
 * there moves as if it were a point, 1 / (n' J M^-1 J' n), with J the point's velocity in the
 * body's speeds and M the body's mass matrix in them. Both sides of a blow have one, and a blow's
 * energy is taken from the two together (`src/core/rules/impact.ts`).
 *
 * **The joints are free and the body floats.** A blow lasts a few milliseconds, less than a muscle
 * takes to answer it, so no joint resists within its freedoms; nothing holds the body's root, so a
 * blow on the trunk moves the whole body, and one on a hand moves the hand, and the arm and trunk
 * as far as the joints couple them. The old game read its masses the same way
 * (`src/golem/effective-mass.ts`, physical contact session 05). A joint at its limit is taken as
 * free too, and the ground is not there.
 *
 * The speeds are the root's velocity and spin, then every freedom's (`dynamics.ts` has how a
 * freedom's speed turns what its joint carries, about its motion axis through the joint's centre).
 * Each segment's rigid body (`rigid.ts`) is read as it stands (H24): its centre from its node, its
 * inertia turned with it.
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
}

export function contactMass(built: BuiltBody): ContactMass {
  const segments = [...built.segments.values()], joints = [...built.joints.values()];
  const index = new Map(segments.map((segment, i) => [segment, i]));
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
  const v = new Vector3(), q = new Quaternion(), carry = new Quaternion(), bodyAxes: Vec3[] = [];

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
      const J = jacobian(segmentIndex(segment), point, false);
      const size = Math.hypot(normal[0], normal[1], normal[2]);
      const g = J[0]!.map((_, col) => (normal[0] * J[0]![col]! + normal[1] * J[1]![col]! + normal[2] * J[2]![col]!) / size);
      const x = solve(g);
      return 1 / g.reduce((sum, gi, k) => sum + gi * x[k]!, 0);
    },
    mobility,
  };
}
