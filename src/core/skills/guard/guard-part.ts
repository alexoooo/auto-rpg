import type { Pose } from "../../spec/pose.ts";
import { fitsAll, fitsWhen, type KeysOf, type Part, type PartConfig } from "../../parts/parts.ts";
import type { ReadBody } from "../../read-body.ts";
import type { BodySpec } from "../../spec/body.ts";
import { guardPosture, guardSkill, handsOf, wardSpeed, type Covering, type GuardSkill } from "./guard.ts";
import { holdUp } from "../framework/hold.ts";

/**
 * **A kind of guard**: a part of role `guard` that owns the arms' rest and makes the skill that
 * covers. Its posture is the one source of where a body of it is built (`Controller.builtIn`), where
 * the arbiter rests the arms no skill holds and where a blow returns (`ExecutorMaking.guard`).
 */
export interface GuardPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "guard";
  readonly keys: KeysOf<C>;
  /** The arms' rest a body of `spec` holds under `config`, before any skill is made: what it is built in. */
  posture(spec: BodySpec, config: C): Pose;
  /** The guard skill of `config` for the body `built`; its `posture` is `posture`'s for the body's spec. */
  make(built: ReadBody, config: C): GuardSkill;
}

/** **The cover guard**: the arms' posture (`guardPosture`), and a guarding hand's cover of what the mind names (`guardSkill`). */
interface CoverGuardConfig {
  readonly kind: "cover-guard";
  readonly tuning?: {
    /** The cover in place of `GUARD_COVER`. */
    readonly covering?: Covering;
    /** Whether a free hand holds what it holds up through the whole-body solve (`holdUp`) rather than by its posture alone. */
    readonly hold?: boolean;
  };
}

/** A cover guard that also wards with an item's declared face: held out at the threat no faster than the body's balance allows (`wardSpeed`), turned toward it. */
interface ShieldGuardConfig {
  readonly kind: "shield-guard";
  readonly tuning?: CoverGuardConfig["tuning"];
}

/** A cover guard's `fits`: a body with a hand that covers (`handsOf`). */
const coversWithHands = fitsWhen((spec: BodySpec) => handsOf(spec).length > 0, "needs a hand that covers: one with knuckles, or holding an item that says how it covers");

/** Whether a hand of `spec` that covers holds an item with a face it wards with (`ItemSpec.coverNormal`). */
const wardsWithFace = (spec: BodySpec): boolean => (spec.held ?? []).some(({ segment, item }) => item.coverNormal !== undefined && handsOf(spec).includes(segment));

/** The guard skill of a cover guard's `config`, warding with an item's face where it is a shield guard. */
const coverMaker = (built: ReadBody, config: CoverGuardConfig | ShieldGuardConfig): GuardSkill =>
  guardSkill(built.spec, config.tuning?.covering, {
    wardSpeeds: config.kind === "shield-guard" ? Object.fromEntries((built.spec.held ?? []).filter(({ item }) => item.coverNormal !== undefined).map(({ segment }) => [segment, wardSpeed(built, segment)])) : null,
    hold: config.tuning?.hold === true ? holdUp(built) : null,
  });

export const COVER_GUARD: GuardPart<CoverGuardConfig> = {
  role: "guard", label: "Guard and cover", stage: "game", fields: [], slots: [], defaults: { kind: "cover-guard" }, keys: { kind: true, tuning: true },
  tuning: ["covering", "hold"], fits: fitsAll(coversWithHands, fitsWhen((spec: BodySpec) => !wardsWithFace(spec), "holds an item with a face, which the shield guard wards with")), faults: () => [],
  supportedEquipment: (spec) => (spec.held ?? []).filter(({ item }) => item.cover !== undefined && item.coverNormal === undefined).map(({ segment }) => segment),
  posture: (spec) => guardPosture(spec), make: coverMaker,
};

/** **At rest**: a body with no hand that covers holds no arms' rest and covers nothing. */
interface RestGuardConfig { readonly kind: "rest" }

/** No posture: a body at rest is built in its reference pose, and nothing is put at rest beside what its skills hold. */
const NO_POSTURE: Pose = Object.freeze({});

/** The guard at rest: no hands, no posture, no hold and no cover. */
const AT_REST: GuardSkill = Object.freeze({ hands: Object.freeze([]), posture: NO_POSTURE, hold: null, command: () => Object.freeze({}), resume: () => undefined });

export const REST_GUARD: GuardPart<RestGuardConfig> = {
  role: "guard", label: "At rest", stage: "game", fields: [], slots: [], defaults: { kind: "rest" }, keys: { kind: true },
  fits: fitsWhen((spec: BodySpec) => handsOf(spec).length === 0, "has a hand that covers, which a cover guard guards with"), faults: () => [],
  posture: () => NO_POSTURE, make: () => AT_REST,
};

export const SHIELD_GUARD: GuardPart<ShieldGuardConfig> = {
  role: "guard", label: "Guard faces and lines", stage: "game", fields: [], slots: [], defaults: { kind: "shield-guard" }, keys: { kind: true, tuning: true },
  tuning: ["covering", "hold"], fits: fitsAll(coversWithHands, fitsWhen(wardsWithFace, "holds no item with a face to ward with")), faults: () => [],
  supportedEquipment: (spec) => (spec.held ?? []).filter(({ item }) => item.cover !== undefined).map(({ segment }) => segment),
  posture: (spec) => guardPosture(spec), make: coverMaker,
};
