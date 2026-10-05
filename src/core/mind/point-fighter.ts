import { createBody, SERVO_SECONDS } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { GUARD_COVER } from "../skills/guard.ts";
import type { World } from "../world.ts";
import type { PointFighterConfig } from "./config.ts";
import { fighterTactics, seekFoe } from "./fighter.ts";
import { GUARD_ACTION } from "./intent.ts";
import type { createMind } from "./minds.ts";
import { supportRecovery } from "./rise/support-recovery.ts";
import { driveBy } from "./tactics.ts";
import { THREAT, threatOf } from "./threat.ts";

/** Point-space attacks and predicted covers over the common body; settings: `docs/reference/arena-point-control.md`. */
export function pointFighter(built: BuiltBody, world: World, config: PointFighterConfig, wiring: Parameters<typeof createMind>[3]) {
  const handMode = config.hand;
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS, senses: wiring.senses, assist: wiring.assist,
    subs: [(own, view) => supportRecovery(own, view, world)] });
  const tactics = fighterTactics(wiring.name, (sight) => wiring.orders(sight.view.senses) ?? seekFoe(sight));
  const skills = driveBy(body, { ...tactics, decide(sight, dt) {
    const intent = tactics.decide(sight, dt), attack = intent.hands.right;
    const cover = threatOf(sight.view, THREAT, { out: GUARD_COVER.out, horizon: THREAT.within / THREAT.closing });
    const guard = cover ? { kind: "guard" as const, cover } : GUARD_ACTION;
    if (attack.kind !== "attack") return { ...intent, hands: { left: guard, right: guard } };
    let hand: "left" | "right";
    switch (handMode) {
      case "left": case "right": hand = handMode; break;
      case "alternate": hand = sight.report.strike.hand
        ?? ((sight.report.strike.thrown.left + sight.report.strike.thrown.right) % 2 === 0 ? "right" : "left"); break;
      default: { const never: never = handMode; throw new Error(`unknown attack hand ${never}`); }
    }
    return { ...intent, hands: hand === "right" ? { left: guard, right: attack } : { left: attack, right: guard } };
  } }, { repertoire: [], pointMotion: true });
  return { kind: "point-fighter" as const, body, skills, state: skills.state };
}
