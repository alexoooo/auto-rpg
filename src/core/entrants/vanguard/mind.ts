import { commandable } from "../../body.ts";
import { actionConfigFaults, armedActions } from "../../mind/action-config.ts";
import { actionAim } from "../../mind/action-aim.ts";
import { configuredActionEstimates, configuredExecutors } from "../../mind/action-config.ts";
import { FIGHTING, MOVE, STAND_UP, type FighterConfig } from "../../mind/config.ts";
import { controller } from "../../mind/controller.ts";
import { createFighter, fighterBody, fighterFaults, fighterSkills } from "../../mind/fighter.ts";
import { toggle } from "../../mind/fields.ts";
import type { BodyHost } from "../../mind/host.ts";
import type { MindWiring } from "../../mind/minds.ts";
import { slotList, slotOne } from "../../mind/parts.ts";
import { tacticsOf } from "../../mind/tactics-of.ts";
import { driveBy } from "../../mind/tactics.ts";
import { guardPosture } from "../../skills/guard.ts";
import { STRAIGHT_PUNCH } from "../../skills/straight-punch.ts";
import type { Skills } from "../../skills/skills.ts";
import { deepFreeze } from "../../state.ts";
import { committedAim } from "./committed-aim.ts";

interface VanguardConfig extends Omit<FighterConfig, "kind"> { readonly kind: "vanguard"; readonly commitAim?: boolean }

/** A body punch with a longer approach and trunk lead, behind an anticipatory free-hand guard. */
const VANGUARD: VanguardConfig = deepFreeze({
  kind: "vanguard", locomotion: MOVE, guard: { kind: "shield-guard" }, support: null, subs: [STAND_UP],
  tactics: { ...FIGHTING, list: [
    { kind: "follow-orders" }, { kind: "clear-of-walls" }, { kind: "clear-of-fallen" },
    { kind: "break-clinch", metres: .7 }, { kind: "attack" }, { kind: "approach" }, { kind: "cover", guard: "ward" },
  ] },
  executors: [{ name: "punch", kind: "straight-punch", ...STRAIGHT_PUNCH,
    reach: .95, band: .18, through: .12, settle: .08, recover: .3, longest: .35, follow: .05,
    lean: .1, hips: .3, turn: .55, lead: .1, chamber: .22 }],
  actions: [{ name: "strike", executor: "punch", effectors: ["hand.right", "hand.left"],
    regions: [{ kind: "mark", mark: "middle" }], aim: { kind: "surface", tuning: {} } }],
});

/** The shared fighter runs the entrant's own immutable kit and tactics. */
const fighter = (config: VanguardConfig): FighterConfig => ({ ...config, kind: "fighter" });

/** The committed-aim variant supplies its own straight-punch bindings and shares the rest of the kit. */
function createVanguard(host: BodyHost, given: VanguardConfig, wiring: MindWiring) {
  if (!given.commitAim) return createFighter(host, fighter(given), wiring);
  const config = { ...given, actions: armedActions(host.spec, given.executors, given.actions) };
  const body = host.command(fighterBody(config, wiring));
  const tactics = tacticsOf(config.tactics, host.spec, wiring.name, config.actions,
    sight => wiring.orders(sight.view.senses), wiring.script, configuredActionEstimates(host.spec, config.executors, config.actions));
  let skills: Skills;
  const ledger = () => skills?.report.ledger ?? [];
  skills = driveBy(body, tactics, (made, driving) => {
    const ordinary = configuredExecutors(made, host.clock, config.executors.filter(executor => executor.kind !== "straight-punch"),
      config.actions.filter(action => !config.executors.some(executor => executor.name === action.executor && executor.kind === "straight-punch")), ledger);
    const aims = new Map(config.actions.map(action => [action.name, actionAim(host.spec, action.aim, action.family)]));
    const executors = config.executors.map(executor => executor.kind === "straight-punch"
      ? { name: executor.name, executor: committedAim(made, config.actions.filter(action => action.executor === executor.name).map(action => action.name), executor,
        (view, target, action, effector) => aims.get(action)?.(view, target, effector, ledger())?.at ?? null) }
      : ordinary.find(binding => binding.name === executor.name)!);
    return fighterSkills(made, host.clock, config, driving, ledger, executors);
  });
  return { skills, state: skills.state };
}

/** Vanguard is an independent entrant, with every skill exposed through the shared mind editor. */
export const VANGUARD_MIND = controller<VanguardConfig>({
  role: "mind", label: "Vanguard", stage: "experimental", defaults: VANGUARD, fields: [toggle("commitAim", "Commit to one aim point")],
  slots: [slotOne("navigation", "Navigation", "navigation", true), slotOne("tactics", "Tactics", "tactics"),
    slotOne("locomotion", "Walk", "locomotion"), slotOne("guard", "Guard", "guard"), slotList("executors", "Executors", "executor"),
    slotOne("support", "Low support", "support", true), slotList("subs", "When down", "sub-mind"),
    slotOne("motor", "Motor control", "motor", true)],
  keys: { kind: true, tactics: true, locomotion: true, navigation: true, guard: true, executors: true, actions: true,
    support: true, subs: true, motor: true, commitAim: true },
  fits: (spec, config) => commandable(spec) && actionConfigFaults(spec, config.executors, config.actions).length === 0
    && armedActions(spec, config.executors, config.actions).length > 0,
  strikes: (spec, config) => armedActions(spec, config.executors, config.actions).flatMap(action => action.effectors),
  faults: config => [...fighterFaults(fighter(config)), ...config.commitAim !== undefined && typeof config.commitAim !== "boolean" ? ["commitAim: a boolean"] : []],
  presets: deepFreeze({ vanguard: { label: "Vanguard", config: VANGUARD } }),
  builtIn: guardPosture,
  create: createVanguard,
});
