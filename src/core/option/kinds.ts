import type { ActionConfig, ExecutorEntry, LocomotionConfig } from "../skills/config.ts";
import type { PartLookup } from "../parts/lookup.ts";
import type { OptionPart } from "./parts.ts";
import { anyBody, type KeysOf, type PartConfig } from "../parts/parts.ts";
import type { BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import { covers } from "./cover.ts";
import type { Ground } from "./ground.ts";
import type { Option } from "./option.ts";
import { followOrders } from "./orders.ts";
import { gaitsOf, goings, groundPlace, outOfPressure, walkBy, windowPlace, type Destination } from "./places.ts";
import type { ProfileTables } from "./predictions-part.ts";
import { guardOf, hold } from "./rest.ts";
import type { StrikeMeasure, StrikeOption } from "./strike.ts";
import type { Walker } from "./walk.ts";

/**
 * **What Option Mind gives each kind of its options** to make them from: its body's spec, the
 * world's rate (Hz) and the part lookup; its legs, executors and actions as its config names them,
 * and the profile tables it predicts from (`ProfileTables`); and what the mind itself runs on: its
 * walk, each action's measure (`strikeMeasure`) and a strike of each (`strike`), and the rise
 * (`groundOptions`). A kind builds anything else it needs from these, the gaits and the hands'
 * covers among them.
 */
export interface OptionsGiven {
  readonly spec: BodySpec;
  readonly hz: number;
  readonly parts: PartLookup;
  readonly locomotion: LocomotionConfig;
  readonly executors: readonly ExecutorEntry[];
  readonly actions: readonly ActionConfig[];
  readonly tables: ProfileTables;
  readonly walk: Walker;
  readonly measures: readonly StrikeMeasure[];
  readonly strikes: readonly StrikeOption[];
  readonly ground: Ground;
}

/** **A kind of Option Mind's options** (`OptionPart`): made from what Option Mind gives (`OptionsGiven`). */
export type OptionKindPart<C extends PartConfig = PartConfig> = OptionPart<C, OptionsGiven, Option>;

/** A kind of option with no settings of its own, `kind`, labelled `label`, made by `make`. */
function kind<K extends string>(kind: K, label: string, make: (given: OptionsGiven) => readonly Option[]): OptionKindPart<{ readonly kind: K }> {
  return deepFreeze({ role: "option", label, stage: "game", fields: [], slots: [], defaults: { kind }, keys: { kind: true } as KeysOf<{ readonly kind: K }>,
    fits: anyBody, faults: () => [], make: (_config: { readonly kind: K }, given: OptionsGiven) => make(given) });
}

/** **Following the orders** a person gives (`followOrders`). */
export const ORDERS_OPTION = kind("orders", "Follow orders", (given) => [followOrders(given.walk, given.actions)]);

/** **A strike** of each blow it throws (`strike`). */
export const STRIKE_OPTION = kind("strikes", "Strikes", (given) => given.strikes);

/** **Each gait its legs go by** (`gaitsOf`) as the Gait drill measured it stopping to throw each of its strikes (`goings`). */
const gaitsGiven = (given: OptionsGiven) => goings(given.spec, given.hz, gaitsOf(given.locomotion),
  given.actions.map((action, i) => ({ name: action.name, skill: given.measures[i]!.measured.skill })), given.tables.gaits);

/** A kind of footwork, `kind`, labelled `label`: an option of each gait (`walkBy`, `gaitsGiven`), each going where it is worth most of the places `places` makes; none where it makes no place. */
const footwork = <K extends string>(name: K, label: string, places: (given: OptionsGiven) => readonly Destination[]) =>
  kind(name, label, (given) => {
    const destinations = places(given);
    return destinations.length === 0 ? [] : gaitsGiven(given).map((going) => walkBy(going, destinations, given.walk));
  });

/** **Walking into a strike's window**: footwork to each strike's (`windowPlace`), so a new strike adds its own place. */
export const WINDOWS_WALK = footwork("walk-into-windows", "Walk into strike windows", (given) => given.strikes.map((one) => windowPlace(one, given.walk)));

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
  make: (config: PlaceConfig, given: OptionsGiven) => gaitsGiven(given).map((going) => walkBy(going, [groundPlace(config.x, config.z, config.within, given.walk)], given.walk)),
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

/** Its options as it starts, in rank order: orders, strikes, footwork into the windows and out of pressure, the rise, covers, then the rest options. */
export const OPTIONS: readonly PartConfig[] = deepFreeze([ORDERS_OPTION, STRIKE_OPTION, WINDOWS_WALK, PRESSURE_WALK, RISE_OPTION, COVER_OPTION, HOLD_OPTION, GUARD_OPTION, BRACE_OPTION]
  .map((part) => part.defaults));

/** The options `configs` name, each kind's as `of` finds it, made from `given`, in their order. */
export const optionsOf = (of: (config: PartConfig) => OptionKindPart, configs: readonly PartConfig[], given: OptionsGiven): readonly Option[] =>
  configs.flatMap((config) => of(config).make(config, given));
