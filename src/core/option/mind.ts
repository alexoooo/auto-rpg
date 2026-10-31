import type { Body } from "../body.ts";
import { actionConfigFaults, armedActions, configuredActionEstimates, configuredAims } from "../tactics/action-config.ts";
import { STAND_UP } from "../recovery/ground/stand-up.ts";
import type { ActionConfig, ExecutorEntry, LocomotionConfig } from "../skills/config.ts";
import { controller } from "../mind/controller.ts";
import { kitBody, kitSkills, kitFaults } from "../tactics/fighter.ts";
import { groundExecutor } from "../recovery/ground/held.ts";
import { STAND_UP_PART } from "../recovery/ground/stand-up-part.ts";
import { REPOSITION, techniquesOf } from "../recovery/ground/stand-up.ts";
import type { TechniqueConfig } from "../recovery/ground/technique.ts";
import type { BodyHost } from "../mind/host.ts";
import { GAME_MOTOR, kitOf } from "../mind/kit.ts";
import type { PartLookup } from "../parts/lookup.ts";
import type { MindWiring } from "../mind/minds.ts";
import { GAME_NAVIGATION } from "../navigation/navigator.ts";
import { fitsAll, slotList, slotOne, takesCommands, type PartConfig, type Slot } from "../parts/parts.ts";
import type { TacticsMaking } from "../tactics/tactics-part.ts";
import { driveBy } from "../tactics/tactics.ts";
import type { Skills } from "../skills/framework/skills.ts";
import { deepFreeze } from "../state.ts";
import { OPTIONS } from "./kinds.ts";
import { MEASURED_PREDICTIONS } from "./predictions-part.ts";
import { optionTactics } from "./tactics.ts";

/**
 * **Option Mind's config**: its chooser, its options (each a part of role `option`, in rank order;
 * `OPTIONS` where none are given), what it predicts from (`predictions`, the measured profiles
 * unless given), the parts its body layer is made from (legs, navigation, guard, low support,
 * executors and the actions they carry out, motor) and the techniques it rises by from the ground, in
 * rank order.
 */
export interface OptionMindConfig {
  readonly kind: "option";
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
}

/** Its gaits (`move`): the one its options name (`Going`), braced where none does; no rule chooses one. */
export const GOING: LocomotionConfig = deepFreeze({ kind: "move", rules: [], otherwise: "braced" });

/** The smallest working config: by worth over the standard options (`OPTIONS`), the gaits they name (`GOING`), the shield guard, no low support, no blow, and the game's edges up (`STAND_UP`). */
const OPTION_DEFAULTS: OptionMindConfig = deepFreeze({ kind: "option", chooser: { kind: "valued", depth: 2 }, options: OPTIONS, locomotion: GOING, guard: { kind: "shield-guard" }, support: null,
  executors: [], actions: [], ground: STAND_UP.techniques });

/** Its slots: its chooser, its options and what it predicts from, a skill of each role, its techniques on the ground and its motor. */
const SLOTS: readonly Slot[] = Object.freeze([
  slotOne("chooser", "Chooser", "chooser"), slotList("options", "Options", "option"), slotOne("predictions", "Predictions", "predictions", true, MEASURED_PREDICTIONS.defaults),
  slotOne("navigation", "Navigation", "navigation", true, GAME_NAVIGATION),
  slotOne("locomotion", "Walk", "locomotion"), slotOne("guard", "Guard", "guard"), slotOne("support", "Low support", "support", true), slotList("executors", "Executors", "executor"),
  slotList("ground", "Getting up", "technique"), slotOne("motor", "Motor control", "motor", true, GAME_MOTOR),
]);

/** What is wrong with `config`, each a sentence: its kit's faults, or no route up from the ground (`STAND_UP_PART.faults`). */
function optionMindFaults(config: OptionMindConfig, parts: PartLookup): readonly string[] {
  const faults = [...kitFaults(config, parts)];
  if (!Array.isArray(config.ground) || config.ground.length === 0) faults.push("ground: a way up when down");
  else faults.push(...STAND_UP_PART.faults({ kind: "stand-up", techniques: config.ground }, parts).map((fault) => `ground: ${fault}`));
  return faults;
}

/**
 * **An Option Mind fighter**: its body with no sub-mind (`kitBody`), its skills the toolkit's body
 * layer (`kitSkills`) and the ground executor of its techniques
 * (`groundExecutor`), decided by its tactics (`optionTactics`). Its blows are those its body
 * throws as armed (`armedActions`).
 */
function createOptionMind(host: BodyHost, given: OptionMindConfig, wiring: MindWiring) {
  const parts = host.parts, config = { ...given, actions: armedActions(parts, host.spec, given.executors, given.actions) };
  const body = host.command(kitBody({ subs: [], motor: config.motor, guard: config.guard }, wiring, parts));
  const registry = techniquesOf(parts, { kind: "stand-up", techniques: config.ground });
  const ground = groundExecutor(body, host.clock, kitOf(parts, host.spec, config), registry);
  let skills: Skills | undefined;
  const make = (made: Body) => kitSkills(made, host.clock, parts, config, () => skills?.report.ledger ?? [],
    { executors: [ground.binding], actions: ground.actions });
  const hz = Math.round(1 / host.clock.dt), rising = { executor: ground, registry };
  const making: TacticsMaking = { spec: host.spec, rules: host.rules, actions: config.actions, estimates: configuredActionEstimates(parts, host.spec, config.executors, config.actions),
    aims: configuredAims(parts, host.spec, config.executors, config.actions), orders: (sight) => wiring.orders(sight.view.senses), parts };
  const driven = driveBy(body, optionTactics(making, hz, config, host.seed, rising), make);
  skills = driven.skills;
  return driven;
}

/** **Option Mind**: a chooser over its options, on its percepts, over the toolkit's body layer. Its choosers, kinds of option, objectives and predictions are the toolkit's role lists (`CHOOSERS`, `OPTION_KINDS`, `OBJECTIVES`, `PREDICTIONS`). */
export const OPTION_MIND = controller<OptionMindConfig>({
  role: "mind", label: "Option Mind", stage: "game", obeys: true, phases: { guard: "Guarding" }, fields: [], slots: SLOTS, defaults: OPTION_DEFAULTS,
  keys: { kind: true, chooser: true, options: true, predictions: true, navigation: true, locomotion: true, guard: true, support: true, executors: true, actions: true, ground: true, motor: true },
  // The options it starts with where its config names none.
  uses: (config) => config.options ? REPOSITION : [...REPOSITION, ...OPTIONS],
  reads: () => ["strike-profiles", "edge-profiles", "gait-profiles"],
  fits: fitsAll<OptionMindConfig>(takesCommands, (spec, config, parts) => actionConfigFaults(parts, spec, config.executors, config.actions)[0] ?? null),
  strikes: (spec, config, parts) => armedActions(parts, spec, config.executors, config.actions).flatMap((action) => action.effectors),
  faults: optionMindFaults,
  builtIn: (spec, config, parts) => parts.of("guard", config.guard).posture(spec, config.guard),
  create: createOptionMind,
});
