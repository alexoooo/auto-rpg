import type { ActionConfig, ExecutorEntry } from "../skills/config.ts";
import type { Region } from "../skills/framework/action.ts";
import type { PartLookup } from "../parts/lookup.ts";
import type { OptionPart } from "./parts.ts";
import { choice } from "../parts/fields.ts";
import { anyBody, slotOne, slotSkill, type KeysOf, type PartConfig } from "../parts/parts.ts";
import { GAME_NAVIGATION } from "../navigation/navigator.ts";
import { GAIT_CHOICES } from "../skills/locomotion/move-rule-part.ts";
import type { GaitName } from "../skills/locomotion/gaits.ts";
import type { BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import { covers } from "./cover.ts";
import { LIMB_ROLES, limbsOf, type LimbRole } from "./limbs.ts";
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
 * world's rate (Hz) and the part lookup; the legs its body goes by (whose gaits its walks name), its
 * Options as its config names them, and the profile tables it predicts from (`ProfileTables`); what
 * the mind itself runs on: its walk and its Options' record of their tries (`OptionRecord`); and
 * the sites its options name (`Sites`, filled once every option is made). A kind builds anything
 * else it needs from these.
 */
export interface OptionsGiven {
  readonly spec: BodySpec;
  readonly hz: number;
  /** The rate its mind decides at, Hz (`OptionMindConfig.rate`); the world's unless given. */
  readonly rate?: number;
  /** The steps its body's command waits (`Body.delay`). */
  readonly delay: number;
  readonly parts: PartLookup;
  readonly legs: PartConfig;
  /** Its mind's Options, as its config names them, in rank order. */
  readonly options: readonly PartConfig[];
  readonly tables: ProfileTables;
  readonly walk: Walker;
  readonly record: OptionRecord;
  readonly sites: Sites;
}

/**
 * **What an Option's config names of its body's skills** (`OptionKindPart.skills`), where the body
 * fits what it names: the executor it strikes by and what it asks of it (`ActionConfig`), the
 * ground technique it runs, the low support it strikes from and the navigation its walk goes by.
 */
export interface NamedSkills {
  readonly executor?: ExecutorEntry;
  readonly action?: ActionConfig;
  readonly technique?: PartConfig;
  readonly support?: PartConfig;
  readonly navigation?: PartConfig;
}

/**
 * **A kind of Option Mind's options** (`OptionPart`): made from what Option Mind gives
 * (`OptionsGiven`), and naming the skills a config of it has a body build (`skills`): null where
 * the body does not fit them, and then it makes no Option on that body; absent, it names none.
 */
export type OptionKindPart<C extends PartConfig = PartConfig> = OptionPart<C, OptionsGiven, Option> & {
  skills?(config: C, spec: BodySpec, parts: PartLookup): NamedSkills | null;
};

/** **The skills a body builds of its Options** (`skillsOf`): its executors and their actions, its ground techniques, its low support and its navigation, each once. */
export interface OptionSkills {
  readonly executors: readonly ExecutorEntry[];
  readonly actions: readonly ActionConfig[];
  readonly techniques: readonly PartConfig[];
  readonly support: PartConfig | null;
  readonly navigation: PartConfig | null;
}

/**
 * **The skills a body of `spec` builds of `options`**: what each names of them on that body
 * (`OptionKindPart.skills`), each executor, action and technique once by its name or kind, in the
 * Options' order, and the low support and navigation the first that names one names (a mind's
 * Options name one of each, `optionMindFaults`). An Option whose skills the body does not fit names none.
 */
export function skillsOf(parts: PartLookup, spec: BodySpec, options: readonly PartConfig[]): OptionSkills {
  const executors: ExecutorEntry[] = [], actions: ActionConfig[] = [], techniques: PartConfig[] = [];
  let support: PartConfig | null = null, navigation: PartConfig | null = null;
  for (const option of options) {
    const named = (parts.of("option", option) as OptionKindPart).skills?.(option, spec, parts);
    if (!named) continue;
    if (named.executor && !executors.some((one) => one.name === named.executor!.name)) executors.push(named.executor);
    if (named.action && !actions.some((one) => one.name === named.action!.name)) actions.push(named.action);
    if (named.technique && !techniques.some((one) => one.kind === named.technique!.kind)) techniques.push(named.technique);
    support ??= named.support ?? null;
    navigation ??= named.navigation ?? null;
  }
  return { executors, actions, techniques, support, navigation };
}

/** A kind of option with no settings of its own, `kind`, labelled `label`, made by `make`. */
function kind<K extends string>(kind: K, label: string, make: (given: OptionsGiven) => readonly Option[]): OptionKindPart<{ readonly kind: K }> {
  return deepFreeze({ role: "option", label, stage: "game", fields: [], slots: [], defaults: { kind }, keys: { kind: true } as KeysOf<{ readonly kind: K }>,
    fits: anyBody, faults: () => [], make: (_config: { readonly kind: K }, given: OptionsGiven) => make(given) });
}

/** **Following the orders** a person gives (`followOrders`). */
export const ORDERS_OPTION = kind("orders", "Follow orders", (given) => [followOrders(given.walk)]);

/**
 * **A strike's config**: the executor it strikes by (`skill`, of its kind's skill), the limbs it
 * strikes with by role (`LimbRole`), where its executor aims the regions it strikes, in order, and
 * its aim (`AimPart`), and the low support it strikes from where it names one (`SupportPart`).
 */
export interface StrikeConfig<K extends string = string> {
  readonly kind: `strike-${K}`;
  readonly skill: PartConfig;
  readonly limbs: LimbRole;
  readonly regions?: readonly Region[];
  readonly aim?: PartConfig;
  readonly support?: PartConfig | null;
}

/** **A kind of strike**: a kind of option (`OptionKindPart`) that strikes by one skill, the executor kind it names (`skill`). */
export type StrikeKindPart<K extends string = string> = OptionKindPart<StrikeConfig<K>> & { readonly skill: K };

/** Each executor's config as its body's skills hold it (`ExecutorEntry`), named by its kind: a skill is one config a mind. */
const ENTRIES = new WeakMap<PartConfig, ExecutorEntry>();

/** **The executor `skill` as its body's skills hold it**, named by its kind, made once a config. */
export function executorEntry(skill: PartConfig): ExecutorEntry {
  let entry = ENTRIES.get(skill);
  if (!entry) ENTRIES.set(skill, entry = Object.freeze({ ...skill, name: skill.kind }));
  return entry;
}

/** Each strike's action, by its config and its body's spec (`strikeAction`): configs are data, so an action is made once and is the same config at every make. */
const ACTIONS = new WeakMap<StrikeConfig, WeakMap<BodySpec, ActionConfig | null>>();

/**
 * **What a strike of `config` asks of its executor on a body of `spec`**: an action named as its
 * skill, struck with the body's limbs of its role that the executor strikes with (`limbsOf`), at
 * its regions by its aim; null where the executor does not fit the body or it has no such limb.
 */
export function strikeAction(parts: PartLookup, spec: BodySpec, config: StrikeConfig): ActionConfig | null {
  let bySpec = ACTIONS.get(config);
  if (!bySpec) ACTIONS.set(config, bySpec = new WeakMap());
  if (bySpec.has(spec)) return bySpec.get(spec)!;
  const executor = parts.of("executor", config.skill), effectors = executor.fits(spec, config.skill, parts) === null ? limbsOf(parts, spec, config.limbs, config.skill) : [];
  const action: ActionConfig | null = effectors.length === 0 ? null : Object.freeze({ name: config.skill.kind, executor: config.skill.kind, effectors,
    ...config.regions === undefined ? {} : { regions: config.regions }, ...config.aim === undefined ? {} : { aim: config.aim } });
  bySpec.set(spec, action);
  return action;
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
 * body (`strikeAction`), priced by its profile among the strikes' where one is measured as the body
 * reads it (`strikeMeasure`); none where the body does not fit its skill or has no limb of its role.
 */
export function strikeKind<K extends string>(skill: K, label: string, limbs: LimbRole): StrikeKindPart<K> {
  const of = (config: StrikeConfig<K>, given: OptionsGiven): readonly Option[] => {
    const action = strikeAction(given.parts, given.spec, config);
    if (!action) return [];
    const executors = [executorEntry(config.skill)], blows = given.parts.of("executor", config.skill).blows?.(config.skill) ?? 1;
    return [strike(action, given.walk, blows, strikeMeasure(given.parts, given.spec, executors, action, given.hz, given.tables.strikes, given.rate ?? given.hz, given.delay))];
  };
  return deepFreeze({
    role: "option", label, stage: "game", skill,
    fields: [choice<StrikeConfig<K>, "limbs">("limbs", "Limbs", LIMB_ROLES)],
    slots: [slotSkill("skill", "Skill", "executor"), slotOne("support", "Low support", "support", true)],
    defaults: { kind: `strike-${skill}`, skill: { kind: skill }, limbs, regions: [{ kind: "mark", mark: "middle" }], aim: { kind: "centre", lead: 0 } } as StrikeConfig<K>,
    keys: { kind: true, skill: true, limbs: true, regions: true, aim: true, support: true } as KeysOf<StrikeConfig<K>>,
    fits: anyBody,
    // Its aim is a setting of where it strikes beside its regions, as the action carries it, not a slot: a link keeps it whole.
    uses: (config: StrikeConfig<K>) => config.aim ? [config.aim] : [],
    faults: (config: StrikeConfig<K>, parts: PartLookup) => config.skill.kind !== skill ? [`skill: a ${skill}`]
      : [...LIMB_ROLES.some(([role]) => role === config.limbs) ? [] : ["limbs: a limb role"], ...aimingFaults(config, parts)],
    strikes: (spec: BodySpec, config: StrikeConfig<K>, parts: PartLookup) => strikeAction(parts, spec, config)?.effectors ?? [],
    skills(config: StrikeConfig<K>, spec: BodySpec, parts: PartLookup): NamedSkills | null {
      const action = strikeAction(parts, spec, config);
      return action ? { executor: executorEntry(config.skill), action, ...config.support ? { support: config.support } : {} } : null;
    },
    make: of,
  });
}

/** **The strikes among `options`** (`StrikeConfig`): those whose kind strikes by a skill it names (`StrikeKindPart.skill`), in their order. */
export const strikesIn = (parts: PartLookup, options: readonly PartConfig[]): readonly StrikeConfig[] =>
  options.filter((option): option is PartConfig & StrikeConfig => "skill" in (parts.of("option", option) as OptionKindPart));

/** **The straight punch** (`straight-punch`), with either hand. */
export const STRAIGHT_PUNCH_OPTION = strikeKind("straight-punch", "Straight punch", "either-hand");

/** **The club's blow** (`club-blow`), with the hand that holds the club. */
export const CLUB_BLOW_OPTION = strikeKind("club-blow", "Club blow", "holding-hand");

/** **The sword's cut** (`cut`), with the hand that holds the sword. */
export const CUT_OPTION = strikeKind("cut", "Cut", "holding-hand");

/** **The sword's thrust** (`sword-thrust`), with the hand that holds the sword. */
export const SWORD_THRUST_OPTION = strikeKind("sword-thrust", "Sword thrust", "holding-hand");

/** **The stomp** (`stomp`), with either foot. */
export const STOMP_OPTION = strikeKind("stomp", "Stomp", "either-foot");

/** **A walk's config**: the gait of its body's legs it goes by (`Gait.name`), and the navigation that plans its way (Visibility routes unless it names one). */
export interface WalkConfig {
  readonly kind: "walk";
  readonly gait: GaitName;
  readonly navigation?: PartConfig | null;
}

/**
 * **The walk** (`walkBy`): by the gait its config names of its body's legs (`gaitsOf`), meaning go
 * to a place by that gait, its places the sites its mind's options name (`Sites`); none on legs
 * without that gait. Its way is planned by its navigation.
 */
export const WALK_OPTION: OptionKindPart<WalkConfig> = deepFreeze({
  role: "option", label: "Walk to a site", stage: "game", fields: [choice<WalkConfig, "gait">("gait", "Gait", GAIT_CHOICES)],
  slots: [slotOne("navigation", "Navigation", "navigation", true, GAME_NAVIGATION)], defaults: { kind: "walk", gait: "braced" },
  keys: { kind: true, gait: true, navigation: true }, fits: anyBody, faults: () => [],
  skills: (config: WalkConfig) => ({ navigation: config.navigation ?? GAME_NAVIGATION }),
  make: (config: WalkConfig, given: OptionsGiven) => gaitsOf(given.legs).filter((gait) => gait.name === config.gait).map((gait) => walkBy(gait, given.sites, given.walk)),
});

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

/** The walks of the stock gaits (`GAIT_CHOICES`), each its own Option: braced, then the run. */
export const WALKS: readonly WalkConfig[] = deepFreeze(GAIT_CHOICES.map(([gait]) => ({ kind: "walk", gait })));

/** Its options as it starts, in rank order: orders, a walk by each gait, the rise (`RISE_OPTIONS`), covers, then the rest options; no blow, which a preset names (`StrikeConfig`). */
export const OPTIONS: readonly PartConfig[] = deepFreeze([ORDERS_OPTION.defaults, ...WALKS, ...RISE_OPTIONS, ...[COVER_OPTION, HOLD_OPTION, GUARD_OPTION, BRACE_OPTION].map((part) => part.defaults)]);

/** **Standing where it is**: the rise (`RISE_OPTIONS`), holding the position, the hands at guard and the brace; a body under these alone strikes, walks and covers nothing. */
export const STANDING_OPTIONS: readonly PartConfig[] = deepFreeze([...RISE_OPTIONS, ...[HOLD_OPTION, GUARD_OPTION, BRACE_OPTION].map((part) => part.defaults)]);

/**
 * The options `configs` name, each kind's as `of` finds it, made from `given`, in their order; then
 * the sites they name (`Sites`), each name once.
 */
export function optionsOf(of: (config: PartConfig) => OptionKindPart, configs: readonly PartConfig[], given: Omit<OptionsGiven, "sites" | "options">): readonly Option[] {
  const all: Site[] = [], names: string[] = [], made: Option[] = [];
  for (const config of configs) made.push(...of(config).make(config, { ...given, options: configs, sites: { all, names } }));
  for (const option of made) for (const site of option.sites ?? []) {
    if (names.includes(site.name)) throw new Error(`two sites are named ${site.name}`);
    all.push(site); names.push(site.name);
  }
  Object.freeze(all); Object.freeze(names);
  return made;
}
