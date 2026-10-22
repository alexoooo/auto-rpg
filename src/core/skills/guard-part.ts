import type { Pose } from "../control/motor.ts";
import { takesCommands, type KeysOf, type Part, type PartConfig } from "../mind/parts.ts";
import type { ReadBody } from "../read-body.ts";
import type { BodySpec } from "../spec/body.ts";
import { guardPosture, guardSkill, type Covering, type GuardSkill } from "./guard.ts";
import { holdUp } from "./hold.ts";

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

/** **The cover guard**: the arms' posture (`guardPosture`), and a guarding hand's cover of what the tactics name (`guardSkill`). */
export interface CoverGuardConfig {
  readonly kind: "cover-guard";
  readonly tuning?: {
    /** The cover in place of `GUARD_COVER`. */
    readonly covering?: Covering;
    /** Whether a free hand holds what it holds up through the whole-body solve (`holdUp`) rather than by its posture alone. */
    readonly hold?: boolean;
  };
}

/** A cover guard that also turns an item's declared face toward the threat. */
export interface ShieldGuardConfig extends Omit<CoverGuardConfig, "kind"> { readonly kind: "shield-guard" }

/** The guard skill of a cover guard's `config`, an item's face turned to the threat where it `faces`. */
const coverMaker = (faces: boolean) => (built: ReadBody, config: CoverGuardConfig | ShieldGuardConfig): GuardSkill =>
  guardSkill(built.spec, config.tuning?.covering, faces, config.tuning?.hold === true ? holdUp(built) : null);

export const COVER_GUARD: GuardPart<CoverGuardConfig> = {
  role: "guard", label: "Guard and cover", stage: "game", fields: [], slots: [], defaults: { kind: "cover-guard" }, keys: { kind: true, tuning: true },
  tuning: ["covering", "hold"], fits: takesCommands, faults: () => [],
  supportedEquipment: (spec) => (spec.held ?? []).filter(({ item }) => item.cover !== undefined && item.coverNormal === undefined).map(({ segment }) => segment),
  posture: (spec) => guardPosture(spec), make: coverMaker(false),
};

export const SHIELD_GUARD: GuardPart<ShieldGuardConfig> = {
  role: "guard", label: "Guard faces and lines", stage: "game", fields: [], slots: [], defaults: { kind: "shield-guard" }, keys: { kind: true, tuning: true },
  tuning: ["covering", "hold"], fits: takesCommands, faults: () => [],
  supportedEquipment: (spec) => (spec.held ?? []).filter(({ item }) => item.cover !== undefined).map(({ segment }) => segment),
  posture: (spec) => guardPosture(spec), make: coverMaker(true),
};
