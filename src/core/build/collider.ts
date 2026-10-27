import type { ColliderShape } from "../engine/engine.ts";
import type { SegmentFrame, ShapeSpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { dot, sub } from "../spec/vec.ts";

/** `point`, body frame, in `frame`'s coordinates. */
export function local(frame: SegmentFrame, point: Vec3): Vec3 {
  const d = sub(point, frame.origin);
  return [dot(d, frame.x), dot(d, frame.y), dot(d, frame.z)];
}

/** The collider of `spec` (body frame, reference pose) on a body whose node is `frame`. */
export function colliderOf(frame: SegmentFrame, spec: ShapeSpec): ColliderShape {
  switch (spec.kind) {
    case "capsule":
      return { kind: "capsule", from: local(frame, spec.from.value), to: local(frame, spec.to.value), radius: spec.radius.value };
    case "box":
      return { kind: "box", centre: local(frame, spec.centre.value), size: spec.size.value };
    case "sphere":
      return { kind: "sphere", centre: local(frame, spec.centre.value), radius: spec.radius.value };
    case "hull":
      return { kind: "hull", points: spec.points.map((p) => local(frame, p.value)) };
    default: {
      const never: never = spec;
      throw new Error(`unknown shape ${JSON.stringify(never)}`);
    }
  }
}
