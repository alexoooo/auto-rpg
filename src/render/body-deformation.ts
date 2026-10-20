import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../core/build/build-body.ts";
import { modelSpec, type BodyModel } from "../core/models.ts";
import { frameOf } from "../core/spec/body.ts";
import { shapeBounds } from "../core/spec/shape-bounds.ts";
import { distance } from "../core/spec/vec.ts";

/** Authored body-frame coordinates into a configured segment's local frame, including its surface deformation. */
export function skinReference(built: BuiltBody, name: string): Matrix {
  const source = modelSpec(built.spec.model as BodyModel).segments.find(s => s.name === name)!;
  const target = built.segments.get(name)!.spec, frame = frameOf(source);
  const reference = Matrix.Compose(Vector3.One(), Quaternion.RotationQuaternionFromAxis(
    Vector3.FromArray(frame.x), Vector3.FromArray(frame.y), Vector3.FromArray(frame.z)), Vector3.FromArray(frame.origin));
  if (source === target) return Matrix.Invert(reference);
  const from = shapeBounds(source, true, source.handPoses?.open), to = shapeBounds(target, true, target.handPoses?.open);
  const factors = [0, 1, 2].map(i => i === 1
    ? distance(target.proximal.value, target.distal.value) / distance(source.proximal.value, source.distal.value)
    : (to.max[i]! - to.min[i]!) / (from.max[i]! - from.min[i]!));
  const offset = factors.map((k, i) => (to.max[i]! + to.min[i]! - (from.max[i]! + from.min[i]!) * k) / 2);
  return Matrix.Invert(reference).multiply(Matrix.Scaling(factors[0]!, factors[1]!, factors[2]!))
    .multiply(Matrix.Translation(offset[0]!, offset[1]!, offset[2]!));
}
