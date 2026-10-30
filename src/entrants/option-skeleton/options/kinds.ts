import type { ActionConfig } from "../../../core/mind/config.ts";
import type { OptionPart } from "../../../core/option/parts.ts";
import { anyBody, type KeysOf, type PartConfig } from "../../../core/parts/parts.ts";
import type { BodySpec } from "../../../core/spec/body.ts";
import { deepFreeze } from "../../../core/state.ts";
import type { covers } from "./cover.ts";
import type { Ground } from "./ground.ts";
import type { Option } from "./option.ts";
import { followOrders } from "./orders.ts";
import { outOfPressure, walkBy, windowPlace, type Destination } from "./places.ts";
import type { Going } from "./position.ts";
import { guardOf, hold } from "./rest.ts";
import type { StrikeOption } from "./strike.ts";
import type { Walker } from "./walk.ts";

/**
 * **What Option Mind gives each kind of its options** to make them from: its body's spec, its walk, the
 * actions it throws and a strike of each (`strike`), each gait as measured (`goings`), the
 * rise (`groundOptions`) and the hands' covers (`covers`).
 */
interface OptionsGiven {
  readonly spec: BodySpec;
  readonly walk: Walker;
  readonly actions: readonly ActionConfig[];
  readonly strikes: readonly StrikeOption[];
  readonly gaits: readonly Going[];
  readonly ground: Ground;
  readonly hands: ReturnType<typeof covers>;
}

/** **A kind of Option Mind's options** (`OptionPart`): made from what Option Mind gives (`OptionsGiven`). */
export type OptionKindPart<C extends PartConfig = PartConfig> = OptionPart<C, OptionsGiven, Option>;

/** A kind of option with no settings of its own, `kind`, labelled `label`, made by `make`. */
function kind<K extends string>(kind: K, label: string, make: (given: OptionsGiven) => readonly Option[]): OptionKindPart<{ readonly kind: K }> {
  return deepFreeze({ role: "option", label, stage: "game", fields: [], slots: [], defaults: { kind }, keys: { kind: true } as KeysOf<{ readonly kind: K }>,
    fits: anyBody, faults: () => [], make: (_config: { readonly kind: K }, given: OptionsGiven) => make(given) });
}

/** **Following the orders** a person gives (`followOrders`). */
const ORDERS_OPTION = kind("option-skeleton:orders", "Follow orders", (given) => [followOrders(given.walk, given.actions)]);

/** **A strike** of each blow it throws (`strike`). */
const STRIKE_OPTION = kind("option-skeleton:strikes", "Strikes", (given) => given.strikes);

/** A kind of footwork, `kind`, labelled `label`: an option a gait (`walkBy`), each going where it is worth most of the places `places` makes. */
const footwork = <K extends string>(name: K, label: string, places: (given: OptionsGiven) => readonly Destination[]) =>
  kind(name, label, (given) => {
    const destinations = places(given);
    return given.gaits.map((going) => walkBy(going, destinations, given.walk));
  });

/** **Walking into a strike's window**: footwork to each strike's (`windowPlace`), so a new strike adds its own place. */
const WINDOWS_WALK = footwork("option-skeleton:walk-into-windows", "Walk into strike windows", (given) => given.strikes.map((one) => windowPlace(one, given.walk)));

/** **Walking out of the focus's pressure**: footwork past where its modelled strikes reach (`outOfPressure`). */
const PRESSURE_WALK = footwork("option-skeleton:walk-out-of-pressure", "Walk out of pressure", (given) => [outOfPressure(given.walk)]);

/** **The rise**: down, the ground's options (`groundOptions`). */
const RISE_OPTION = kind("option-skeleton:rise", "Rise", (given) => given.ground.options);

/** **The cover** of the head by the hand on the side a blow closes from (`covers`). */
const COVER_OPTION = kind("option-skeleton:covers", "Cover", (given) => given.hands.options);

/** **Hold the position** (`hold`), a rest option. */
const HOLD_OPTION = kind("option-skeleton:hold-position", "Hold the position", (given) => [hold(given.walk)]);

/** **The hands at their guard** (`guard`), a rest option over the body's hands, none for a body without. */
const GUARD_OPTION = kind("option-skeleton:hands-at-guard", "Hands at guard", (given) => guardOf(given.spec));

/** **Brace**, down (`Ground.rest`), a rest option. */
const BRACE_OPTION = kind("option-skeleton:brace", "Brace", (given) => [given.ground.rest]);

/** Every kind of Option Mind's options. */
export const OPTION_KINDS: readonly OptionKindPart[] = Object.freeze([ORDERS_OPTION, STRIKE_OPTION, WINDOWS_WALK, PRESSURE_WALK, RISE_OPTION, COVER_OPTION, HOLD_OPTION, GUARD_OPTION, BRACE_OPTION]);

/** Its options as it starts, in rank order: orders, strikes, footwork into the windows and out of pressure, the rise, covers, then the rest options. */
export const OPTIONS: readonly PartConfig[] = deepFreeze([ORDERS_OPTION, STRIKE_OPTION, WINDOWS_WALK, PRESSURE_WALK, RISE_OPTION, COVER_OPTION, HOLD_OPTION, GUARD_OPTION, BRACE_OPTION]
  .map((part) => part.defaults));

/** The options `configs` name, each kind's as `of` finds it, made from `given`, in their order. */
export const optionsOf = (of: (config: PartConfig) => OptionKindPart, configs: readonly PartConfig[], given: OptionsGiven): readonly Option[] =>
  configs.flatMap((config) => of(config).make(config, given));
