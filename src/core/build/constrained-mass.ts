import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { SegmentBody } from "../engine/engine.ts";
import type { Vec3 } from "../spec/quantity.ts";

/** A scalar velocity constraint, summed over bodies: linear . v(point) + angular . spin = 0. */
export type MotionConstraint = readonly {
  readonly body: SegmentBody;
  readonly point: Vec3;
  readonly linear: Vec3;
  readonly angular: Vec3;
}[];

/** Relative rank tolerance after mass whitening: a numeric setting (`docs/reference/constraint-mass.md`). */
const RANK_TOLERANCE = 1e-10;
const XYZ: readonly Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const ZERO: Vec3 = [0, 0, 0];
const dot = (a: readonly number[], b: readonly number[]): number => a.reduce((s, v, i) => s + v * b[i]!, 0);

/** Remove the independent rows' components, twice to control loss of orthogonality. */
function reject(row: number[], basis: readonly number[][]): void {
  for (let pass = 0; pass < 2; pass++) for (const q of basis) {
    const weight = dot(row, q);
    for (let i = 0; i < row.length; i++) row[i]! -= weight * q[i]!;
  }
}

/** Rank-revealing orthonormal rows; pivoting prevents a weak row from amplifying roundoff. */
export function constraintBasis(rows: readonly (readonly number[])[], tolerance: number): number[][] {
  const remaining = rows.map((row) => [...row]), basis: number[][] = [];
  const largest = remaining.reduce((max, row) => Math.max(max, dot(row, row)), 0);
  while (remaining.length) {
    let selected = 0, length2 = 0;
    for (let r = 0; r < remaining.length; r++) {
      const row = remaining[r]!;
      reject(row, basis);
      const norm = dot(row, row);
      if (norm > length2) { selected = r; length2 = norm; }
    }
    if (length2 <= tolerance * tolerance * largest) break;
    const row = remaining.splice(selected, 1)[0]!, scale = 1 / Math.sqrt(length2);
    basis.push(row.map((v) => v * scale));
  }
  return basis;
}

/**
 * Instantaneous mobility of rigid bodies joined by homogeneous velocity constraints, including
 * redundant closed loops. Mass-whitened constraint rows form an orthonormal basis Q; the free
 * impulse response is M^-1/2 (E - Q' Q) M^-1/2. No penalty stiffness or artificial mass is added.
 * The caller declares all constraints; absent contacts, limits and motors remain free.
 * `update` freezes one pose and constraint set for subsequent queries, including after release.
 */
export function constrainedMass(bodies: readonly SegmentBody[], constraints: () => readonly MotionConstraint[]) {
  const members = [...bodies], index = new Map(members.map((b, i) => [b, i]));
  if (index.size !== members.length) throw new Error("duplicate body in constrained mass");
  const size = 6 * members.length;
  const centres: Vec3[] = [], axes: Vec3[][] = [], linearScale: number[] = [], angularScale: number[][] = [];
  const basis: number[][] = [];
  const point = new Vector3(), turn = new Quaternion();
  let ready = false, rows = 0;

  const rowOf = (entries: MotionConstraint): number[] => {
    const row = new Array<number>(size).fill(0);
    for (const entry of entries) {
      const i = index.get(entry.body);
      if (i === undefined) throw new Error("constraint or query names an unregistered body");
      if (![...entry.point, ...entry.linear, ...entry.angular].every(Number.isFinite)) throw new Error("nonfinite motion row");
      const c = centres[i]!, r = entry.point.map((v, k) => v - c[k]!), f = entry.linear;
      const torque = [entry.angular[0] + r[1]! * f[2] - r[2]! * f[1],
        entry.angular[1] + r[2]! * f[0] - r[0]! * f[2], entry.angular[2] + r[0]! * f[1] - r[1]! * f[0]];
      for (let k = 0; k < 3; k++) {
        row[6 * i + k]! += f[k]! * linearScale[i]!;
        row[6 * i + 3 + k]! += dot(torque, axes[i]![k]!) * angularScale[i]![k]!;
      }
    }
    return row;
  };
  const projected = (entries: MotionConstraint): number[] => {
    if (!ready) throw new Error("constrained mass needs update before a query");
    const row = rowOf(entries);
    reject(row, basis);
    return row;
  };
  return {
    update(): void {
      ready = false; basis.length = 0;
      members.forEach((b, i) => {
        const p = b.massProperties;
        if (!(p.mass > 0) || !Number.isFinite(p.mass) || !p.moments.every((v) => v > 0 && Number.isFinite(v))) {
          throw new Error("constrained mass requires positive finite mass and principal inertias");
        }
        point.set(...p.centre).applyRotationQuaternionToRef(b.node.rotationQuaternion!, point).addInPlace(b.node.position);
        centres[i] = [point.x, point.y, point.z];
        b.node.rotationQuaternion!.multiplyToRef(p.orientation, turn);
        axes[i] = XYZ.map((a) => {
          point.set(...a).applyRotationQuaternionToRef(turn, point);
          return [point.x, point.y, point.z];
        });
        linearScale[i] = 1 / Math.sqrt(p.mass);
        angularScale[i] = p.moments.map((v) => 1 / Math.sqrt(v));
      });
      const supplied = constraints(); rows = supplied.length;
      basis.push(...constraintBasis(supplied.map(rowOf), RANK_TOLERANCE));
      ready = true;
    },
    /** Independent constraint count and remaining velocity freedoms, from the last update. */
    report() {
      if (!ready) throw new Error("constrained mass needs update before a query");
      return { rows, rank: basis.length, freedoms: size - basis.length };
    },
    mobility(body: SegmentBody, at: Vec3): number[][] {
      const J = XYZ.map((linear) => projected([{ body, point: at, linear, angular: ZERO }]));
      return J.map((a) => J.map((b) => dot(a, b)));
    },
    along(body: SegmentBody, at: Vec3, normal: Vec3): number {
      const length = Math.sqrt(dot(normal, normal));
      if (!(length > 0) || !Number.isFinite(length)) throw new Error("contact normal needs a finite nonzero direction");
      const linear = normal.map((v) => v / length) as unknown as Vec3;
      const row = projected([{ body, point: at, linear, angular: ZERO }]);
      const inverseMass = dot(row, row);
      return inverseMass <= Number.EPSILON * Number.EPSILON ? Infinity : 1 / inverseMass;
    },
  };
}

/**
 * Three common-point velocity rows, and optionally three equal-spin rows. The mean of the two
 * world anchors is the ideal joint's force reference. Solver stretch must not turn a common
 * rigid rotation into relative velocity and add spurious constraints to a closed loop.
 */
export function attachmentRows(parent: SegmentBody, child: SegmentBody, a: Vec3, b: Vec3, rigid: boolean): MotionConstraint[] {
  const opposite = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
  const point: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const rows: MotionConstraint[] = XYZ.map((linear) => [
    { body: parent, point, linear, angular: ZERO }, { body: child, point, linear: opposite(linear), angular: ZERO },
  ]);
  if (rigid) for (const angular of XYZ) rows.push([
    { body: parent, point: a, linear: ZERO, angular }, { body: child, point: b, linear: ZERO, angular: opposite(angular) },
  ]);
  return rows;
}
