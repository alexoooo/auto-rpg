import { guardVariations, type GuardPart, type GuardSkill } from "../../framework/guard.ts";
import type { Varied } from "../../framework/variations.ts";
import { fitsWhen } from "../../../parts/parts.ts";
import { soleRefusal } from "../../../control/support.ts";
import type { ReadBody } from "../../../core/bodies/read-body.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { facedHands } from "../../../core/bodies/items/held.ts";
import { guardPosture, guardSkill, handsOf, wardSpeed, validCovering, GUARD_COVER, type Covering } from "../shared/guard.ts";
import { handConfigurationRefusal } from "../../reach/hand.ts";
import { holdUp } from "../shared/hold.ts";

/** **The cover guard's config**: its kind and its settings. */
interface CoverGuardConfig extends Varied {
  readonly kind: "cover-guard";
  readonly tuning?: {
    /** The cover in place of `GUARD_COVER`. */
    readonly covering?: Covering;
    /** Whether a free hand holds what it holds up through the whole-body solve (`holdUp`) rather than by its posture alone. */
    readonly hold?: boolean;
  };
}

/** The hands of `spec` that cover holding an item with a face (`facedHands`): each wards with it. */
const wardingHands = (spec: BodySpec): readonly string[] => facedHands(spec).filter((hand) => handsOf(spec).includes(hand));

/** Guard admission and construction consume the same complete cover settings. */
function coverFaults(config: CoverGuardConfig): readonly string[] {
  const tuning = config.tuning;
  return tuning === undefined || !!tuning && typeof tuning === "object" && !Array.isArray(tuning)
    && Object.keys(tuning).every(key => key === "covering" || key === "hold")
    && (tuning.hold === undefined || typeof tuning.hold === "boolean") && validCovering(tuning.covering === undefined ? GUARD_COVER : tuning.covering)
    ? [] : ["invalid guard tuning"];
}

/** The guard's settings and its body's open hands: why it does not fit, or null. */
const coverFit = (spec: BodySpec, config: CoverGuardConfig): string | null =>
  coverFaults(config)[0] ?? handConfigurationRefusal(spec, handsOf(spec), "open");

/**
 * The guard skill of `config`: its hands' cover of what the mind names (`guardSkill`), each hand
 * holding a face warding with it no faster than the body's balance allows (`wardSpeed`).
 */
function coverSkill(built: ReadBody, config: CoverGuardConfig): GuardSkill {
  const fault = coverFit(built.spec, config);
  if (fault) throw new Error(fault);
  return guardSkill(built.spec, config.tuning?.covering, {
    wardSpeeds: Object.fromEntries(wardingHands(built.spec).map((hand) => [hand, wardSpeed(built, hand)])),
    hold: config.tuning?.hold === true ? holdUp(built) : null,
  });
}

/** The cover guard's variations: the cover guard. */
const VARIATIONS = { "cover-guard": { posture: (spec: BodySpec) => guardPosture(spec), make: coverSkill } };

/**
 * **The cover guard**: the arms' posture (`guardPosture`) and each hand's cover of what the mind
 * names with what it covers with (`handsOf`: its knuckles, or what it holds where the item says how
 * it covers). A hand holding an item with a face holds the face out at the threat, turned toward
 * it, no faster than the body's balance allows: for that the body needs soles to balance on.
 */
export const COVER_GUARD: GuardPart<CoverGuardConfig> = {
  // A shield.
  icon: "M12 2l8 3v6c0 5-3.4 9-8 11c-4.6-2-8-6-8-11V5Z",
  covers: (spec) => handsOf(spec),
  role: "guard", label: "Guard and cover", fields: [], slots: [], defaults: { kind: "cover-guard" }, keys: { kind: true, variation: true, tuning: true },
  tuning: ["covering", "hold"], faults: coverFaults,
  supportedEquipment: (spec) => (spec.held ?? []).filter(({ item }) => item.cover !== undefined).map(({ segment }) => segment),
  asSkill: { group: "Guard", ends: ["standing"] }, ...guardVariations({ skill: "cover-guard", label: "guard and cover", variations: VARIATIONS, fits: [coverFit,
    fitsWhen((spec: BodySpec) => handsOf(spec).length > 0, "needs a hand that covers: one with knuckles, or holding an item that says how it covers"),
    (spec: BodySpec) => wardingHands(spec).length > 0 ? soleRefusal(spec) : null] }),
};

declare module "../../config.ts" {
  interface GuardConfigs {
    readonly "cover-guard": CoverGuardConfig;
  }
}
