import { guardVariations, type GuardPart, type GuardSkill } from "../../framework/guard.ts";
import type { Varied } from "../../framework/variations.ts";
import { fitsWhen } from "../../../parts/parts.ts";
import { soleRefusal } from "../../../control/support.ts";
import type { ReadBody } from "../../../core/bodies/read-body.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { guardPosture, guardSkill, handsOf, wardSpeed, validCovering, GUARD_COVER, type Covering } from "./guard.ts";
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

/** A covering guard's `fits`: a body with a hand that covers (`handsOf`). */
const coversWithHands = fitsWhen((spec: BodySpec) => handsOf(spec).length > 0, "needs a hand that covers: one with knuckles, or holding an item that says how it covers");

/** Whether a hand of `spec` that covers holds an item with a face it wards with (`ItemSpec.coverNormal`). */
const wardsWithFace = (spec: BodySpec): boolean => (spec.held ?? []).some(({ segment, item }) => item.coverNormal !== undefined && handsOf(spec).includes(segment));

/** Guard admission and construction consume the same complete cover settings. */
function coveringFaults(config: CoveringConfig<string>): readonly string[] {
  const tuning = config.tuning;
  return tuning === undefined || !!tuning && typeof tuning === "object" && !Array.isArray(tuning)
    && Object.keys(tuning).every(key => key === "covering" || key === "hold")
    && (tuning.hold === undefined || typeof tuning.hold === "boolean") && validCovering(tuning.covering === undefined ? GUARD_COVER : tuning.covering)
    ? [] : ["invalid guard tuning"];
}

/** A covering guard's settings and its body's open hands: why it does not fit, or null. */
const coveringFit = (spec: BodySpec, config: CoveringConfig<string>): string | null =>
  coveringFaults(config)[0] ?? handConfigurationRefusal(spec, handsOf(spec), "open");

/**
 * The guard skill of a covering guard's `config`: its hands' cover of what the mind names
 * (`guardSkill`), warding with each held item's face (`wardSpeed`) where it `wards`.
 */
function coveringSkill(built: ReadBody, config: CoveringConfig<string>, { wards }: { readonly wards: boolean }): GuardSkill {
  const fault = coveringFit(built.spec, config);
  if (fault) throw new Error(fault);
  return guardSkill(built.spec, config.tuning?.covering, {
    wardSpeeds: wards ? Object.fromEntries((built.spec.held ?? []).filter(({ item }) => item.coverNormal !== undefined).map(({ segment }) => [segment, wardSpeed(built, segment)])) : null,
    hold: config.tuning?.hold === true ? holdUp(built) : null,
  });
}

/**
 * **A covering guard as a part**: the arms' posture (`guardPosture`) and its hands' cover of what
 * the mind names (`coveringSkill`), its one variation named as its kind; `named` in its refusals.
 * One that `wards` also holds an item's declared face out at the threat, no faster than the body's
 * balance allows (`wardSpeed`): it needs soles to balance on and an item with a face.
 */
export function coveringPart<K extends string>({ kind, label, named, wards }: { readonly kind: K; readonly label: string; readonly named: string; readonly wards: boolean }): GuardPart<CoveringConfig<K>> {
  const variations = { [kind]: { posture: (spec: BodySpec) => guardPosture(spec), make: (built: ReadBody, config: CoveringConfig<K>) => coveringSkill(built, config, { wards }) } };
  const warding = wards ? [soleRefusal, fitsWhen(wardsWithFace, "holds no item with a face to ward with")] : [];
  return {
    covers: (spec) => handsOf(spec),
    role: "guard", label, stage: "game", fields: [], slots: [], defaults: { kind } as CoveringConfig<K>, keys: { kind: true, variation: true, tuning: true },
    tuning: ["covering", "hold"], faults: coveringFaults,
    supportedEquipment: (spec) => (spec.held ?? []).filter(({ item }) => item.cover !== undefined).map(({ segment }) => segment),
    skillGroup: "Guard", ...guardVariations({ skill: kind, label: named, variations, fits: [coveringFit, coversWithHands, ...warding] }),
  };
}
