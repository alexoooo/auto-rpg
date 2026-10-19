import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { ShapeSpec } from "../../spec/body.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import type { ReadBody, ReadSegment } from "../../read-body.ts";

/** Conservative anatomical projections: a hand or forearm must clear every trunk footprint. */
export function armClearance(built: ReadBody): () => boolean {
  const parts = [...built.segments.values()].filter(p => p.spec.name.endsWith("Trunk") || /^(hand|forearm)\./.test(p.spec.name));
  const bounds = parts.map(part => {
    const vertices: { point: Vector3; radius: number }[] = [];
    const add = (point: Vec3, radius: number) => {
      const f = part.frame, x = point[0] - f.origin[0], y = point[1] - f.origin[1], z = point[2] - f.origin[2];
      vertices.push({ point: new Vector3(x * f.x[0] + y * f.x[1] + z * f.x[2],
        x * f.y[0] + y * f.y[1] + z * f.y[2], x * f.z[0] + y * f.z[1] + z * f.z[2]), radius });
    };
    const shape = (s: ShapeSpec) => {
      switch (s.kind) {
        case "capsule": add(s.from.value, s.radius.value); add(s.to.value, s.radius.value); break;
        case "sphere": add(s.centre.value, s.radius.value); break;
        case "hull": for (const p of s.points) add(p.value, 0); break;
        case "box": {
          const f = part.frame, c = s.centre.value, half = s.size.value.map(n => n / 2);
          for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) add([
            c[0] + x * half[0]! * f.x[0] + y * half[1]! * f.y[0] + z * half[2]! * f.z[0],
            c[1] + x * half[0]! * f.x[1] + y * half[1]! * f.y[1] + z * half[2]! * f.z[1],
            c[2] + x * half[0]! * f.x[2] + y * half[1]! * f.y[2] + z * half[2]! * f.z[2]], 0);
          break;
        }
        default: { const never: never = s; throw new Error(`unknown shape ${never}`); }
      }
    };
    shape(part.spec.shape);
    for (const contact of part.spec.contacts ?? []) shape(contact.shape);
    return { part, vertices, low: new Vector3(), high: new Vector3() };
  });
  const trunk = bounds.filter(b => b.part.spec.name.endsWith("Trunk")), arms = bounds.filter(b => !b.part.spec.name.endsWith("Trunk"));
  const point = new Vector3();
  const update = (b: { part: ReadSegment; vertices: { point: Vector3; radius: number }[]; low: Vector3; high: Vector3 }) => {
    b.low.setAll(Infinity); b.high.setAll(-Infinity);
    for (const v of b.vertices) {
      v.point.applyRotationQuaternionToRef(b.part.node.rotationQuaternion!, point).addInPlace(b.part.node.position);
      b.low.x = Math.min(b.low.x, point.x - v.radius); b.high.x = Math.max(b.high.x, point.x + v.radius);
      b.low.y = Math.min(b.low.y, point.y - v.radius); b.high.y = Math.max(b.high.y, point.y + v.radius);
      b.low.z = Math.min(b.low.z, point.z - v.radius); b.high.z = Math.max(b.high.z, point.z + v.radius);
    }
  };
  return () => {
    for (const b of bounds) update(b);
    for (const arm of arms) for (const body of trunk) {
      if (arm.low.y < body.high.y && arm.low.x < body.high.x && arm.high.x > body.low.x
        && arm.low.z < body.high.z && arm.high.z > body.low.z) return false;
    }
    return true;
  };
}
