import { createBody, SERVO_SECONDS } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { ATTACK_PATH } from "../skills/attack-path.ts";
import type { World } from "../world.ts";
import { combatTactics } from "./combat.ts";
import type { ArenaFighterConfig } from "./config.ts";
import type { createMind } from "./minds.ts";
import { supportRecovery } from "./rise/support-recovery.ts";
import { driveBy } from "./tactics.ts";

/** Combat selection and execution share the ordinary physical body and recovery contract. */
export function arenaFighter(built: BuiltBody, world: World, config: ArenaFighterConfig, wiring: Parameters<typeof createMind>[3]) {
  const paths = { ...ATTACK_PATH, ...config.paths };
  if (Object.values(paths).some(v => !Number.isFinite(v) || v < 0)
    || [paths.chamberSeconds, paths.swingSeconds, paths.hookSeconds, paths.returnSeconds, paths.prepareLimit, paths.returnLimit, paths.hold].some(v => v === 0))
    throw new Error("combat path settings need finite nonnegative values and positive durations");
  if (config.spacing !== undefined && !Number.isFinite(config.spacing)) throw new Error("combat spacing must be finite");
  if (Object.values(config.openings??{}).some(v=>!Number.isFinite(v))) throw new Error("opening preferences must be finite");
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS, senses: wiring.senses, assist: wiring.assist, handFeedback: true, contactIdentity: wiring.contactIdentity,
    subs: [(own, view) => supportRecovery(own, view, world)] });
  const tactics = combatTactics(built.spec, wiring.name, sight => wiring.orders(sight.view.senses), config);
  const skills = driveBy(body, tactics, { combat: paths });
  return { kind: "arena-fighter" as const, body, skills, state: skills.state };
}
