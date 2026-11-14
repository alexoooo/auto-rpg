import type { BodySpec } from "../../../core/bodies/spec/body.ts";

/** `spec`'s leg, m: its left hip's centre to its left ankle's in the reference pose. */
export function legOf(spec: BodySpec): number {
  return jointGap(spec, "hip.left", "ankle.left");
}

/** The distance between two of `spec`'s joints' centres, m. */
function jointGap(spec: BodySpec, a: string, b: string): number {
  const centre = (name: string): readonly number[] => {
    const joint = spec.joints.find((j) => j.name === name);
    if (!joint) throw new Error(`a gait needs a joint ${name}`);
    return joint.centre.value;
  };
  const p = centre(a), q = centre(b), x = p[0]! - q[0]!, y = p[1]! - q[1]!, z = p[2]! - q[2]!;
  return Math.sqrt(x * x + y * y + z * z);
}
