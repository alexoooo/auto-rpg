import type { ActionConfig, ExecutorEntry, LocomotionConfig } from "../skills/config.ts";
import { blowsOf } from "../skills/action-config.ts";
import { skillDigest } from "../skills/framework/profile.ts";
import type { PartLookup } from "../parts/lookup.ts";
import type { OptionPart } from "./parts.ts";
import { anyBody, type KeysOf, type PartConfig } from "../parts/parts.ts";
import type { BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import { covers } from "./cover.ts";
import type { Ground } from "./ground.ts";
import type { Option } from "./option.ts";
import { followOrders } from "./orders.ts";
import { gaitsOf, goings, groundPlace, outOfPressure, walkBy, windowPlace, type Destination, type Windowed } from "./places.ts";
import type { ProfileTables } from "./predictions-part.ts";
import { guardOf, hold } from "./rest.ts";
import { strike, strikeMeasure } from "./strike.ts";
import type { Walker } from "./walk.ts";

/**
 * **What Option Mind gives each kind of its options** to make them from: its body's spec, the
 * world's rate (Hz) and the part lookup; its legs, executors and actions as its config names them,
 * and the profile tables it predicts from (`ProfileTables`); what the mind itself runs on: its walk
 * and the rise (`groundOptions`); and the options the kinds before it made (`made`). A kind builds
 * anything else it needs from these, the strikes, the gaits and the hands' covers among them.
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
  readonly ground: Ground;
  /** The options the kinds before it in its mind's rank order made, in that order. */
  readonly made: readonly Option[];
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

/** **Each gait its legs go by** (`gaitsOf`) as the Gait drill measured it stopping to throw each of its actions (`goings`, each by its digest, `skillDigest`). */
const gaitsGiven = (given: OptionsGiven) => goings(given.spec, given.hz, gaitsOf(given.locomotion),
  given.actions.map((action) => ({ name: action.name, skill: skillDigest(given.parts, given.spec, given.executors, action) })), given.tables.gaits, given.rate ?? given.hz, given.delay);

/**
 * **Footwork to `destinations`**: an option of each gait its legs go by (`walkBy`, `gaitsGiven`),
 * each going where it is worth most of them, priced as every walk is (`walkTerms`); none where there
 * is no destination. A kind of option of any mind's own makes its footwork with it, its places any
 * rule's (`placeBy`).
 */
export const walksTo = (given: OptionsGiven, destinations: readonly Destination[]): readonly Option[] =>
  destinations.length === 0 ? [] : gaitsGiven(given).map((going) => walkBy(going, destinations, given.walk));

/** A kind of footwork, `kind`, labelled `label`, to the places `places` makes (`walksTo`). */
export const footwork = <K extends string>(name: K, label: string, places: (given: OptionsGiven) => readonly Destination[]) =>
  kind(name, label, (given) => walksTo(given, places(given)));

/** **Walking into a window**: footwork to the window of each option made before it that has one (`Option.window`, `windowPlace`), so a new strike adds its own place. */
export const WINDOWS_WALK = footwork("walk-into-windows", "Walk into strike windows",
  (given) => given.made.flatMap((option) => option.window ? [windowPlace(option as Windowed, given.walk)] : []));

/** **Walking out of the focus's pressure**: footwork past where its modelled strikes reach (`outOfPressure`). */
export const PRESSURE_WALK = footwork("walk-out-of-pressure", "Walk out of pressure", (given) => [outOfPressure(given.walk)]);

/** **A place on the ground** to walk to: where it is, m, and how near its centre the body reaches it, m. */
export interface PlaceConfig { readonly kind: "walk-to-place"; readonly x: number; readonly z: number; readonly within: number }

/** What is wrong with a place's config: a coordinate not finite, or a reach not above nothing. */
export const placeFaults = (config: { readonly x: number; readonly z: number; readonly within: number }): readonly string[] => [
  ...Number.isFinite(config.x) && Number.isFinite(config.z) ? [] : ["x, z: a place, m"],
  ...Number.isFinite(config.within) && config.within > 0 ? [] : ["within: a distance above nothing, m"]];

/**
 * **Walking to a place on the ground** (`groundPlace`), whatever the focus: footwork, one option a
 * gait (`walkBy`), to the place its config names, until the body's centre is within its reach.
 */
export const PLACE_WALK: OptionKindPart<PlaceConfig> = deepFreeze({
  role: "option", label: "Walk to a place", stage: "game", fields: [], slots: [], defaults: { kind: "walk-to-place", x: 0, z: 0, within: .3 },
  keys: { kind: true, x: true, z: true, within: true }, fits: anyBody, faults: placeFaults,
  make: (config: PlaceConfig, given: OptionsGiven) => walksTo(given, [groundPlace(config.x, config.z, config.within, given.walk)]),
});

/** **The rise**: down, the ground's options (`groundOptions`). */
export const RISE_OPTION = kind("rise", "Rise", (given) => given.ground.options);

/** **The cover** of the head by the hand on the side a blow closes from (`covers`). */
export const COVER_OPTION = kind("covers", "Cover", (given) => covers(given.spec));

/** **Hold the position** (`hold`), a rest option. */
export const HOLD_OPTION = kind("hold-position", "Hold the position", (given) => [hold(given.walk)]);

/** **The hands at their guard** (`guard`), a rest option over the body's hands, none for a body without. */
export const GUARD_OPTION = kind("hands-at-guard", "Hands at guard", (given) => guardOf(given.spec));

/** **Brace**, down (`Ground.rest`), a rest option. */
export const BRACE_OPTION = kind("brace", "Brace", (given) => [given.ground.rest]);

/** Its options as it starts, in rank order: orders, each strike, footwork into the windows and out of pressure, the rise, covers, then the rest options. */
export const OPTIONS: readonly PartConfig[] = deepFreeze([ORDERS_OPTION, STRAIGHT_PUNCH_OPTION, CLUB_BLOW_OPTION, CUT_OPTION, SWORD_THRUST_OPTION, STOMP_OPTION,
  WINDOWS_WALK, PRESSURE_WALK, RISE_OPTION, COVER_OPTION, HOLD_OPTION, GUARD_OPTION, BRACE_OPTION].map((part) => part.defaults));

/** **Standing where it is**: the rise, holding the position, the hands at guard and the brace; a body under these alone strikes, walks and covers nothing. */
export const STANDING_OPTIONS: readonly PartConfig[] = deepFreeze([RISE_OPTION, HOLD_OPTION, GUARD_OPTION, BRACE_OPTION].map((part) => part.defaults));

/** The options `configs` name, each kind's as `of` finds it, made from `given` and the options the kinds before it made (`OptionsGiven.made`), in their order. */
export function optionsOf(of: (config: PartConfig) => OptionKindPart, configs: readonly PartConfig[], given: Omit<OptionsGiven, "made">): readonly Option[] {
  const made: Option[] = [];
  for (const config of configs) made.push(...of(config).make(config, { ...given, made: Object.freeze([...made]) }));
  return made;
}
