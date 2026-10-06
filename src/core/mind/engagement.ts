import { targetWindow } from "../control/target-window.ts";
import { cos, hypot, sin } from "../math/real.ts";
import { APPROACH, PLACED } from "../skills/strike.ts";
import { wrap } from "../skills/locomotion.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { PointFighterConfig } from "./config.ts";
import { fighterTactics, STRAFE } from "./fighter.ts";
import { GUARD_ACTION, type HandAction } from "./intent.ts";
import { STAND_ORDERS, type Orders } from "./orders.ts";
import type { Sight, Tactics } from "./tactics.ts";

/** Point placement and entry hysteresis, engineering settings in `docs/reference/arena-engagement.md#tracked-settings`. */
export const ENGAGEMENT = Object.freeze({ spacing: APPROACH.reach / 2, entry: APPROACH.reach / 2 });

/** Range-aware intentions over the existing skills; explicit orders override autonomous pursuit. */
export function trackedEngagement(name: string, orders: (sight: Sight) => Orders | null, mode: PointFighterConfig["hand"]): Tactics {
  const ordered = fighterTactics(name, sight => orders(sight) ?? STAND_ORDERS);
  const state = { phase: "guard", foe: null as string | null, hand: "right" as "left" | "right",
    aim: null as Vec3 | null, cycle: 0, engaging: false, ordered: ordered.state! };
  const guard = { left: GUARD_ACTION, right: GUARD_ACTION };
  return { name, state, engagement: state, decide(sight, dt) {
    const { view, report, envelope } = sight, strike = report.strike;
    const cycles = strike.pointCycle ? strike.pointCycle.returned.left + strike.pointCycle.returned.right
      + strike.pointCycle.failed + strike.pointCycle.interrupted : strike.thrown.left + strike.thrown.right;
    if (view.resumed || cycles !== state.cycle) { state.aim = null; state.engaging = false; state.cycle = cycles; }
    if (strike.hand) state.hand = strike.hand;
    else switch (mode) {
      case "left": case "right": state.hand = mode; break;
      case "alternate": state.hand = cycles % 2 === 0 ? "right" : "left"; break;
      default: { const never: never = mode; throw new Error(`unknown attack hand ${never}`); }
    }
    const given = orders(sight);
    if (given !== null) {
      state.foe = null; state.aim = null; state.engaging = false;
      const intent = ordered.decide(sight, dt);
      state.phase = strike.phase ?? (given.move ? "approach" : "guard");
      if (!given.attack) return intent;
      const attack: HandAction = { kind: "attack", target: given.attack };
      return { ...intent, hands: state.hand === "left" ? { left: attack, right: GUARD_ACTION } : { left: GUARD_ACTION, right: attack } };
    }
    let foe = view.senses.others.find(o => o.id === state.foe && o.side !== view.senses.side && !o.out);
    if (!foe) {
      let nearest = Infinity;
      for (const other of view.senses.others) if (other.side !== view.senses.side && !other.out) {
        const d = hypot(other.centre.x - view.head.x, other.centre.z - view.head.z);
        if (d < nearest) { nearest = d; foe = other; }
      }
      state.foe = foe?.id ?? null; state.aim = null; state.engaging = false;
    }
    if (!foe || view.senses.out || view.down) {
      state.phase = "guard"; state.aim = null; state.engaging = false;
      return { move: null, face: report.heading, hands: guard };
    }
    const part = foe.segments.get("head"), at = part?.centre ?? foe.centre, velocity = part?.velocity ?? foe.velocity;
    const horizon = strike.phase === "swing" ? Math.max(0, PLACED.seconds - strike.since)
      : strike.phase === "chamber" ? PLACED.seconds : 0;
    const speed = hypot(velocity.x, velocity.y, velocity.z), scale = speed > 0 ? Math.min(horizon, APPROACH.reach / speed) : 0;
    const target: Vec3 = [at.x + velocity.x * scale, at.y + velocity.y * scale, at.z + velocity.z * scale];
    const range = strike.rangeAt(state.hand, target[1] - view.head.y);
    const geometry = targetWindow([view.head.x, view.head.y, view.head.z], report.heading, target, range, APPROACH.reach);
    const committed = strike.phase === "chamber" || strike.phase === "swing" || strike.phase === "return";
    if (committed || (state.engaging && geometry.inside)) {
      state.phase = strike.phase ?? "attack";
      if (committed || !state.aim || hypot(target[0] - state.aim[0], target[1] - state.aim[1], target[2] - state.aim[2]) > ENGAGEMENT.entry) state.aim = target;
      const attack: HandAction = { kind: "attack", target: state.aim! };
      return { move: null, face: report.heading, hands: state.hand === "left" ? { left: attack, right: GUARD_ACTION } : { left: GUARD_ACTION, right: attack } };
    }
    const delta = geometry.distance - range.reach, turn = wrap(geometry.bearing - report.heading);
    if (Math.abs(delta) <= ENGAGEMENT.entry && Math.abs(turn) <= STRAFE.turned) {
      state.engaging = true; state.aim = target; state.phase = "attack";
      const attack: HandAction = { kind: "attack", target };
      return { move: null, face: report.heading, hands: state.hand === "left" ? { left: attack, right: GUARD_ACTION } : { left: GUARD_ACTION, right: attack } };
    }
    state.engaging = false; state.aim = null;
    const pace = Math.min(envelope?.walk.value ?? APPROACH.pace, APPROACH.pace);
    const speedTo = Math.max(-pace * STRAFE.share, Math.min(pace, delta / APPROACH.seconds));
    state.phase = delta < -ENGAGEMENT.entry ? "retreat" : Math.abs(turn) > STRAFE.turned ? "align" : "approach";
    // A zero-speed walking goal still asks locomotion to turn within its measured envelope.
    return { move: [speedTo * cos(turn), speedTo * sin(turn)], face: geometry.bearing, hands: guard };
  } };
}
