import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltJoint } from "./build-body.ts";
import type { MotionConstraint } from "./constrained-mass.ts";
import { jointAngles, relativeRotationToRef } from "./joint-state.ts";
import type { Vec3 } from "../spec/quantity.ts";

const ZERO: Vec3 = [0, 0, 0];
const tuple = (v: Vector3): Vec3 => [v.x, v.y, v.z];
const dot = (a: readonly number[], b: readonly number[]): number => a.reduce((sum, v, i) => sum + v * b[i]!, 0);
const cross = (a: readonly number[], b: readonly number[]): Vec3 => [
  a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!,
];

/**
 * Measured angle motion for one freedom, including residual motion on locked axes. The row reads
 * angle rate from world angular velocities. Angle acceleration is row times angular acceleration
 * minus target; a stationary stop therefore asks for target, not zero. The equal and opposite
 * angular row is also the direction of a measured-angle limit reaction. It does not select active
 * stops or apply forces. A coordinate undefined at q_axis = q_w = 0 returns null.
 * This diagnostic allocation path uses actual body poses and spins, not reduced joint kinematics.
 */
export function jointCoordinateMotion(joint: BuiltJoint, axis: number): {
  readonly angle: number; readonly rate: number; readonly row: MotionConstraint; readonly target: number;
} | null {
  if (!Number.isInteger(axis) || axis < 0 || axis >= joint.dofs.length) throw new Error("invalid joint coordinate axis");
  const q = relativeRotationToRef(joint, new Quaternion()), local = [joint.axes.x, joint.axes.y, joint.axes.z];
  const v = local.map((a) => dot(a, [q.x, q.y, q.z])), w = q.w, i = axis, j = (i + 1) % 3, k = (i + 2) % 3;
  const denominator = w * w + v[i]! * v[i]!;
  if (denominator === 0) return null;
  const inverse = new Quaternion(), transform = new Quaternion();
  Quaternion.InverseToRef(joint.parent.rest, inverse);
  joint.parent.node.rotationQuaternion!.multiplyToRef(inverse, transform);
  const axes = local.map((a) => tuple(new Vector3(...a).applyRotationQuaternionToRef(transform, new Vector3())));
  const parent = tuple(joint.parent.body.angularVelocityToRef(new Vector3()));
  const child = tuple(joint.child.body.angularVelocityToRef(new Vector3()));
  const relative = child.map((value, n) => value - parent[n]!), u = axes.map((a) => dot(a, relative));
  const dw = -dot(u, v) / 2, uv = cross(u, v), dv = u.map((value, n) => (w * value + uv[n]!) / 2);
  const change = 2 * (w * dw + v[i]! * dv[i]!);
  const gradient = [0, 0, 0], derivative = [0, 0, 0];
  gradient[i] = 1;
  gradient[j] = (v[i]! * v[j]! + w * v[k]!) / denominator;
  gradient[k] = (v[i]! * v[k]! - w * v[j]!) / denominator;
  derivative[j] = (dv[i]! * v[j]! + v[i]! * dv[j]! + dw * v[k]! + w * dv[k]! - gradient[j]! * change) / denominator;
  derivative[k] = (dv[i]! * v[k]! + v[i]! * dv[k]! - dw * v[j]! - w * dv[j]! - gradient[k]! * change) / denominator;
  const world = (values: readonly number[]): Vec3 => [0, 1, 2].map((n) =>
    axes.reduce((sum, a, c) => sum + a[n]! * values[c]!, 0) * joint.dofs[i]!.sign) as unknown as Vec3;
  const angular = world(gradient), changing = world(derivative), turning = cross(parent, angular);
  const target = -dot(changing.map((value, n) => value + turning[n]!), relative);
  return { angle: jointAngles(joint)[i]!, rate: dot(angular, relative), target, row: [
    { body: joint.child.body, point: ZERO, linear: ZERO, angular },
    { body: joint.parent.body, point: ZERO, linear: ZERO, angular: [-angular[0], -angular[1], -angular[2]] },
  ] };
}
