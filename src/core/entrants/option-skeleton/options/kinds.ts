import type { ActionConfig } from "../../../mind/config.ts";
import type { OptionPart } from "../../../mind/option-part.ts";
import { anyBody, slotOne, type KeysOf, type PartConfig } from "../../../mind/parts.ts";
import { tacticsOf, type TacticsMaking } from "../../../mind/tactics-part.ts";
import type { Cover } from "../../../mind/intent.ts";
import type { Tactics } from "../../../mind/tactics.ts";
import type { BodySpec } from "../../../spec/body.ts";
import { deepFreeze } from "../../../state.ts";
import type { covers } from "./cover.ts";
import type { Ground } from "./ground.ts";
import { asking, READY, WHOLE, type Option } from "./option.ts";
import { followOrders } from "./orders.ts";
import { outOfPressure, walkBy, windowPlace, type Destination } from "./places.ts";
import type { Going } from "./position.ts";
import { guardOf, hold, still } from "./rest.ts";
import type { StrikeOption } from "./strike.ts";
import type { Walker } from "./walk.ts";

/**
 * **What Option Mind gives each kind of its options** to make them from: its body's spec, its walk, the
 * actions it throws and a strike of each (`strike`), each gait as measured (`goings`), the
 * rise (`groundOptions`), the hands' covers (`covers`) and what tactics are made for (`TacticsMaking`, a script's).
 */
export interface OptionsGiven {
  readonly spec: BodySpec;
  readonly walk: Walker;
  readonly actions: readonly ActionConfig[];
  readonly strikes: readonly StrikeOption[];
  readonly gaits: readonly Going[];
  readonly ground: Ground;
  readonly hands: ReturnType<typeof covers>;
  readonly making: TacticsMaking;
}

/** **A kind of Option Mind's options** (`OptionPart`): made from what Option Mind gives (`OptionsGiven`). */
export type OptionKindPart<C extends PartConfig = PartConfig> = OptionPart<C, OptionsGiven, Option>;

/** A kind of option with no settings of its own, `kind`, labelled `label`, made by `make`. */
function kind<K extends string>(kind: K, label: string, make: (given: OptionsGiven) => readonly Option[]): OptionKindPart<{ readonly kind: K }> {
  return deepFreeze({ role: "option", label, stage: "game", fields: [], slots: [], defaults: { kind }, keys: { kind: true } as KeysOf<{ readonly kind: K }>,
    fits: anyBody, faults: () => [], make: (_config: { readonly kind: K }, given: OptionsGiven) => make(given) });
}

/** **Following the orders** a person gives (`followOrders`). */
export const ORDERS_OPTION = kind("skeleton-orders", "Follow orders", (given) => [followOrders(given.walk, given.actions)]);

/** **A strike** of each blow it throws (`strike`). */
export const STRIKE_OPTION = kind("skeleton-strikes", "Strikes", (given) => given.strikes);

/** A kind of footwork, `kind`, labelled `label`: an option a gait (`walkBy`), each going where it is worth most of the places `places` makes. */
const footwork = <K extends string>(name: K, label: string, places: (given: OptionsGiven) => readonly Destination[]) =>
  kind(name, label, (given) => {
    const destinations = places(given);
    return given.gaits.map((going) => walkBy(going, destinations, given.walk));
  });

/** **Walking into a strike's window**: footwork to each strike's (`windowPlace`), so a new strike adds its own place. */
export const WINDOWS_WALK = footwork("skeleton-walk-into-windows", "Walk into strike windows", (given) => given.strikes.map((one) => windowPlace(one, given.walk)));

/** **Walking out of the focus's pressure**: footwork past where its modelled strikes reach (`outOfPressure`). */
export const PRESSURE_WALK = footwork("skeleton-walk-out-of-pressure", "Walk out of pressure", (given) => [outOfPressure(given.walk)]);

/** **The rise**: down, the ground's options (`groundOptions`). */
export const RISE_OPTION = kind("skeleton-rise", "Rise", (given) => given.ground.options);

/** **The cover** of the head by the hand on the side a blow closes from (`covers`). */
export const COVER_OPTION = kind("skeleton-covers", "Cover", (given) => given.hands.options);

/** **Hold the position** (`hold`), a rest option. */
export const HOLD_OPTION = kind("skeleton-hold-position", "Hold the position", (given) => [hold(given.walk)]);

/** **The hands at their guard** (`guard`), a rest option over the body's hands, none for a body without. */
export const GUARD_OPTION = kind("skeleton-hands-at-guard", "Hands at guard", (given) => guardOf(given.spec));

/** **Brace**, down (`Ground.rest`), a rest option. */
export const BRACE_OPTION = kind("skeleton-brace", "Brace", (given) => [given.ground.rest]);

/** **A script**: the tactics a drill drives the body by (`Controller.drilled`), its orders, run whole. */
interface ScriptedConfig {
  readonly kind: "skeleton-scripted";
  readonly tactics: PartConfig;
}

/**
 * `tactics` as one option: always on offer and committed, over the whole body, worth keeping the
 * body as it is (`still`); its step is what they decide, and it reports what they do. Its memory is
 * theirs.
 */
function scripted(tactics: Tactics): Option {
  return {
    name: tactics.name, state: tactics.state ?? {}, claims: WHOLE, engagement: tactics.engagement,
    get decision() { return tactics.decision; },
    entry: () => READY, status: () => "committed", begin() {}, end() {}, model: still,
    step(now, dt) {
      const { guard, ...rest } = tactics.decide(now.sight, dt), covers: Record<string, Cover> = {};
      // A hand with no cover holds the guard's pose, as one not named does.
      for (const [hand, cover] of Object.entries(guard)) if (cover) covers[hand] = cover;
      const asked = { ...rest, guard: covers };
      return { asked, holds: asking(now, asked) };
    },
  };
}

/** **A script** (`scripted`): the tactics its config names, made as a mind's are (`tacticsOf`). */
export const SCRIPTED_OPTION: OptionKindPart<ScriptedConfig> = deepFreeze({
  role: "option", label: "Script", stage: "experimental", fields: [], slots: [slotOne("tactics", "Tactics", "tactics")],
  defaults: { kind: "skeleton-scripted", tactics: { kind: "skeleton-drill-cover" } }, keys: { kind: true, tactics: true },
  fits: anyBody, faults: () => [], make: (config: ScriptedConfig, given: OptionsGiven) => [scripted(tacticsOf(given.making, config.tactics))],
});

/** The scripts `configs` name (`SCRIPTED_OPTION`): each one's tactics. */
export const scriptsOf = (configs: readonly PartConfig[]): readonly PartConfig[] =>
  configs.flatMap((config) => config.kind === "skeleton-scripted" ? [(config as ScriptedConfig).tactics] : []);

/** Every kind of Option Mind's options. */
export const OPTION_KINDS: readonly OptionKindPart[] = Object.freeze([ORDERS_OPTION, STRIKE_OPTION, WINDOWS_WALK, PRESSURE_WALK, RISE_OPTION, COVER_OPTION, HOLD_OPTION, GUARD_OPTION, BRACE_OPTION,
  SCRIPTED_OPTION as OptionKindPart]);

/** Its options as it starts, in rank order: orders, strikes, footwork into the windows and out of pressure, the rise, covers, then the rest options. */
export const OPTIONS: readonly PartConfig[] = deepFreeze([ORDERS_OPTION, STRIKE_OPTION, WINDOWS_WALK, PRESSURE_WALK, RISE_OPTION, COVER_OPTION, HOLD_OPTION, GUARD_OPTION, BRACE_OPTION]
  .map((part) => part.defaults));

/** The options `configs` name, each kind's as `of` finds it, made from `given`, in their order. */
export const optionsOf = (of: (config: PartConfig) => OptionKindPart, configs: readonly PartConfig[], given: OptionsGiven): readonly Option[] =>
  configs.flatMap((config) => of(config).make(config, given));
