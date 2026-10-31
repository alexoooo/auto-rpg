import { SERVO_SECONDS, type Body, type BodyOptions } from "../body.ts";
import { skillSet } from "../skills/framework/arbiter.ts";
import type { Skills } from "../skills/framework/skills.ts";
import type { Ended } from "../skills/framework/action.ts";
import type { ActionBinding, ExecutorBinding } from "../skills/framework/action-instances.ts";
import type { Clock } from "../clock.ts";
import { rulesOf, type BodyHost } from "../mind/host.ts";
import type { SkillKit } from "../skills/config.ts";
import type { FighterConfig } from "./config.ts";
import { actionConfigFaults, actionFaults, armedActions, configuredActionEstimates, configuredAims, configuredExecutors } from "./action-config.ts";
import type { MindWiring } from "../mind/minds.ts";
import type { PartLookup } from "../parts/lookup.ts";
import { navigatorOf } from "../navigation/navigator.ts";
import { legsOf, motorOf, subMindsOf } from "../mind/kit.ts";
import { prepareTacticsSkills, tacticsOf, type TacticsMaking } from "./tactics-part.ts";
import { driveBy, type AroundDecider, type Driven } from "../mind/decider.ts";

/** Cross-part references are checked before any motion state is constructed: its kit's (`kitFaults`), and the actions its tactics name (`TacticsPart.actionFaults`). */
export function fighterFaults(config: FighterConfig, parts: PartLookup): readonly string[] {
  const faults = [...kitFaults(config, parts),
    ...(parts.of("tactics", config.tactics).kitFaults?.(config.tactics, config, parts) ?? []).map(fault => `tactics: ${fault}`)];
  if (!Array.isArray(config.actions)) return faults;
  const names = config.actions.map((action) => action?.name);
  return [...faults, ...parts.of("tactics", config.tactics).actionFaults?.(config.tactics, names, parts) ?? []];
}

/** What is wrong with how a kit's actions name its executors and their own settings, each a sentence (`actionFaults`). */
export function kitFaults(config: SkillKit, parts: PartLookup): readonly string[] {
  if (!Array.isArray(config.actions)) return ["actions must be a list"];
  const executors = new Set(config.executors.map(e => e.name));
  return [...executors.size !== config.executors.length || executors.has("") ? ["executors need distinct nonempty names"] : [], ...actionFaults(parts, config.executors, config.actions)];
}

/** All action instances share the fighter's physical feedback and body-local ledger; its motor and its sub-minds are those `parts` finds, the sub-minds made with its kit (`kitOf`). */
export function kitBody(config: Pick<FighterConfig, "subs" | "motor" | "guard">, wiring: MindWiring, parts: PartLookup): BodyOptions {
  return { servoSeconds: SERVO_SECONDS, senses: wiring.senses, assist: wiring.assist,
    feedback: true, contactIdentity: wiring.contactIdentity, subs: subMindsOf(parts, config.subs, config), motor: motorOf(parts, config.motor) };
}

/**
 * Named executors are built once; behaviours select actions without rebuilding motion state. Its
 * blows are those its body throws as armed (`armedActions`); its parts are those `parts` finds.
 * Returns the fighter as driven (`Driven`).
 */
export function driveFighter(body: Body, clock: Clock, parts: PartLookup, given: FighterConfig, wiring: MindWiring, around: AroundDecider = (decider) => decider): Driven {
  const config = { ...given, actions: armedActions(parts, body.built.spec, given.executors, given.actions) };
  const faults = actionConfigFaults(parts, body.built.spec, config.executors, config.actions);
  if (faults.length) throw new Error(faults.join("; "));
  const making: TacticsMaking = { spec: body.built.spec, rules: rulesOf(wiring), actions: config.actions, estimates: configuredActionEstimates(parts, body.built.spec, config.executors, config.actions),
    aims: configuredAims(parts, body.built.spec, config.executors, config.actions),
    orders: sight => wiring.orders(sight.view.senses), ...wiring.script ? { script: wiring.script } : {}, parts };
  const tactics = around(wiring.script ?? tacticsOf(making, config.tactics));
  let skills: Skills | undefined;
  const driven = driveBy(body, tactics, (made) => {
    const kit = kitSkills(made, clock, parts, config, () => skills?.report.ledger ?? []);
    return wiring.script ? kit : prepareTacticsSkills(making, config.tactics, kit, () => tactics.decision);
  });
  skills = driven.skills;
  return driven;
}

/** Executors a mind makes itself beside those its config names, and their actions (`kitSkills`). */
interface MoreSkills {
  readonly executors: readonly ExecutorBinding[];
  readonly actions: readonly ActionBinding[];
}

/** No executor beyond the config's. */
const NO_MORE: MoreSkills = Object.freeze({ executors: Object.freeze([]), actions: Object.freeze([]) });

/** The skills `config` names, each part the one `parts` finds, a mind's own included, and `more` beside them; action aims read the body's `ledger`. */
export function kitSkills(made: Body, clock: Clock, parts: PartLookup, config: SkillKit, ledger: () => readonly Ended[],
  more: MoreSkills = NO_MORE): Skills {
  const guard = parts.of("guard", config.guard).make(made.built, config.guard);
  return skillSet(made, {
    legs: legsOf(parts, made, config.locomotion), navigation: navigatorOf(parts, made.built.spec, config.navigation), guard,
    support: config.support ? parts.of("support", config.support).make(made, config.support) : null,
    executors: [...configuredExecutors(parts, made, clock, guard.posture, config.executors, config.actions, ledger), ...more.executors],
    actions: [...config.actions, ...more.actions],
  });
}

/** **A fighter**: its body and sub-minds (`kitBody`), driven by its tactics over its skills (`driveFighter`). */
export function createFighter(host: BodyHost, config: FighterConfig, wiring: MindWiring): Driven {
  const body = host.command(kitBody(config, wiring, host.parts));
  return driveFighter(body, host.clock, host.parts, config, wiring);
}
