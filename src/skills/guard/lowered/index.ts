import { guardVariations, type GuardPart, type GuardSkill } from "../../framework/guard.ts";
import type { Varied } from "../../framework/variations.ts";
import type { Pose } from "../../../core/bodies/spec/pose.ts";
import { fitsWhen } from "../../../parts/parts.ts";
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
  // A shield's outline with an arrow down in it.
  icon: "M12 2l8 3v6c0 5-3.4 9-8 11c-4.6-2-8-6-8-11V5ZM12 4.6l-5.6 2.1V11c0 3.8 2.4 6.7 5.6 8.3c3.2-1.6 5.6-4.5 5.6-8.3V6.7ZM8.5 9.5h7L12 15Z",
  role: "guard", label: "Arms lowered", fields: [], slots: [], defaults: { kind: "lowered" }, keys: { kind: true, variation: true },
  faults: () => [], asSkill: { group: "Guard", ends: ["standing"] }, ...guardVariations({ skill: "lowered", label: "lowered arms", variations: VARIATIONS, fits: [
    fitsWhen((spec: BodySpec) => Object.keys(LOWERED).every((channel) => spec.joints.some((joint) => joint.dofs.some((dof) => `${joint.name} ${dof.positive}` === channel))),
      "has no two arms to lower")] }),
};

declare module "../../config.ts" {
  interface GuardConfigs {
    readonly "lowered": LoweredGuardConfig;
  }
}
