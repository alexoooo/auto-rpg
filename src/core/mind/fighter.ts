import { SERVO_SECONDS, type Body, type BodyOptions } from "../body.ts";
import { skillSet } from "../skills/arbiter.ts";
import { guardSkill } from "../skills/guard.ts";
import { holdUp } from "../skills/hold.ts";
import type { Skills } from "../skills/skills.ts";
import type { Ended } from "../skills/action.ts";
import type { ExecutorBinding } from "../skills/action-instances.ts";
import { supportFold } from "../skills/support-fold.ts";
import { deepFreeze } from "../state.ts";
import type { Clock } from "../clock.ts";
import type { BodyHost } from "./host.ts";
import type { ActionConfig, FighterConfig, SkillKit, SkillConfig } from "./config.ts";
import { actionConfigFaults, armedActions, configuredActionEstimates, configuredExecutors } from "./action-config.ts";
import type { MindWiring } from "./minds.ts";
import { legsOf } from "./locomotions.ts";
import type { PartLookup } from "./lookup.ts";
import { navigatorOf } from "./navigator.ts";
import { takesCommands, type Part } from "./parts.ts";
import { subMindsOf } from "./sub-minds.ts";
import { tacticsOf } from "./tactics-of.ts";
import { driveBy, type Tactics } from "./tactics.ts";

/** A skill part of no settings: its role, what it is called, its stage, its config and what is wrong with one. */
const skill = <C extends SkillConfig>(role: Part["role"], label: string, stage: Part["stage"], defaults: C, faults: (config: C) => readonly string[] = () => []): Part<C> =>
  ({ role, label, stage, fields: [], slots: [], defaults, fits: takesCommands, faults });

/**
 * **Every guard and low support, by its kind** (`Part`): what a fighter's guard and support slots
 * hold. Low support is the opening tactics' research, offered beside the game's.
 */
export const SKILL_PARTS: { readonly [K in SkillConfig["kind"]]: Part<Extract<SkillConfig, { kind: K }>> } = deepFreeze({
  "cover-guard": { ...skill("guard", "Guard and cover", "game", { kind: "cover-guard" }),
    supportedEquipment: (spec) => (spec.held ?? []).filter(({ item }) => item.cover !== undefined && item.coverNormal === undefined).map(({ segment }) => segment), tuning: ["covering", "hold"] },
  "shield-guard": { ...skill("guard", "Guard faces and lines", "game", { kind: "shield-guard" }),
    supportedEquipment: (spec) => (spec.held ?? []).filter(({ item }) => item.cover !== undefined).map(({ segment }) => segment), tuning: ["covering", "hold"] },
  "support-fold": skill("support", "Fight from low support", "experimental", { kind: "support-fold" }),
});

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

/** The skills `config` names, each part the one `parts` finds, with entrant-made executors where supplied; action aims read the body's `ledger`. */
export function fighterSkills(made: Body, clock: Clock, parts: PartLookup, config: SkillKit, driving: Pick<Tactics, "state" | "engagement">, ledger: () => readonly Ended[], suppliedExecutors?: readonly ExecutorBinding[]): Skills {
  return skillSet(made, driving, {
    legs: legsOf(made, config.locomotion), navigation: navigatorOf(parts, made.built.spec, config.navigation), guard: guardSkill(made.built.spec, config.guard.tuning?.covering, config.guard.kind === "shield-guard"),
    support: config.support ? supportFold(made) : null, hold: config.guard.tuning?.hold === true ? holdUp(made.built) : null,
    executors: suppliedExecutors ?? configuredExecutors(parts, made, clock, config.executors, config.actions, ledger),
    actions: config.actions,
  });
}

/** **A fighter**: its body and sub-minds (`fighterBody`), driven by its tactics over its skills (`driveFighter`). */
export function createFighter(host: BodyHost, config: FighterConfig, wiring: MindWiring) {
  const body = host.command(fighterBody(config, wiring));
  const skills = driveFighter(body, host.clock, host.parts, config, wiring);
  return { skills, state: skills.state };
}
