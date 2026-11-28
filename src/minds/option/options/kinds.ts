import type { GaitName } from "../../../skills/framework/skill.ts";
import type { ConfigFor } from "../../../parts/lookup.ts";
import { optionApplies } from "../assembly/config.ts";
import type { OptionContext } from "../contract/context.ts";
import type { OptionPart } from "../contract/parts.ts";
import { optionalChoice } from "../../../parts/fields.ts";
import { anyBody, slotOne, type KeysOf, type PartConfig } from "../../../parts/parts.ts";
import { gaitChoices } from "../../../skills/locomotion/move/move-rule-part.ts";
import { deepFreeze } from "../../../core/state.ts";
import { covers } from "./cover.ts";
import { backStepping } from "./back-step.ts";
import type { Option, Site } from "../contract/option.ts";
import { followOrders } from "./orders.ts";
import { gaitsOf, goesBy, walkBy, walkModel } from "./places.ts";
import { guardOf, hold, holdAt } from "./rest.ts";
import { choosingSkill } from "./selection.ts";
import { handSet } from "../../../core/hand-set.ts";

/** A kind of option with no settings of its own, `kind`, labelled `label`, made by `make`. */
function kind<K extends string>(kind: K, label: string, make: (given: OptionContext) => readonly Option[]): OptionPart<{ readonly kind: K }> {
  return deepFreeze<OptionPart<{ readonly kind: K }>>({ role: "option", label, stands: false, fields: [], slots: [], defaults: { kind }, keys: { kind: true } as KeysOf<{ readonly kind: K }>,
    fits: anyBody, faults: () => [], make: (_config: { readonly kind: K }, given: OptionContext) => make(given) });
}

/** **Following the orders** a person gives (`followOrders`), by the gaits its body's legs go by (`gaitsOf`). */
export const ORDERS_OPTION = deepFreeze({ ...kind("orders", "Follow orders",
  given => given.parts.selected("navigation", given.spec).map(config => choosingSkill(
    followOrders(gaitsOf(given.parts, given.legs, given.spec).map(gait => gait.name), given.walk), config, "navigation"))), obeys: true });

/** A walk's gait and planner; omitted, every enabled gait and navigation is available to the chooser. */
export interface WalkConfig {
  readonly kind: "walk";
  readonly gait?: GaitName;
  readonly navigation?: ConfigFor<"navigation"> | null;
}

/**
 * **The walk** (`walkBy`): one option by each gait of its body's legs (`gaitsOf`), or by the one its
 * config names, meaning go to a place by that gait, its places the sites its mind's options name
 * (`Sites`); none on legs without that gait. Its way is planned by its navigation.
 */
export const WALK_OPTION = deepFreeze<OptionPart<WalkConfig>>({
  role: "option", label: "Walk to a site", stands: false, fields: [optionalChoice<WalkConfig, "gait">("gait", "Gait", "Every gait", gaitChoices)],
  slots: [slotOne("navigation", "Navigation", "navigation", true)], defaults: { kind: "walk" },
  keys: { kind: true, gait: true, navigation: true }, fits: anyBody, faults: () => [],
  applicable: (config: WalkConfig, { parts, legs, spec }) => legs === null || gaitsOf(parts, legs, spec).some(gait => config.gait === undefined || gait.name === config.gait),
  skills: (config: WalkConfig) => config.navigation ? { navigation: config.navigation } : {},
  make: (config: WalkConfig, given: OptionContext) => {
    // A gait's walks by each navigator price alike, so share one model (`walkModel`).
    const gaits = gaitsOf(given.parts, given.legs, given.spec).filter(gait => config.gait === undefined || gait.name === config.gait)
      .map(gait => ({ gait, model: walkModel(gait, given.sites, given.walk, given.spec) }));
    return given.parts.selected("navigation", given.spec).filter(navigation => !config.navigation || config.navigation.kind === navigation.kind)
      .flatMap(navigation => gaits.map(({ gait, model }) => choosingSkill(walkBy(gait, given.sites, given.walk, model), navigation, "navigation")));
  },
});

/** How near a place the body holds there, m, unless its config says. */
const HELD_WITHIN = handSet({
  name: "HELD_WITHIN", sort: "own",
  says: "How near a place a body holding at it counts as there, m, unless the hold's config says.",
  value: .3,
});

/** **A place on the ground** to hold at: where it is, m, and how near its centre the body holds there. */
interface PlaceConfig { readonly kind: "hold-at-place"; readonly x: number; readonly z: number; readonly within: number }

/** What is wrong with a place's config: a coordinate not finite, or a reach not above nothing. */
const placeFaults = (config: PlaceConfig): readonly string[] => [
  ...Number.isFinite(config.x) && Number.isFinite(config.z) ? [] : ["x, z: a place, m"],
  ...Number.isFinite(config.within) && config.within > 0 ? [] : ["within: a distance above nothing, m"]];

/** **Holding at a place on the ground** (`holdAt`), whatever the focus: a rest option at the place its config names, which is its site. */
export const HOLD_AT_OPTION = deepFreeze<OptionPart<PlaceConfig>>({
  role: "option", label: "Hold at a place", offered: false, stands: false, fields: [], slots: [], defaults: { kind: "hold-at-place", x: 0, z: 0, within: HELD_WITHIN },
  keys: { kind: true, x: true, z: true, within: true }, fits: anyBody, faults: placeFaults,
  make: (config: PlaceConfig, given: OptionContext) => [holdAt(config.x, config.z, config.within, given.walk)],
});

/** **The cover** of the head by the hand on the side a blow closes from (`covers`). */
export const COVER_OPTION = kind("covers", "Cover", given => given.guards.flatMap(config => {
  const part = given.parts.of("guard", config);
  return covers(given.spec, part.covers?.(given.spec, config) ?? []).map(option => choosingSkill(option, config, "guard"));
}));

/** **The back step** (`backStepping`), where its body's steps' profiles measured it and its legs go by its gait (`goesBy`). */
export const BACK_STEP_OPTION = kind("steps-back", "Back step", given => goesBy(given.parts, given.legs, given.spec, "back-step") ? backStepping(given) : []);

/** **Hold the position** (`hold`), a rest option. */
export const HOLD_OPTION = deepFreeze({ ...kind("hold-position", "Hold the position", (given) => [hold(given.walk)]), stands: true });

/** Each enabled guard as its own rest option, explicitly selected by the mind. */
export const GUARD_OPTION = deepFreeze({ ...kind("hands-at-guard", "Hands at guard", given => given.guards.map(config =>
  choosingSkill(guardOf(given.spec, given.parts.of("guard", config).covers?.(given.spec, config) ?? []), config, "guard"))),
  stands: true });

/**
 * The Options `configs` name, each kind's as `given.parts` finds it, made from `given`, in their
 * order; then the sites they name (`Sites`), each name once.
 */
export function optionsOf(configs: readonly PartConfig[], given: Omit<OptionContext, "sites" | "options">): readonly Option[] {
  const all: Site[] = [], names: string[] = [], made: Option[] = [];
  const body = { ...given, options: configs, sites: { all, names } };
  for (const config of configs) if (optionApplies(config, body)) made.push(...given.parts.of("option", config).make(config, body));
  for (const option of made) for (const site of option.sites ?? []) {
    if (names.includes(site.name)) throw new Error(`two sites are named ${site.name}`);
    all.push(site); names.push(site.name);
  }
  Object.freeze(all); Object.freeze(names);
  return made;
}

declare module "../contract/parts.ts" {
  interface OptionConfigs {
    readonly orders: { readonly kind: "orders" };
    readonly walk: WalkConfig;
    readonly "hold-at-place": PlaceConfig;
    readonly covers: { readonly kind: "covers" };
    readonly "steps-back": { readonly kind: "steps-back" };
    readonly "hold-position": { readonly kind: "hold-position" };
    readonly "hands-at-guard": { readonly kind: "hands-at-guard" };
  }
}
