import { commandable, createBody, SERVO_SECONDS, type Body } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { skillSet, type SkillParts } from "../skills/arbiter.ts";
import { ATTACK_PATH, validAttackTuning, type AttackTuning } from "../skills/attack-path.ts";
import { pathStrike, validCombatExecution } from "../skills/combat.ts";
import { guardPosture, guardSkill } from "../skills/guard.ts";
import { kickSkill, validKickTuning } from "../skills/kick.ts";
import { locomotion, validTurnLimit, validTurnStartup } from "../skills/locomotion.ts";
import type { BlowSkill } from "../skills/skill.ts";
import { recipeStrike } from "../skills/strike.ts";
import { supportFold } from "../skills/support-fold.ts";
import { deepFreeze } from "../state.ts";
import type { World } from "../world.ts";
import { ARENA_KICKS, type BlowConfig, type FighterConfig, type FrontKickConfig, type PathStrikeConfig, type SkillConfig, type StanceWalkConfig } from "./config.ts";
import { toggle } from "./fields.ts";
import type { MindWiring } from "./minds.ts";
import type { Part } from "./parts.ts";
import { subMindsOf } from "./sub-minds.ts";
import { tacticsOf } from "./tactics-of.ts";
import { driveBy, type Abilities } from "./tactics.ts";
import { aimedOrders, highMark } from "./targets.ts";

/** A skill part of no settings: its role, what it is called, its stage, its config and what is wrong with one. */
const skill = <C extends SkillConfig>(role: Part["role"], label: string, stage: Part["stage"], defaults: C, faults: (config: C) => readonly string[] = () => []): Part<C> =>
  ({ role, label, stage, fields: [], slots: [], defaults, fits: commandable, faults });

/** The hand paths a blow of `config` carries out: the path strike's over `ATTACK_PATH`, or `ATTACK_PATH` for a blow of none. */
function pathsOf(config: BlowConfig): AttackTuning {
  switch (config.kind) {
    case "recipe-strike": return ATTACK_PATH;
    case "path-strike": return { ...ATTACK_PATH, ...config.tuning?.paths };
    default: { const never: never = config; throw new Error(`no blow of kind ${JSON.stringify((never as { kind?: unknown }).kind)}`); }
  }
}

/**
 * **Every skill, by its kind** (`Part`): what a fighter's skill slots hold, each its role's. The
 * path strike, the kick and low support are the opening tactics' research, offered beside the
 * game's.
 */
export const SKILL_PARTS: { readonly [K in SkillConfig["kind"]]: Part<Extract<SkillConfig, { kind: K }>> } = deepFreeze({
  "stance-walk": skill<StanceWalkConfig>("locomotion", "Walk in the stance", "game", { kind: "stance-walk" }, (config) => [
    ...(validTurnLimit(config.tuning?.turnLimit) ? [] : ["locomotion turn limit must be finite and positive"]),
    ...(validTurnStartup(config.tuning?.turnStartup) ? [] : ["invalid combat turn startup settings"]),
  ]),
  "cover-guard": skill("guard", "Guard and cover", "game", { kind: "cover-guard" }),
  "recipe-strike": skill("blow", "Recipe strike", "game", { kind: "recipe-strike" }),
  "path-strike": {
    ...skill<PathStrikeConfig>("blow", "Path strike", "experimental", { kind: "path-strike", overlap: false }, (config) => [
      ...(validAttackTuning(pathsOf(config)) ? [] : ["combat path settings need finite nonnegative values, positive durations and elbowExtension in [0,1]"]),
      ...(!config.tuning?.execution || validCombatExecution(config.tuning.execution) ? [] : ["invalid combat execution settings"]),
    ]),
    fields: [toggle("overlap", "Overlap returns")],
  },
  "front-kick": skill<FrontKickConfig>("kick", "Front kick", "experimental", { kind: "front-kick" },
    (config) => validKickTuning({ ...ARENA_KICKS, ...config.tuning }) ? [] : ["invalid kick settings"]),
  "support-fold": skill("support", "Fight from low support", "experimental", { kind: "support-fold" }),
});

/** What the skills of `config` can do, as its tactics plan by it. */
function abilitiesOf(config: FighterConfig): Abilities {
  return deepFreeze({ paths: pathsOf(config.blow), kick: config.kick ? { ...ARENA_KICKS, ...config.kick.tuning } : null, ground: config.support !== null });
}

/**
 * **What is wrong with a fighter of `config`** across its slots, each a sentence prefixed with the
 * slot it is found at: a skill its tactics never ask of, or a blow that cannot carry out what
 * they ask. Each part answers for itself (`treeFaults`).
 */
export function fighterFaults(config: FighterConfig): readonly string[] {
  const faults: string[] = [], tactics = config.tactics;
  switch (tactics.kind) {
    case "seek":
      if (config.blow.kind === "path-strike") faults.push("blow: the path strike carries out a blow only along a path, and these tactics name none");
      if (config.kick) faults.push("kick: these tactics never kick");
      if (config.support) faults.push("support: these tactics never fight from low support");
      break;
    case "openings":
      if (tactics.combinations === "overlap" && !(config.blow.kind === "path-strike" && config.blow.overlap))
        faults.push("blow: overlapping combinations need a blow that may begin while the other hand returns");
      break;
    default: { const never: never = tactics; throw new Error(`no tactics of kind ${JSON.stringify((never as { kind?: unknown }).kind)}`); }
  }
  return faults;
}

/** Whether a fighter of `config` reads its hands' contacts: the opening tactics and the path strike do (`BodyOptions.feedback`). */
function readsContact(config: FighterConfig): boolean {
  return config.tactics.kind === "openings" || config.blow.kind === "path-strike";
}

/** The blow `config` names, for `body`, carrying out the paths its tactics plan by (`abilities`). */
function blowOf(body: Body, config: BlowConfig, abilities: Abilities): BlowSkill {
  switch (config.kind) {
    case "recipe-strike": {
      const spec = body.built.spec, tuning = config.tuning;
      return recipeStrike(spec, tuning?.repertoire, tuning?.placed, tuning?.steer, guardPosture(spec));
    }
    case "path-strike": {
      const execution = config.tuning?.execution;
      return pathStrike(body, { paths: abilities.paths, ...(execution ? { execution } : {}), overlap: config.overlap });
    }
    default: { const never: never = config; throw new Error(`no blow of kind ${JSON.stringify((never as { kind?: unknown }).kind)}`); }
  }
}

/** The skills of a fighter of `config`, for `body`: one a slot, an empty slot a skill it has not. */
function skillPartsOf(body: Body, config: FighterConfig, abilities: Abilities): SkillParts {
  const walk = config.locomotion.tuning;
  return {
    legs: locomotion(body.envelope, walk?.turnLimit, walk?.turnStartup), guard: guardSkill(body.built.spec, config.guard.tuning?.covering),
    blow: blowOf(body, config.blow, abilities),
    kick: abilities.kick ? kickSkill(body, abilities.kick) : null, support: config.support ? supportFold(body) : null,
  };
}

/** **A fighter**: its tactics, planning by what its skills can do, handing their intent to its skills (`skillSet`), over its body and sub-minds. */
export function createFighter(built: BuiltBody, world: World, config: FighterConfig, wiring: MindWiring) {
  const abilities = abilitiesOf(config);
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS, senses: wiring.senses, assist: wiring.assist,
    ...(readsContact(config) ? { feedback: true, contactIdentity: wiring.contactIdentity } : {}), subs: subMindsOf(config.subs) });
  const tactics = tacticsOf(config.tactics, built.spec, wiring.name, abilities, (sight) => aimedOrders(wiring.orders(sight.view.senses), sight.view.senses, highMark));
  const skills = driveBy(body, tactics, (made, driving) => skillSet(made, driving, skillPartsOf(made, config, abilities)));
  return { kind: "fighter" as const, body, skills, state: skills.state };
}
