import type { ColliderShape } from "../../physics/engine.ts";
import { localPoint, type SegmentFrame, type ShapeSpec } from "../spec/body.ts";

/** The collider of `spec` (body frame, reference pose) on a body whose pose is `frame`. */
export function colliderOf(frame: SegmentFrame, spec: ShapeSpec): ColliderShape {
  switch (spec.kind) {
    case "capsule":
      return { kind: "capsule", from: localPoint(frame, spec.from.value), to: localPoint(frame, spec.to.value), radius: spec.radius.value };
    case "box":
      return { kind: "box", centre: localPoint(frame, spec.centre.value), size: spec.size.value };
    case "sphere":
      return { kind: "sphere", centre: localPoint(frame, spec.centre.value), radius: spec.radius.value };
    case "hull":
      return { kind: "hull", points: spec.points.map((p) => localPoint(frame, p.value)) };
    default: {
      const never: never = spec;
      throw new Error(`unknown shape ${JSON.stringify(never)}`);
    }
  }
}
