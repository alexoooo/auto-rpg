import { SERVO_SECONDS, type Body, type BodyOptions } from "../body.ts";
import { skillSet } from "../skills/arbiter.ts";
import type { Skills } from "../skills/skills.ts";
import type { Ended } from "../skills/action.ts";
import type { Clock } from "../clock.ts";
import type { BodyHost } from "./host.ts";
import type { ActionConfig, FighterConfig, SkillKit } from "./config.ts";
import { actionConfigFaults, armedActions, configuredActionEstimates, configuredExecutors } from "./action-config.ts";
import type { MindWiring } from "./minds.ts";
import { legsOf } from "./locomotions.ts";
import type { PartLookup } from "./lookup.ts";
import { navigatorOf } from "./navigator.ts";
import { subMindsOf } from "./sub-minds.ts";
import { tacticsOf } from "./tactics-of.ts";
import { driveBy, type Tactics } from "./tactics.ts";

/** Cross-part references are checked before any motion state is constructed: its kit's (`kitFaults`), and the actions its selector names. */
export function fighterFaults(config: FighterConfig): readonly string[] {
  const faults = [...kitFaults(config)];
  if (!Array.isArray(config.actions)) return faults;
  const names = new Set(config.actions.map((action) => action?.name));
  if (config.tactics.kind === "behaviours" && config.tactics.choose.kind === "rules") {
    const choose = config.tactics.choose;
    for (const name of [...choose.otherwise, ...choose.rules.flatMap(rule => rule.actions)]) if (!names.has(name)) faults.push(`selector: no action ${name}`);
  }
  return faults;
}

/** What is wrong with how a kit's actions name its executors and their own settings, each a sentence. */
export function kitFaults(config: SkillKit): readonly string[] {
  const faults: string[] = [];
  if (!Array.isArray(config.actions)) return ["actions must be a list"];
  const executors = new Set(config.executors.map(e => e.name)), names = new Set<string>();
  if (executors.size !== config.executors.length || executors.has("")) faults.push("executors need distinct nonempty names");
  for (const action of config.actions) {
    if (!action || typeof action !== "object") { faults.push("action must be an object"); continue; }
    for (const key of Object.keys(action)) if (!["name", "executor", "effectors", "regions", "aim", "family", "armExtension", "lower"].includes(key)) faults.push(`${action.name}: no action setting ${key}`);
    if (!Array.isArray(action.effectors) || !action.effectors.length || action.effectors.some((e: unknown) => typeof e !== "string") || new Set(action.effectors).size !== action.effectors.length)
      faults.push(`${action.name}: distinct effectors required`);
    if (!Array.isArray(action.regions) || !action.regions.length || action.regions.some((region: ActionConfig["regions"][number]) => !region || (region.kind !== "segment" && region.kind !== "mark")
      || (region.kind === "segment" ? typeof region.segment !== "string" || !region.segment : !["high", "middle", "legs", "any"].includes(region.mark)))) faults.push(`${action.name}: valid target regions required`);
    if (!action.aim || !["centre", "surface", "leg-height"].includes(action.aim.kind)) faults.push(`${action.name}: valid aiming rule required`);
    if (!action.name || names.has(action.name)) faults.push("actions need distinct nonempty names");
    names.add(action.name);
    if (!executors.has(action.executor)) faults.push(`${action.name}: missing executor ${action.executor}`);
  }
  return faults;
}

/** All action instances share the fighter's physical feedback and body-local ledger. */
export function fighterBody(config: Pick<FighterConfig, "subs" | "motor">, wiring: MindWiring): BodyOptions {
  return { servoSeconds: SERVO_SECONDS, senses: wiring.senses, assist: wiring.assist,
    feedback: true, contactIdentity: wiring.contactIdentity, subs: subMindsOf(config.subs), motor: config.motor ?? null };
}

/**
 * Named executors are built once; behaviours select actions without rebuilding motion state. Its
 * blows are those its body throws as armed (`armedActions`); its parts are those `parts` finds.
 */
export function driveFighter(body: Body, clock: Clock, parts: PartLookup, given: FighterConfig, wiring: MindWiring, around: (tactics: Tactics) => Tactics = tactics => tactics): Skills {
  const config = { ...given, actions: armedActions(parts, body.built.spec, given.executors, given.actions) };
  const faults = actionConfigFaults(parts, body.built.spec, config.executors, config.actions);
  if (faults.length) throw new Error(faults.join("; "));
  const tactics = tacticsOf(config.tactics, body.built.spec, wiring.name, config.actions,
    sight => wiring.orders(sight.view.senses), wiring.script, configuredActionEstimates(parts, body.built.spec, config.executors, config.actions));
  let skills: Skills;
  skills = driveBy(body, around(tactics), (made, driving) => fighterSkills(made, clock, parts, config, driving, () => skills?.report.ledger ?? []));
  return skills;
}

/** The skills `config` names, each part the one `parts` finds, a mind's own included; action aims read the body's `ledger`. */
export function fighterSkills(made: Body, clock: Clock, parts: PartLookup, config: SkillKit, driving: Pick<Tactics, "state" | "engagement">, ledger: () => readonly Ended[]): Skills {
  const guard = parts.of("guard", config.guard).make(made, config.guard);
  return skillSet(made, driving, {
    legs: legsOf(made, config.locomotion), navigation: navigatorOf(parts, made.built.spec, config.navigation), guard,
    support: config.support ? parts.of("support", config.support).make(made, config.support) : null,
    executors: configuredExecutors(parts, made, clock, guard.posture, config.executors, config.actions, ledger),
    actions: config.actions,
  });
}

/** **A fighter**: its body and sub-minds (`fighterBody`), driven by its tactics over its skills (`driveFighter`). */
export function createFighter(host: BodyHost, config: FighterConfig, wiring: MindWiring) {
  const body = host.command(fighterBody(config, wiring));
  const skills = driveFighter(body, host.clock, host.parts, config, wiring);
  return { skills, state: skills.state };
}
