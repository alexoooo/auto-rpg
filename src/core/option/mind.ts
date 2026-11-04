import type { Body } from "../body.ts";
import { aimsState, configuredAims } from "../skills/action-config.ts";
import type { SkillKit } from "../skills/config.ts";
import { controller } from "../mind/controller.ts";
import { everyOf } from "../mind/decider.ts";
import { kitBody, kitSkills } from "../skills/kit.ts";
import { groundSkills } from "../recovery/ground/skills.ts";
import { standUpFaults } from "../recovery/ground/stand-up.ts";
import { isWayUp, type TechniqueConfig } from "../recovery/ground/technique.ts";
import type { BodyHost } from "../mind/host.ts";
import { FILLED, filledOf, filledRefusal, kitOf, type Filled } from "../mind/kit.ts";
import type { PartLookup } from "../parts/lookup.ts";
import type { MindWiring } from "../mind/minds.ts";
import { GAME_NAVIGATION } from "../navigation/navigator.ts";
import { slotList, slotOne, type PartConfig, type Slot } from "../parts/parts.ts";
import { driveBy } from "../mind/decider.ts";
import { commandedMind } from "../mind/sub-mind.ts";
import type { Skills } from "../skills/framework/skills.ts";
import { deepFreeze } from "../state.ts";
import { OPTIONS, skillsOf, strikesIn, type StrikeConfig, type WalkConfig } from "./kinds.ts";
import { MEASURED_PREDICTIONS } from "./predictions-part.ts";
import { optionDecider, type DeciderMaking } from "./decider.ts";
import { waysUpIn } from "./rise.ts";

/**
 * **Option Mind's config**: its chooser, what it predicts from (`predictions`, the measured profiles
 * unless given), the rate it decides at and its options (each a part of role `option`, in rank
 * order; `OPTIONS` where none are given), each naming the skill it uses and how it uses it. Its
 * body builds the skills its options name that it fits (`skillsOf`); what lies under every skill
 * (its motor, its legs, its guard) is the one game part of each that fits the body (`filledOf`),
 * unless an experiment passes one in (`tuning.parts`). This is Option Mind over its own body layer,
 * the toolkit's humanoid kit; over another, its config names a frame (`FramedOptionMindConfig`).
 */
export interface OptionMindConfig {
  readonly kind: "option";
  readonly frame?: null;
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

/**
 * **Option Mind's config over a frame**: its chooser and its options, each made for the frame
 * (`ForFrame`), named, and the frame (a part of role `frame`, `FramePart`) whose body layer it
 * decides over; the frame says what else of deciding it reads (`FramePart.decidingFaults`).
 */
export interface FramedOptionMindConfig {
  readonly kind: "option";
  readonly frame: PartConfig;
  readonly chooser: PartConfig;
  readonly options: readonly PartConfig[];
  readonly predictions?: PartConfig | null;
  readonly rate?: number;
}

/** **Any Option Mind's config**: over its own humanoid kit, or over a frame. */
export type AnyOptionMindConfig = OptionMindConfig | FramedOptionMindConfig;

/** Whether `config` decides over a frame rather than Option Mind's own kit. */
export const framed = (config: AnyOptionMindConfig): config is FramedOptionMindConfig => config.frame != null;

/** The smallest working config: by worth over the standard options (`OPTIONS`), which throw no blow. */
const OPTION_DEFAULTS: OptionMindConfig = deepFreeze({ kind: "option", chooser: { kind: "valued", depth: 2 }, options: OPTIONS });

/** Its slots: its chooser, its options and what it predicts from. */
const SLOTS: readonly Slot[] = Object.freeze([
  slotOne("chooser", "Chooser", "chooser"), slotList("options", "Options", "option"), slotOne("predictions", "Predictions", "predictions", true, MEASURED_PREDICTIONS.defaults),
  slotOne("frame", "Frame", "frame", true),
]);

/** Its slots over a frame: its chooser, its options, what it predicts from and the frame. */
const FRAMED_SLOTS: readonly Slot[] = Object.freeze([
  slotOne("chooser", "Chooser", "chooser"), slotList("options", "Options", "option"), slotOne("predictions", "Predictions", "predictions", true),
  slotOne("frame", "Frame", "frame", true),
]);

/** The frame `config`'s chooser and options are made for (`ForFrame`): its frame's kind, or none for its own kit. */
const frameOf = (config: AnyOptionMindConfig): string | null => framed(config) ? config.frame.kind : null;

/** Who a part made for `frame` is made for, as a sentence names it. */
const its = (frame: string | null): string => frame === null ? "Option Mind's own kit" : `the ${frame} frame`;

/** What is wrong with a chooser or an option `config` names that is made for another frame than its own (`ForFrame`), each a sentence. */
function frameFaults(config: AnyOptionMindConfig, parts: PartLookup): readonly string[] {
  const own = frameOf(config), named = (part: { readonly frame?: string }): string | null => part.frame ?? null;
  const chooser = named(parts.of("chooser", config.chooser));
  return [...chooser === own ? [] : [`chooser: ${config.chooser.kind} is made for ${its(chooser)}, not ${its(own)}`],
    ...(config.options ?? []).flatMap((option, i) => {
      const made = named(parts.of("option", option));
      return made === own ? [] : [`options.${i}: ${option.kind} is made for ${its(made)}, not ${its(own)}`];
    })];
}

/** What is wrong with a config over a frame, each a sentence: no options, or what of deciding its frame does not read (`FramePart.decidingFaults`). */
function framedFaults(config: FramedOptionMindConfig, parts: PartLookup): readonly string[] {
  const faults = [...frameFaults(config, parts)];
  if (!Array.isArray(config.options) || config.options.length === 0) faults.push("options: a frame's options, named");
  faults.push(...parts.of("frame", config.frame).decidingFaults(config, config.frame).map((fault) => `frame: ${fault}`));
  return faults;
}

/** The navigation `option` walks by, where it is a walk (`WalkConfig`): its own, else the game's. */
const navigationOf = (option: PartConfig): PartConfig | null => option.kind === "walk" ? (option as WalkConfig).navigation ?? GAME_NAVIGATION : null;

/**
 * What is wrong with `options` together, each a sentence: two strikes by one skill (a skill is one
 * Option's), or two low supports or two navigations among them (a body has one of each).
 */
function optionsFaults(options: readonly PartConfig[], parts: PartLookup): readonly string[] {
  const faults: string[] = [], skills = new Set<string>(), strikes = strikesIn(parts, options);
  for (const strike of strikes) {
    if (skills.has(strike.skill.kind)) faults.push(`options: two strikes by ${strike.skill.kind}: a skill is one Option's`);
    skills.add(strike.skill.kind);
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
function optionMindFaults(config: OptionMindConfig, parts: PartLookup): readonly string[] {
  const options = config.options ?? OPTIONS, faults = [...frameFaults(config, parts), ...optionsFaults(options, parts), ...tunedFaults(config, parts)];
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
function createOptionMind(host: BodyHost, config: OptionMindConfig, wiring: MindWiring) {
  const parts = host.parts, spec = host.spec, given = config.tuning?.parts ?? {}, named = skillsOf(parts, spec, config.options ?? OPTIONS);
  const legs = filledOf(parts, spec, "legs", given), kit: SkillKit = { legs, navigation: named.navigation ?? GAME_NAVIGATION, guard: filledOf(parts, spec, "guard", given),
    executors: named.executors, actions: named.actions, support: named.support };
  const { body } = host.take((own) => commandedMind(own, kitBody(filledOf(parts, spec, "motor", given), parts), host.clock));
  const ground = groundSkills(body, host.clock, kitOf(parts, spec, given), named.techniques.map((technique) => parts.of("technique", technique)));
  let skills: Skills | undefined;
  const aims = configuredAims(parts, spec, kit.actions);
  const make = (made: Body) => kitSkills(made, host.clock, parts, kit, () => skills?.report.ledger ?? [], ground, aims);
  const hz = Math.round(1 / host.clock.dt), every = everyOf(config.rate, hz);
  const making: DeciderMaking = { spec, rules: host.rules, orders: (sight) => wiring.orders(sight.view.senses), parts };
  const driven = driveBy(body, optionDecider(making, hz, { ...config, legs }, host.seed, host.phase, hz / every, body.delay), make,
    { every, phase: host.phase, orders: making.orders }, aimsState(aims));
  skills = driven.skills;
  return driven;
}

/**
 * **Option Mind**: a chooser over its options, on its percepts, over a body layer: its own, the
 * toolkit's humanoid kit, or the one a frame makes (`FramePart`), so a new family of bodies is a new
 * frame, not a new kind of mind. Its choosers, kinds of option, objectives, predictions and frames are
 * the toolkit's role lists (`CHOOSERS`, `OPTION_KINDS`, `OBJECTIVES`, `PREDICTIONS`, `QUADRUPED_FRAMES`).
 * Over its own kit it fits a body with one part of each place under its skills (`filledRefusal`), is
 * built in its guard's posture, and uses what its guard covers with; its blows are its options'
 * (`Part.strikes`).
 */
export const OPTION_MIND = controller<AnyOptionMindConfig>({
  role: "mind", label: "Option Mind", stage: "game", obeys: true, phases: { guard: "Guarding" }, fields: [], slots: SLOTS, defaults: OPTION_DEFAULTS,
  slotsFor: (config) => framed(config) ? FRAMED_SLOTS : SLOTS,
  keys: { kind: true, frame: true, chooser: true, options: true, predictions: true, rate: true, tuning: true }, tuning: ["parts"],
  // The options it starts with where its config names none, the navigation its walks go by where none names one, and every part that may lie under its skills: a frame's are named.
  uses: (config, parts) => framed(config) ? [] : [...config.options ? [] : OPTIONS, GAME_NAVIGATION, ...Object.values(FILLED).flatMap((role) => parts.game(role)),
    ...Object.values(config.tuning?.parts ?? {})],
  reads: (config) => framed(config) ? [] : ["strike-profiles", "edge-profiles"],
  fits: (spec, config, parts) => framed(config) ? parts.of("frame", config.frame).fits(spec, config.frame, parts) : filledRefusal(parts, spec, config.tuning?.parts),
  strikes: (spec, config, parts) => framed(config) ? parts.of("frame", config.frame).strikes?.(spec, config.frame, parts) : undefined,
  supportedEquipment: (spec, config, parts) => {
    if (framed(config)) return [];
    const guard = filledOf(parts, spec, "guard", config.tuning?.parts);
    return parts.of("guard", guard).supportedEquipment?.(spec, guard, parts) ?? [];
  },
  faults: (config, parts) => framed(config) ? framedFaults(config, parts) : optionMindFaults(config, parts),
  builtIn: (spec, config, parts) => {
    if (framed(config)) return parts.of("frame", config.frame).builtIn(spec, config.frame, parts);
    const guard = filledOf(parts, spec, "guard", config.tuning?.parts);
    return parts.of("guard", guard).posture(spec, guard);
  },
  create: (host, config, wiring) => framed(config) ? host.parts.of("frame", config.frame).create(host, config, config.frame, wiring) : createOptionMind(host, config, wiring),
});
