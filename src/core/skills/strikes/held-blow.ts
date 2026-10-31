import clubMeta from "../../../../assets/core/club-blow.meta.json" with { type: "json" };
import cutMeta from "../../../../assets/core/sword-cut.meta.json" with { type: "json" };
import thrustMeta from "../../../../assets/core/sword-thrust.meta.json" with { type: "json" };
import clubLayout from "../../../../assets/core/club-blow.layout.json" with { type: "json" };
import cutLayout from "../../../../assets/core/sword-cut.layout.json" with { type: "json" };
import thrustLayout from "../../../../assets/core/sword-thrust.layout.json" with { type: "json" };
import { recoveryNetwork, type Network } from "../../learning/recovery-network.ts";
import { bodyKey } from "../../spec/body.ts";
import { checkedLayout, type PunchLayout } from "./learned-punch.ts";
import { dataOf } from "../../data/store.ts";
import { heldBy, type Held } from "../../items/held.ts";
import { fitsAll, fitsWhen, strikesWithOneOf } from "../../parts/parts.ts";
import { text } from "../../parts/fields.ts";
import type { Mechanism } from "../../rules/rulebook.ts";
import type { BodySpec, Side } from "../../spec/body.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import { deepFreeze } from "../../state.ts";
import { aimedPoint, AIMED_ACTIONS, type ExecutorPart } from "../framework/executor-part.ts";
import { recordFault, tunedSettings, type SkillRecord } from "../framework/records.ts";
import { faceFault, STRAIGHT_PUNCH_KEYS, straightPunchExecutor, straightPunchFits, timedChannelFault, validStraightPunch, validStraightPunchPart,
  type StraightPunch, type StrikingFace } from "./straight-punch.ts";

/**
 * **The held blows**, by kind: what each is thrown with (`item`, by `HELD`'s name), what it meets
 * the target with as the rules read the contact (`mechanism`: the club its swell, blunt; the
 * sword's cut its edge; its thrust its point), the bodies with a record of it, and how its steer
 * reads and pushes (`layout`, `assets/core/<kind>.layout.json`).
 */
export const HELD_BLOWS = deepFreeze({
  "club-blow": { label: "Club blow", item: "club" as Held, mechanism: "blunt" as Mechanism, bodies: clubMeta.bodies, layout: checkedLayout(clubLayout as PunchLayout) },
  "sword-cut": { label: "Sword cut", item: "sword" as Held, mechanism: "edge" as Mechanism, bodies: cutMeta.bodies, layout: checkedLayout(cutLayout as PunchLayout) },
  "sword-thrust": { label: "Sword thrust", item: "sword" as Held, mechanism: "point" as Mechanism, bodies: thrustMeta.bodies, layout: checkedLayout(thrustLayout as PunchLayout) },
});
export type HeldBlowKind = keyof typeof HELD_BLOWS;

/**
 * **A held blow's record for one body** (`dataOf(<kind>)`, `assets/core/<kind>.json`, by
 * `bodyKey`): its settings, whole, and the network that steers it where it was trained (its
 * layout's inputs in, its outputs out, `recoveryNetwork`), or null.
 */
export interface HeldBlowRecord extends SkillRecord<StraightPunch> {
  readonly network: Network | null;
}
type HeldBlowRecords = Readonly<Record<string, HeldBlowRecord>>;

declare module "../../data/store.ts" {
  interface DataOf {
    /** Every body's club blow record. */
    "club-blow": HeldBlowRecords;
    /** Every body's sword cut record. */
    "sword-cut": HeldBlowRecords;
    /** Every body's sword thrust record. */
    "sword-thrust": HeldBlowRecords;
  }
}

/**
 * The way a blunt item's face meets the target, in the item's frame: its x, the holding hand's own
 * length (`handHolding`), the way its far end goes as the wrist bends it toward the little finger,
 * as a hammer's head goes.
 */
const BLUNT_FACING: Vec3 = Object.freeze([1, 0, 0]) as unknown as Vec3;

/**
 * **The face `hand` of `spec` meets a target with by `mechanism`** (`StrikingFace`): a directed
 * region of what it holds with that mechanism and a point of its own name, facing as the region
 * does (the sword's edge, its tip); for a blunt blow, the item's aimed point (`ItemSpec.aim`)
 * facing `BLUNT_FACING`. Null where the hand holds nothing, or nothing with such a face.
 */
export function faceOf(spec: BodySpec, hand: Side, mechanism: Mechanism): StrikingFace | null {
  const item = spec.held?.find((h) => h.segment === `hand.${hand}`)?.item;
  if (!item) return null;
  if (mechanism === "blunt") return item.aim ? { point: item.aim, facing: BLUNT_FACING } : null;
  const region = item.contacts?.find((one) => one.surface.directed?.mechanism === mechanism && item.points[one.name]);
  return region ? { point: region.name, facing: region.surface.directed!.direction.value } : null;
}

/** The hand `effector` names, or null. */
const sideOf = (effector: string): Side | null => effector === "hand.left" ? "left" : effector === "hand.right" ? "right" : null;

/** The face `effector` of `spec` throws `kind` with: null where it does not hold the blow's item (`HELD_BLOWS`). */
function blowFace(spec: BodySpec, effector: string, kind: HeldBlowKind): StrikingFace | null {
  const hand = sideOf(effector), blow = HELD_BLOWS[kind];
  return hand && heldBy(spec, hand) === blow.item ? faceOf(spec, hand, blow.mechanism) : null;
}

/**
 * A held blow's config: its kind, its name, and a research `tuning` over its body's record, which
 * a link does not carry (all of its settings where the body has none).
 */
interface Config<K extends HeldBlowKind = HeldBlowKind> {
  readonly kind: K;
  readonly name: string;
  readonly tuning?: Partial<StraightPunch>;
}

/**
 * **A held item's blow** (`straightPunchExecutor`): the straight punch's whole-body drive thrown
 * with the face of what the hand holds (`faceOf`), its settings its body's record of the blow
 * (`SkillRecord`, `assets/core/<kind>.json`): a schedule of the trunk's, legs' and arm's pushes, the
 * arm held at its contact pose, the face along the line from the shoulder to the target, steered
 * by its network where it has one. A body with no record does not throw it; a hand holding another
 * item, or nothing, does not. A research `tuning` sets settings over the record's, and then no
 * network steers it: its trainer does, where it is `steered`.
 */
function heldBlowPart<K extends HeldBlowKind>(kind: K): ExecutorPart<Config<K>> {
  const blow = HELD_BLOWS[kind];
  return {
    role: "executor", label: blow.label, stage: "game", defaults: { kind, name: kind } as Config<K>,
    keys: { kind: true, name: true, tuning: true }, tuning: STRAIGHT_PUNCH_KEYS,
    fields: [text("name", "Name")], slots: [],
    fits: fitsAll(strikesWithOneOf("hand.left", "hand.right"), fitsWhen(straightPunchFits, "needs both arms on the upper trunk and a thoracic joint"),
      recordFault(blow.label.toLowerCase(), deepFreeze(blow.bodies), validStraightPunch),
      (spec, config) => config.tuning ? timedChannelFault(spec, config.tuning) ?? faceFault(config.tuning) : null),
    faults: (config) => config.tuning === undefined || validStraightPunchPart(config.tuning) ? [] : [`invalid ${blow.label.toLowerCase()} tuning`],
    reads: () => [kind], effectors: ["hand.left", "hand.right"], ...AIMED_ACTIONS, meets: blow.mechanism,
    strikesWith: (spec, _config, effector) => blowFace(spec, effector, kind) !== null,
    make({ body, guard, aim }, config, actions) {
      const spec = body.built.spec, faces: Partial<Record<Side, StrikingFace>> = {};
      for (const hand of ["left", "right"] as const) { const face = blowFace(spec, `hand.${hand}`, kind); if (face) faces[hand] = face; }
      const network = config.tuning === undefined ? dataOf(kind)[bodyKey(spec)]?.network : null;
      return straightPunchExecutor(body, guard, actions.map((action) => action.name), tunedSettings(dataOf(kind), spec, config), aimedPoint(aim),
        { faces, layout: blow.layout, ...(network ? { policy: recoveryNetwork(network) } : {}) });
    },
  };
}

export const CLUB_BLOW_PART = heldBlowPart("club-blow");
export const SWORD_CUT_PART = heldBlowPart("sword-cut");
export const SWORD_THRUST_PART = heldBlowPart("sword-thrust");
