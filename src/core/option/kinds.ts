import type { ActionConfig, ExecutorEntry, LocomotionConfig } from "../skills/config.ts";
import { blowsOf } from "../skills/action-config.ts";
import type { PartLookup } from "../parts/lookup.ts";
import type { OptionPart } from "./parts.ts";
import { anyBody, type KeysOf, type PartConfig } from "../parts/parts.ts";
import type { BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import { covers } from "./cover.ts";
import type { Option, Site, Sites } from "./option.ts";
import { followOrders } from "./orders.ts";
import { gaitsOf, walkBy } from "./places.ts";
import type { ProfileTables } from "./predictions-part.ts";
import { guardOf, hold, holdAt } from "./rest.ts";
import type { OptionRecord } from "./record.ts";
import { BRACE_OPTION, RISE_OPTIONS } from "./rise.ts";
import { strike, strikeMeasure } from "./strike.ts";
import type { Walker } from "./walk.ts";

/**
 * **What Option Mind gives each kind of its options** to make them from: its body's spec, the
 * world's rate (Hz) and the part lookup; its legs, executors and actions as its config names them,
 * and the profile tables it predicts from (`ProfileTables`); what the mind itself runs on: its walk
 * and its Options' record of their tries (`OptionRecord`); the options the kinds before it made
 * (`made`); and the sites its options name (`Sites`, filled once every option is made). A kind
 * builds anything else it needs from these, the strikes, the gaits, the hands' covers and the rise
 * among them.
 */
export interface OptionsGiven {
  readonly spec: BodySpec;
  readonly hz: number;
  /** The rate its mind decides at, Hz (`OptionMindConfig.rate`); the world's unless given. */
  readonly rate?: number;
  /** The steps its body's command waits (`Body.delay`). */
  readonly delay: number;
  readonly parts: PartLookup;
  readonly locomotion: LocomotionConfig;
  readonly executors: readonly ExecutorEntry[];
  readonly actions: readonly ActionConfig[];
  readonly tables: ProfileTables;
  readonly walk: Walker;
  readonly record: OptionRecord;
  /** The options the kinds before it in its mind's rank order made, in that order. */
  readonly made: readonly Option[];
  readonly sites: Sites;
}

/** **A kind of Option Mind's options** (`OptionPart`): made from what Option Mind gives (`OptionsGiven`). */
export type OptionKindPart<C extends PartConfig = PartConfig> = OptionPart<C, OptionsGiven, Option>;

/** A kind of option with no settings of its own, `kind`, labelled `label`, made by `make`. */
function kind<K extends string>(kind: K, label: string, make: (given: OptionsGiven) => readonly Option[]): OptionKindPart<{ readonly kind: K }> {
  return deepFreeze({ role: "option", label, stage: "game", fields: [], slots: [], defaults: { kind }, keys: { kind: true } as KeysOf<{ readonly kind: K }>,
    fits: anyBody, faults: () => [], make: (_config: { readonly kind: K }, given: OptionsGiven) => make(given) });
}

/** **Following the orders** a person gives (`followOrders`). */
export const ORDERS_OPTION = kind("orders", "Follow orders", (given) => [followOrders(given.walk)]);

/** **A kind of strike**: a kind of option (`OptionKindPart`) that strikes by one skill, the executor kind it names (`skill`). */
export type StrikeKindPart<K extends string = string> = OptionKindPart<{ readonly kind: `strike-${K}` }> & { readonly skill: K };

/**
 * **The kind of strike by `skill`** (`strike-<skill>`): a strike (`strike`) of each of the mind's
 * actions its executor of that kind carries out, in their order, priced by its profile among the
 * strikes' where one is measured as the body reads it (`strikeMeasure`).
 */
function strikeKind<K extends string>(skill: K, label: string): StrikeKindPart<K> {
  return deepFreeze({ ...kind(`strike-${skill}`, label, (given) => given.actions.flatMap((action) =>
    given.executors.find((executor) => executor.name === action.executor)?.kind === skill
      ? [strike(action, given.walk, blowsOf(given.parts, given.executors, action),
        strikeMeasure(given.parts, given.spec, given.executors, action, given.hz, given.tables.strikes, given.rate ?? given.hz, given.delay))]
      : [])), skill });
}

/** **The straight punch** (`straight-punch`). */
export const STRAIGHT_PUNCH_OPTION = strikeKind("straight-punch", "Straight punch");

/** **The club's blow** (`club-blow`). */
export const CLUB_BLOW_OPTION = strikeKind("club-blow", "Club blow");

/** **The sword's cut** (`cut`). */
export const CUT_OPTION = strikeKind("cut", "Cut");

/** **The sword's thrust** (`sword-thrust`). */
export const SWORD_THRUST_OPTION = strikeKind("sword-thrust", "Sword thrust");

/** **The stomp** (`stomp`). */
export const STOMP_OPTION = strikeKind("stomp", "Stomp");

/**
 * **The walk** (`walkBy`): an option of each gait its legs go by (`gaitsOf`), each meaning go to a
 * place by that gait, its places the sites its mind's options name (`Sites`).
 */
export const WALK_OPTION = kind("walk", "Walk to a site", (given) => gaitsOf(given.locomotion).map((gait) => walkBy(gait, given.sites, given.walk)));

/** **A place on the ground** to hold at: where it is, m, and how near its centre the body holds there. */
export interface PlaceConfig { readonly kind: "hold-at-place"; readonly x: number; readonly z: number; readonly within: number }

/** What is wrong with a place's config: a coordinate not finite, or a reach not above nothing. */
const placeFaults = (config: PlaceConfig): readonly string[] => [
  ...Number.isFinite(config.x) && Number.isFinite(config.z) ? [] : ["x, z: a place, m"],
  ...Number.isFinite(config.within) && config.within > 0 ? [] : ["within: a distance above nothing, m"]];

/** **Holding at a place on the ground** (`holdAt`), whatever the focus: a rest option at the place its config names, which is its site. */
export const HOLD_AT_OPTION: OptionKindPart<PlaceConfig> = deepFreeze({
  role: "option", label: "Hold at a place", stage: "game", fields: [], slots: [], defaults: { kind: "hold-at-place", x: 0, z: 0, within: .3 },
  keys: { kind: true, x: true, z: true, within: true }, fits: anyBody, faults: placeFaults,
  make: (config: PlaceConfig, given: OptionsGiven) => [holdAt(config.x, config.z, config.within, given.walk)],
});

/** **The cover** of the head by the hand on the side a blow closes from (`covers`). */
export const COVER_OPTION = kind("covers", "Cover", (given) => covers(given.spec));

/** **Hold the position** (`hold`), a rest option. */
export const HOLD_OPTION = kind("hold-position", "Hold the position", (given) => [hold(given.walk)]);

/** **The hands at their guard** (`guard`), a rest option over the body's hands, none for a body without. */
export const GUARD_OPTION = kind("hands-at-guard", "Hands at guard", (given) => guardOf(given.spec));

/** Its options as it starts, in rank order: orders, each strike, the walk, the rise (`RISE_OPTIONS`), covers, then the rest options. */
export const OPTIONS: readonly PartConfig[] = deepFreeze([...[ORDERS_OPTION, STRAIGHT_PUNCH_OPTION, CLUB_BLOW_OPTION, CUT_OPTION, SWORD_THRUST_OPTION, STOMP_OPTION,
  WALK_OPTION].map((part) => part.defaults), ...RISE_OPTIONS, ...[COVER_OPTION, HOLD_OPTION, GUARD_OPTION, BRACE_OPTION].map((part) => part.defaults)]);

/** **Standing where it is**: the rise (`RISE_OPTIONS`), holding the position, the hands at guard and the brace; a body under these alone strikes, walks and covers nothing. */
export const STANDING_OPTIONS: readonly PartConfig[] = deepFreeze([...RISE_OPTIONS, ...[HOLD_OPTION, GUARD_OPTION, BRACE_OPTION].map((part) => part.defaults)]);

/**
 * The options `configs` name, each kind's as `of` finds it, made from `given` and the options the
 * kinds before it made (`OptionsGiven.made`), in their order; then the sites they name (`Sites`),
 * each name once.
 */
export function optionsOf(of: (config: PartConfig) => OptionKindPart, configs: readonly PartConfig[], given: Omit<OptionsGiven, "made" | "sites">): readonly Option[] {
  const all: Site[] = [], names: string[] = [], made: Option[] = [];
  for (const config of configs) made.push(...of(config).make(config, { ...given, made: Object.freeze([...made]), sites: { all, names } }));
  for (const option of made) for (const site of option.sites ?? []) {
    if (names.includes(site.name)) throw new Error(`two sites are named ${site.name}`);
    all.push(site); names.push(site.name);
  }
  Object.freeze(all); Object.freeze(names);
  return made;
}
