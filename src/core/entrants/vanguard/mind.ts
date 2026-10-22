import { commandable } from "../../body.ts";
import { actionConfigFaults, armedActions } from "../../mind/action-config.ts";
import { actionAim } from "../../mind/action-aim.ts";
import { configuredActionEstimates, configuredExecutors } from "../../mind/action-config.ts";
import { FIGHTING, MOVE, STAND_UP, type FighterConfig } from "../../mind/config.ts";
import { controller } from "../../mind/controller.ts";
import { createFighter, fighterBody, fighterFaults, fighterSkills } from "../../mind/fighter.ts";
import { toggle, type PartField } from "../../mind/fields.ts";
import type { BodyHost } from "../../mind/host.ts";
import type { MindWiring } from "../../mind/minds.ts";
import { slotList, slotOne } from "../../mind/parts.ts";
import { tacticsOf } from "../../mind/tactics-of.ts";
import { driveBy } from "../../mind/tactics.ts";
import { guardPosture } from "../../skills/guard.ts";
import { STRAIGHT_PUNCH } from "../../skills/straight-punch.ts";
import type { Skills } from "../../skills/skills.ts";
import type { ExecutorBinding } from "../../skills/action-instances.ts";
import { deepFreeze } from "../../state.ts";
import { committedAim } from "./committed-aim.ts";
import { lowGuard } from "./low-guard.ts";

interface VanguardConfig extends Omit<FighterConfig, "kind"> {
  readonly kind: "vanguard";
  readonly commitAim?: boolean;
  readonly lowGuard?: boolean;
  readonly lowActions?: readonly string[];
}

/** Low-only actions remain ordinary editable actions, with their admission restriction named explicitly. */
const LOW_ACTIONS: PartField<VanguardConfig> = {
  kind: "text", key: "lowActions", label: "Low-only action names (JSON)",
  read: config => JSON.stringify(config.lowActions ?? []),
  write(config, text) {
    try {
      const names: unknown = JSON.parse(text);
      return Array.isArray(names) && names.every(name => typeof name === "string") ? { ...config, lowActions: names } : null;
    } catch { return null; }
  },
};

/** A restriction names distinct actions, and the committed-aim runtime enforces it. */
function lowActionFaults(config: VanguardConfig): readonly string[] {
  if (config.lowActions === undefined) return [];
  const names = config.lowActions;
  if (!Array.isArray(names) || names.some(name => typeof name !== "string") || new Set(names).size !== names.length
    || names.some(name => !config.actions.some(action => action.name === name))) return ["lowActions: distinct known action names"];
  return names.length && !config.commitAim ? ["lowActions needs committed aim"] : [];
}

/** A body punch behind an anticipatory guard, with a planted low punch and closed low cover. */
const VANGUARD: VanguardConfig = deepFreeze({
  kind: "vanguard", commitAim: true, lowGuard: true, lowActions: ["low-punch"],
  locomotion: MOVE, guard: { kind: "shield-guard" }, support: { kind: "support-fold" }, subs: [STAND_UP],
  tactics: { ...FIGHTING, list: [
    { kind: "follow-orders" }, { kind: "clear-of-walls" },
    { kind: "break-clinch", metres: .7 }, { kind: "attack" }, { kind: "approach" }, { kind: "cover", guard: "ward" },
  ] },
  executors: (["punch", "low-punch"] as const).map(name => ({ name, kind: "straight-punch", ...STRAIGHT_PUNCH,
    reach: .95, band: .18, through: .12, settle: .2, recover: .3, longest: .35, follow: .05,
    // The low stroke predicts the lumbar bend held by the planted support fold.
    lean: name === "low-punch" ? .89 : .1, hips: .3, turn: .55, lead: .1, chamber: .22 })),
  actions: (["punch", "low-punch"] as const).map(executor => ({ name: executor === "punch" ? "strike" : executor, executor,
    effectors: ["hand.right", "hand.left"], regions: [{ kind: "mark", mark: "middle" }], aim: { kind: "surface", tuning: {} } })),
});

/** The shared fighter runs the entrant's own immutable kit and tactics. */
const fighter = (config: VanguardConfig): FighterConfig => ({ ...config, kind: "fighter" });

/** The committed-aim variant supplies its own straight-punch bindings and shares the rest of the kit. */
function createVanguard(host: BodyHost, given: VanguardConfig, wiring: MindWiring) {
  if (!given.commitAim) return createFighter(host, fighter(given), wiring);
  const config = { ...given, actions: armedActions(host.spec, given.executors, given.actions) };
  const lowActions = new Set(given.lowActions ?? []);
  const body = host.command(fighterBody(config, wiring));
  const tactics = tacticsOf(config.tactics, host.spec, wiring.name, config.actions,
    sight => wiring.orders(sight.view.senses), wiring.script, configuredActionEstimates(host.spec, config.executors, config.actions));
  const low = given.lowGuard ? lowGuard(tactics, host.spec, sight => wiring.orders(sight.view.senses)) : null;
  let skills: Skills;
  const ledger = () => skills?.report.ledger ?? [];
  skills = driveBy(body, low?.tactics ?? tactics, (made, driving) => {
    const ordinary = configuredExecutors(made, host.clock, config.executors.filter(executor => executor.kind !== "straight-punch"),
      config.actions.filter(action => !config.executors.some(executor => executor.name === action.executor && executor.kind === "straight-punch")), ledger);
    const aims = new Map(config.actions.map(action => [action.name, actionAim(host.spec, action.aim, action.family)]));
    const executors = config.executors.map((settings): ExecutorBinding => {
      if (settings.kind !== "straight-punch") return ordinary.find(binding => binding.name === settings.name)!;
      const executor = committedAim(made, config.actions.filter(action => action.executor === settings.name).map(action => action.name), settings,
        (view, target, action, effector) => low?.aim(view, target) ?? aims.get(action)?.(view, target, effector, ledger())?.at ?? null, given.lowGuard);
      return { name: settings.name, executor: { ...executor,
        readiness(view, action, effector, target, around) {
          if (lowActions.has(action) && !low?.aim(view, target)) return { kind: "blocked" as const, reason: "action needs a low opponent" };
          return executor.readiness(view, action, effector, target, around);
        },
      } };
    });
    const skills = fighterSkills(made, host.clock, config, driving, ledger, executors);
    return low ? low.skills(skills) : skills;
  });
  return { skills, state: skills.state };
}

/** Vanguard is an independent entrant, with every skill exposed through the shared mind editor. */
export const VANGUARD_MIND = controller<VanguardConfig>({
  role: "mind", label: "Vanguard", stage: "experimental", defaults: VANGUARD,
  fields: [toggle("commitAim", "Commit to one aim point"), toggle("lowGuard", "Prepare a low guard"), LOW_ACTIONS],
  slots: [slotOne("navigation", "Navigation", "navigation", true), slotOne("tactics", "Tactics", "tactics"),
    slotOne("locomotion", "Walk", "locomotion"), slotOne("guard", "Guard", "guard"), slotList("executors", "Executors", "executor"),
    slotOne("support", "Low support", "support", true), slotList("subs", "When down", "sub-mind"),
    slotOne("motor", "Motor control", "motor", true)],
  keys: { kind: true, tactics: true, locomotion: true, navigation: true, guard: true, executors: true, actions: true,
    support: true, subs: true, motor: true, commitAim: true, lowGuard: true, lowActions: true },
  fits: (spec, config) => commandable(spec) && actionConfigFaults(spec, config.executors, config.actions).length === 0
    && armedActions(spec, config.executors, config.actions).length > 0,
  strikes: (spec, config) => armedActions(spec, config.executors, config.actions).flatMap(action => action.effectors),
  faults: config => [...fighterFaults(fighter(config)), ...lowActionFaults(config),
    ...config.commitAim !== undefined && typeof config.commitAim !== "boolean" ? ["commitAim: a boolean"] : [],
    ...config.lowGuard !== undefined && typeof config.lowGuard !== "boolean" ? ["lowGuard: a boolean"] : [],
    ...config.lowGuard && (!config.commitAim || config.support?.kind !== "support-fold") ? ["lowGuard needs committed aim and low support"] : []],
  presets: deepFreeze({ vanguard: { label: "Vanguard", config: VANGUARD } }),
  builtIn: guardPosture,
  create: createVanguard,
});
