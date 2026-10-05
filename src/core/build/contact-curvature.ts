import type { ColliderShape } from "../engine/engine.ts";
import type { Vec3 } from "../spec/quantity.ts";

/**
 * Material-point acceleration compatible with a curved shape rolling on a fixed plane.
 * `normal` is unit length, from the plane into the body; spin is in world coordinates.
 * A sphere/capsule is a point/segment dilated by radius r. Its support point's radial offset
 * is -r n in world space, rather than a fixed material offset. The velocity constraint's
 * derivative therefore requires omega x (omega x (-r n)), not zero material acceleration.
 * Polyhedral support vertices have no smooth radius; edge changes need a separate mode choice.
 */
export function planarContactAcceleration(shape: ColliderShape, normal: Vec3, spin: Vec3): Vec3 {
  let radius: number;
  switch (shape.kind) {
    case "sphere": case "capsule": radius = shape.radius; break;
    case "box": case "hull": return [0, 0, 0];
    default: { const never: never = shape; throw new Error(`unknown contact shape ${JSON.stringify(never)}`); }
  }
  const x = -radius * normal[0], y = -radius * normal[1], z = -radius * normal[2];
  const a = spin[1] * z - spin[2] * y, b = spin[2] * x - spin[0] * z, c = spin[0] * y - spin[1] * x;
  return [spin[1] * c - spin[2] * b, spin[2] * a - spin[0] * c, spin[0] * b - spin[1] * a];
}
