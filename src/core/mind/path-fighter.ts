import type { Sight } from "./tactics.ts";
import { validKickTuning, type KickTuning } from "../skills/kick.ts";
import { createBody, SERVO_SECONDS } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { ATTACK_PATH, validAttackTuning, type AttackTuning } from "../skills/attack-path.ts";
import { combatSkills, validCombatExecution, type CombatExecution } from "../skills/combat.ts";
import { deepFreeze } from "../state.ts";
import type { World } from "../world.ts";
import { pathTactics } from "./path-tactics.ts";
import { ARENA_KICKS, BODY_OPENINGS, type PathFighterConfig } from "./config.ts";
import type { MindWiring } from "./minds.ts";
import { subMindsOf } from "./sub-minds.ts";
import { validRangeLearning } from "./range-learning.ts";
import { validTurnLimit, validTurnStartup, type TurnStartup } from "../skills/locomotion.ts";
import { validOpeningTuning, type OpeningTuning } from "./openings.ts";
import { driveBy } from "./tactics.ts";

/** **A path fighter's settings, merged once** from its config: what its tactics and its skills both read. */
export interface ResolvedPath {
  readonly paths: AttackTuning;
  readonly openings: OpeningTuning | undefined;
  /** Its kick, or null for a fighter that does not kick. */
  readonly kick: KickTuning | null;
  readonly execution: CombatExecution | undefined;
  readonly turnLimit: number | undefined;
  readonly turnStartup: TurnStartup | undefined;
}

/** What `config` sets, each setting over its default: the paths over `ATTACK_PATH`, the openings over `prefers`', the kick over `ARENA_KICKS`. */
export function resolvePath(config: PathFighterConfig): ResolvedPath {
  const tuning = config.tuning ?? {};
  return deepFreeze({
    paths: { ...ATTACK_PATH, ...tuning.paths },
    openings: config.prefers === "body" ? { ...BODY_OPENINGS, ...tuning.openings } : tuning.openings,
    kick: config.kicks ? { ...ARENA_KICKS, ...tuning.kick } : null,
    execution: tuning.execution, turnLimit: tuning.turnLimit, turnStartup: tuning.turnStartup,
  });
}

/** What is wrong with `config`, each a sentence; none for a config a path fighter can be made of. */
export function pathFaults(config: PathFighterConfig): readonly string[] {
  const tuning = config.tuning ?? {}, resolved = resolvePath(config), faults: string[] = [];
  if (config.combinations !== "none" && config.hands !== "alternate") faults.push("combat combinations require alternate hands");
  if (tuning.kick && !config.kicks) faults.push("kick settings need a fighter that kicks");
  if (resolved.kick && !validKickTuning(resolved.kick)) faults.push("invalid kick settings");
  if (resolved.execution && !validCombatExecution(resolved.execution)) faults.push("invalid combat execution settings");
  if (!validTurnLimit(resolved.turnLimit)) faults.push("locomotion turn limit must be finite and positive");
  if (!validTurnStartup(resolved.turnStartup)) faults.push("invalid combat turn startup settings");
  if (!validRangeLearning(config.spacing, config.spacingStep)) faults.push("invalid combat range learning settings");
  if (!validAttackTuning(resolved.paths)) faults.push("combat path settings need finite nonnegative values, positive durations and elbowExtension in [0,1]");
  if (!validOpeningTuning(resolved.openings ?? {})) faults.push("opening preferences must be finite and headLateral must be in [0,1]");
  return faults;
}

/** Combat selection and execution share the ordinary physical body and recovery contract. */
export function createPathFighter(built: BuiltBody, world: World, config: PathFighterConfig, wiring: MindWiring) {
  const resolved = resolvePath(config);
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS, senses: wiring.senses, assist: wiring.assist, feedback: true, contactIdentity: wiring.contactIdentity,
    subs: subMindsOf(config.subs) });
  const tactics = pathTactics(built.spec, wiring.name, config, resolved, (sight: Sight) => wiring.orders(sight.view.senses));
  const skills = driveBy(body, tactics, (made, { state, engagement }) => combatSkills(made, resolved.paths, state ?? null, engagement,
    config.ground, resolved.turnLimit, resolved.turnStartup, config.combinations === "overlap", resolved.execution, resolved.kick ?? undefined));
  return { kind: "path-fighter" as const, body, skills, state: skills.state };
}
