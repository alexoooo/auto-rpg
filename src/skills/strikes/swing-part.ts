import { handConfigurationRefusal } from "../reach/hand.ts";
import { SUPPORT_REFERENCE } from "../../control/support-reference.ts";
import clubMeta from "../../../assets/skills/strikes/club-blow/club-blow.meta.json" with { type: "json" };
import cutMeta from "../../../assets/skills/strikes/cut/cut.meta.json" with { type: "json" };
import bonkMeta from "../../../assets/skills/strikes/bonk/bonk.meta.json" with { type: "json" };
import bonkLayout from "../../../assets/skills/strikes/bonk/bonk.layout.json" with { type: "json" };
import { recoveryNetwork, type Network } from "../../core/math/learning/recovery-network.ts";
import { bodyKey } from "../../core/bodies/spec/body.ts";
import { checkedLayout, type PunchLayout } from "./learned-punch.ts";
import { dataOf } from "../../core/data/store.ts";
import { heldBy, type Held } from "../../core/bodies/items/held.ts";
import { fitsAll, strikesWithOneOf } from "../../parts/parts.ts";
import type { Mechanism } from "../../combat/rulebook.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../core/state.ts";
import { aimedPoint, type ExecutorPart } from "../framework/executor-part.ts";
import { recordFault, tunedSettings, type SkillRecord } from "../framework/records.ts";
import { faceOf } from "./held-blow.ts";
import type { StrikingFace } from "./straight-punch.ts";
import { swingChannelFault, swingExecutor, SWING_KEYS, validSwing, validSwingPart, type Swing } from "./swing.ts";
import { type Side, SIDES } from "../../core/bodies/bilateral.ts";

/**
 * **The swung blows**, by kind: what each is swung with (`item`, by `HELD`'s name), what it meets
 * the target with as the rules read the contact (`mechanism`: the sword's cut its edge, the club
 * its head, blunt), the bodies with a record of it, whether a game offers it (`stage`), and how a
 * steer reads and pushes it where one is trained (`layout`, `assets/skills/strikes/<kind>/<kind>.layout.json`). The
 * bonk is the club's blow overhead at the head, the arm straight as it lands; the club blow, its
 * swing at the trunk.
 */
export const SWINGS = deepFreeze({
  "cut": { label: "Cut", item: "sword" as Held, mechanism: "edge" as Mechanism, bodies: cutMeta.bodies, stage: "game" as const },
  "club-blow": { label: "Club blow", item: "club" as Held, mechanism: "blunt" as Mechanism, bodies: clubMeta.bodies, stage: "game" as const },
  "bonk": { label: "Bonk", item: "club" as Held, mechanism: "blunt" as Mechanism, bodies: bonkMeta.bodies, stage: "game" as const,
    layout: checkedLayout(bonkLayout as PunchLayout) },
});
type SwingKind = keyof typeof SWINGS;

/**
 * **A swing's record for one body** (`dataOf(<kind>)`, by `bodyKey`): its settings, whole, and
 * where its kind has a layout, the network that steers it where one was trained (its layout's
 * inputs in, its outputs out, `recoveryNetwork`), or none.
 */
export interface SwingRecord extends SkillRecord<Swing> {
  readonly network?: Network | null;
}
type SwingRecords = Readonly<Record<string, SwingRecord>>;

declare module "../../core/data/store.ts" {
  interface DataOf {
    /** Every body's cut record. */
    "cut": SwingRecords;
    /** Every body's club blow record. */
    "club-blow": SwingRecords;
    /** Every body's bonk record. */
    "bonk": SwingRecords;
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
 * record's, and then no network steers it: its trainer does, where it is `steered`.
 */
function swingPart<K extends SwingKind>(kind: K): ExecutorPart<Config<K>> {
  const swing = SWINGS[kind];
  return {
    role: "executor", requires: [SUPPORT_REFERENCE], label: swing.label, stage: swing.stage, defaults: { kind } as Config<K>,
    keys: { kind: true, tuning: true }, tuning: SWING_KEYS,
    fields: [], slots: [],
    fits: fitsAll((spec) => handConfigurationRefusal(spec, (spec.held ?? []).map(held => held.segment), "grip"), strikesWithOneOf("hand.left", "hand.right"), recordFault(swing.label.toLowerCase(), deepFreeze(swing.bodies), validSwing),
      (spec, config) => config.tuning ? swingChannelFault(spec, config.tuning) : null),
    faults: (config) => config.tuning === undefined || validSwingPart(config.tuning) ? [] : [`invalid ${swing.label.toLowerCase()} tuning`],
    reads: () => [kind], effectors: ["hand.left", "hand.right"], aims: true, meets: swing.mechanism,
    strikesWith: (spec, _config, effector) => swingFace(spec, effector, kind) !== null,
    make({ body, guard, aim }, config, actions) {
      const spec = body.built.spec, faces: Partial<Record<Side, StrikingFace>> = {};
      for (const hand of SIDES) { const face = swingFace(spec, `hand.${hand}`, kind); if (face) faces[hand] = face; }
      const layout: PunchLayout | undefined = "layout" in swing ? swing.layout : undefined;
      const network = layout && config.tuning === undefined ? dataOf(kind)[bodyKey(spec)]?.network : null;
      return swingExecutor(body, guard, actions.map((action) => action.name), tunedSettings(dataOf(kind), spec, config), aimedPoint(aim), faces,
        { align: swing.mechanism === "edge", ...(layout ? { layout } : {}), ...(network ? { policy: recoveryNetwork(network) } : {}) });
    },
  };
}

export const CUT_PART = swingPart("cut");
export const CLUB_BLOW_PART = swingPart("club-blow");
export const BONK_PART = swingPart("bonk");

declare module "../config.ts" {
  interface ExecutorConfigs {
    readonly "club-blow": Config<"club-blow">;
    readonly "cut": Config<"cut">;
    readonly "bonk": Config<"bonk">;
  }
}
