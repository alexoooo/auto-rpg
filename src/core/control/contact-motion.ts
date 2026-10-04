import type { ContactManifold } from "../engine/engine.ts";
import type { Vec3 } from "../spec/quantity.ts";

/**
 * Normal closing-velocity rows at a rigid body's reference point: spin xyz, then translation xyz.
 * For an outward contact normal n and offset r, each row is [r cross n, n]. A positive result
 * closes on the other surface. These are unilateral geometry rows, not friction welds: the
 * controller supplies the other body's point motion and decides sticking, sliding or lift-off.
 */
export function contactMotionRows(manifold: ContactManifold, reference: Vec3) {
  const [nx, ny, nz] = manifold.normal;
  return manifold.points.map(({ point, distance }) => {
    const x = point[0] - reference[0], y = point[1] - reference[1], z = point[2] - reference[2];
    return { point: [...point] as Vec3, distance,
      row: [y * nz - z * ny, z * nx - x * nz, x * ny - y * nx, nx, ny, nz] as const };
  });
}
