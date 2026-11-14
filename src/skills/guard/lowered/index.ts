import { guardVariations, type GuardPart, type GuardSkill } from "../../framework/guard.ts";
import { variationFault, type Varied } from "../../framework/variations.ts";
import type { Pose } from "../../../core/bodies/spec/pose.ts";
import { fitsAll, fitsWhen } from "../../../parts/parts.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";

/** **Arms lowered**: the arms hang at the sides and cover nothing, a drill's open target. */
interface LoweredGuardConfig extends Varied { readonly kind: "lowered" }

/**
 * The arms hanging: each upper arm by the trunk, the elbow a little bent, so the head and the chest
 * are open to a blow from any side.
 */
const LOWERED: Pose = Object.freeze({
  "shoulder.right flexion": 0, "shoulder.right abduction": -0.5, "elbow.right flexion": -0.6,
  "shoulder.left flexion": 0, "shoulder.left abduction": -0.5, "elbow.left flexion": -0.6,
});

/** The guard with arms lowered: the posture alone, no hold and no cover. */
const LOWERED_SKILL: GuardSkill = Object.freeze({ effectors: Object.freeze([]), posture: LOWERED, hold: null, command: () => Object.freeze({}), resume: () => undefined });

/** Arms lowered's variations: arms lowered. */
const VARIATIONS = { lowered: { posture: () => LOWERED, make: () => LOWERED_SKILL } };

export const LOWERED_GUARD: GuardPart<LoweredGuardConfig> = {
  role: "guard", label: "Arms lowered", stage: "experimental", fields: [], slots: [], defaults: { kind: "lowered" }, keys: { kind: true, variation: true },
  fits: fitsAll(variationFault("lowered", "lowered arms", VARIATIONS),
    fitsWhen((spec: BodySpec) => Object.keys(LOWERED).every((channel) => spec.joints.some((joint) => joint.dofs.some((dof) => `${joint.name} ${dof.positive}` === channel))),
      "has no two arms to lower")), faults: () => [],
  skillGroup: "Guard", ...guardVariations("lowered", VARIATIONS),
};

declare module "../../config.ts" {
  interface GuardConfigs {
    readonly "lowered": LoweredGuardConfig;
  }
}
