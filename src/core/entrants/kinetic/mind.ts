import type { Body } from "../../body.ts";
import { actionConfigFaults, armedActions, configuredActionEstimates, configuredAims } from "../../mind/action-config.ts";
import { MOVE, STAND_UP, type ActionConfig, type ExecutorEntry, type LocomotionConfig } from "../../mind/config.ts";
import { controller } from "../../mind/controller.ts";
import { fighterBody, fighterSkills, kitFaults } from "../../mind/fighter.ts";
import type { BodyHost } from "../../mind/host.ts";
import { GAME_MOTOR } from "../../mind/kit.ts";
import type { PartLookup } from "../../mind/lookup.ts";
import type { MindWiring } from "../../mind/minds.ts";
import { GAME_NAVIGATION } from "../../mind/navigator.ts";
import { fitsAll, slotList, slotOne, takesCommands, type PartConfig, type Slot } from "../../mind/parts.ts";
import { prepareTacticsSkills, tacticsOf, type TacticsMaking } from "../../mind/tactics-part.ts";
import { driveBy, type Tactics } from "../../mind/tactics.ts";
import type { Skills } from "../../skills/skills.ts";
import { STRAIGHT_PUNCH } from "../../skills/straight-punch.ts";
import { deepFreeze } from "../../state.ts";
import { kineticTactics } from "./tactics.ts";

/**
 * **Kinetic's config**: its chooser and the parts its body layer is made from (legs, navigation,
 * guard, executors and the actions they carry out, motor), the sub-minds it hands its body to when
 * down, in rank order, and the tactics that decide in its chooser's place (a drill's), or null.
 */
export interface KineticConfig {
  readonly kind: "kinetic";
  readonly chooser: PartConfig;
  readonly tactics: PartConfig | null;
  readonly locomotion: LocomotionConfig;
  readonly navigation?: PartConfig;
  readonly guard: PartConfig;
  readonly executors: readonly ExecutorEntry[];
  readonly actions: readonly ActionConfig[];
  readonly subs: readonly PartConfig[];
  readonly motor?: PartConfig | null;
}

/** The learned straight punch (`PunchPolicy`): the drive the learned puncher throws. */
const PUNCH: ExecutorEntry = deepFreeze({ name: "punch", kind: "straight-punch", ...STRAIGHT_PUNCH, learned: true });

/** Its punch with either hand at the trunk's opening, aimed as the learned puncher aims. */
const STRIKE: ActionConfig = deepFreeze({ name: "strike", executor: "punch", effectors: ["hand.right", "hand.left"], regions: [{ kind: "mark", mark: "middle" }],
  aim: { kind: "surface", tuning: { upperTrunk: 1, middleTrunk: -1, square: 4 } } });

/** As it starts: by worth, the learned punch, Classic's gaits (`MOVE`) walked in the stance, the shield guard, and the game's stand-up. */
const KINETIC: KineticConfig = deepFreeze({ kind: "kinetic", chooser: { kind: "valued", depth: 1 }, tactics: null, locomotion: MOVE, guard: { kind: "shield-guard" },
  executors: [PUNCH], actions: [STRIKE], subs: [STAND_UP] });

/** Its slots: its chooser, the tactics in its place, a skill of each role but low support, its sub-minds and its motor. */
const SLOTS: readonly Slot[] = Object.freeze([
  slotOne("chooser", "Chooser", "chooser"), slotOne("tactics", "Tactics", "tactics", true),
  slotOne("navigation", "Navigation", "navigation", true, GAME_NAVIGATION),
  slotOne("locomotion", "Walk", "locomotion"), slotOne("guard", "Guard", "guard"), slotList("executors", "Executors", "executor"),
  slotList("subs", "When down", "sub-mind"), slotOne("motor", "Motor control", "motor", true, GAME_MOTOR),
]);

/** What is wrong with `config`, each a sentence: its kit's faults, or no way up when down. */
function kineticFaults(config: KineticConfig, parts: PartLookup): readonly string[] {
  const faults = [...kitFaults({ ...config, support: null }, parts)];
  if (!Array.isArray(config.subs) || config.subs.length === 0) faults.push("subs: a way up when down");
  if (Array.isArray(config.actions) && config.actions.some((action) => action?.lower !== undefined)) faults.push("actions: Kinetic throws no blow from low support");
  return faults;
}

/**
 * **A Kinetic fighter**: its body and sub-minds (`fighterBody`), its skills the toolkit's body
 * layer with no low support (`fighterSkills`), decided by its tactics (`kineticTactics`), or by
 * the tactics its config names in their place. Its blows are those its body throws as armed
 * (`armedActions`).
 */
function createKinetic(host: BodyHost, given: KineticConfig, wiring: MindWiring) {
  const parts = host.parts, config = { ...given, actions: armedActions(parts, host.spec, given.executors, given.actions) };
  const body = host.command(fighterBody(config, wiring, parts));
  let skills: Skills;
  const make = (made: Body, driving: Pick<Tactics, "state" | "engagement">) => fighterSkills(made, host.clock, parts, { ...config, support: null }, driving, () => skills?.report.ledger ?? []);
  if (config.tactics) {
    const making: TacticsMaking = { spec: host.spec, actions: config.actions, estimates: configuredActionEstimates(parts, host.spec, config.executors, config.actions),
      aims: configuredAims(parts, host.spec, config.executors, config.actions), orders: (sight) => wiring.orders(sight.view.senses), parts };
    const tactics = config.tactics;
    skills = driveBy(body, tacticsOf(making, tactics), (made, driving) => prepareTacticsSkills(making, tactics, make(made, driving), () => driving.decision));
  } else {
    skills = driveBy(body, kineticTactics(host.spec, config, wiring, parts), make);
  }
  return { skills, state: skills.state };
}

/** **Kinetic** as an entrant: Options' chooser and percepts over the toolkit's body layer. */
export const KINETIC_MIND = controller<KineticConfig>({
  role: "mind", label: "Kinetic", stage: "game", obeys: true, phases: { guard: "Guarding" }, fields: [], slots: SLOTS, defaults: KINETIC,
  keys: { kind: true, chooser: true, tactics: true, navigation: true, locomotion: true, guard: true, executors: true, actions: true, subs: true, motor: true },
  fits: fitsAll<KineticConfig>(takesCommands, (spec, config, parts) => actionConfigFaults(parts, spec, config.executors, config.actions)[0] ?? null),
  strikes: (spec, config, parts) => armedActions(parts, spec, config.executors, config.actions).flatMap((action) => action.effectors),
  faults: kineticFaults,
  presets: deepFreeze({ kinetic: { label: "Kinetic", config: KINETIC, models: ["workshop-fighter"], character: { toes: true } } }),
  builtIn: (spec, config, parts) => parts.of("guard", config.guard).posture(spec, config.guard),
  create: createKinetic,
});
