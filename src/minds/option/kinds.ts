import type { GaitName } from "../../skills/framework/skill.ts";
import type { ActionConfig, ExecutorEntry } from "../../skills/config.ts";
import type { Region } from "../../skills/framework/action.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import { optionApplies, type OptionBody, type OptionPart } from "./parts.ts";
import { choice, json, optionalChoice } from "../../parts/fields.ts";
import { anyBody, slotOne, slotSkill, type KeysOf, type PartConfig } from "../../parts/parts.ts";
import { GAIT_CHOICES } from "../../skills/locomotion/move-rule-part.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../core/state.ts";
import { recordingKey } from "../../core/world/recording.ts";
import { covers } from "./cover.ts";
import { LIMB_ROLES, limbsOf, type LimbRole } from "./limbs.ts";
import type { Option, Site } from "./option.ts";
import { followOrders } from "./orders.ts";
import { gaitsOf, walkBy } from "./places.ts";
import { PROFILE_MODEL, type ProfileOptionContext } from "./profile-contract.ts";
import type { NamedSkills } from "./skills.ts";
import { guardOf, hold, holdAt } from "./rest.ts";
import { strike, strikeMeasure } from "./strike.ts";

/** An Option kind whose constructor consumes the declared profile-model context. */
export type ProfileOptionPart<C extends PartConfig = PartConfig> = OptionPart<C, ProfileOptionContext, Option> & {
  readonly model: typeof PROFILE_MODEL;
  /** Ordinary ascent choices establish routes; fallback transitions only serve uncovered starts. */
  readonly recovery?: { readonly purpose: "ascent" | "fallback"; technique(config: C): PartConfig };
};

/** The profile model's declared constructor and reporting protocol. */
export const isProfileOption = (part: OptionPart): part is ProfileOptionPart => part.model === PROFILE_MODEL;

/** A kind of option with no settings of its own, `kind`, labelled `label`, made by `make`. */
function kind<K extends string>(kind: K, label: string, make: (given: ProfileOptionContext) => readonly Option[]): ProfileOptionPart<{ readonly kind: K }> {
  return deepFreeze({ role: "option", model: PROFILE_MODEL, label, stage: "game", fields: [], slots: [], defaults: { kind }, keys: { kind: true } as KeysOf<{ readonly kind: K }>,
    fits: anyBody, faults: () => [], make: (_config: { readonly kind: K }, given: ProfileOptionContext) => make(given) });
}

/** **Following the orders** a person gives (`followOrders`): one option by each gait its body's legs go by (`gaitsOf`), one by the legs' own where they go by none. */
export const ORDERS_OPTION = deepFreeze({ ...kind("orders", "Follow orders", (given) => {
  const gaits = gaitsOf(given.parts, given.legs);
  return gaits.length ? gaits.map((gait) => followOrders(gait, given.walk)) : [followOrders(null, given.walk)];
}), obeys: true });

/**
 * **A strike's config**: the executor it strikes by (`skill`, of its kind's skill), the limbs it
 * strikes with by role (`LimbRole`), where its executor aims the regions it strikes, in order, and
 * its aim (`AimPart`), and the low support it strikes from where it names one (`LowSupportPart`).
 */
export interface StrikeConfig<K extends string = string> {
  readonly kind: `strike-${K}`;
  readonly skill: PartConfig;
  readonly limbs: LimbRole;
  readonly regions?: readonly Region[];
  readonly aim?: PartConfig;
  readonly support?: PartConfig | null;
}

/** **A kind of strike**: a kind of option (`ProfileOptionPart`) that strikes by one skill, the executor kind it names (`skill`). */
export type StrikeKindPart<K extends string = string> = ProfileOptionPart<StrikeConfig<K>> & { readonly skill: K };

/** Each executor's config as its body's skills hold it (`ExecutorEntry`), named by its kind: a skill is one config a mind. */
const ENTRIES = new WeakMap<PartConfig, ExecutorEntry>();

/** **The executor `skill` as its body's skills hold it**, named by its kind, made once a config. */
function executorEntry(skill: PartConfig): ExecutorEntry {
  let entry = ENTRIES.get(skill);
  if (!entry) ENTRIES.set(skill, entry = Object.freeze({ ...skill, name: skill.kind }));
  return entry;
}

/** A region as a strike's name says it: its mark, or its segment. */
const regionName = (region: Region): string => region.kind === "mark" ? region.mark : region.segment;

/** What of a strike's use its name may say (`strikeName`), in the order it says them: its limbs' role, its regions, its aim's kind, and its aim whole. */
const USES: readonly ((config: StrikeConfig) => string)[] = Object.freeze([
  (config: StrikeConfig) => config.limbs,
  (config: StrikeConfig) => (config.regions ?? []).map(regionName).join("+"),
  (config: StrikeConfig) => config.aim?.kind ?? "",
  (config: StrikeConfig) => recordingKey(config.aim ?? null),
]);

/**
 * **The name of a strike of `config` among its mind's `strikes`**: its skill's kind; where another
 * of them uses that skill, followed by what of its use tells it from each such other (the first of
 * `USES` that differs between the two). Two strikes alike in skill and use are a fault of their
 * mind (`optionMindFaults`), so every strike of a mind has a name of its own.
 */
function strikeName(config: StrikeConfig, strikes: readonly StrikeConfig[]): string {
  const told = new Set<number>();
  for (const other of strikes) {
    if (other === config || other.skill.kind !== config.skill.kind) continue;
    const k = USES.findIndex((said) => said(other) !== said(config));
    if (k >= 0) told.add(k);
  }
  return told.size === 0 ? config.skill.kind : `${config.skill.kind} (${[...told].sort((a, b) => a - b).map((k) => USES[k]!(config)).join(", ")})`;
}

/** The limbs a strike of `config` strikes with on a body of `spec`: those of its role its executor strikes with (`limbsOf`); none where the executor does not fit the body. */
const strikeLimbs = (parts: PartLookup, spec: BodySpec, config: StrikeConfig): readonly string[] =>
  parts.of("executor", config.skill).fits(spec, config.skill, parts) === null ? limbsOf(parts, spec, config.limbs, config.skill) : [];

/** Each strike's action, by its config, its body's spec and its name (`strikeAction`): configs are data, so an action is made once and is the same config at every make. */
const ACTIONS = new WeakMap<StrikeConfig, WeakMap<BodySpec, Map<string, ActionConfig | null>>>();

/**
 * **What a strike of `config` named `name` (`strikeName`) asks of its executor on a body of
 * `spec`**: an action of that name, struck with the body's limbs of its role that the executor
 * strikes with (`strikeLimbs`), at its regions by its aim; null where the executor does not fit the
 * body or it has no such limb.
 */
function strikeAction(parts: PartLookup, spec: BodySpec, config: StrikeConfig, name: string): ActionConfig | null {
  let bySpec = ACTIONS.get(config);
  if (!bySpec) ACTIONS.set(config, bySpec = new WeakMap());
  let byName = bySpec.get(spec);
  if (!byName) bySpec.set(spec, byName = new Map());
  if (byName.has(name)) return byName.get(name)!;
  const effectors = strikeLimbs(parts, spec, config);
  const action: ActionConfig | null = effectors.length === 0 ? null : Object.freeze({ name, executor: config.skill.kind, effectors,
    ...config.regions === undefined ? {} : { regions: config.regions }, ...config.aim === undefined ? {} : { aim: config.aim } });
  byName.set(name, action);
  return action;
}

/** Each action struck with one of its limbs (`limbAction`), by its limb: configs are data, so a narrowing is made once and is the same config at every make. */
const LIMBED = new WeakMap<ActionConfig, Map<string, ActionConfig>>();

/** **`action` struck with `limb` alone**: what one Option of a strike asks of its skill, and what its profile is measured of (`skillDigest`). */
export function limbAction(action: ActionConfig, limb: string): ActionConfig {
  let by = LIMBED.get(action);
  if (!by) LIMBED.set(action, by = new Map());
  let made = by.get(limb);
  if (!made) by.set(limb, made = Object.freeze({ ...action, effectors: Object.freeze([limb]) }));
  return made;
}

/** What is wrong with where a strike of `config` strikes, each a sentence: its regions and its aim where its executor aims, and neither where not. */
function aimingFaults(config: StrikeConfig, parts: PartLookup): readonly string[] {
  const executor = parts.of("executor", config.skill);
  if (!executor.aims) return config.regions !== undefined || config.aim !== undefined ? [`${executor.label} aims at nothing: no regions or aim`] : [];
  const faults: string[] = [], regions: readonly unknown[] = Array.isArray(config.regions) ? config.regions : [];
  if (!regions.length) faults.push("regions: at least one target region");
  for (const region of regions as readonly Region[]) {
    if (!region || typeof region !== "object") { faults.push("regions: valid target regions"); continue; }
    switch (region.kind) {
      case "segment": if (typeof region.segment !== "string" || !region.segment) faults.push("regions: a target segment named"); break;
      case "mark": if (!["high", "middle", "legs", "any"].includes(region.mark)) faults.push("regions: a target mark"); break;
      default: faults.push("regions: valid target regions");
    }
  }
  if (!config.aim || typeof config.aim !== "object") return [...faults, "aim: an aim"];
  const aim = parts.of("aim", config.aim);
  for (const key of Object.keys(config.aim)) if (!Object.hasOwn(aim.keys, key)) faults.push(`aim: no ${aim.label} aim setting ${key}`);
  faults.push(...aim.faults(config.aim, parts).map((fault) => `aim: ${fault}`));
  for (const effector of executor.effectors) if (aim.aimsWith && !aim.aimsWith(effector)) faults.push(`aim: ${aim.label} cannot aim ${effector}`);
  return faults;
}

/**
 * **The kind of strike by `skill`** (`strike-<skill>`): a strike (`strike`) of its action on its
 * body (`strikeAction`, named among its mind's strikes, `strikeName`) with each of its limbs, one Option a limb (`limbAction`, named by the action
 * and the limb), each priced by its profile among the strikes' where one is measured as the body
 * reads it (`strikeMeasure`); none where the body does not fit its skill or has no limb of its role.
 */
function strikeKind<K extends string>(skill: K, label: string, limbs: LimbRole): StrikeKindPart<K> {
  const of = (config: StrikeConfig<K>, given: ProfileOptionContext): readonly Option[] => {
    const action = strikeAction(given.parts, given.spec, config, strikeName(config, strikesIn(given.parts, given.options)));
    if (!action) return [];
    const executors = [executorEntry(config.skill)], blows = given.parts.of("executor", config.skill).blows?.(config.skill) ?? 1;
    return action.effectors.map((limb) => {
      const one = limbAction(action, limb);
      return strike(one, given.walk, blows, strikeMeasure(given.parts, given.spec, executors, one, given.hz, given.tables.strikes, given.rate ?? given.hz, given.delay), `${action.name} ${limb}`);
    });
  };
  return deepFreeze({
    role: "option", model: PROFILE_MODEL, label, stage: "game", skill,
    fields: [choice<StrikeConfig<K>, "limbs">("limbs", "Limbs", LIMB_ROLES), json<StrikeConfig<K>, "regions">("regions", "Target regions", "target-regions")],
    slots: [slotSkill("skill", "Skill", "executor"), slotOne("support", "Low support", "support", true), slotOne("aim", "Aim", "aim", true)],
    defaults: { kind: `strike-${skill}`, skill: { kind: skill }, limbs, regions: [{ kind: "mark", mark: "middle" }], aim: { kind: "centre", lead: 0 } } as StrikeConfig<K>,
    keys: { kind: true, skill: true, limbs: true, regions: true, aim: true, support: true } as KeysOf<StrikeConfig<K>>,
    fits: anyBody,
    faults: (config: StrikeConfig<K>, parts: PartLookup) => config.skill.kind !== skill ? [`skill: a ${skill}`]
      : [...LIMB_ROLES.some(([role]) => role === config.limbs) ? [] : ["limbs: a limb role"], ...aimingFaults(config, parts)],
    strikes: (spec: BodySpec, config: StrikeConfig<K>, parts: PartLookup) => strikeLimbs(parts, spec, config),
    skills(config: StrikeConfig<K>, spec: BodySpec, parts: PartLookup, options: readonly PartConfig[]): NamedSkills | null {
      const action = strikeAction(parts, spec, config, strikeName(config, strikesIn(parts, options)));
      return action ? { executor: executorEntry(config.skill), action, ...config.support ? { support: config.support } : {} } : null;
    },
    make: of,
  });
}

/** **The strikes among `options`** (`StrikeConfig`): those whose kind strikes by a skill it names (`StrikeKindPart.skill`), in their order. */
export const strikesIn = (parts: PartLookup, options: readonly PartConfig[]): readonly StrikeConfig[] =>
  options.filter((option): option is PartConfig & StrikeConfig => "skill" in (parts.of("option", option) as ProfileOptionPart));

/** **The straight punch** (`straight-punch`), with either hand. */
export const STRAIGHT_PUNCH_OPTION = strikeKind("straight-punch", "Straight punch", "either-hand");

/** **The club's blow** (`club-blow`), with the hand that holds the club. */
export const CLUB_BLOW_OPTION = strikeKind("club-blow", "Club blow", "holding-hand");

const BONK_KIND = strikeKind("bonk", "Bonk", "holding-hand");
/** A descending held-club use aimed at the head with the centre aim. */
export const BONK_OPTION = deepFreeze({ ...BONK_KIND, stage: "experimental" as const,
  defaults: { ...BONK_KIND.defaults, regions: [{ kind: "mark" as const, mark: "high" as const }] } });

/** **The sword's cut** (`cut`), with the hand that holds the sword. */
export const CUT_OPTION = strikeKind("cut", "Cut", "holding-hand");

/** **The sword's thrust** (`sword-thrust`), with the hand that holds the sword. */
export const SWORD_THRUST_OPTION = strikeKind("sword-thrust", "Sword thrust", "holding-hand");

/** **The stomp** (`stomp`), with either foot. */
export const STOMP_OPTION = strikeKind("stomp", "Stomp", "either-foot");

/** **The bite** (`jaw-bite`), with the jaw. */
export const BITE_OPTION = strikeKind("jaw-bite", "Bite", "jaw");

/** **A walk's config**: the gait of its body's legs it goes by (`Gait.name`), every one where it names none, and the navigation that plans its way (Visibility routes unless it names one). */
export interface WalkConfig {
  readonly kind: "walk";
  readonly gait?: GaitName;
  readonly navigation?: PartConfig | null;
}

/**
 * **The walk** (`walkBy`): one option by each gait of its body's legs (`gaitsOf`), or by the one its
 * config names, meaning go to a place by that gait, its places the sites its mind's options name
 * (`Sites`); none on legs without that gait. Its way is planned by its navigation.
 */
export const WALK_OPTION: ProfileOptionPart<WalkConfig> = deepFreeze({
  role: "option", model: PROFILE_MODEL, label: "Walk to a site", stage: "game", fields: [optionalChoice<WalkConfig, "gait">("gait", "Gait", "Every gait", GAIT_CHOICES)],
  slots: [slotOne("navigation", "Navigation", "navigation", true)], defaults: { kind: "walk" },
  keys: { kind: true, gait: true, navigation: true }, fits: anyBody, faults: () => [],
  applicable: (config: WalkConfig, { parts, legs }) => legs === null || gaitsOf(parts, legs).some(gait => config.gait === undefined || gait.name === config.gait),
  skills: (config: WalkConfig) => config.navigation ? { navigation: config.navigation } : {},
  make: (config: WalkConfig, given: ProfileOptionContext) => gaitsOf(given.parts, given.legs).filter((gait) => config.gait === undefined || gait.name === config.gait)
    .map((gait) => walkBy(gait, given.sites, given.walk)),
});

/** **A place on the ground** to hold at: where it is, m, and how near its centre the body holds there. */
interface PlaceConfig { readonly kind: "hold-at-place"; readonly x: number; readonly z: number; readonly within: number }

/** What is wrong with a place's config: a coordinate not finite, or a reach not above nothing. */
const placeFaults = (config: PlaceConfig): readonly string[] => [
  ...Number.isFinite(config.x) && Number.isFinite(config.z) ? [] : ["x, z: a place, m"],
  ...Number.isFinite(config.within) && config.within > 0 ? [] : ["within: a distance above nothing, m"]];

/** **Holding at a place on the ground** (`holdAt`), whatever the focus: a rest option at the place its config names, which is its site. */
export const HOLD_AT_OPTION: ProfileOptionPart<PlaceConfig> = deepFreeze({
  role: "option", model: PROFILE_MODEL, label: "Hold at a place", stage: "game", fields: [], slots: [], defaults: { kind: "hold-at-place", x: 0, z: 0, within: .3 },
  keys: { kind: true, x: true, z: true, within: true }, fits: anyBody, faults: placeFaults,
  make: (config: PlaceConfig, given: ProfileOptionContext) => [holdAt(config.x, config.z, config.within, given.walk)],
});

/** **The cover** of the head by the hand on the side a blow closes from (`covers`). */
export const COVER_OPTION = deepFreeze({ ...kind("covers", "Cover", (given) => covers(given.spec)),
  applicable: (_config: { readonly kind: "covers" }, { spec }: OptionBody) => covers(spec).length > 0 });

/** **Hold the position** (`hold`), a rest option. */
export const HOLD_OPTION = kind("hold-position", "Hold the position", (given) => [hold(given.walk)]);

/** **The hands at their guard** (`guard`), a rest option over the body's hands, none for a body without. */
export const GUARD_OPTION = deepFreeze({ ...kind("hands-at-guard", "Hands at guard", (given) => guardOf(given.spec)), phases: { guard: "Guarding" },
  applicable: (_config: { readonly kind: "hands-at-guard" }, { spec }: OptionBody) => guardOf(spec).length > 0 });

/**
 * The options `configs` name, each kind's as `of` finds it, made from `given`, in their order; then
 * the sites they name (`Sites`), each name once.
 */
export function optionsOf(of: (config: PartConfig) => ProfileOptionPart, configs: readonly PartConfig[], given: Omit<ProfileOptionContext, "sites" | "options">): readonly Option[] {
  const all: Site[] = [], names: string[] = [], made: Option[] = [];
  const body = { ...given, options: configs, sites: { all, names } };
  for (const config of configs) if (optionApplies(config, body)) made.push(...of(config).make(config, body));
  for (const option of made) for (const site of option.sites ?? []) {
    if (names.includes(site.name)) throw new Error(`two sites are named ${site.name}`);
    all.push(site); names.push(site.name);
  }
  Object.freeze(all); Object.freeze(names);
  return made;
}
