import { commandable, createBody, SERVO_SECONDS, type Body, type BodyOptions } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { skillSet, type SkillParts } from "../skills/arbiter.ts";
import { ATTACK_PATH, validAttackTuning, type AttackTuning } from "../skills/attack-path.ts";
import { chooseSkill } from "../skills/choose.ts";
import { DRIVEN_STRIKE, pathStrike, validCombatExecution, validDrivenStrike } from "../skills/combat.ts";
import { guardPosture, guardSkill } from "../skills/guard.ts";
import { kickSkill, validKickTuning } from "../skills/kick.ts";
import { locomotion, validTurnLimit, validTurnStartup, type Locomotion } from "../skills/locomotion.ts";
import { noBlow } from "../skills/no-blow.ts";
import type { BlowSkill } from "../skills/skill.ts";
import type { Skills } from "../skills/skills.ts";
import { recipeStrike } from "../skills/strike.ts";
import { STRAIGHT_PUNCH, straightPunch, straightPunchFits, validStraightPunch } from "../skills/straight-punch.ts";
import { STRIDE, stride, validStride } from "../skills/stride.ts";
import { RUN, run, validRun } from "../skills/run.ts";
import { SIMBICON, simbicon, simbiconRun, simbiconWays, validSimbicon, validSimbiconRun, validWays, type SimbiconSettings } from "../skills/simbicon.ts";
import { GAIT_NAMES, GAITS, type GaitName } from "../skills/gaits.ts";
import { distanceRule, move, standingRule, type MoveGait, type MoveRule } from "../skills/move.ts";
import { supportFold } from "../skills/support-fold.ts";
import { wholeBodyFits, wholeBodyStrike } from "../skills/whole-body-strike.ts";
import { deepFreeze } from "../state.ts";
import type { World } from "../world.ts";
import { ARENA_KICKS, MOVE, type BehaviourConfig, type BlowConfig, type ChooseBlowConfig, type DrivenStrikeConfig, type FighterConfig, type FrontKickConfig, type PathStrikeConfig, type SkillConfig, type StanceWalkConfig, type StrideConfig, type RunConfig, type SimbiconConfig, type MoveConfig, type MoveRuleConfig, type LocomotionConfig,
  type StraightPunchConfig, type WholeBodyStrikeConfig } from "./config.ts";
import { choice, number, toggle, type PartField } from "./fields.ts";
import type { MindWiring } from "./minds.ts";
import { slotList, type Part } from "./parts.ts";
import { subMindsOf } from "./sub-minds.ts";
import { tacticsOf } from "./tactics-of.ts";
import { driveBy, type Abilities, type Tactics } from "./tactics.ts";
import { aimedOrders, highMark } from "./targets.ts";

/** A skill part of no settings: its role, what it is called, its stage, its config and what is wrong with one. */
const skill = <C extends SkillConfig>(role: Part["role"], label: string, stage: Part["stage"], defaults: C, faults: (config: C) => readonly string[] = () => []): Part<C> =>
  ({ role, label, stage, fields: [], slots: [], defaults, fits: commandable, faults });

/**
 * The hand paths a blow of `config` carries out: the path strike's over `ATTACK_PATH`, the driven
 * strike's with its wind-up, turn and speed, a choice's first option's, or `ATTACK_PATH` for a blow
 * of none.
 */
function pathsOf(config: BlowConfig): AttackTuning {
  switch (config.kind) {
    case "recipe-strike": case "whole-body-strike": case "straight-punch": return ATTACK_PATH;
    case "path-strike": return { ...ATTACK_PATH, ...config.tuning?.paths };
    case "driven-strike": return { ...ATTACK_PATH, ...config.tuning?.paths, windup: config.windup, torso: config.torso, contactSpeed: config.contact };
    case "choose-blow": return config.options[0] ? pathsOf(config.options[0]) : ATTACK_PATH;
    default: { const never: never = config; throw new Error(`no blow of kind ${JSON.stringify((never as { kind?: unknown }).kind)}`); }
  }
}

/**
 * The driven strike's settings. Their bounds are a numeric setting, the most a panel offers: what a
 * strike can do with them is `validDrivenStrike`'s.
 */
const DRIVEN_FIELDS: readonly PartField<DrivenStrikeConfig>[] = Object.freeze([
  number<DrivenStrikeConfig, "drive">("drive", "Trunk drive", 0, 1, 0.05, "of full"),
  number<DrivenStrikeConfig, "torso">("torso", "Trunk turn", 0, 0.6, 0.01, "rad"),
  number<DrivenStrikeConfig, "windup">("windup", "Wind-up", 0, 0.4, 0.01, "m"),
  number<DrivenStrikeConfig, "contact">("contact", "Contact speed", 1, 12, 0.5, "m/s"),
]);

/** A SIMBICON walk's config's settings, its kind taken off. */
const settingsOf = ({ kind: _, tuning: __, runs: ___, ...settings }: SimbiconConfig): SimbiconSettings => settings;

/** Whether `name` is a gait's (`GAITS`): a config read from a save or a link may name any. */
const isGait = (name: string): name is GaitName => Object.hasOwn(GAITS, name);

/** The gaits as a choice offers them. */
const GAIT_CHOICES = GAIT_NAMES.map((name): [GaitName, string] => [name, GAITS[name].stage === "experimental" ? `${GAITS[name].label} (experimental)` : GAITS[name].label]);

/** A rule part of Move: a gait it chooses, and what is wrong with a config of it. */
const rule = <C extends MoveRuleConfig>(label: string, defaults: C, fields: readonly PartField<C>[], faults: (config: C) => readonly string[] = () => []): Part<C> =>
  ({ role: "move-rule", label, stage: "game", fields: [...fields, choice<C, "gait">("gait", "Gait", GAIT_CHOICES)], slots: [], defaults, fits: () => true,
    faults: (config) => [...faults(config), ...isGait(config.gait) ? [] : [`no gait called ${JSON.stringify(config.gait)}`]] });

/** **Every rule of Move, by its kind** (`Part`): what Move's rule list holds. */
export const MOVE_RULE_PARTS: { readonly [K in MoveRuleConfig["kind"]]: Part<Extract<MoveRuleConfig, { kind: K }>> } = deepFreeze({
  "when-standing": rule<Extract<MoveRuleConfig, { kind: "when-standing" }>>("While standing", { kind: "when-standing", gait: "braced" }, []),
  "when-distance": rule<Extract<MoveRuleConfig, { kind: "when-distance" }>>("While a distance", { kind: "when-distance", of: "foe", than: "under", metres: 5, gait: "braced" }, [
    choice("of", "From", [["foe", "The nearest foe"], ["destination", "The destination"]]),
    choice("than", "Is", [["under", "Under"], ["over", "Over"]]),
    number("metres", "Metres", 0.5, 50, 0.5, "m"),
  ], (config) => Number.isFinite(config.metres) && config.metres > 0 ? [] : ["a rule's distance must be finite and positive"]),
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
    ...skill<StrideConfig>("locomotion", "Walk and run", "experimental", { kind: "stride", ...STRIDE },
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
        ...validSimbiconRun(simbiconRun(config.tuning?.run)) ? [] : ["a SIMBICON gait's run gives only the run's settings, each finite, its times positive and its shares of strength within (0, 1]"],
      ]),
    tuning: ["side", "back", "run"],
  },
  "move": {
    ...skill<MoveConfig>("locomotion", "Move", "game", MOVE, (config) => isGait(config.otherwise) ? [] : [`move: no gait called ${JSON.stringify(config.otherwise)}`]),
    fields: [choice<MoveConfig, "otherwise">("otherwise", "Otherwise", GAIT_CHOICES)],
    slots: [slotList("rules", "When", "move-rule")],
  },
  "cover-guard": { ...skill("guard", "Guard and cover", "game", { kind: "cover-guard" }), tuning: ["covering"] },
  "recipe-strike": { ...skill("blow", "Recipe strike", "game", { kind: "recipe-strike" }), tuning: ["repertoire", "placed", "steer"] },
  "path-strike": {
    ...skill<PathStrikeConfig>("blow", "Path strike", "experimental", { kind: "path-strike", overlap: false }, (config) => [
      ...(validAttackTuning(pathsOf(config)) ? [] : ["combat path settings need finite nonnegative values, positive durations and elbowExtension in [0,1]"]),
      ...(!config.tuning?.execution || validCombatExecution(config.tuning.execution) ? [] : ["invalid combat execution settings"]),
    ]),
    fields: [toggle("overlap", "Overlap returns")],
    tuning: ["paths", "execution"],
  },
  "driven-strike": {
    ...skill<DrivenStrikeConfig>("blow", "Driven strike", "experimental", { kind: "driven-strike", ...DRIVEN_STRIKE }, (config) => [
      ...(validDrivenStrike(config) ? [] : ["a driven strike needs a drive in [0,1], a turn and a wind-up not negative, and a positive contact speed"]),
      ...(validAttackTuning(pathsOf(config)) ? [] : ["combat path settings need finite nonnegative values, positive durations and elbowExtension in [0,1]"]),
      ...(!config.tuning?.execution || validCombatExecution(config.tuning.execution) ? [] : ["invalid combat execution settings"]),
    ]),
    fields: DRIVEN_FIELDS,
    tuning: ["paths", "execution"],
  },
  "whole-body-strike": {
    ...skill<WholeBodyStrikeConfig>("blow", "Whole-body strike", "experimental", { kind: "whole-body-strike", drive: "timed" }),
    fits: (spec) => commandable(spec) && wholeBodyFits(spec),
    fields: [choice("drive", "Drive", [["timed", "On a timed path"], ["flat-out", "Flat out along the line"]])],
  },
  "straight-punch": {
    ...skill<StraightPunchConfig>("blow", "Straight punch", "game", { kind: "straight-punch", ...STRAIGHT_PUNCH },
      (config) => validStraightPunch(config) ? [] : ["a straight punch needs every setting finite and not negative, and a pace, reach, band and drive's length above zero"]),
    fits: (spec) => commandable(spec) && straightPunchFits(spec),
  },
  "choose-blow": {
    ...skill<ChooseBlowConfig>("blow", "Choose a blow", "experimental", { kind: "choose-blow", options: [{ kind: "recipe-strike" }], policy: "first-able" },
      (config) => config.options.length > 0 ? [] : ["a choice needs a blow to choose"]),
    fields: [choice("policy", "Choose by", [["first-able", "The first that can"], ["rotate", "Each in turn"], ["scored", "The one that lands"]])],
    slots: [slotList("options", "Among", "blow")],
  },
  "front-kick": {
    ...skill<FrontKickConfig>("kick", "Front kick", "experimental", { kind: "front-kick" },
      (config) => validKickTuning({ ...ARENA_KICKS, ...config.tuning }) ? [] : ["invalid kick settings"]),
    tuning: Object.keys(ARENA_KICKS),
  },
  "support-fold": skill("support", "Fight from low support", "experimental", { kind: "support-fold" }),
});

/**
 * Whether a locomotion of `config` ever drives the legs itself (`Locomotion.drive`): low support
 * steps from the stance, which such a walk leaves, and is not offered beside it. A kick waits for
 * such a walk to give the legs back (`skillSet`).
 */
export function drivesLegs(config: LocomotionConfig): boolean {
  switch (config.kind) {
    case "stance-walk": case "stride": case "run": return false;
    case "simbicon": return true;
    case "move": return gaitsOf(config).some((name) => isGait(name) && drivesLegs(GAITS[name].legs));
    default: { const never: never = config; throw new Error(`no locomotion of kind ${JSON.stringify((never as { kind?: unknown }).kind)}`); }
  }
}

/**
 * The blow, kick and low support of a fighter of `config`: its slots', or, under behaviours, the
 * first strike's blow and the first kick's kick; no low support beside a walk that drives the legs
 * (`drivesLegs`).
 */
function fighterSkills(config: FighterConfig): Pick<FighterConfig, "blow" | "kick" | "support"> {
  const tactics = config.tactics, driving = drivesLegs(config.locomotion);
  if (tactics.kind !== "behaviours") return driving ? { blow: config.blow, kick: config.kick, support: null } : config;
  const strike = tactics.list.find((behaviour): behaviour is Extract<BehaviourConfig, { kind: "strike" }> => behaviour.kind === "strike");
  const kick = tactics.list.find((behaviour): behaviour is Extract<BehaviourConfig, { kind: "kick" }> => behaviour.kind === "kick");
  return { blow: strike?.blow ?? null, kick: kick?.kick ?? null, support: null };
}

/** What the skills of `config` can do, as its tactics plan by it; a fighter of no blow plans no path. */
function abilitiesOf(config: Pick<FighterConfig, "blow" | "kick" | "support">): Abilities {
  return deepFreeze({ paths: config.blow ? pathsOf(config.blow) : ATTACK_PATH, kick: config.kick ? { ...ARENA_KICKS, ...config.kick.tuning } : null, ground: config.support !== null });
}

/** Whether a blow of `config` may throw one with no path, as tactics that name none ask: the recipe strike, or a choice with an option that may. */
function throwsPathless(config: BlowConfig): boolean {
  switch (config.kind) {
    case "recipe-strike": case "whole-body-strike": case "straight-punch": return true;
    case "path-strike": case "driven-strike": return false;
    case "choose-blow": return config.options.some(throwsPathless);
    default: { const never: never = config; throw new Error(`no blow of kind ${JSON.stringify((never as { kind?: unknown }).kind)}`); }
  }
}

/** Whether every blow of `config` may begin while the other hand returns: the overlapping path strike, or a choice of nothing else. */
function overlaps(config: BlowConfig): boolean {
  switch (config.kind) {
    case "recipe-strike": case "driven-strike": case "whole-body-strike": case "straight-punch": return false;
    case "path-strike": return config.overlap;
    case "choose-blow": return config.options.length > 0 && config.options.every(overlaps);
    default: { const never: never = config; throw new Error(`no blow of kind ${JSON.stringify((never as { kind?: unknown }).kind)}`); }
  }
}

/**
 * Whether a blow of `config` reads its hand's contacts: the path strikes' impacts do, the
 * whole-body strike drives on past its touch, and a choice counts what landed by them (`chooseSkill`).
 */
function blowReadsContact(config: BlowConfig): boolean {
  switch (config.kind) {
    case "recipe-strike": return false;
    case "path-strike": case "driven-strike": case "whole-body-strike": case "straight-punch": case "choose-blow": return true;
    default: { const never: never = config; throw new Error(`no blow of kind ${JSON.stringify((never as { kind?: unknown }).kind)}`); }
  }
}

/**
 * **What is wrong with a fighter of `config`** across its slots, each a sentence prefixed with the
 * slot it is found at: a skill its tactics never ask of, or a blow that cannot carry out what
 * they ask. Each part answers for itself (`treeFaults`).
 */
export function fighterFaults(config: FighterConfig): readonly string[] {
  const faults: string[] = [], tactics = config.tactics;
  const blow = config.blow;
  const alike = (configs: readonly object[]) => configs.every((one) => JSON.stringify(one) === JSON.stringify(configs[0]));
  const neverKick = () => {
    if (config.kick) faults.push("kick: these tactics never kick");
    if (config.support) faults.push("support: these tactics never fight from low support");
  };
  if (drivesLegs(config.locomotion) && config.support) faults.push("support: a walk that drives the legs leaves no stance to fold");
  switch (tactics.kind) {
    case "seek":
    case "script":
      if (!blow) faults.push("blow: these tactics throw blows, and the fighter has none");
      else if (!throwsPathless(blow)) faults.push("blow: the path strike carries out a blow only along a path, and these tactics name none");
      neverKick();
      break;
    case "stand":
      neverKick();
      break;
    case "openings":
      if (!blow) faults.push("blow: these tactics throw blows, and the fighter has none");
      else if (tactics.combinations === "overlap" && !overlaps(blow))
        faults.push("blow: overlapping combinations need a blow that may begin while the other hand returns");
      break;
    case "behaviours": {
      const strikes = tactics.list.flatMap((behaviour) => behaviour.kind === "strike" ? [behaviour.blow] : []);
      const kicks = tactics.list.flatMap((behaviour) => behaviour.kind === "kick" ? [behaviour.kick] : []);
      if (!alike(strikes)) faults.push("tactics: a body has one blow, and these strikes name different ones");
      if (!alike(kicks)) faults.push("tactics: a body has one kick, and these kicks name different ones");
      if (strikes[0] && !throwsPathless(strikes[0])) faults.push("tactics: a strike names no path, and the path strike carries out a blow only along one");
      break;
    }
    default: { const never: never = tactics; throw new Error(`no tactics of kind ${JSON.stringify((never as { kind?: unknown }).kind)}`); }
  }
  return faults;
}

/** Whether a fighter of `config` reads its hands' contacts (`BodyOptions.feedback`): the opening tactics do, and some blows (`blowReadsContact`). */
function readsContact(config: FighterConfig): boolean {
  const blow = fighterSkills(config).blow;
  return config.tactics.kind === "openings" || (blow !== null && blowReadsContact(blow));
}

/**
 * **The blow `config` names**, for `body` in `world`: a path strike carries out its own paths,
 * which the tactics plan by where it is the first blow (`abilitiesOf`).
 */
export function blowOf(body: Body, world: World, config: BlowConfig): BlowSkill {
  switch (config.kind) {
    case "recipe-strike": {
      const spec = body.built.spec, tuning = config.tuning;
      return recipeStrike(spec, tuning?.repertoire, tuning?.placed, tuning?.steer, guardPosture(spec));
    }
    case "path-strike": {
      const execution = config.tuning?.execution;
      return pathStrike(body, { paths: pathsOf(config), ...(execution ? { execution } : {}), overlap: config.overlap });
    }
    case "driven-strike": {
      const execution = config.tuning?.execution, { drive, torso, windup, contact } = config;
      return pathStrike(body, { paths: { ...ATTACK_PATH, ...config.tuning?.paths }, ...(execution ? { execution } : {}), driven: { drive, torso, windup, contact } });
    }
    case "whole-body-strike": return wholeBodyStrike(body, world, config.drive);
    case "straight-punch": { const { kind: _, ...settings } = config; return straightPunch(body, settings); }
    case "choose-blow": return chooseSkill(config.options.map((option) => blowOf(body, world, option)), config.policy);
    default: { const never: never = config; throw new Error(`no blow of kind ${JSON.stringify((never as { kind?: unknown }).kind)}`); }
  }
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

/** The legs' skill of `config` for `body`. */
function legsOf(body: Body, config: LocomotionConfig): Locomotion {
  switch (config.kind) {
    case "stance-walk": return locomotion(body.envelope, config.tuning?.turnLimit, config.tuning?.turnStartup);
    case "stride": { const { kind: _, ...settings } = config; return stride(body, settings); }
    case "run": { const { kind: _, ...settings } = config; return run(body, settings); }
    case "simbicon": return simbicon(body, settingsOf(config), simbiconWays(config.tuning), simbiconRun(config.tuning?.run), config.runs ?? true);
    case "move": {
      const names = gaitsOf(config), built = new Map<string, Locomotion>();
      // Gaits whose legs differ only in whether they may run share one walk (`MoveGait`).
      const gaits = names.map((name): MoveGait => {
        const legs: LocomotionConfig = GAITS[name].legs, runs = legs.kind === "simbicon" ? legs.runs ?? true : undefined;
        const key = JSON.stringify(legs.kind === "simbicon" ? { ...legs, runs: undefined } : legs);
        if (!built.has(key)) built.set(key, legsOf(body, legs));
        return { legs: built.get(key)!, ...(runs === undefined ? {} : { runs }) };
      });
      return move(gaits, config.rules.map((r) => moveRule(r, names.indexOf(r.gait))), names.indexOf(config.otherwise));
    }
    default: { const never: never = config; throw new Error(`no locomotion of kind ${JSON.stringify((never as { kind?: unknown }).kind)}`); }
  }
}

/** The skills of a fighter of `config`, for `body` in `world`: one a slot, an empty slot a skill it has not (`noBlow` for the blow). */
function skillPartsOf(body: Body, world: World, config: FighterConfig, abilities: Abilities): SkillParts {
  const { blow, support } = fighterSkills(config);
  return {
    legs: legsOf(body, config.locomotion), guard: guardSkill(body.built.spec, config.guard.tuning?.covering),
    blow: blow ? blowOf(body, world, blow) : noBlow(body.built.spec),
    kick: abilities.kick ? kickSkill(body, abilities.kick) : null, support: support ? supportFold(body) : null,
  };
}

/** What a fighter of `config` asks of the body it is made with (`createBody`): its senses, its assist, its hands' contacts where it reads them, and its sub-minds. */
export function fighterBody(config: FighterConfig, wiring: MindWiring): BodyOptions {
  return { servoSeconds: SERVO_SECONDS, senses: wiring.senses, assist: wiring.assist,
    ...(readsContact(config) ? { feedback: true, contactIdentity: wiring.contactIdentity } : {}), subs: subMindsOf(config.subs) };
}

/**
 * `body` in `world` under a fighter of `config`: its tactics, planning by what its skills can do,
 * handing their intent to its skills (`skillSet`). What the screen makes of the tactics (`around`:
 * the Lab's log, its barred hands and its instrument) decides in their place.
 */
export function driveFighter(body: Body, world: World, config: FighterConfig, wiring: MindWiring, around: (tactics: Tactics) => Tactics = (tactics) => tactics): Skills {
  const abilities = abilitiesOf(fighterSkills(config));
  const tactics = tacticsOf(config.tactics, body.built.spec, wiring.name, abilities,
    (sight) => aimedOrders(wiring.orders(sight.view.senses), sight.view.senses, highMark), wiring.script);
  return driveBy(body, around(tactics), (made, driving) => skillSet(made, driving, skillPartsOf(made, world, config, abilities)));
}

/** **A fighter**: its body and sub-minds (`fighterBody`), driven by its tactics over its skills (`driveFighter`). */
export function createFighter(built: BuiltBody, world: World, config: FighterConfig, wiring: MindWiring) {
  const body = createBody(built, world, fighterBody(config, wiring));
  const skills = driveFighter(body, world, config, wiring);
  return { kind: "fighter" as const, body, skills, state: skills.state };
}
