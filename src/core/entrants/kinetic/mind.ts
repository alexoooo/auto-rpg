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
import { fitsAll, slotList, slotOne, takesCommands, type PartConfig, type Slot } from "../../mind/parts.ts";
import { prepareTacticsSkills, type TacticsMaking } from "../../mind/tactics-part.ts";
import { driveBy, type Tactics } from "../../mind/tactics.ts";
import type { Skills } from "../../skills/skills.ts";
import { STRAIGHT_PUNCH } from "../../skills/straight-punch.ts";
import { deepFreeze } from "../../state.ts";
import { COVER_DRILL_TACTICS } from "./drill-cover.ts";
import { RANKED_CHOOSER, VALUED_CHOOSER } from "./options/chooser.ts";
import { OPTION_KINDS, OPTIONS, scriptsOf } from "./options/kinds.ts";
import { FEW_TERMS_PART } from "./options/position.ts";
import { MEASURED_PREDICTIONS, PRIOR_PREDICTIONS } from "./options/predictions-part.ts";
import { kineticTactics } from "./tactics.ts";

/**
 * **Kinetic's config**: its chooser, its options (each a part of role `option`, in rank order;
 * `OPTIONS` where none are given), what it predicts from (`predictions`, the measured profiles
 * unless given), the parts its body layer is made from (legs, navigation, guard, low support,
 * executors and the actions they carry out, motor) and the techniques it rises by from the ground, in
 * rank order. A drill drives it by its options: a script of the drill's tactics (`drilled`).
 */
export interface KineticConfig {
  readonly kind: "kinetic";
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

/** The learned straight punch (`PunchPolicy`): the drive the learned puncher throws. */
const PUNCH: ExecutorEntry = deepFreeze({ name: "punch", kind: "straight-punch", ...STRAIGHT_PUNCH, learned: true });

/** **The straight punch**: its punch with either hand at the trunk's opening, aimed as the learned puncher aims. */
const STRAIGHT_PUNCH_ACTION: ActionConfig = deepFreeze({ name: "straight-punch", executor: "punch", effectors: ["hand.right", "hand.left"], regions: [{ kind: "mark", mark: "middle" }],
  aim: { kind: "surface", tuning: { upperTrunk: 1, middleTrunk: -1, square: 4 } } });

/**
 * **The stomp's stroke**: the front kick's, its chamber over the target, its height band low, so
 * it strikes down on a body lying ahead and nothing standing, from a window as far out as a foot
 * clear of a lying body's limbs stands ([stomp settings](../../../../docs/reference/front-kicks.md#stomp-settings)).
 */
const STOMP: ExecutorEntry = deepFreeze({ name: "stomp", kind: "front-kick",
  over: 1, windup: 0, lift: .5, soleTurn: 0, top: .4, alongNear: .4, alongFar: .7, across: .2, contactSpeed: 3, swingSeconds: .3 });

/** **The stomp**: its stroke with either foot at the trunk's middle, aimed at its centre. */
const STOMP_ACTION: ActionConfig = deepFreeze({ name: "stomp", executor: "stomp", effectors: ["foot.right", "foot.left"], regions: [{ kind: "mark", mark: "middle" }],
  aim: { kind: "centre", lead: 0 } });

/** Its gaits (`move`): the one its options name (`Going`), braced where none does; no rule chooses one. */
const GOING: LocomotionConfig = deepFreeze({ kind: "move", rules: [], otherwise: "braced" });

/** As it starts: by worth, the learned punch, the stomp, the gaits its options name (`GOING`), the shield guard, the support fold, and the game's stand-up's techniques. */
const KINETIC: KineticConfig = deepFreeze({ kind: "kinetic", chooser: { kind: "valued", depth: 1 }, options: OPTIONS, locomotion: GOING, guard: { kind: "shield-guard" }, support: { kind: "support-fold" },
  executors: [PUNCH, STOMP], actions: [STRAIGHT_PUNCH_ACTION, STOMP_ACTION], ground: STAND_UP.techniques });

/** Its slots: its chooser, its options and what it predicts from, a skill of each role, its techniques on the ground and its motor. */
const SLOTS: readonly Slot[] = Object.freeze([
  slotOne("chooser", "Chooser", "chooser"), slotList("options", "Options", "option"), slotOne("predictions", "Predictions", "predictions", true, MEASURED_PREDICTIONS.defaults),
  slotOne("navigation", "Navigation", "navigation", true, GAME_NAVIGATION),
  slotOne("locomotion", "Walk", "locomotion"), slotOne("guard", "Guard", "guard"), slotOne("support", "Low support", "support", true), slotList("executors", "Executors", "executor"),
  slotList("ground", "Getting up", "technique"), slotOne("motor", "Motor control", "motor", true, GAME_MOTOR),
]);

/** What is wrong with `config`, each a sentence: its kit's faults, or no route up from the ground (`STAND_UP_PART.faults`). */
function kineticFaults(config: KineticConfig, parts: PartLookup): readonly string[] {
  const faults = [...kitFaults(config, parts)];
  if (!Array.isArray(config.ground) || config.ground.length === 0) faults.push("ground: a way up when down");
  else faults.push(...STAND_UP_PART.faults({ kind: "stand-up", techniques: config.ground }, parts).map((fault) => `ground: ${fault}`));
  return faults;
}

/**
 * **A Kinetic fighter**: its body with no sub-mind (`fighterBody`), its skills the toolkit's body
 * layer (`fighterSkills`) and the ground executor of its techniques
 * (`groundExecutor`), decided by its tactics (`kineticTactics`), the skills prepared for each
 * script among its options (`scriptsOf`, `prepareTacticsSkills`). Its blows are those its body
 * throws as armed (`armedActions`).
 */
function createKinetic(host: BodyHost, given: KineticConfig, wiring: MindWiring) {
  const parts = host.parts, config = { ...given, actions: armedActions(parts, host.spec, given.executors, given.actions) };
  const body = host.command(fighterBody({ subs: [], motor: config.motor, guard: config.guard }, wiring, parts));
  const registry = techniquesOf(parts, { kind: "stand-up", techniques: config.ground });
  const ground = groundExecutor(body, host.clock, kitOf(parts, host.spec, config), registry);
  let skills: Skills;
  const make = (made: Body, driving: Pick<Tactics, "state" | "engagement">) => fighterSkills(made, host.clock, parts, config, driving, () => skills?.report.ledger ?? [],
    { executors: [ground.binding], actions: ground.actions });
  const making: TacticsMaking = { spec: host.spec, rules: host.rules, actions: config.actions, estimates: configuredActionEstimates(parts, host.spec, config.executors, config.actions),
    aims: configuredAims(parts, host.spec, config.executors, config.actions), orders: (sight) => wiring.orders(sight.view.senses), parts };
  skills = driveBy(body, kineticTactics(making, Math.round(1 / host.clock.dt), config, host.seed, { executor: ground, registry }), (made, driving) =>
    scriptsOf(config.options ?? []).reduce((prepared, tactics) => prepareTacticsSkills(making, tactics, prepared, () => driving.decision), make(made, driving)));
  return { skills, state: skills.state };
}

/** **Kinetic** as an entrant: a chooser over its options, on its percepts, over the toolkit's body layer. Its own parts are its choosers, its kinds of option, its position value and the Cover drill's tactics. */
export const KINETIC_MIND = controller<KineticConfig>({
  role: "mind", label: "Kinetic", stage: "game", obeys: true, phases: { guard: "Guarding" }, fields: [], slots: SLOTS, defaults: KINETIC,
  keys: { kind: true, chooser: true, options: true, predictions: true, navigation: true, locomotion: true, guard: true, support: true, executors: true, actions: true, ground: true, motor: true },
  parts: [VALUED_CHOOSER, RANKED_CHOOSER, ...OPTION_KINDS, FEW_TERMS_PART, MEASURED_PREDICTIONS, PRIOR_PREDICTIONS, COVER_DRILL_TACTICS],
  // The options it starts with where its config names none.
  uses: (config) => config.options ? REPOSITION : [...REPOSITION, ...OPTIONS],
  reads: () => ["strike-profiles", "edge-profiles", "gait-profiles"],
  // A drill drives it by a script of its tactics in place of its options.
  drilled: (config, tactics) => ({ ...config, options: [{ kind: "scripted", tactics }] }),
  fits: fitsAll<KineticConfig>(takesCommands, (spec, config, parts) => actionConfigFaults(parts, spec, config.executors, config.actions)[0] ?? null),
  strikes: (spec, config, parts) => armedActions(parts, spec, config.executors, config.actions).flatMap((action) => action.effectors),
  faults: kineticFaults,
  presets: deepFreeze({ kinetic: { label: "Kinetic", config: KINETIC, models: ["workshop-fighter"], character: { toes: true } } }),
  builtIn: (spec, config, parts) => parts.of("guard", config.guard).posture(spec, config.guard),
  create: createKinetic,
});
