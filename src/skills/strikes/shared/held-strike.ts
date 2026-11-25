/**
 * **A held strike as a part**: a hand's blow with what it holds, its settings its body's record of
 * its one variation, steered by the record's network where it has a steer. What a family of them
 * shares (the swings', `swing.ts`; the drives', `straight-drive.ts`) is its settings
 * (`StrikeSettings`) and its executor; what a strike is, its item, what it meets the target with,
 * the bodies with a record and its data.
 */
import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import type { Mechanism } from "../../../combat/rulebook.ts";
import type { Held } from "../../../core/bodies/items/held.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { Side } from "../../../core/bodies/bilateral.ts";
import type { Pose } from "../../../core/bodies/spec/pose.ts";
import { dataOf, type DataKey, type DataOf } from "../../../core/data/store.ts";
import { recoveryNetwork, type Network } from "../../../core/math/learning/recovery-network.ts";
import { deepFreeze } from "../../../core/state.ts";
import type { Body } from "../../../control/body.ts";
import { strikesWithOneOf } from "../../../parts/parts.ts";
import type { PartLookup } from "../../../parts/lookup.ts";
import type { Executor, TargetResolver } from "../../framework/action.ts";
import { aimedPoint, type ExecutorPart } from "../../framework/executor-part.ts";
import { recordFault, tunedSettings, type SkillRecord } from "../../framework/records.ts";
import { executorOf, varied, type ExecutorVariations, type Varied } from "../../framework/variations.ts";
import { handConfigurationRefusal } from "../../reach/hand.ts";
import { heldFace, heldFaces, type StrikingFace } from "./held-face.ts";
import type { SteerLayout } from "./steer.ts";

/** **A family's settings**: every key a tuning may name, whether some are valid and whether they are whole, and what of them a body has no joint to push. */
export interface StrikeSettings<S> {
  readonly keys: readonly (keyof S & string)[];
  validPart(settings: Partial<S>): boolean;
  valid(settings: Partial<S>): settings is S;
  channelFault(spec: BodySpec, settings: Partial<S>): string | null;
}

/** **A held strike's record for one body**: its settings, whole, and where it was trained, the network that steers it (its layout's inputs in, its outputs out, `recoveryNetwork`). */
export interface HeldStrikeRecord<S> extends SkillRecord<S> {
  readonly network?: Network | null;
}

/** A held strike's config: its kind, its variation, and a research `tuning` over its body's record (all of its settings where the body has none). */
export interface HeldStrikeConfig<K extends string, S> extends Varied {
  readonly kind: K;
  readonly tuning?: Partial<S>;
}

/** A held strike's records, by model. */
type Records<S> = Readonly<Record<string, HeldStrikeRecord<S>>>;

/** The data keys whose records are a held strike's of settings `S`: where a strike names its data, the compiler holds it to them. */
type RecordsKey<S> = { [D in DataKey]: DataOf[D] extends Records<S> ? D : never }[DataKey];

/** **The records `key` holds** (`dataOf`): a strike's of settings `S`, as `RecordsKey` held it where the strike was written, which a generic key does not carry into `dataOf`'s type. */
const recordsOf = <S>(key: RecordsKey<S>): Records<S> => dataOf(key) as Records<S>;

/** What a held strike's executor is made of: the body, its guard, the actions it runs, its settings, where it aims, the faces its hands strike with, and its steer where it has one. */
export interface HeldStrikeMaking<S> {
  readonly body: Body;
  readonly guard: Pose;
  readonly actions: readonly string[];
  readonly settings: S;
  readonly resolve: TargetResolver;
  readonly faces: Partial<Record<Side, StrikingFace>>;
  readonly layout?: SteerLayout;
  readonly policy?: ReturnType<typeof recoveryNetwork>;
}

/**
 * **A held strike**: its kind, label, picture (`Part.icon`) and stage; the item it is struck with and what it meets the
 * target with (`Mechanism`); its one variation and the data its records are (`data`, by model),
 * the bodies with a record (`bodies`); its family's settings and executor and what the family needs
 * of a body beside a hand holding the item (`fits`); and how its steer reads and pushes, null where
 * it has none.
 */
export interface HeldStrike<K extends string, S> {
  readonly kind: K;
  readonly label: string;
  readonly icon: string;
  readonly item: Held;
  readonly mechanism: Mechanism;
  readonly variation: string;
  readonly data: RecordsKey<S>;
  readonly bodies: readonly string[];
  readonly settings: StrikeSettings<S>;
  readonly fits: readonly ((spec: BodySpec, config: HeldStrikeConfig<K, S>, parts: PartLookup) => string | null)[];
  readonly layout: SteerLayout | null;
  executor(making: HeldStrikeMaking<S>): Executor;
}

/**
 * **`strike` as a part**: thrown by a hand holding its item, with the face of it that meets the
 * target (`heldFace`), its settings its body's record (`tunedSettings`). A body with no record does
 * not throw it; a hand holding another item, or nothing, does not. A research `tuning` sets
 * settings over the record's, and then no network steers it: its trainer does, where it is
 * `steered`.
 */
export function heldStrikePart<K extends string, S>(strike: HeldStrike<K, S>): ExecutorPart<HeldStrikeConfig<K, S>> {
  const { kind, label, item, mechanism, settings } = strike, named = label.toLowerCase();
  const variations = {
    [strike.variation]({ body, guard, aim }, config, actions) {
      const spec = body.built.spec, records = recordsOf<S>(strike.data);
      const network = strike.layout && config.tuning === undefined ? records[spec.model]?.network : null;
      return strike.executor({ body, guard, actions: actions.map((action) => action.name), settings: tunedSettings(records, spec, config), resolve: aimedPoint(aim),
        faces: heldFaces(spec, item, mechanism), ...(strike.layout ? { layout: strike.layout } : {}), ...(network ? { policy: recoveryNetwork(network) } : {}) });
    },
  } satisfies ExecutorVariations<HeldStrikeConfig<K, S>>;
  return {
    role: "executor", requires: [SUPPORT_REFERENCE], label, icon: strike.icon, defaults: { kind } as HeldStrikeConfig<K, S>,
    keys: { kind: true, variation: true, tuning: true }, tuning: settings.keys,
    fields: [], slots: [],
    ...varied({ skill: kind, label: named, variations, of: executorOf, fits: [(spec) => handConfigurationRefusal(spec, (spec.held ?? []).map((held) => held.segment), "grip"),
      strikesWithOneOf("hand.left", "hand.right"), ...strike.fits, recordFault(named, deepFreeze(strike.bodies), settings.valid),
      (spec, config) => config.tuning ? settings.channelFault(spec, config.tuning) : null] }),
    faults: (config) => config.tuning === undefined || settings.validPart(config.tuning) ? [] : [`invalid ${named} tuning`],
    reads: () => [strike.data], effectors: ["hand.left", "hand.right"], aims: true, meets: mechanism,
    strikesWith: (spec, _config, effector) => heldFace(spec, effector, item, mechanism) !== null,
    asSkill: { group: "Strikes", ends: ["standing"] },
  };
}
