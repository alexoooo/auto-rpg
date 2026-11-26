import type { ActionConfig, ExecutorConfigs, ExecutorEntry } from "../../../skills/config.ts";
import { isRegionMark, type Region } from "../../../skills/framework/action.ts";
import type { ConfigFor, PartLookup } from "../../../parts/lookup.ts";
import type { OptionContext } from "../contract/context.ts";
import type { OptionPart, NamedSkills } from "../contract/parts.ts";
import { choice, json } from "../../../parts/fields.ts";
import { anyBody, slotOne, slotSkill, type KeysOf, type PartConfig } from "../../../parts/parts.ts";
import { heldVariations, type BodySpec } from "../../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../../core/state.ts";
import { recordingKey } from "../../../core/world/recording.ts";
import { LIMB_ROLES, limbsOf, type LimbRole } from "./limbs.ts";
import type { Option } from "../contract/option.ts";
import { chosenVariation, type Varied } from "../../../skills/framework/variations.ts";
import { strike, strikeMeasure } from "./strike.ts";
import { choosingSkill } from "./selection.ts";
import { handSet } from "../../../core/hand-set.ts";

/**
 * **A strike's config**: the executor it strikes by (`skill`, of its kind's skill), the limbs it
 * strikes with by role (`LimbRole`), where its executor aims the regions it strikes, in order, and
 * its aim (`AimPart`), and the low support it strikes from where it names one (`LowSupportPart`).
 */
export interface StrikeConfig<K extends string = keyof ExecutorConfigs> {
  readonly kind: `strike-${K}`;
  readonly skill: ConfigFor<"executor">;
  readonly limbs: LimbRole;
  readonly regions?: readonly Region[];
  readonly aim?: ConfigFor<"aim">;
  readonly support?: ConfigFor<"support"> | null;
}

/** **A kind of strike**: a kind of option (`OptionPart`) that strikes by one skill, the executor kind it names (`skill`). */
export type StrikeKindPart<K extends string = keyof ExecutorConfigs> = OptionPart<StrikeConfig<K>> & { readonly skill: K };

/** Each executor's config as its body's skills hold it (`ExecutorEntry`), by the variation it runs and the name it goes by: a skill is one config a mind. A cache: a config is data, which never changes. */
const ENTRIES = new WeakMap<ConfigFor<"executor">, Map<string, ExecutorEntry>>();

/**
 * **The executor `skill` as its body's skills hold it**, running `variation` (none for a skill
 * without variations) and named `name`; made once a config.
 */
function executorEntry(skill: ConfigFor<"executor">, variation: string | null, name: string): ExecutorEntry {
  let byVariation = ENTRIES.get(skill);
  if (!byVariation) ENTRIES.set(skill, byVariation = new Map());
  const key = `${variation ?? ""} ${name}`;
  let entry = byVariation.get(key);
  if (!entry) byVariation.set(key, entry = Object.freeze({ ...skill, ...variation === null ? {} : { variation }, name }));
  return entry;
}

/**
 * **The variations a strike of `config` runs on a body of `spec`**: the one its skill names; else
 * each its character holds of that skill (`heldVariations`); a skill without variations runs as
 * itself (null).
 */
function strikeVariations(parts: PartLookup, spec: BodySpec, config: StrikeConfig): readonly (string | null)[] {
  const named = (config.skill as Varied).variation;
  if (named !== undefined) return [named];
  return parts.of("executor", config.skill).variations === undefined ? [null] : heldVariations(spec, config.skill.kind);
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

/** The limbs a strike of `config` strikes with on a body of `spec` by `executor` (its skill, as one variation): those of its role the executor strikes with (`limbsOf`); none where the executor does not fit the body. */
const strikeLimbs = (parts: PartLookup, spec: BodySpec, config: StrikeConfig, executor: ConfigFor<"executor"> = config.skill): readonly string[] =>
  parts.of("executor", executor).fits(spec, executor, parts) === null ? limbsOf(parts, spec, config.limbs, executor) : [];

/** Each strike's action, by its config, its body's spec, its executor and its name (`strikeAction`): configs are data, so an action is made once and is the same config at every make. */
const ACTIONS = new WeakMap<StrikeConfig, WeakMap<BodySpec, WeakMap<ExecutorEntry, Map<string, ActionConfig | null>>>>();

/**
 * **A strike's aim as its action asks it**: `config`'s, with its skill's research `tuning` beside it
 * where the aim reads a record the skill reads (the jaw's arc a bite's aim searches is the bite's
 * own), so research that tunes the skill tunes what its aim reckons with too.
 */
function aimFor(parts: PartLookup, config: StrikeConfig): ConfigFor<"aim"> | undefined {
  const aim = config.aim, tuning = (config.skill as { readonly tuning?: object }).tuning;
  if (!aim || tuning === undefined) return aim;
  const read = parts.of("executor", config.skill).reads?.(config.skill) ?? [];
  return parts.of("aim", aim).reads?.(aim).some((key) => read.includes(key)) ? { ...aim, tuning } as ConfigFor<"aim"> : aim;
}

/**
 * **What a strike of `config` named `name` (`strikeName`) asks of `executor` on a body of
 * `spec`**: an action of that name, struck with the body's limbs of its role that the executor
 * strikes with (`strikeLimbs`), at its regions by its aim (`aimFor`); null where the executor does
 * not fit the body or it has no such limb.
 */
function strikeAction(parts: PartLookup, spec: BodySpec, config: StrikeConfig, executor: ExecutorEntry, name: string): ActionConfig | null {
  let bySpec = ACTIONS.get(config);
  if (!bySpec) ACTIONS.set(config, bySpec = new WeakMap());
  let byExecutor = bySpec.get(spec);
  if (!byExecutor) bySpec.set(spec, byExecutor = new WeakMap());
  let byName = byExecutor.get(executor);
  if (!byName) byExecutor.set(executor, byName = new Map());
  if (byName.has(name)) return byName.get(name)!;
  const effectors = strikeLimbs(parts, spec, config, executor), aim = aimFor(parts, config);
  const action: ActionConfig | null = effectors.length === 0 ? null : Object.freeze({ name, executor: executor.name, effectors,
    ...config.regions === undefined ? {} : { regions: config.regions }, ...aim === undefined ? {} : { aim } });
  byName.set(name, action);
  return action;
}

/**
 * **A strike of `config`'s executors and actions on a body of `spec`**, one of each a variation it
 * runs (`strikeVariations`): the action named among its mind's strikes (`strikeName`), and by
 * its variation too where the body holds several; none for a variation the body does not fit.
 */
function strikeSkills(parts: PartLookup, spec: BodySpec, config: StrikeConfig, options: readonly PartConfig[]): readonly { readonly executor: ExecutorEntry; readonly action: ActionConfig }[] {
  const variations = strikeVariations(parts, spec, config), several = heldVariations(spec, config.skill.kind).length > 1, name = strikeName(config, strikesIn(parts, options));
  return variations.flatMap((variation) => {
    // Named by its kind, and by its variation too where the body holds several of its skill's.
    const shown = several ? variation : null, kind = config.skill.kind;
    const executor = executorEntry(config.skill, variation, shown === null ? kind : `${kind}/${shown}`);
    const action = strikeAction(parts, spec, config, executor, shown === null ? name : `${executor.name}${name.slice(kind.length)}`);
    return action ? [{ executor, action }] : [];
  });
}

/** Each action struck with one of its limbs (`limbAction`), by its limb: configs are data, so a narrowing is made once and is the same config at every make. */
const LIMBED = new WeakMap<ActionConfig, Map<string, ActionConfig>>();

/** **`action` struck with `limb` alone**: what one Option of a strike asks of its skill, and what its profile is measured of (`strikeMeasure`). */
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
      case "mark": if (!isRegionMark(region.mark)) faults.push("regions: a target mark"); break;
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
 * **The kind of strike by `skill`** (`strike-<skill>`): a strike (`strike`) of each of its actions on its
 * body, one a variation the body holds (`strikeSkills`), with each of its limbs, one Option a limb (`limbAction`, named by the action
 * and the limb), each priced by its profile among the strikes' where one is measured as the body
 * reads it (`strikeMeasure`); none where the body does not fit its skill or has no limb of its role.
 */
function strikeKind<K extends keyof ExecutorConfigs>(skill: K, label: string, settings: Omit<StrikeConfig<K>, "kind" | "skill">): StrikeKindPart<K> {
  const of = (config: StrikeConfig<K>, given: OptionContext): readonly Option[] =>
    strikeSkills(given.parts, given.spec, config, given.options).flatMap(({ executor, action }) => {
      const executors = [executor], blows = given.parts.of("executor", executor).blows?.(executor) ?? 1;
      return action.effectors.map((limb) => {
        const one = limbAction(action, limb);
        const option = strike({ action: one, walk: given.walk, throws: blows, measure: strikeMeasure(given, executors, one), guesses: given.guesses, name: `${action.name} ${limb}` });
        const support = config.support && given.parts.of("support", config.support).fits(given.spec, config.support, given.parts) === null ? config.support : null;
        return support ? choosingSkill(option, { ...support, variation: chosenVariation(given.spec, support.kind, support) }, "support") : option;
      });
    });
  return deepFreeze<StrikeKindPart<K>>({
    role: "option", label, stands: false, skill,
    fields: [choice<StrikeConfig<K>, "limbs">("limbs", "Limbs", () => LIMB_ROLES), json<StrikeConfig<K>, "regions">("regions", "Target regions", "target-regions")],
    slots: [slotSkill("skill", "Skill", "executor"), { ...slotSkill("support", "Low support", "support"), optional: true }, slotOne("aim", "Aim", "aim", true)],
    defaults: { kind: `strike-${skill}`, skill: { kind: skill }, ...settings } as StrikeConfig<K>,
    keys: { kind: true, skill: true, limbs: true, regions: true, aim: true, support: true } as KeysOf<StrikeConfig<K>>,
    fits: anyBody,
    faults: (config: StrikeConfig<K>, parts: PartLookup) => config.skill.kind !== skill ? [`skill: a ${skill}`]
      : [...LIMB_ROLES.some(([role]) => role === config.limbs) ? [] : ["limbs: a limb role"], ...aimingFaults(config, parts)],
    strikes: (spec: BodySpec, config: StrikeConfig<K>, parts: PartLookup) => strikeLimbs(parts, spec, config),
    skills(config: StrikeConfig<K>, spec: BodySpec, parts: PartLookup, options: readonly PartConfig[]): NamedSkills | null {
      const made = strikeSkills(parts, spec, config, options);
      const support = config.support && parts.of("support", config.support).fits(spec, config.support, parts) === null ? config.support : null;
      return made.length ? { executors: made.map((one) => one.executor), actions: made.map((one) => one.action), ...support ? { support } : {} } : null;
    },
    make: of,
  });
}

/** **The strikes among `options`** (`StrikeConfig`): those whose kind strikes by a skill it names (`StrikeKindPart.skill`), in their order. */
export const strikesIn = (parts: PartLookup, options: readonly PartConfig[]): readonly StrikeConfig[] =>
  options.filter((option): option is PartConfig & StrikeConfig => "skill" in parts.of("option", option));

/** A strike at the trunk's middle. */
const MIDDLE: readonly Region[] = deepFreeze([{ kind: "mark", mark: "middle" }]);

/** A strike aimed at its region's centre. */
const CENTRE: ConfigFor<"aim"> = deepFreeze({ kind: "centre", lead: 0 });

/** Aimed at the trunk's opening as the learned puncher aims. */
const TRUNK_OPENING = handSet<ConfigFor<"aim">>({
  name: "TRUNK_OPENING", sort: "guess",
  says: "Where on the trunk a strike aims for an opening: the weights the learned punch aims by, given to every strike at the trunk.",
  value: { kind: "surface", tuning: { upperTrunk: 1, middleTrunk: -1, square: 4 } },
});

/** Its low support, under a blow of the hands: the support fold. */
const SUPPORT_FOLD: ConfigFor<"support"> = deepFreeze({ kind: "support-fold" });

/**
 * **The straight punch** (`straight-punch`, `assets/skills/strikes/straight-punch/drive.json`, the
 * Warrior's trained): with either hand at the trunk's opening, aimed as the learned puncher aims,
 * from its low support.
 */
export const STRAIGHT_PUNCH_OPTION = strikeKind("straight-punch", "Straight punch", { limbs: "either-hand", regions: MIDDLE, aim: TRUNK_OPENING, support: SUPPORT_FOLD });

/** **The club's blow** (`club-blow`), with the hand that holds the club, at the trunk's middle. */
export const CLUB_BLOW_OPTION = strikeKind("club-blow", "Club blow", { limbs: "holding-hand", regions: MIDDLE, aim: CENTRE });

/** **The bonk** (`bonk`): the club swung overhead at the head, with the hand that holds the club. */
export const BONK_OPTION = strikeKind("bonk", "Bonk", { limbs: "holding-hand", regions: [{ kind: "mark", mark: "high" }], aim: CENTRE });

/**
 * **The sword's thrust** (`sword-thrust`, as its body's record has it,
 * `assets/skills/strikes/sword-thrust/drive.json`): with the hand that holds the sword, aimed at
 * the trunk's opening as the straight punch is, from its low support.
 */
export const SWORD_THRUST_OPTION = strikeKind("sword-thrust", "Sword thrust", { limbs: "holding-hand", regions: MIDDLE, aim: TRUNK_OPENING, support: SUPPORT_FOLD });

/**
 * **The stomp** (`stomp`, `assets/skills/strikes/stomp/stomp.json`): with either foot at the
 * trunk's middle, aimed at its centre; its chamber high and its height band low, so it strikes down
 * on a body lying ahead and nothing standing.
 */
export const STOMP_OPTION = strikeKind("stomp", "Stomp", { limbs: "either-foot", regions: MIDDLE, aim: CENTRE });

/** The trunk's middle, then its base: a kick's regions, the first a body has taken unless orders name another (`orderedTarget`). */
const MIDDLE_THEN_BASE: readonly Region[] = deepFreeze([{ kind: "mark", mark: "middle" }, { kind: "mark", mark: "base" }]);

/**
 * **The kick** (`kick`, `assets/skills/strikes/kick/kick.json`): with either foot at the trunk's
 * middle, or its base, the belly and hips, where orders name it, aimed at its centre: a drive ahead
 * at a body standing.
 */
export const KICK_OPTION = strikeKind("kick", "Kick", { limbs: "either-foot", regions: MIDDLE_THEN_BASE, aim: CENTRE });

/** **The bite** (`bite`), with the jaw, at any part of a foe, aimed at the first surface its teeth meet as the jaw closes (`first-exposed`). */
export const BITE_OPTION = strikeKind("bite", "Bite", { limbs: "jaw", regions: [{ kind: "mark", mark: "any" }], aim: { kind: "first-exposed" } });

declare module "../contract/parts.ts" {
  interface OptionConfigs {
    readonly "strike-straight-punch": StrikeConfig<"straight-punch">;
    readonly "strike-club-blow": StrikeConfig<"club-blow">;
    readonly "strike-bonk": StrikeConfig<"bonk">;
    readonly "strike-sword-thrust": StrikeConfig<"sword-thrust">;
    readonly "strike-stomp": StrikeConfig<"stomp">;
    readonly "strike-kick": StrikeConfig<"kick">;
    readonly "strike-bite": StrikeConfig<"bite">;
  }
}
