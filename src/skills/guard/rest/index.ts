import { guardVariations, type GuardPart, type GuardSkill } from "../../framework/guard.ts";
import type { Varied } from "../../framework/variations.ts";
import type { Pose } from "../../../core/bodies/spec/pose.ts";

/** **At rest**: the body's reference pose, without active cover. */
interface RestGuardConfig extends Varied { readonly kind: "rest" }

/** No posture: a body at rest is built in its reference pose, and nothing is put at rest beside what its skills hold. */
const NO_POSTURE: Pose = Object.freeze({});

/** The guard at rest: no hands, no posture, no hold and no cover. */
const AT_REST: GuardSkill = Object.freeze({ effectors: Object.freeze([]), posture: NO_POSTURE, hold: null, command: () => Object.freeze({}), resume: () => undefined });

/** At rest's variations: at rest. */
const VARIATIONS = { rest: { posture: () => NO_POSTURE, make: () => AT_REST } };

export const REST_GUARD: GuardPart<RestGuardConfig> = {
  // A shield's outline: no guard held.
  icon: "M12 2l8 3v6c0 5-3.4 9-8 11c-4.6-2-8-6-8-11V5ZM12 4.6l-5.6 2.1V11c0 3.8 2.4 6.7 5.6 8.3c3.2-1.6 5.6-4.5 5.6-8.3V6.7Z",
  role: "guard", label: "At rest", fields: [], slots: [], defaults: { kind: "rest" }, keys: { kind: true, variation: true },
  faults: () => [], skillGroup: "Guard", ...guardVariations({ skill: "rest", label: "rest", variations: VARIATIONS, fits: [] }),
};

declare module "../../config.ts" {
  interface GuardConfigs {
    readonly "rest": RestGuardConfig;
  }
}
