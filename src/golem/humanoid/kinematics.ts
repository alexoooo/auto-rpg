import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { PALM_GRIP } from "./grip.ts";

/** Seven anatomical hinges, in proximal-to-distal order. SI units. */
export const ARM_AXES = [Vector3.Up(), Vector3.Right(), Vector3.Up(), Vector3.Right(),
  Vector3.Up(), Vector3.Right(), Vector3.Forward()];
export const ARM_LENGTHS = [0, 0, 0.32, 0.27, 0, 0, 0.09];
export const ARM_LIMITS = [[-2.5, 2.5], [-2.7, 1.4], [-1.6, 1.6], [-2.65, -0.04],
  [-1.5, 1.5], [-0.85, 0.85], [-0.5, 0.5]] as const;
export const ARM_REST = [0, 0.35, 0, -1.3, 0, 0, 0];
export const ARM_IDS = ["shoulderYaw", "shoulderPitch", "upper", "fore", "pronation", "wrist", "hand"];
export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export function armForward(angles: readonly number[]) {
  let rotation = Quaternion.Identity(), point = Vector3.Zero();
  const frames: { pivot: Vector3; rotation: Quaternion; end: Vector3; axis: Vector3 }[] = [];
  for (let i = 0; i < 7; i++) {
    const axis = ARM_AXES[i].rotateByQuaternionToRef(rotation, new Vector3());
    rotation = rotation.multiply(Quaternion.RotationAxis(ARM_AXES[i], angles[i])).normalize();
    const end = new Vector3(0, -ARM_LENGTHS[i], 0).rotateByQuaternionToRef(rotation, new Vector3()).addInPlace(point);
    frames.push({ pivot: point, rotation, end, axis }); point = end;
  }
  point = frames[6].pivot.add(new Vector3(0, -ARM_LENGTHS[6] / 2, 0).add(PALM_GRIP).rotateByQuaternionToRef(rotation, new Vector3()));
  return { point, rotation, frames };
}

export function rotationError(wanted: Quaternion, actual: Quaternion): Vector3 {
  const q = wanted.multiply(actual.conjugate()).normalize();
  const sign = q.w < 0 ? -1 : 1;
  const v = new Vector3(q.x * sign, q.y * sign, q.z * sign);
  const n = v.length();
  return n < 1e-9 ? v.scale(2) : v.scale(2 * Math.atan2(n, Math.abs(q.w)) / n);
}

/** Bounded damped least-squares solve. It reads commanded geometry, never physical lag. */
export function solveArm(point: Vector3, orientation: Quaternion | null, previous = ARM_REST, passes = 18, side = 0, supported = false): number[] {
  const q = [...previous];
  if (supported) q[5] = q[6] = 0;
  const wrist = orientation ? point.subtract(new Vector3(0, -.045, 0).add(PALM_GRIP).rotateByQuaternionToRef(orientation, new Vector3())) : point;
  const distance = clamp(wrist.length(), .08, .585), direction = wrist.normalizeToNew();
  const along = (.32 * .32 - .27 * .27 + distance * distance) / (2 * distance);
  const pole = new Vector3(side * .8, -1, -.2);
  pole.subtractInPlace(direction.scale(Vector3.Dot(pole, direction))).normalize();
  const elbow = direction.scale(along).add(pole.scale(Math.sqrt(Math.max(0, .32 * .32 - along * along))));
  for (let pass = 0; pass < passes; pass++) {
    const f = armForward(q), dp = point.subtract(f.point);
    const dr = orientation ? rotationError(orientation, f.rotation).scale(0.3) : Vector3.Zero();
    if (dp.length() < 0.0003 && dr.length() < 0.0003) break;
    const de = side ? elbow.subtract(f.frames[2].end).scale(.12) : Vector3.Zero();
    const error = [dp.x, dp.y, dp.z, dr.x, dr.y, dr.z, de.x, de.y, de.z];
    const columns = f.frames.map((frame, i) => {
      const p = Vector3.Cross(frame.axis, f.point.subtract(frame.pivot));
      const a = frame.axis.scale(orientation ? 0.3 : 0);
      const e = side && i < 3 ? Vector3.Cross(frame.axis, f.frames[2].end.subtract(frame.pivot)).scale(.12) : Vector3.Zero();
      return supported && i >= 5 ? Array(9).fill(0) : [p.x, p.y, p.z, a.x, a.y, a.z, e.x, e.y, e.z];
    });
    const matrix = Array.from({ length: 9 }, (_, r) => Array.from({ length: 10 }, (_, c) =>
      c === 9 ? error[r] : columns.reduce((s, j) => s + j[r] * j[c], 0) + (r === c ? 0.0008 : 0)));
    for (let k = 0; k < 9; k++) {
      let pivot = k;
      for (let r = k + 1; r < 9; r++) if (Math.abs(matrix[r][k]) > Math.abs(matrix[pivot][k])) pivot = r;
      [matrix[k], matrix[pivot]] = [matrix[pivot], matrix[k]];
      const divisor = matrix[k][k];
      for (let c = k; c <= 9; c++) matrix[k][c] /= divisor;
      for (let r = 0; r < 9; r++) if (r !== k) {
        const factor = matrix[r][k];
        for (let c = k; c <= 9; c++) matrix[r][c] -= factor * matrix[k][c];
      }
    }
    for (let i = 0; i < 7; i++) {
      const step = columns[i].reduce((s, x, j) => s + x * matrix[j][9], 0);
      q[i] = clamp(q[i] + clamp(step, -0.16, 0.16), ARM_LIMITS[i][0], ARM_LIMITS[i][1]);
    }
  }
  // Position and anatomical limits take priority over an impossible requested orientation.
  if (side && orientation && Vector3.Distance(armForward(q).point, point) > .015)
    return solveArm(point, null, q, passes, side, supported);
  return q;
}

export function validOrientation(value: { x: number; y: number; z: number; w: number } | undefined): Quaternion | null {
  if (!value || ![value.x, value.y, value.z, value.w].every(Number.isFinite)) return null;
  const q = new Quaternion(value.x, value.y, value.z, value.w);
  return q.lengthSquared() > 1e-10 ? q.normalize() : null;
}

/** Decompose achieved segment rotations into the same virtual coordinates as forward kinematics. */
export function measureArm(rotations: readonly Quaternion[], reference: readonly number[]): number[] {
  const shoulder = rotations[0], elbow = rotations[0].conjugate().multiply(rotations[1]), wrist = rotations[1].conjugate().multiply(rotations[2]);
  const wrap = (a: number, near: number) => near + Math.atan2(Math.sin(a - near), Math.cos(a - near));
  const sign = reference[1] < 0 ? -1 : 1;
  const sum = 2 * Math.atan2(shoulder.y, shoulder.w), difference = 2 * Math.atan2(-shoulder.z * sign, shoulder.x * sign);
  return [wrap((sum + difference) / 2, reference[0]), sign * 2 * Math.atan2(Math.hypot(shoulder.x, shoulder.z), Math.hypot(shoulder.y, shoulder.w)),
    wrap((sum - difference) / 2, reference[2]), wrap(2 * Math.atan2(elbow.x, elbow.w), reference[3]), wrap(2 * Math.atan2(elbow.y, elbow.w), reference[4]),
    wrap(2 * Math.atan2(wrist.x, wrist.w), reference[5]), wrap(2 * Math.atan2(wrist.z, wrist.w), reference[6])];
}
