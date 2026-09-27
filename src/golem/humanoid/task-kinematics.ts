import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { ARM_LIMITS, armForward, clamp } from "./kinematics.ts";

/** Position-only fallback for a carried endpoint. Every accepted step improves the endpoint
 * and retains the palm envelope; anatomical stops apply before accepting it. No physical pose
 * or velocity enters this solve. The ordinary hand-pose solver owns orientation first. */
export function solveTaskEndpoint(target: Vector3, offset: Vector3, seed: readonly number[],
  acceptsPalm: (point: Vector3) => boolean, passes = 24): number[] {
  let angles = [...seed];
  const endpoint = (pose: ReturnType<typeof armForward>) =>
    pose.point.add(offset.rotateByQuaternionToRef(pose.rotation, new Vector3()));
  if (!acceptsPalm(armForward(angles).point)) return angles;
  for (let pass = 0; pass < passes; pass++) {
    const pose = armForward(angles), tip = endpoint(pose), error = target.subtract(tip);
    const squared = error.lengthSquared();
    if (squared < .0003 ** 2) break;
    const columns = pose.frames.map(frame => Vector3.Cross(frame.axis, tip.subtract(frame.pivot)).asArray());
    const rhs = error.asArray();
    const matrix = Array.from({ length: 3 }, (_, r) => Array.from({ length: 4 }, (_, c) =>
      c === 3 ? rhs[r] : columns.reduce((sum, column) => sum + column[r] * column[c], 0) + (r === c ? .0008 : 0)));
    for (let k = 0; k < 3; k++) {
      let pivot = k;
      for (let r = k + 1; r < 3; r++) if (Math.abs(matrix[r][k]) > Math.abs(matrix[pivot][k])) pivot = r;
      [matrix[k], matrix[pivot]] = [matrix[pivot], matrix[k]];
      const divisor = matrix[k][k];
      for (let c = k; c < 4; c++) matrix[k][c] /= divisor;
      for (let r = 0; r < 3; r++) if (r !== k) {
        const factor = matrix[r][k];
        for (let c = k; c < 4; c++) matrix[r][c] -= factor * matrix[k][c];
      }
    }
    const delta = columns.map(column => clamp(column.reduce((sum, value, j) => sum + value * matrix[j][3], 0), -.16, .16));
    let accepted = false;
    for (const fraction of [1, .5, .25, .125, .0625]) {
      const candidate = angles.map((angle, i) => clamp(angle + delta[i] * fraction, ARM_LIMITS[i][0], ARM_LIMITS[i][1]));
      const next = armForward(candidate);
      if (!acceptsPalm(next.point) || Vector3.DistanceSquared(endpoint(next), target) >= squared) continue;
      angles = candidate; accepted = true; break;
    }
    if (!accepted) break;
  }
  return angles;
}
