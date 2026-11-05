import type { Body } from "../../control/body.ts";
import { aimsState, configuredAims } from "../../skills/action-config.ts";
import type { SkillKit } from "../../skills/config.ts";
import { controller } from "../controller.ts";
import { everyOf } from "../decider.ts";
import { kitBody, kitSkills } from "../../skills/assembly.ts";
import { groundSkills } from "../../skills/recovery/skills.ts";
import { standUpFaults } from "../../skills/recovery/stand-up.ts";
import { isWayUp, type TechniqueConfig } from "../../skills/recovery/technique.ts";
import type { BodyHost } from "../host.ts";
import { FILLED, filledOf, filledRefusal, kitOf, type Filled } from "../../skills/kit.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { MindWiring } from "../minds.ts";
import { GAME_NAVIGATION } from "../../skills/locomotion/navigation/navigator.ts";
import { slotList, slotOne, type PartConfig, type Slot } from "../../parts/parts.ts";
import { driveBy } from "../decider.ts";
import { commandedMind } from "../sub-mind.ts";
import type { Skills } from "../../skills/framework/skills.ts";
import { deepFreeze } from "../../core/world/state.ts";
import { recordingKey } from "../../core/world/recording.ts";
import { skillsOf, strikesIn, type StrikeConfig, type WalkConfig } from "./kinds.ts";
import { MEASURED_PREDICTIONS } from "./predictions-part.ts";
import { optionDecider, type DeciderMaking } from "./decider.ts";
import { waysUpIn } from "./rise.ts";

/**
 * **Option Mind's config**: its chooser, what it predicts from (`predictions`, the measured profiles
 * unless given), the rate it decides at and its options (each a part of role `option`, in rank
 * order; the registered controller's defaults where none are given), each naming the skill it uses and how it uses it. Its
 * body builds the skills its options name that it fits (`skillsOf`); what lies under every skill
 * (its motor, its legs, its guard) is the one game part of each that fits the body (`filledOf`),
 * unless an experiment passes one in (`tuning.parts`).
 */
export interface OptionMindConfig {
  readonly kind: "option";
  readonly chooser: PartConfig;
  readonly options?: readonly PartConfig[] | null;
  readonly predictions?: PartConfig | null;
  /** The rate it decides at, Hz (`everyOf`, `Pace`): every control step unless given; its skills make the command every step from what it last decided. */
  readonly rate?: number;
  /** An experiment's research tuning, which a link does not carry: `parts`, a part in place of what lies under its skills, by its place (`Filled`). */
  readonly tuning?: { readonly parts?: Filled };
}

/** `config` on the legs `legs` (role `locomotion`) in place of those its body fits: an experiment's (`OptionMindConfig.tuning`). */
export const withLegs = (config: OptionMindConfig, legs: PartConfig): OptionMindConfig => ({ ...config, tuning: { ...config.tuning, parts: { ...config.tuning?.parts, legs } } });

/** A controller resolves its optional assembly before building the shared framework. */
type Configured = OptionMindConfig & { readonly options: readonly PartConfig[] };

/** Its slots: its chooser, its options and what it predicts from. */
const SLOTS: readonly Slot[] = Object.freeze([
  slotOne("chooser", "Chooser", "chooser"), slotList("options", "Options", "option"), slotOne("predictions", "Predictions", "predictions", true, MEASURED_PREDICTIONS.defaults),
]);

/** The navigation `option` walks by, where it is a walk (`WalkConfig`): its own, else the game's. */
const navigationOf = (option: PartConfig): PartConfig | null => option.kind === "walk" ? (option as WalkConfig).navigation ?? GAME_NAVIGATION : null;

/**
 * What is wrong with `options` together, each a sentence: two strikes by one kind of skill set
 * differently (a body builds one skill of a kind), two alike in skill and use (its limbs, regions
 * and aim: one Option twice; two uses of one skill are two Options), or two low supports or two
 * navigations among them (a body has one of each).
 */
function optionsFaults(options: readonly PartConfig[], parts: PartLookup): readonly string[] {
  const faults: string[] = [], skills = new Map<string, string>(), uses = new Set<string>(), strikes = strikesIn(parts, options);
  for (const strike of strikes) {
    const kind = strike.skill.kind, skill = recordingKey(strike.skill), had = skills.get(kind);
    if (had !== undefined && had !== skill) faults.push(`options: two strikes by ${kind} set differently: a body has one ${kind}`);
    skills.set(kind, skill);
    const use = recordingKey([strike.skill, strike.limbs, strike.regions ?? null, strike.aim ?? null]);
    if (uses.has(use)) faults.push(`options: two strikes by ${kind} alike in limbs, regions and aim: one Option twice`);
    uses.add(use);
  }
  const one = (what: string, of: (option: PartConfig) => PartConfig | null | undefined): void => {
    const named = new Set(options.flatMap((option) => { const part = of(option); return part ? [JSON.stringify(part)] : []; }));
    if (named.size > 1) faults.push(`options: ${named.size} ${what}, where a body has one`);
  };
  one("low supports", (option) => strikes.includes(option as StrikeConfig) ? (option as StrikeConfig).support : null);
  one("navigations", navigationOf);
  return faults;
}

/** What is wrong with the parts `config` passes in under its skills (`tuning.parts`), each a sentence: a place it has not, or a part's own faults. */
function tunedFaults(config: OptionMindConfig, parts: PartLookup): readonly string[] {
  return Object.entries(config.tuning?.parts ?? {}).flatMap(([place, part]) => !Object.hasOwn(FILLED, place) ? [`tuning: no place ${place} under its skills`]
    : parts.of(FILLED[place as keyof typeof FILLED], part).faults(part, parts).map((fault) => `tuning.parts.${place}: ${fault}`));
}

/** What is wrong with `config`, each a sentence: its rate, its options together (`optionsFaults`), the parts it passes in, or no route up from the ground by the ways up its options name (`standUpFaults`). */
function optionMindFaults(config: Configured, parts: PartLookup): readonly string[] {
  const options = config.options, faults = [...optionsFaults(options, parts), ...tunedFaults(config, parts)];
  if (config.rate !== undefined && !(Number.isFinite(config.rate) && config.rate > 0)) faults.push("rate: a positive number of times a second");
  const waysUp = waysUpIn(options).filter((technique) => isWayUp(parts.of("technique", technique))) as readonly TechniqueConfig[];
  faults.push(...standUpFaults(waysUp, parts).map((fault) => `options: ${fault}`));
  return faults;
}

/**
 * **An Option Mind fighter**: its body with no sub-mind (`kitBody`) over its motor; its skills the
 * toolkit's body layer (`kitSkills`) of what its options name on its body (`skillsOf`): its
 * executors and their actions, its low support, its navigation (its walks', the game's where they
 * name none) and a ground skill of each technique (`groundSkills`), over its legs and its guard;
 * decided by its decider (`optionDecider`). What lies under its skills is the part its body fits
 * (`filledOf`) where its config passes none in.
 */
function createOptionMind(host: BodyHost, config: Configured, wiring: MindWiring) {
  const parts = host.parts, spec = host.spec, given = config.tuning?.parts ?? {}, named = skillsOf(parts, spec, config.options);
  const legs = filledOf(parts, spec, "legs", given), kit: SkillKit = { legs, navigation: named.navigation ?? GAME_NAVIGATION, guard: filledOf(parts, spec, "guard", given),
    executors: named.executors, actions: named.actions, support: named.support };
  const { body } = host.take((own) => commandedMind(own, { ...kitBody(filledOf(parts, spec, "motor", given), parts), ...wiring.experiment }, host.clock));
  const ground = groundSkills(body, host.clock, kitOf(parts, spec, given), named.techniques);
  let skills: Skills | undefined;
  const aims = configuredAims(parts, spec, kit.actions);
  const make = (made: Body) => kitSkills(made, host.clock, parts, kit, () => skills?.report.ledger ?? [], ground, aims);
  const hz = Math.round(1 / host.clock.dt), every = everyOf(config.rate, hz);
  const making: DeciderMaking = { spec, rules: host.rules, orders: (sight) => wiring.orders(sight.view.senses), parts, techniques: named.techniques };
  const driven = driveBy(body, optionDecider(making, hz, { ...config, legs }, host.seed, host.phase, hz / every, body.delay), make,
    { every, phase: host.phase, orders: making.orders }, aimsState(aims));
  skills = driven.skills;
  return driven;
}

/**
 * **Option Mind**: a chooser over its options, on its percepts, over the toolkit's body layer, the
 * same for every body: what lies under its skills is the part of each place its body fits. Its
 * choosers, kinds of option, objectives and predictions are the toolkit's role lists (`CHOOSERS`,
 * `OPTION_KINDS`, `OBJECTIVES`, `PREDICTIONS`). It fits a body with one part of each place under
 * its skills (`filledRefusal`), is built in its guard's posture, and uses what its guard covers
 * with; its blows are its options' (`Part.strikes`).
 */
export function optionMind(defaultOptions: readonly PartConfig[]) {
  const defaults: OptionMindConfig = deepFreeze({ kind: "option", chooser: { kind: "tree" }, options: defaultOptions });
  const configured = (config: OptionMindConfig): Configured => ({ ...config, options: config.options ?? defaultOptions });
  return controller<OptionMindConfig>({
    role: "mind", label: "Option Mind", stage: "game", obeys: true, phases: { guard: "Guarding" }, fields: [], slots: SLOTS, defaults,
    keys: { kind: true, chooser: true, options: true, predictions: true, rate: true, tuning: true }, tuning: ["parts"],
    // The options it starts with where its config names none, the navigation its walks go by where none names one, and every part that may lie under its skills.
    uses: (config, parts) => [...config.options ? [] : defaultOptions, GAME_NAVIGATION, ...Object.values(FILLED).flatMap((role) => parts.game(role)), ...parts.game("leg-adapter"),
      ...Object.values(config.tuning?.parts ?? {})],
    reads: () => ["strike-profiles", "edge-profiles"],
    fits: (spec, config, parts) => filledRefusal(parts, spec, config.tuning?.parts),
    supportedEquipment: (spec, config, parts) => {
      const guard = filledOf(parts, spec, "guard", config.tuning?.parts);
      return parts.of("guard", guard).supportedEquipment?.(spec, guard, parts) ?? [];
    },
    faults: (config, parts) => optionMindFaults(configured(config), parts),
    builtIn: (spec, config, parts) => {
      const guard = filledOf(parts, spec, "guard", config.tuning?.parts);
      return parts.of("guard", guard).posture(spec, guard);
    },
    create: (host, config, wiring) => createOptionMind(host, configured(config), wiring),
  });
}
