import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { ColliderShape } from "../engine/engine.ts";
import type { Vec3 } from "../spec/quantity.ts";

/**
 * Current geometric support points toward a plane, whose inward normal points into the shape.
 * Shape coordinates are body-local. Rotation and normal are normalized locally without mutation.
 * The caller supplies the world pose and a nonnegative linear
 * tolerance for selecting a near-coplanar feature. This does not detect contact, choose friction,
 * or assert that every selected vertex is loaded. Curved supports replace material continuously.
 */
export function planarSupportPoints(shape: ColliderShape, position: Vec3, rotation: Readonly<Quaternion>, normal: Vec3, tolerance: number): Vec3[] {
  const length = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
  const turnLength = Math.sqrt(rotation.x * rotation.x + rotation.y * rotation.y + rotation.z * rotation.z + rotation.w * rotation.w);
  if (!(length > 0) || !Number.isFinite(length) || !(tolerance >= 0) || !Number.isFinite(tolerance)
    || position.length !== 3 || !Array.from(position).every(Number.isFinite)
    || !(turnLength > 0) || !Number.isFinite(turnLength)) throw new Error("invalid planar support pose or tolerance");
  const direction = normal.map((v) => v / length) as unknown as Vec3;
  let vertices: readonly Vec3[], radius = 0;
  switch (shape.kind) {
    case "sphere": vertices = [shape.centre]; radius = shape.radius; break;
    case "capsule": vertices = [shape.from, shape.to]; radius = shape.radius; break;
    case "box": {
      if (!Array.from(shape.size).every((v) => v > 0 && Number.isFinite(v))) throw new Error("invalid planar support box");
      const corners: Vec3[] = [];
      for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) corners.push([
        shape.centre[0] + x * shape.size[0], shape.centre[1] + y * shape.size[1], shape.centre[2] + z * shape.size[2],
      ]);
      vertices = corners; break;
    }
    case "hull": vertices = shape.points; break;
    default: { const never: never = shape; throw new Error(`unknown planar support shape ${JSON.stringify(never)}`); }
  }
  if (!vertices.length || !Array.from(vertices).every((p) => p?.length === 3 && Array.from(p).every(Number.isFinite))
    || !(radius >= 0) || !Number.isFinite(radius)) throw new Error("invalid planar support geometry");
  const turn = new Quaternion(rotation.x / turnLength, rotation.y / turnLength, rotation.z / turnLength, rotation.w / turnLength), point = new Vector3();
  const candidates = vertices.map((vertex): Vec3 => {
    point.set(...vertex).applyRotationQuaternionToRef(turn, point);
    return [point.x + position[0] - radius * direction[0], point.y + position[1] - radius * direction[1], point.z + position[2] - radius * direction[2]];
  });
  const levels = candidates.map((p) => p[0] * direction[0] + p[1] * direction[1] + p[2] * direction[2]);
  if (!candidates.every((p) => p.every(Number.isFinite)) || !levels.every(Number.isFinite)) throw new Error("nonfinite planar support projection");
  let minimum = Infinity;
  for (const level of levels) minimum = Math.min(minimum, level);
  const selected: Vec3[] = [];
  candidates.forEach((p, i) => {
    if (levels[i]! - minimum <= tolerance && !selected.some((other) => p.every((v, k) => v === other[k]))) selected.push(p);
  });
  return selected;
}
