import type { Body } from "../body.ts";
import { aimsState, armedActions, configuredActionEstimates, configuredAims, usableSkills } from "../skills/action-config.ts";
import { STAND_UP } from "../recovery/ground/stand-up.ts";
import type { ActionConfig, ExecutorEntry, LocomotionConfig } from "../skills/config.ts";
import { controller } from "../mind/controller.ts";
import { everyOf } from "../mind/decider.ts";
import { kitBody, kitSkills, kitFaults } from "../skills/kit.ts";
import { groundExecutor } from "../recovery/ground/held.ts";
import { REPOSITION, standUpFaults, techniquesOf } from "../recovery/ground/stand-up.ts";
import type { TechniqueConfig } from "../recovery/ground/technique.ts";
import type { BodyHost } from "../mind/host.ts";
import { GAME_MOTOR, kitOf } from "../mind/kit.ts";
import type { PartLookup } from "../parts/lookup.ts";
import type { MindWiring } from "../mind/minds.ts";
import { GAME_NAVIGATION } from "../navigation/navigator.ts";
import { anyBody, slotList, slotOne, slotSkills, type PartConfig, type Slot } from "../parts/parts.ts";
import { driveBy } from "../mind/decider.ts";
import { commandedMind } from "../mind/sub-mind.ts";
import type { Skills } from "../skills/framework/skills.ts";
import { deepFreeze } from "../state.ts";
import { OPTIONS } from "./kinds.ts";
import { MEASURED_PREDICTIONS } from "./predictions-part.ts";
import { optionTactics, type TacticsMaking } from "./tactics.ts";

/**
 * **Option Mind's config**: its chooser, its options (each a part of role `option`, in rank order;
 * `OPTIONS` where none are given), what it predicts from (`predictions`, the measured profiles
 * unless given), the parts its body layer is made from (legs, navigation, guard, low support,
 * executors and the actions they carry out, motor) and the techniques it rises by from the ground, in
 * rank order. This is Option Mind over its own body layer, the toolkit's humanoid kit; over another,
 * its config names a frame (`FramedOptionMindConfig`).
 */
export interface OptionMindConfig {
  readonly kind: "option";
  readonly frame?: null;
  readonly chooser: PartConfig;
  readonly options?: readonly PartConfig[] | null;
  readonly predictions?: PartConfig | null;
  readonly locomotion: LocomotionConfig;
  readonly navigation?: PartConfig;
  readonly guard: PartConfig;
  readonly support: PartConfig | null;
  readonly executors: readonly ExecutorEntry[];
  readonly actions: readonly ActionConfig[];
  readonly ground: readonly TechniqueConfig[];
  readonly motor?: PartConfig | null;
  /** The rate it decides at, Hz (`everyOf`, `Pace`): every control step unless given; its skills make the command every step from what it last decided. */
  readonly rate?: number;
}

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

/** Its gaits (`move`): the one its options name (`Going`), braced where none does; no rule chooses one. */
export const GOING: LocomotionConfig = deepFreeze({ kind: "move", rules: [], otherwise: "braced" });

/** The smallest working config: by worth over the standard options (`OPTIONS`), the gaits they name (`GOING`), the shield guard, no low support, no blow, and the game's edges up (`STAND_UP`). */
const OPTION_DEFAULTS: OptionMindConfig = deepFreeze({ kind: "option", chooser: { kind: "valued", depth: 2 }, options: OPTIONS, locomotion: GOING, guard: { kind: "shield-guard" }, support: null,
  executors: [], actions: [], ground: STAND_UP.techniques });

/** Its slots: its chooser, its options and what it predicts from, a skill of each role, its techniques on the ground and its motor. */
const SLOTS: readonly Slot[] = Object.freeze([
  slotOne("chooser", "Chooser", "chooser"), slotList("options", "Options", "option"), slotOne("predictions", "Predictions", "predictions", true, MEASURED_PREDICTIONS.defaults),
  slotOne("navigation", "Navigation", "navigation", true, GAME_NAVIGATION),
  slotOne("locomotion", "Walk", "locomotion"), slotOne("guard", "Guard", "guard"), slotOne("support", "Low support", "support", true), slotSkills("executors", "Executors", "executor"),
  slotList("ground", "Getting up", "technique"), slotOne("motor", "Motor control", "motor", true, GAME_MOTOR), slotOne("frame", "Frame", "frame", true),
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

/** What is wrong with `config`, each a sentence: its kit's faults, or no route up from the ground (`standUpFaults`). */
function optionMindFaults(config: OptionMindConfig, parts: PartLookup): readonly string[] {
  const faults = [...kitFaults(config, parts), ...frameFaults(config, parts)];
  if (config.rate !== undefined && !(Number.isFinite(config.rate) && config.rate > 0)) faults.push("rate: a positive number of times a second");
  if (!Array.isArray(config.ground) || config.ground.length === 0) faults.push("ground: a way up when down");
  else faults.push(...standUpFaults(config.ground, parts).map((fault) => `ground: ${fault}`));
  return faults;
}

/**
 * **An Option Mind fighter**: its body with no sub-mind (`kitBody`), its skills the toolkit's body
 * layer (`kitSkills`) and the ground executor of its techniques
 * (`groundExecutor`), decided by its tactics (`optionTactics`). Its blows are those its body
 * throws as armed (`armedActions`).
 */
function createOptionMind(host: BodyHost, given: OptionMindConfig, wiring: MindWiring) {
  const parts = host.parts, config = { ...given, executors: usableSkills(parts, host.spec, given.executors, given.actions).executors,
    actions: armedActions(parts, host.spec, given.executors, given.actions) };
  const { body } = host.take((own) => commandedMind(own, kitBody(config, parts), host.clock));
  const registry = techniquesOf(parts, { kind: "stand-up", techniques: config.ground });
  const ground = groundExecutor(body, host.clock, kitOf(parts, host.spec, config), registry);
  let skills: Skills | undefined;
  const aims = configuredAims(parts, host.spec, config.executors, config.actions);
  const make = (made: Body) => kitSkills(made, host.clock, parts, config, () => skills?.report.ledger ?? [],
    { executors: [ground.binding], actions: ground.actions }, aims);
  const hz = Math.round(1 / host.clock.dt), every = everyOf(config.rate, hz), rising = { executor: ground, registry };
  const making: TacticsMaking = { spec: host.spec, rules: host.rules, actions: config.actions, estimates: configuredActionEstimates(parts, host.spec, config.executors, config.actions, aims),
    aims, orders: (sight) => wiring.orders(sight.view.senses), parts };
  const driven = driveBy(body, optionTactics(making, hz, config, host.seed, rising, host.phase, hz / every), make, { every, phase: host.phase, orders: making.orders }, aimsState(aims));
  skills = driven.skills;
  return driven;
}

/**
 * **Option Mind**: a chooser over its options, on its percepts, over a body layer: its own, the
 * toolkit's humanoid kit, or the one a frame makes (`FramePart`), so a new family of bodies is a new
 * frame, not a new kind of mind. Its choosers, kinds of option, objectives, predictions and frames are
 * the toolkit's role lists (`CHOOSERS`, `OPTION_KINDS`, `OBJECTIVES`, `PREDICTIONS`, `QUADRUPED_FRAMES`).
 */
export const OPTION_MIND = controller<AnyOptionMindConfig>({
  role: "mind", label: "Option Mind", stage: "game", obeys: true, phases: { guard: "Guarding" }, fields: [], slots: SLOTS, defaults: OPTION_DEFAULTS,
  slotsFor: (config) => framed(config) ? FRAMED_SLOTS : SLOTS,
  keys: { kind: true, frame: true, chooser: true, options: true, predictions: true, navigation: true, locomotion: true, guard: true, support: true, executors: true, actions: true, ground: true, motor: true, rate: true },
  // The options it starts with where its config names none; a frame's are named.
  uses: (config) => framed(config) ? [] : config.options ? REPOSITION : [...REPOSITION, ...OPTIONS],
  reads: (config) => framed(config) ? [] : ["strike-profiles", "edge-profiles", "gait-profiles"],
  fits: (spec, config, parts) => framed(config) ? parts.of("frame", config.frame).fits(spec, config.frame, parts) : anyBody(),
  strikes: (spec, config, parts) => framed(config) ? parts.of("frame", config.frame).strikes?.(spec, config.frame, parts)
    : armedActions(parts, spec, config.executors, config.actions).flatMap((action) => action.effectors),
  faults: (config, parts) => framed(config) ? framedFaults(config, parts) : optionMindFaults(config, parts),
  builtIn: (spec, config, parts) => framed(config) ? parts.of("frame", config.frame).builtIn(spec, config.frame, parts) : parts.of("guard", config.guard).posture(spec, config.guard),
  create: (host, config, wiring) => framed(config) ? host.parts.of("frame", config.frame).create(host, config, config.frame, wiring) : createOptionMind(host, config, wiring),
});
