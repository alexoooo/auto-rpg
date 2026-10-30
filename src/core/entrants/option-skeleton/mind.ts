import type { Body } from "../../body.ts";
import { actionConfigFaults, armedActions, configuredActionEstimates, configuredAims } from "../../mind/action-config.ts";
import { STAND_UP, type ActionConfig, type ExecutorEntry, type LocomotionConfig } from "../../mind/config.ts";
import { controller } from "../../mind/controller.ts";
import { fighterBody, fighterSkills, kitFaults } from "../../mind/fighter.ts";
import { groundExecutor } from "../../mind/ground/held.ts";
import { STAND_UP_PART } from "../../mind/ground/stand-up-part.ts";
import { REPOSITION, techniquesOf } from "../../mind/ground/stand-up.ts";
import type { TechniqueConfig } from "../../mind/ground/technique.ts";
import type { BodyHost } from "../../mind/host.ts";
import { GAME_MOTOR, kitOf } from "../../mind/kit.ts";
import type { PartLookup } from "../../mind/lookup.ts";
import type { MindWiring } from "../../mind/minds.ts";
import { GAME_NAVIGATION } from "../../mind/navigator.ts";
import { fitsAll, fitsWhen, slotList, slotOne, takesCommands, type PartConfig, type Slot } from "../../mind/parts.ts";
import type { TacticsMaking } from "../../mind/tactics-part.ts";
import { driveBy, type Tactics } from "../../mind/tactics.ts";
import type { Skills } from "../../skills/skills.ts";
import { deepFreeze } from "../../state.ts";
import { RANKED_CHOOSER, VALUED_CHOOSER } from "./options/chooser.ts";
import { OPTION_KINDS, OPTIONS } from "./options/kinds.ts";
import { FEW_TERMS_PART } from "./options/position.ts";
import { MEASURED_PREDICTIONS, PRIOR_PREDICTIONS } from "./options/predictions-part.ts";
import { optionTactics } from "./tactics.ts";
import { SKELETON_GUARD } from "./guard.ts";

/**
 * **Option Mind's config**: its chooser, its options (each a part of role `option`, in rank order;
 * `OPTIONS` where none are given), what it predicts from (`predictions`, the measured profiles
 * unless given), the parts its body layer is made from (legs, navigation, guard, low support,
 * executors and the actions they carry out, motor) and the techniques it rises by from the ground, in
 * rank order.
 */
interface SkeletonOptionConfig {
  readonly kind: "option-skeleton";
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

/** A low front kick reaches a trunk below the punch's height band. */
const LOW_KICK: ExecutorEntry = deepFreeze({ name: "low-kick", kind: "front-kick", contactSpeed: 7, windup: 0, swingSeconds: .25, returnNear: .1 });
const LOW_KICK_ACTION: ActionConfig = deepFreeze({ name: "low-kick", executor: "low-kick", effectors: ["foot.right", "foot.left"],
  regions: [{ kind: "mark", mark: "middle" }], aim: { kind: "centre", lead: 0 } });

/** The Skeleton walks braced, with each gait chosen as an option. */
const GOING: LocomotionConfig = deepFreeze({ kind: "move", rules: [], otherwise: "braced" });

/** The empty-handed Skeleton's own chooser, low kick and the game's rise (`STAND_UP`); no straight punch, which is not tuned for its body. */
const OPTION_DEFAULTS: SkeletonOptionConfig = deepFreeze({ kind: "option-skeleton", chooser: { kind: "skeleton-valued", depth: 2 }, options: OPTIONS,
  locomotion: GOING, guard: SKELETON_GUARD.defaults, support: { kind: "support-fold" },
  executors: [LOW_KICK], actions: [LOW_KICK_ACTION], ground: STAND_UP.techniques });

/** Its slots: its chooser, its options and what it predicts from, a skill of each role, its techniques on the ground and its motor. */
const SLOTS: readonly Slot[] = Object.freeze([
  slotOne("chooser", "Chooser", "chooser"), slotList("options", "Options", "option"), slotOne("predictions", "Predictions", "predictions", true, MEASURED_PREDICTIONS.defaults),
  slotOne("navigation", "Navigation", "navigation", true, GAME_NAVIGATION),
  slotOne("locomotion", "Walk", "locomotion"), slotOne("guard", "Guard", "guard"), slotOne("support", "Low support", "support", true), slotList("executors", "Executors", "executor"),
  slotList("ground", "Getting up", "technique"), slotOne("motor", "Motor control", "motor", true, GAME_MOTOR),
]);

/** What is wrong with `config`, each a sentence: its kit's faults, or no route up from the ground (`STAND_UP_PART.faults`). */
function optionMindFaults(config: SkeletonOptionConfig, parts: PartLookup): readonly string[] {
  const faults = [...kitFaults(config, parts)];
  if (!Array.isArray(config.ground) || config.ground.length === 0) faults.push("ground: a way up when down");
  else faults.push(...STAND_UP_PART.faults({ kind: "stand-up", techniques: config.ground }, parts).map((fault) => `ground: ${fault}`));
  return faults;
}

/**
 * **An Option Mind fighter**: its body with no sub-mind (`fighterBody`), its skills the toolkit's body
 * layer (`fighterSkills`) and the ground executor of its techniques
 * (`groundExecutor`), decided by its tactics (`optionTactics`). Its blows are those its body
 * throws as armed (`armedActions`).
 */
function createOptionMind(host: BodyHost, given: SkeletonOptionConfig, wiring: MindWiring) {
  const parts = host.parts, config = { ...given, actions: armedActions(parts, host.spec, given.executors, given.actions) };
  const body = host.command(fighterBody({ subs: [], motor: config.motor, guard: config.guard }, wiring, parts));
  const registry = techniquesOf(parts, { kind: "stand-up", techniques: config.ground });
  const ground = groundExecutor(body, host.clock, kitOf(parts, host.spec, config), registry);
  let skills: Skills;
  const make = (made: Body, driving: Pick<Tactics, "state" | "engagement">) => fighterSkills(made, host.clock, parts, config, driving, () => skills?.report.ledger ?? [],
    { executors: [ground.binding], actions: ground.actions });
  const making: TacticsMaking = { spec: host.spec, rules: host.rules, actions: config.actions, estimates: configuredActionEstimates(parts, host.spec, config.executors, config.actions),
    aims: configuredAims(parts, host.spec, config.executors, config.actions), orders: (sight) => wiring.orders(sight.view.senses), parts };
  skills = driveBy(body, optionTactics(making, Math.round(1 / host.clock.dt), config, host.seed, { executor: ground, registry }), make);
  return { skills, state: skills.state };
}

/** **Option Mind** as an entrant: a chooser over its options, on its percepts, over the toolkit's body layer. Its own parts are its choosers, options, position value, predictions and guard. */
export const SKELETON_OPTION_MIND = controller<SkeletonOptionConfig>({
  role: "mind", label: "Option Mind — Skeleton", stage: "game", obeys: true, phases: { guard: "Guarding" }, fields: [], slots: SLOTS, defaults: OPTION_DEFAULTS,
  keys: { kind: true, chooser: true, options: true, predictions: true, navigation: true, locomotion: true, guard: true, support: true, executors: true, actions: true, ground: true, motor: true },
  parts: [VALUED_CHOOSER, RANKED_CHOOSER, ...OPTION_KINDS, FEW_TERMS_PART, MEASURED_PREDICTIONS, PRIOR_PREDICTIONS, SKELETON_GUARD],
  // The options it starts with where its config names none.
  uses: (config) => config.options ? REPOSITION : [...REPOSITION, ...OPTIONS],
  reads: () => ["strike-profiles", "edge-profiles", "gait-profiles"],
  fits: fitsAll<SkeletonOptionConfig>(takesCommands,
    fitsWhen((spec) => spec.model === "crypt-skeleton" && !spec.held?.length, "needs an empty-handed Skeleton"),
    (spec, config, parts) => actionConfigFaults(parts, spec, config.executors, config.actions)[0] ?? null),
  strikes: (spec, config, parts) => armedActions(parts, spec, config.executors, config.actions).flatMap((action) => action.effectors),
  faults: optionMindFaults,
  presets: deepFreeze({
    "option-skeleton": { label: "Option Mind — Skeleton", config: OPTION_DEFAULTS, models: ["crypt-skeleton"] },
  }),
  builtIn: (spec, config, parts) => parts.of("guard", config.guard).posture(spec, config.guard),
  create: createOptionMind,
});
