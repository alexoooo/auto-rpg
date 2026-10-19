import { commandable, createBody, SERVO_SECONDS, type Body, type BodyOptions } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { skillSet } from "../skills/arbiter.ts";
import { guardSkill } from "../skills/guard.ts";
import { holdUp } from "../skills/hold.ts";
import { locomotion, validTurnLimit, validTurnStartup, type Locomotion } from "../skills/locomotion.ts";
import type { Skills } from "../skills/skills.ts";
import type { Ended } from "../skills/action.ts";
import { STRIDE, stride, validStride } from "../skills/stride.ts";
import { RUN, run, validRun } from "../skills/run.ts";
import { SIMBICON, simbicon, simbiconWays, validSimbicon, validWays, type SimbiconSettings } from "../skills/simbicon.ts";
import { runCycleSettings, validRunCycle } from "../skills/cycle-run.ts";
import { WALK_RUN, WALK_RUN_CYCLE, validWalkRun, walkRun, type WalkRunSettings } from "../skills/walk-run.ts";
import { learnedRun, RUN_POLICIES } from "../skills/learned-run.ts";
import { GAIT_NAMES, GAITS, type GaitName } from "../skills/gaits.ts";
import { distanceRule, move, standingRule, type MoveGait, type MoveRule } from "../skills/move.ts";
import { supportFold } from "../skills/support-fold.ts";
import { deepFreeze } from "../state.ts";
import type { World } from "../world.ts";
import { MOVE, type ActionConfig, type FighterConfig, type SkillConfig, type StanceWalkConfig, type StrideConfig, type RunConfig, type SimbiconConfig, type WalkRunConfig, type LearnedRunConfig, type MoveConfig, type MoveRuleConfig, type LocomotionConfig } from "./config.ts";
import { actionConfigFaults, configuredActionEstimates, configuredExecutors } from "./action-config.ts";
import { choice, type PartField } from "./fields.ts";
import { CONDITIONS } from "./conditions.ts";
import type { MindWiring } from "./minds.ts";
import { slotList, type Part } from "./parts.ts";
import { subMindsOf } from "./sub-minds.ts";
import { tacticsOf } from "./tactics-of.ts";
import { driveBy, type Tactics } from "./tactics.ts";

/** A skill part of no settings: its role, what it is called, its stage, its config and what is wrong with one. */
const skill = <C extends SkillConfig>(role: Part["role"], label: string, stage: Part["stage"], defaults: C, faults: (config: C) => readonly string[] = () => []): Part<C> =>
  ({ role, label, stage, fields: [], slots: [], defaults, fits: commandable, faults });

/** A SIMBICON walk's config's settings, its kind taken off. */
const settingsOf = ({ kind: _, tuning: __, runs: ___, ...settings }: SimbiconConfig): SimbiconSettings => settings;

/** A walk and run's config's settings, its kind taken off. */
const walkRunOf = ({ kind: _, tuning: __, runs: ___, ...settings }: WalkRunConfig): WalkRunSettings => settings;
const learnedRunOf = ({ kind: _, tuning: __, runs: ___, policy: ____, ...settings }: LearnedRunConfig): WalkRunSettings => settings;

/** Whether `name` is a gait's (`GAITS`): a config read from a save or a link may name any. */
const isGait = (name: string): name is GaitName => Object.hasOwn(GAITS, name);

/** The gaits as a choice offers them. */
const GAIT_CHOICES = GAIT_NAMES.map((name): [GaitName, string] => [name, GAITS[name].stage === "experimental" ? `${GAITS[name].label} (experimental)` : GAITS[name].label]);

/** A rule part of Move: a gait it chooses, and what is wrong with a config of it. */
const rule = <C extends MoveRuleConfig>(label: string, defaults: C, fields: readonly PartField<C>[], faults: (config: C) => readonly string[] = () => []): Part<C> =>
  ({ role: "move-rule", label, stage: "game", fields: [...fields, choice<C, "gait">("gait", "Gait", GAIT_CHOICES)], slots: [], defaults, fits: () => true,
    faults: (config) => [...faults(config), ...isGait(config.gait) ? [] : [`no gait called ${JSON.stringify(config.gait)}`]] });

type DistanceRuleConfig = Extract<MoveRuleConfig, { kind: "when-distance" }>;
/** Shared condition fields retain the movement rule's selected gait when edited. */
const withGait = <C>(fields: readonly PartField<C>[]): readonly PartField<C & { readonly gait: GaitName }>[] => fields.map(field => ({ ...field,
  write(config: C & { readonly gait: GaitName }, value: string) {
    const updated = field.write(config, value);
    return updated ? { ...config, ...updated } : null;
  } }));

/** **Every rule of Move, by its kind** (`Part`): what Move's rule list holds. */
export const MOVE_RULE_PARTS: { readonly [K in MoveRuleConfig["kind"]]: Part<Extract<MoveRuleConfig, { kind: K }>> } = deepFreeze({
  "when-standing": rule<Extract<MoveRuleConfig, { kind: "when-standing" }>>("While standing", { kind: "when-standing", gait: "braced" }, withGait(CONDITIONS["when-standing"].fields)),
  "when-distance": rule<DistanceRuleConfig>("While a distance", { kind: "when-distance", of: "foe", than: "under", metres: 5, gait: "braced" }, withGait(CONDITIONS["when-distance"].fields),
    (config) => Number.isFinite(config.metres) && config.metres > 0 ? [] : ["a rule's distance must be finite and positive"]),
});

/**
 * **Every skill, by its kind** (`Part`): what a fighter's skill slots hold, each its role's. The
 * path strike, the kick and low support are the opening tactics' research, and the driven and
 * whole-body strikes the punch's, offered beside the game's.
 */
export const SKILL_PARTS: { readonly [K in SkillConfig["kind"]]: Part<Extract<SkillConfig, { kind: K }>> } = deepFreeze({
  "stance-walk": {
    ...skill<StanceWalkConfig>("locomotion", "Walk in the stance", "game", { kind: "stance-walk" }, (config) => [
      ...(validTurnLimit(config.tuning?.turnLimit) ? [] : ["locomotion turn limit must be finite and positive"]),
      ...(validTurnStartup(config.tuning?.turnStartup) ? [] : ["invalid combat turn startup settings"]),
    ]),
    tuning: ["turnLimit", "turnStartup"],
  },
  "stride": {
    ...skill<StrideConfig>("locomotion", "Stride", "experimental", { kind: "stride", ...STRIDE },
      (config) => validStride(config) ? [] : ["a stride needs every setting finite and positive, its double support not negative"]),
  },
  "run": {
    ...skill<RunConfig>("locomotion", "Run", "experimental", { kind: "run", ...RUN },
      (config) => validRun(config) ? [] : ["a run needs every setting finite and positive, its gain not negative"]),
  },
  "simbicon": {
    ...skill<SimbiconConfig>("locomotion", "SIMBICON walk", "game", { kind: "simbicon", ...SIMBICON },
      (config) => [
        ...validSimbicon(settingsOf(config)) ? [] : ["a SIMBICON gait needs every setting finite, its times, turn, swerve, turn's change, speed-up, run and leg positive, and its shares of strength within (0, 1]"],
        ...validWays(simbiconWays(config.tuning)) ? [] : ["a SIMBICON gait's side and back give only the settings a way changes, each finite"],
        ...validRunCycle(runCycleSettings(config.tuning?.run)) ? [] : ["a SIMBICON gait's run gives only the run's settings, each finite, its times and the cycle's positive and its shares of strength within (0, 1]"],
      ]),
    tuning: ["side", "back", "run"],
  },
  "walk-run": {
    ...skill<WalkRunConfig>("locomotion", "Walk and run", "game", { kind: "walk-run", ...WALK_RUN },
      (config) => [
        ...validWalkRun(walkRunOf(config)) ? [] : ["a walk and run needs every setting finite, its run, turns and leg positive, timed to its haste to the power 0, 1/2 or 1"],
        ...validRunCycle(runCycleSettings(config.tuning?.run, WALK_RUN_CYCLE)) ? [] : ["a walk and run's run gives only the run's settings, each finite, its times and the cycle's positive and its shares of strength within (0, 1]"],
      ]),
    tuning: ["run"],
  },
  "learned-run": {
    ...skill<LearnedRunConfig>("locomotion", "Walk and learned run", "experimental", { kind: "learned-run", ...WALK_RUN, hasted: RUN_POLICIES["all-bodies"]!.hasted, policy: "all-bodies" },
      (config) => [
        ...validWalkRun(learnedRunOf(config)) ? [] : ["a walk and learned run needs every setting finite, its run, turns and leg positive, timed to its haste to the power 0, 1/2 or 1"],
        ...validRunCycle(runCycleSettings(config.tuning?.run, WALK_RUN_CYCLE)) ? [] : ["a walk and learned run's run gives only the run's settings, each finite, its times and the cycle's positive and its shares of strength within (0, 1]"],
        ...config.policy === null || Object.hasOwn(RUN_POLICIES, config.policy) ? [] : [`a learned run has no policy called ${JSON.stringify(config.policy)}`],
      ]),
    tuning: ["run"],
  },
  "move": {
    ...skill<MoveConfig>("locomotion", "Move", "game", MOVE, (config) => isGait(config.otherwise) ? [] : [`move: no gait called ${JSON.stringify(config.otherwise)}`]),
    fields: [choice<MoveConfig, "otherwise">("otherwise", "Otherwise", GAIT_CHOICES)],
    slots: [slotList("rules", "When", "move-rule")],
  },
  "cover-guard": { ...skill("guard", "Guard and cover", "game", { kind: "cover-guard" }), tuning: ["covering", "hold"] },
  "support-fold": skill("support", "Fight from low support", "experimental", { kind: "support-fold" }),
});

/** Cross-part references are checked before any motion state is constructed. */
export function fighterFaults(config: FighterConfig): readonly string[] {
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
  if (config.tactics.kind === "behaviours" && config.tactics.choose.kind === "rules") {
    const choose = config.tactics.choose;
    for (const name of [...choose.otherwise, ...choose.rules.flatMap(rule => rule.actions)]) if (!names.has(name)) faults.push(`selector: no action ${name}`);
  }
  return faults;
}

/** The gaits `config` walks by, each once, in the order its rules and then `otherwise` name them. */
const gaitsOf = (config: MoveConfig): readonly GaitName[] => [...new Set([...config.rules.map((r) => r.gait), config.otherwise])];

/** The rule `config` makes, choosing the `gait`th of its Move's gaits. */
function moveRule(config: MoveRuleConfig, gait: number): MoveRule {
  switch (config.kind) {
    case "when-standing": return standingRule(gait);
    case "when-distance": return distanceRule(gait, config.of, config.than, config.metres);
    default: { const never: never = config; throw new Error(`no rule of kind ${JSON.stringify((never as { kind?: unknown }).kind)}`); }
  }
}

/** Whether legs of `config` may run (`Locomotion.runs`), undefined for legs that are not told. */
function runsOf(config: LocomotionConfig): boolean | undefined {
  switch (config.kind) {
    case "simbicon": case "walk-run": case "learned-run": return config.runs ?? true;
    case "stance-walk": case "stride": case "run": case "move": return undefined;
    default: { const never: never = config; throw new Error(`no locomotion of kind ${JSON.stringify((never as { kind?: unknown }).kind)}`); }
  }
}

/** The legs' skill of `config` for `body`. */
function legsOf(body: Body, config: LocomotionConfig): Locomotion {
  switch (config.kind) {
    case "stance-walk": return locomotion(body.envelope, config.tuning?.turnLimit, config.tuning?.turnStartup);
    case "stride": { const { kind: _, ...settings } = config; return stride(body, settings); }
    case "run": { const { kind: _, ...settings } = config; return run(body, settings); }
    case "simbicon": return simbicon(body, settingsOf(config), simbiconWays(config.tuning), runCycleSettings(config.tuning?.run), config.runs ?? true);
    case "walk-run": return walkRun(body, walkRunOf(config), runCycleSettings(config.tuning?.run, WALK_RUN_CYCLE), config.runs ?? true);
    case "learned-run": return learnedRun(body, config.policy === null ? null : RUN_POLICIES[config.policy]!, learnedRunOf(config), runCycleSettings(config.tuning?.run, WALK_RUN_CYCLE), config.runs ?? true);
    case "move": {
      const names = gaitsOf(config), built = new Map<string, Locomotion>();
      // Gaits whose legs differ only in whether they may run share one walk (`MoveGait`).
      const gaits = names.map((name): MoveGait => {
        const legs: LocomotionConfig = GAITS[name].legs, runs = runsOf(legs);
        const key = JSON.stringify(runs === undefined ? legs : { ...legs, runs: undefined });
        if (!built.has(key)) built.set(key, legsOf(body, legs));
        return { legs: built.get(key)!, ...(runs === undefined ? {} : { runs }) };
      });
      return move(gaits, config.rules.map((r) => moveRule(r, names.indexOf(r.gait))), names.indexOf(config.otherwise));
    }
    default: { const never: never = config; throw new Error(`no locomotion of kind ${JSON.stringify((never as { kind?: unknown }).kind)}`); }
  }
}

/** All action instances share the fighter's physical feedback and body-local ledger. */
export function fighterBody(config: FighterConfig, wiring: MindWiring): BodyOptions {
  return { servoSeconds: SERVO_SECONDS, senses: wiring.senses, assist: wiring.assist,
    feedback: true, contactIdentity: wiring.contactIdentity, subs: subMindsOf(config.subs) };
}

/** Named executors are built once; behaviours select actions without rebuilding motion state. */
export function driveFighter(body: Body, world: World, config: FighterConfig, wiring: MindWiring, around: (tactics: Tactics) => Tactics = tactics => tactics): Skills {
  const faults = actionConfigFaults(body.built.spec, config.executors, config.actions);
  if (faults.length) throw new Error(faults.join("; "));
  const tactics = tacticsOf(config.tactics, body.built.spec, wiring.name, config.actions,
    sight => wiring.orders(sight.view.senses), wiring.script, configuredActionEstimates(body.built.spec, config.executors, config.actions));
  let skills: Skills;
  skills = driveBy(body, around(tactics), (made, driving) => fighterSkills(made, world, config, driving, () => skills?.report.ledger ?? []));
  return skills;
}

/** The skills `config` names for `made`, under `driving`: its legs, guard, low support and executors, its actions read through `ledger`. */
export function fighterSkills(made: Body, world: World, config: FighterConfig, driving: Pick<Tactics, "state" | "engagement">, ledger: () => readonly Ended[]): Skills {
  return skillSet(made, driving, {
    legs: legsOf(made, config.locomotion), guard: guardSkill(made.built.spec, config.guard.tuning?.covering),
    support: config.support ? supportFold(made) : null, hold: config.guard.tuning?.hold === true ? holdUp(made.built) : null,
    executors: configuredExecutors(made, world, config.executors, config.actions, ledger),
    actions: config.actions,
  });
}

/** **A fighter**: its body and sub-minds (`fighterBody`), driven by its tactics over its skills (`driveFighter`). */
export function createFighter(built: BuiltBody, world: World, config: FighterConfig, wiring: MindWiring) {
  const body = createBody(built, world, fighterBody(config, wiring));
  const skills = driveFighter(body, world, config, wiring);
  return { kind: "fighter" as const, body, skills, state: skills.state };
}
