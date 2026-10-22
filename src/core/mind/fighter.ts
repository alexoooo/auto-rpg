import { SERVO_SECONDS, type Body, type BodyOptions } from "../body.ts";
import { skillSet } from "../skills/arbiter.ts";
import type { Skills } from "../skills/skills.ts";
import type { Ended } from "../skills/action.ts";
import type { Clock } from "../clock.ts";
import type { BodyHost } from "./host.ts";
import type { FighterConfig, SkillKit } from "./config.ts";
import { actionConfigFaults, actionFaults, armedActions, configuredActionEstimates, configuredAims, configuredExecutors } from "./action-config.ts";
import type { MindWiring } from "./minds.ts";
import type { PartLookup } from "./lookup.ts";
import { navigatorOf } from "./navigator.ts";
import { legsOf, motorOf, subMindsOf } from "./kit.ts";
import { tacticsOf } from "./tactics-part.ts";
import { driveBy, type Tactics } from "./tactics.ts";

/** Cross-part references are checked before any motion state is constructed: its kit's (`kitFaults`), and the actions its tactics name (`TacticsPart.actionFaults`). */
export function fighterFaults(config: FighterConfig, parts: PartLookup): readonly string[] {
  const faults = [...kitFaults(config, parts)];
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
export function fighterBody(config: Pick<FighterConfig, "subs" | "motor" | "guard">, wiring: MindWiring, parts: PartLookup): BodyOptions {
  return { servoSeconds: SERVO_SECONDS, senses: wiring.senses, assist: wiring.assist,
    feedback: true, contactIdentity: wiring.contactIdentity, subs: subMindsOf(parts, config.subs, config), motor: motorOf(parts, config.motor) };
}

/**
 * Named executors are built once; behaviours select actions without rebuilding motion state. Its
 * blows are those its body throws as armed (`armedActions`); its parts are those `parts` finds.
 */
export function driveFighter(body: Body, clock: Clock, parts: PartLookup, given: FighterConfig, wiring: MindWiring, around: (tactics: Tactics) => Tactics = tactics => tactics): Skills {
  const config = { ...given, actions: armedActions(parts, body.built.spec, given.executors, given.actions) };
  const faults = actionConfigFaults(parts, body.built.spec, config.executors, config.actions);
  if (faults.length) throw new Error(faults.join("; "));
  const tactics = tacticsOf({ spec: body.built.spec, actions: config.actions, estimates: configuredActionEstimates(parts, body.built.spec, config.executors, config.actions),
    aims: configuredAims(parts, body.built.spec, config.executors, config.actions),
    orders: sight => wiring.orders(sight.view.senses), ...wiring.script ? { script: wiring.script } : {}, parts }, config.tactics);
  let skills: Skills;
  skills = driveBy(body, around(tactics), (made, driving) => fighterSkills(made, clock, parts, config, driving, () => skills?.report.ledger ?? []));
  return skills;
}

/** The skills `config` names, each part the one `parts` finds, a mind's own included; action aims read the body's `ledger`. */
export function fighterSkills(made: Body, clock: Clock, parts: PartLookup, config: SkillKit, driving: Pick<Tactics, "state" | "engagement">, ledger: () => readonly Ended[]): Skills {
  const guard = parts.of("guard", config.guard).make(made.built, config.guard);
  return skillSet(made, driving, {
    legs: legsOf(parts, made, config.locomotion), navigation: navigatorOf(parts, made.built.spec, config.navigation), guard,
    support: config.support ? parts.of("support", config.support).make(made, config.support) : null,
    executors: configuredExecutors(parts, made, clock, guard.posture, config.executors, config.actions, ledger),
    actions: config.actions,
  });
}

/** **A fighter**: its body and sub-minds (`fighterBody`), driven by its tactics over its skills (`driveFighter`). */
export function createFighter(host: BodyHost, config: FighterConfig, wiring: MindWiring) {
  const body = host.command(fighterBody(config, wiring, host.parts));
  const skills = driveFighter(body, host.clock, host.parts, config, wiring);
  return { skills, state: skills.state };
}
