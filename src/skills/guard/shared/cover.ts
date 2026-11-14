import type { GuardSkill } from "../../framework/guard.ts";
import type { Varied } from "../../framework/variations.ts";
import { fitsWhen } from "../../../parts/parts.ts";
import type { ReadBody } from "../../../core/bodies/read-body.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { guardSkill, handsOf, wardSpeed, validCovering, GUARD_COVER, type Covering } from "./guard.ts";
import { handConfigurationRefusal } from "../../reach/hand.ts";
import { holdUp } from "./hold.ts";

/** **A covering guard's config** (the cover guard's and the shield guard's): its kind and its settings. */
export interface CoveringConfig<K extends string> extends Varied {
  readonly kind: K;
  readonly tuning?: {
    /** The cover in place of `GUARD_COVER`. */
    readonly covering?: Covering;
    /** Whether a free hand holds what it holds up through the whole-body solve (`holdUp`) rather than by its posture alone. */
    readonly hold?: boolean;
  };
}

/** The settings a covering guard's `tuning` names. */
export const COVERING_TUNING = Object.freeze(["covering", "hold"]);

/** A covering guard's `fits`: a body with a hand that covers (`handsOf`). */
export const coversWithHands = fitsWhen((spec: BodySpec) => handsOf(spec).length > 0, "needs a hand that covers: one with knuckles, or holding an item that says how it covers");

/** Whether a hand of `spec` that covers holds an item with a face it wards with (`ItemSpec.coverNormal`). */
export const wardsWithFace = (spec: BodySpec): boolean => (spec.held ?? []).some(({ segment, item }) => item.coverNormal !== undefined && handsOf(spec).includes(segment));

/** Guard admission and construction consume the same complete cover settings. */
export function coveringFaults(config: CoveringConfig<string>): readonly string[] {
  const tuning = config.tuning;
  return tuning === undefined || !!tuning && typeof tuning === "object" && !Array.isArray(tuning)
    && Object.keys(tuning).every(key => key === "covering" || key === "hold")
    && (tuning.hold === undefined || typeof tuning.hold === "boolean") && validCovering(tuning.covering === undefined ? GUARD_COVER : tuning.covering)
    ? [] : ["invalid guard tuning"];
}

/** A covering guard's settings and its body's open hands: why it does not fit, or null. */
export const coveringFit = (spec: BodySpec, config: CoveringConfig<string>): string | null =>
  coveringFaults(config)[0] ?? handConfigurationRefusal(spec, handsOf(spec), "open");

/**
 * The guard skill of a covering guard's `config`: its hands' cover of what the mind names
 * (`guardSkill`), warding with each held item's face (`wardSpeed`) where `wards`.
 */
export function coveringSkill(built: ReadBody, config: CoveringConfig<string>, wards: boolean): GuardSkill {
  const fault = coveringFit(built.spec, config);
  if (fault) throw new Error(fault);
  return guardSkill(built.spec, config.tuning?.covering, {
    wardSpeeds: wards ? Object.fromEntries((built.spec.held ?? []).filter(({ item }) => item.coverNormal !== undefined).map(({ segment }) => [segment, wardSpeed(built, segment)])) : null,
    hold: config.tuning?.hold === true ? holdUp(built) : null,
  });
}
