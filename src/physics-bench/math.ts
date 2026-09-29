/**
 * Double-precision vector and quaternion helpers for the physics bake-off. Quaternions are
 * [x, y, z, w] (Babylon's, Havok's and Rapier's order; MuJoCo's w-first order is converted in its
 * adapter). Every engine is read through these, so no reading goes through a float32 matrix (H75).
 */
export type V3 = [number, number, number];
export type Q4 = [number, number, number, number];

export const v3 = (x = 0, y = 0, z = 0): V3 => [x, y, z];
export const add = (a: readonly number[], b: readonly number[]): V3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
export const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
export const scale = (a: readonly number[], s: number): V3 => [a[0]! * s, a[1]! * s, a[2]! * s];
export const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
export const cross = (a: readonly number[], b: readonly number[]): V3 =>
  [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
export const norm = (a: readonly number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!);
export const normalize = (a: readonly number[]): V3 => scale(a, 1 / norm(a));

export const qIdentity = (): Q4 => [0, 0, 0, 1];
export const qMul = (a: readonly number[], b: readonly number[]): Q4 => [
  a[3]! * b[0]! + a[0]! * b[3]! + a[1]! * b[2]! - a[2]! * b[1]!,
  a[3]! * b[1]! - a[0]! * b[2]! + a[1]! * b[3]! + a[2]! * b[0]!,
  a[3]! * b[2]! + a[0]! * b[1]! - a[1]! * b[0]! + a[2]! * b[3]!,
  a[3]! * b[3]! - a[0]! * b[0]! - a[1]! * b[1]! - a[2]! * b[2]!,
];
export const qConj = (q: readonly number[]): Q4 => [-q[0]!, -q[1]!, -q[2]!, q[3]!];
export const qAxisAngle = (axis: readonly number[], angle: number): Q4 => {
  const s = Math.sin(angle / 2);
  return [axis[0]! * s, axis[1]! * s, axis[2]! * s, Math.cos(angle / 2)];
};
/** `v` turned by `q`. */
export function qRotate(q: readonly number[], v: readonly number[]): V3 {
  const [x, y, z, w] = q as Q4;
  const tx = 2 * (y * v[2]! - z * v[1]!), ty = 2 * (z * v[0]! - x * v[2]!), tz = 2 * (x * v[1]! - y * v[0]!);
  return [v[0]! + w * tx + y * tz - z * ty, v[1]! + w * ty + z * tx - x * tz, v[2]! + w * tz + x * ty - y * tx];
}
/** The quaternion of the rotation whose matrix has columns `x`, `y`, `z` (a right-handed orthonormal frame). */
export function qFromBasis(x: readonly number[], y: readonly number[], z: readonly number[]): Q4 {
  const m00 = x[0]!, m10 = x[1]!, m20 = x[2]!, m01 = y[0]!, m11 = y[1]!, m21 = y[2]!, m02 = z[0]!, m12 = z[1]!, m22 = z[2]!;
  const trace = m00 + m11 + m22;
  let q: Q4;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  const n = Math.hypot(...q);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}
/** The shortest rotation taking unit `from` to unit `to`. */
export function qBetween(from: readonly number[], to: readonly number[]): Q4 {
  const c = dot(from, to);
  if (c < -1 + 1e-12) {
    const axis = normalize(Math.abs(from[0]!) < 0.9 ? cross(from, [1, 0, 0]) : cross(from, [0, 1, 0]));
    return [axis[0], axis[1], axis[2], 0];
  }
  const a = cross(from, to);
  const q: Q4 = [a[0], a[1], a[2], 1 + c];
  const n = Math.hypot(...q);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}
/** A unit vector square to unit `a`. */
export const perpendicular = (a: readonly number[]): V3 =>
  normalize(Math.abs(a[0]!) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]));

/** The 3x3 matrix (row-major) of `q`. */
export function qMatrix(q: readonly number[]): number[] {
  const [x, y, z, w] = q as Q4;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

/**
 * Eigen-decomposition of a symmetric 3x3 matrix (row-major) by Jacobi rotations: the eigenvalues,
 * and the eigenvectors as the columns of a right-handed rotation, as a quaternion.
 */
export function symmetricEigen(m: readonly number[]): { values: V3; rotation: Q4 } {
  const a = [...m];
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = a[1]! ** 2 + a[2]! ** 2 + a[5]! ** 2;
    if (off < 1e-30) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]] as const) {
      const apq = a[p * 3 + q]!;
      if (Math.abs(apq) < 1e-300) continue;
      const theta = (a[q * 3 + q]! - a[p * 3 + p]!) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k * 3 + p]!, akq = a[k * 3 + q]!;
        a[k * 3 + p] = c * akp - s * akq; a[k * 3 + q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p * 3 + k]!, aqk = a[q * 3 + k]!;
        a[p * 3 + k] = c * apk - s * aqk; a[q * 3 + k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k * 3 + p]!, vkq = v[k * 3 + q]!;
        v[k * 3 + p] = c * vkp - s * vkq; v[k * 3 + q] = s * vkp + c * vkq;
      }
    }
  }
  const x: V3 = [v[0]!, v[3]!, v[6]!], y: V3 = [v[1]!, v[4]!, v[7]!];
  let z: V3 = [v[2]!, v[5]!, v[8]!];
  if (dot(cross(x, y), z) < 0) z = scale(z, -1);
  return { values: [a[0]!, a[4]!, a[8]!], rotation: qFromBasis(x, y, z) };
}

/** Percentile `p` (0-100) of `xs`, by sorting a copy. */
export function percentile(xs: readonly number[], p: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
  return s[i]!;
}
export const median = (xs: readonly number[]): number => percentile(xs, 50);
export const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
