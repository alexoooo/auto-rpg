import { fitsWhen } from "../../parts/parts.ts";
import { pawsOf, segmentOf, type BodySpec } from "../../core/bodies/spec/body.ts";
/** The joint `name` hangs from, if any. */
const above = (spec: BodySpec, name: string) => spec.joints.find((joint) => joint.child === name);

/** How many joints from the root `name` is. */
const depth = (spec: BodySpec, name: string): number => { const joint = above(spec, name); return joint ? 1 + depth(spec, joint.parent) : 0; };

/** A part's `fits` for a body on three paws or more, each the end of a hip, a knee and an ankle from the root, so two stay down while one steps. */
export const fitsPaws = fitsWhen((spec: BodySpec) => pawsOf(spec).length >= 3 && pawsOf(spec).every((paw) => depth(spec, paw.segment) === 3),
  "needs three paws or more, each at the end of a hip, a knee and an ankle");

/** A part's `fits` for a body with a jaw: a segment with a bite point hinged to a head with a mouth (`mouthOf`). */
export const fitsJaw = fitsWhen((spec: BodySpec) => {
  const jaw = spec.segments.find((s) => s.points?.bite), parent = jaw && above(spec, jaw.name)?.parent, head = parent === undefined ? undefined : segmentOf(spec, parent);
  return !!head?.points?.mouth && above(spec, head.name) !== undefined;
}, "needs a jaw with a bite point, hinged to a head with a mouth");
