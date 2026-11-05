import clubMeta from "../../../assets/skills/strikes/club-blow/club-blow.meta.json" with { type: "json" };
import cutMeta from "../../../assets/skills/strikes/cut/cut.meta.json" with { type: "json" };
import { dataOf } from "../../core/data/store.ts";
import { heldBy, type Held } from "../../core/bodies/items/held.ts";
import { fitsAll, strikesWithOneOf } from "../../parts/parts.ts";
import type { Mechanism } from "../../combat/rulebook.ts";
import type { BodySpec, Side } from "../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../core/world/state.ts";
import { aimedPoint, type ExecutorPart } from "../framework/executor-part.ts";
import { recordFault, tunedSettings, type SkillRecords } from "../framework/records.ts";
import { faceOf } from "./held-blow.ts";
import type { StrikingFace } from "./straight-punch.ts";
import { swingChannelFault, swingExecutor, SWING_KEYS, validSwing, validSwingPart, type Swing } from "./swing.ts";

/**
 * **The swung blows**, by kind: what each is swung with (`item`, by `HELD`'s name), what it meets
 * the target with as the rules read the contact (`mechanism`: the sword's cut its edge, the club
 * its head, blunt), and the bodies with a record of it.
 */
export const SWINGS = deepFreeze({
  "cut": { label: "Cut", item: "sword" as Held, mechanism: "edge" as Mechanism, bodies: cutMeta.bodies },
  "club-blow": { label: "Club blow", item: "club" as Held, mechanism: "blunt" as Mechanism, bodies: clubMeta.bodies },
});
export type SwingKind = keyof typeof SWINGS;

declare module "../../core/data/store.ts" {
  interface DataOf {
    /** Every body's cut record. */
    "cut": SkillRecords<Swing>;
    /** Every body's club blow record. */
    "club-blow": SkillRecords<Swing>;
  }
}

/** The face `effector` of `spec` swings `kind` with: null where it does not hold the swing's item. */
function swingFace(spec: BodySpec, effector: string, kind: SwingKind): StrikingFace | null {
  const hand: Side | null = effector === "hand.left" ? "left" : effector === "hand.right" ? "right" : null, swing = SWINGS[kind];
  return hand && heldBy(spec, hand) === swing.item ? faceOf(spec, hand, swing.mechanism) : null;
}

/** A swing's config: its kind, and a research `tuning` over its body's record (all of its settings where the body has none). */
interface Config<K extends SwingKind = SwingKind> {
  readonly kind: K;
  readonly tuning?: Partial<Swing>;
}

/**
 * **A swung blow** (`swingExecutor`): its item swung on an arc that meets the target with its face
 * (`faceOf`), its settings its body's record of the swing (`assets/skills/strikes/<kind>/<kind>.json`): the windup
 * and the schedule of pushes searched for that body. A body with no record does not throw it; a
 * hand holding another item, or nothing, does not. A research `tuning` sets settings over the
 * record's.
 */
function swingPart<K extends SwingKind>(kind: K): ExecutorPart<Config<K>> {
  const swing = SWINGS[kind];
  return {
    role: "executor", label: swing.label, stage: "game", defaults: { kind } as Config<K>,
    keys: { kind: true, tuning: true }, tuning: SWING_KEYS,
    fields: [], slots: [],
    fits: fitsAll(strikesWithOneOf("hand.left", "hand.right"), recordFault(swing.label.toLowerCase(), deepFreeze(swing.bodies), validSwing),
      (spec, config) => config.tuning ? swingChannelFault(spec, config.tuning) : null),
    faults: (config) => config.tuning === undefined || validSwingPart(config.tuning) ? [] : [`invalid ${swing.label.toLowerCase()} tuning`],
    reads: () => [kind], effectors: ["hand.left", "hand.right"], aims: true, meets: swing.mechanism,
    strikesWith: (spec, _config, effector) => swingFace(spec, effector, kind) !== null,
    make({ body, guard, aim }, config, actions) {
      const spec = body.built.spec, faces: Partial<Record<Side, StrikingFace>> = {};
      for (const hand of ["left", "right"] as const) { const face = swingFace(spec, `hand.${hand}`, kind); if (face) faces[hand] = face; }
      return swingExecutor(body, guard, actions.map((action) => action.name), tunedSettings(dataOf(kind), spec, config), aimedPoint(aim), faces,
        { align: swing.mechanism === "edge" });
    },
  };
}

export const CUT_PART = swingPart("cut");
export const CLUB_BLOW_PART = swingPart("club-blow");

declare module "../config.ts" {
  interface ExecutorConfigs {
    readonly "club-blow": Config<"club-blow">;
    readonly "cut": Config<"cut">;
  }
}
