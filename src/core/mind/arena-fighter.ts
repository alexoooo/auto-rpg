import { createBody, SERVO_SECONDS } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { ATTACK_PATH, validAttackTuning } from "../skills/attack-path.ts";
import { validCombatExecution } from "../skills/combat.ts";
import type { World } from "../world.ts";
import { combatTactics } from "./combat.ts";
import type { ArenaFighterConfig } from "./config.ts";
import type { createMind } from "./minds.ts";
import { supportRecovery } from "./rise/support-recovery.ts";
import { validRangeLearning } from "./range-learning.ts";
import { validTurnLimit, validTurnStartup } from "../skills/locomotion.ts";
import { validOpeningTuning } from "./openings.ts";
import { driveBy } from "./tactics.ts";

/** Combat selection and execution share the ordinary physical body and recovery contract. */
export function arenaFighter(built: BuiltBody, world: World, config: ArenaFighterConfig, wiring: Parameters<typeof createMind>[3]) {
  if (config.execution && !validCombatExecution(config.execution)) throw new Error("invalid combat execution settings");
  if (!validTurnLimit(config.turnLimit)) throw new Error("locomotion turn limit must be finite and positive");
  if (!validTurnStartup(config.turnStartup)) throw new Error("invalid combat turn startup settings");
  if (!validRangeLearning(config.spacing, config.spacingStep)) throw new Error("invalid combat range learning settings");
  const paths = { ...ATTACK_PATH, ...config.paths };
  if (!validAttackTuning(paths))
    throw new Error("combat path settings need finite nonnegative values, positive durations and elbowExtension in [0,1]");
  if (config.spacing !== undefined && !Number.isFinite(config.spacing)) throw new Error("combat spacing must be finite");
  if (!validOpeningTuning(config.openings ?? {})) throw new Error("opening preferences must be finite and headLateral must be in [0,1]");
  if (config.combinations && (config.hand !== "alternate" || config.targeting !== "openings"))
    throw new Error("combat combinations require alternate hands and opening selection");
  if (config.overlap && !config.combinations) throw new Error("overlapping combat requires bounded combinations");
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS, senses: wiring.senses, assist: wiring.assist, handFeedback: true, contactIdentity: wiring.contactIdentity,
    subs: [(own, view) => supportRecovery(own, view, world)] });
  const tactics = combatTactics(built.spec, wiring.name, sight => wiring.orders(sight.view.senses), config);
  const skills = driveBy(body, tactics, { combat: paths, combatExecution: config.execution, lowCombat: config.groundGame === true, turnLimit: config.turnLimit, turnStartup: config.turnStartup, combatOverlap: config.overlap });
  return { kind: "arena-fighter" as const, body, skills, state: skills.state };
}
