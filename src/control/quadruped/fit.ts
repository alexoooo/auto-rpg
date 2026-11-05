import { supportConfigurationRefusal } from "../support-shapes.ts";
import { pawsOf, type BodySpec } from "../../core/bodies/spec/body.ts";
/** The joint `name` hangs from, if any. */
const above = (spec: BodySpec, name: string) => spec.joints.find((joint) => joint.child === name);

/** How many joints from the root `name` is. */
const depth = (spec: BodySpec, name: string): number => { const joint = above(spec, name); return joint ? 1 + depth(spec, joint.parent) : 0; };

/** A part's `fits` for a body on three paws or more, each the end of a hip, a knee and an ankle from the root, so two stay down while one steps. */
export const fitsPaws = (spec: BodySpec): string | null => pawsOf(spec).length >= 3 && pawsOf(spec).every((paw) => depth(spec, paw.segment) === 3 && spec.segments.find(segment => segment.name === paw.segment)?.points?.sole !== undefined)
  ? supportConfigurationRefusal(spec, pawsOf(spec).map(paw => spec.segments.find(segment => segment.name === paw.segment)!)) : "needs three paws or more, each at the end of a hip, a knee and an ankle";
