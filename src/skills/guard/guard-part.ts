import { guardVariations, type GuardPart, type GuardSkill } from "../framework/guard.ts";
import { variationFault, type Varied } from "../framework/variations.ts";
import { soleRefusal } from "../../control/support.ts";
import type { Pose } from "../../core/bodies/spec/pose.ts";
import { fitsAll, fitsWhen } from "../../parts/parts.ts";
import type { ReadBody } from "../../core/bodies/read-body.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { guardPosture, guardSkill, handsOf, wardSpeed, validCovering, GUARD_COVER, type Covering } from "./guard.ts";
import { handConfigurationRefusal } from "../reach/hand.ts";
import { holdUp } from "./hold.ts";



/** **The cover guard**: the arms' posture (`guardPosture`), and a guarding hand's cover of what the mind names (`guardSkill`). */
interface CoverGuardConfig extends Varied {
  readonly kind: "cover-guard";
  readonly tuning?: {
    /** The cover in place of `GUARD_COVER`. */
    readonly covering?: Covering;
    /** Whether a free hand holds what it holds up through the whole-body solve (`holdUp`) rather than by its posture alone. */
    readonly hold?: boolean;
  };
}

/** A cover guard that also wards with an item's declared face: held out at the threat no faster than the body's balance allows (`wardSpeed`), turned toward it. */
interface ShieldGuardConfig extends Varied {
  readonly kind: "shield-guard";
  readonly tuning?: CoverGuardConfig["tuning"];
}

/** A cover guard's `fits`: a body with a hand that covers (`handsOf`). */
const coversWithHands = fitsWhen((spec: BodySpec) => handsOf(spec).length > 0, "needs a hand that covers: one with knuckles, or holding an item that says how it covers");

/** Whether a hand of `spec` that covers holds an item with a face it wards with (`ItemSpec.coverNormal`). */
const wardsWithFace = (spec: BodySpec): boolean => (spec.held ?? []).some(({ segment, item }) => item.coverNormal !== undefined && handsOf(spec).includes(segment));

/** Guard admission and construction consume the same complete cover settings. */
function guardFaults(config: CoverGuardConfig | ShieldGuardConfig): readonly string[] {
  const tuning = config.tuning;
  return tuning === undefined || !!tuning && typeof tuning === "object" && !Array.isArray(tuning)
    && Object.keys(tuning).every(key => key === "covering" || key === "hold")
    && (tuning.hold === undefined || typeof tuning.hold === "boolean") && validCovering(tuning.covering === undefined ? GUARD_COVER : tuning.covering)
    ? [] : ["invalid guard tuning"];
}
const guardFit = (spec: BodySpec, config: CoverGuardConfig | ShieldGuardConfig): string | null =>
  guardFaults(config)[0] ?? handConfigurationRefusal(spec, handsOf(spec), "open");

/** The guard skill of a cover guard's `config`, warding with an item's face where it is a shield guard. */
const coverMaker = (built: ReadBody, config: CoverGuardConfig | ShieldGuardConfig): GuardSkill => {
  const fault = guardFit(built.spec, config);
  if (fault) throw new Error(fault);
  return guardSkill(built.spec, config.tuning?.covering, {
    wardSpeeds: config.kind === "shield-guard" ? Object.fromEntries((built.spec.held ?? []).filter(({ item }) => item.coverNormal !== undefined).map(({ segment }) => [segment, wardSpeed(built, segment)])) : null,
    hold: config.tuning?.hold === true ? holdUp(built) : null,
  });
};

/** The cover guard's variations: the cover guard. */
const COVER_VARIATIONS = { "cover-guard": { posture: (spec: BodySpec) => guardPosture(spec), make: coverMaker } };

export const COVER_GUARD: GuardPart<CoverGuardConfig> = {
  role: "guard", label: "Guard and cover", stage: "game", fields: [], slots: [], defaults: { kind: "cover-guard" }, keys: { kind: true, variation: true, tuning: true },
  tuning: ["covering", "hold"], fits: fitsAll(variationFault("cover-guard", "guard and cover", COVER_VARIATIONS), guardFit, coversWithHands,
    fitsWhen((spec: BodySpec) => !wardsWithFace(spec), "holds an item with a face, which the shield guard wards with")), faults: guardFaults,
  supportedEquipment: (spec) => (spec.held ?? []).filter(({ item }) => item.cover !== undefined && item.coverNormal === undefined).map(({ segment }) => segment),
  ...guardVariations("cover-guard", COVER_VARIATIONS),
};

/** **At rest**: a body with no hand that covers holds no arms' rest and covers nothing. */
interface RestGuardConfig extends Varied { readonly kind: "rest" }

/** No posture: a body at rest is built in its reference pose, and nothing is put at rest beside what its skills hold. */
const NO_POSTURE: Pose = Object.freeze({});

/** The guard at rest: no hands, no posture, no hold and no cover. */
const AT_REST: GuardSkill = Object.freeze({ effectors: Object.freeze([]), posture: NO_POSTURE, hold: null, command: () => Object.freeze({}), resume: () => undefined });

/** At rest's variations: at rest. */
const REST_VARIATIONS = { rest: { posture: () => NO_POSTURE, make: () => AT_REST } };

export const REST_GUARD: GuardPart<RestGuardConfig> = {
  role: "guard", label: "At rest", stage: "game", fields: [], slots: [], defaults: { kind: "rest" }, keys: { kind: true, variation: true },
  fits: fitsAll(variationFault("rest", "rest", REST_VARIATIONS), fitsWhen((spec: BodySpec) => handsOf(spec).length === 0, "has a hand that covers, which a cover guard guards with")), faults: () => [],
  ...guardVariations("rest", REST_VARIATIONS),
};

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
const LOWERED_VARIATIONS = { lowered: { posture: () => LOWERED, make: () => LOWERED_SKILL } };

export const LOWERED_GUARD: GuardPart<LoweredGuardConfig> = {
  role: "guard", label: "Arms lowered", stage: "experimental", fields: [], slots: [], defaults: { kind: "lowered" }, keys: { kind: true, variation: true },
  fits: fitsAll(variationFault("lowered", "lowered arms", LOWERED_VARIATIONS),
    fitsWhen((spec: BodySpec) => Object.keys(LOWERED).every((channel) => spec.joints.some((joint) => joint.dofs.some((dof) => `${joint.name} ${dof.positive}` === channel))),
      "has no two arms to lower")), faults: () => [],
  ...guardVariations("lowered", LOWERED_VARIATIONS),
};

/** The shield guard's variations: the shield guard. */
const SHIELD_VARIATIONS = { "shield-guard": { posture: (spec: BodySpec) => guardPosture(spec), make: coverMaker } };

export const SHIELD_GUARD: GuardPart<ShieldGuardConfig> = {
  role: "guard", label: "Guard faces and lines", stage: "game", fields: [], slots: [], defaults: { kind: "shield-guard" }, keys: { kind: true, variation: true, tuning: true },
  tuning: ["covering", "hold"], fits: fitsAll(variationFault("shield-guard", "shield guard", SHIELD_VARIATIONS), guardFit, coversWithHands, soleRefusal,
    fitsWhen(wardsWithFace, "holds no item with a face to ward with")), faults: guardFaults,
  supportedEquipment: (spec) => (spec.held ?? []).filter(({ item }) => item.cover !== undefined).map(({ segment }) => segment),
  ...guardVariations("shield-guard", SHIELD_VARIATIONS),
};


declare module "../config.ts" {
  interface GuardConfigs {
    readonly "cover-guard": CoverGuardConfig;
    readonly "shield-guard": ShieldGuardConfig;
    readonly "rest": RestGuardConfig;
    readonly "lowered": LoweredGuardConfig;
  }
}
