import { supportConfigurationRefusal } from "../support-shapes.ts";
import { pawsOf, type BodySpec } from "../../core/bodies/spec/body.ts";
/** The joint `name` hangs from, if any. */
const above = (spec: BodySpec, name: string) => spec.joints.find((joint) => joint.child === name);

/** How many joints from the root `name` is. */
const depth = (spec: BodySpec, name: string): number => { const joint = above(spec, name); return joint ? 1 + depth(spec, joint.parent) : 0; };

/** A part's `fits` for a body on three paws or more, each the end of a hip, a knee and an ankle from the root, so two stay down while one steps. */
export function fitsPaws(spec: BodySpec): string | null {
  const paws = pawsOf(spec);
  if (paws.length < 3 || paws.some(paw => depth(spec, paw.segment) !== 3)) return "needs three paws or more, each at the end of a hip, a knee and an ankle";
  for (const paw of paws) {
    const segment = spec.segments.find(segment => segment.name === paw.segment);
    if (!segment?.points?.[paw.point]) return `unknown support endpoint ${paw.segment}/${paw.point}`;
    if (paw.sole && segment.shape.kind !== "box") return `${paw.segment}: a rectangular support sole needs a box`;
  }
  return supportConfigurationRefusal(spec, paws.map(paw => spec.segments.find(segment => segment.name === paw.segment)!));
}
