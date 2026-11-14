import { guardVariations, type GuardPart, type GuardSkill } from "../../framework/guard.ts";
import { variationFault, type Varied } from "../../framework/variations.ts";
import type { Pose } from "../../../core/bodies/spec/pose.ts";
import { fitsAll, fitsWhen } from "../../../parts/parts.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { handsOf } from "../shared/guard.ts";

/** **At rest**: a body with no hand that covers holds no arms' rest and covers nothing. */
interface RestGuardConfig extends Varied { readonly kind: "rest" }

/** No posture: a body at rest is built in its reference pose, and nothing is put at rest beside what its skills hold. */
const NO_POSTURE: Pose = Object.freeze({});

/** The guard at rest: no hands, no posture, no hold and no cover. */
const AT_REST: GuardSkill = Object.freeze({ effectors: Object.freeze([]), posture: NO_POSTURE, hold: null, command: () => Object.freeze({}), resume: () => undefined });

/** At rest's variations: at rest. */
const VARIATIONS = { rest: { posture: () => NO_POSTURE, make: () => AT_REST } };

export const REST_GUARD: GuardPart<RestGuardConfig> = {
  role: "guard", label: "At rest", stage: "game", fields: [], slots: [], defaults: { kind: "rest" }, keys: { kind: true, variation: true },
  fits: fitsAll(variationFault("rest", "rest", VARIATIONS), fitsWhen((spec: BodySpec) => handsOf(spec).length === 0, "has a hand that covers, which a cover guard guards with")), faults: () => [],
  skillGroup: "Guard", ...guardVariations("rest", VARIATIONS),
};

declare module "../../config.ts" {
  interface GuardConfigs {
    readonly "rest": RestGuardConfig;
  }
}
