import { atan2, cos, hypot, sin } from "../math/real.ts";
import { ATTACK_PATH } from "../skills/attack-path.ts";
import { wrap } from "../skills/locomotion.ts";
import { placedReach } from "../skills/strike.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { ArenaFighterConfig } from "./config.ts";
import { fighterTactics, STRAFE } from "./fighter.ts";
import { GUARD_ACTION, type CombatAction, type Intent } from "./intent.ts";
import { STAND_ORDERS, type Orders } from "./orders.ts";
import type { Sight, Tactics } from "./tactics.ts";
import { THREAT, threatOf } from "./threat.ts";

/** Search cells for braking, chamber room and escape: `docs/reference/combat-strikes.md#tactical-settings`. */
const COMBAT = Object.freeze({ band: .08, reserve: .08, braking: .5, prediction: .12, pressure: .6,
  escape: .6, lateral: .2, settle: .08, readySpeed: .35 });

/** Tactical selection uses detached sensed bodies; the common skill owns physical execution. */
export function combatTactics(spec: BodySpec, name: string, orders: (sight: Sight) => Orders | null, config: ArenaFighterConfig): Tactics {
  const ordered = fighterTactics(name, sight => orders(sight) ?? STAND_ORDERS);
  const state = { phase: "guard", foe: null as string | null, action: null as CombatAction | null,
    pressure: 0, escape: 0, angle: 1, cycle: 0, ready: 0, ordered: ordered.state! };
  const guard = { left: GUARD_ACTION, right: GUARD_ACTION };
  return { name, state, engagement: state, decide(sight, dt): Intent {
    const { view, report, envelope } = sight, strike = report.strike;
    if (view.resumed) { state.action = null; state.escape = 0; state.pressure = 0; state.ready = 0; }
    const cycles = strike.thrown.left + strike.thrown.right + (strike.pointCycle?.failed ?? 0);
    if (!strike.hand && cycles !== state.cycle) { state.cycle = cycles; state.action = null; state.ready = 0; }
    let hand: "left" | "right";
    switch (config.hand) {
      case "left": case "right": hand = config.hand; break;
      case "alternate": hand = cycles % 2 === 0 ? "right" : "left"; break;
      default: { const never: never = config.hand; throw new Error(`unknown combat hand ${never}`); }
    }
    const given = orders(sight);
    if (given) {
      state.action = null; state.foe = null; state.pressure = 0; state.escape = 0; state.ready = 0;
      const intent = ordered.decide(sight, dt);
      state.phase = given.attack ? strike.phase ?? "attack" : given.move ? "approach" : "guard";
      return { ...intent, hands: guard, combat: given.attack ? { hand, target: given.attack, family: "straight" } : null };
    }
    const foe = view.senses.others.filter(o => o.side !== view.senses.side && !o.out)
      .reduce<typeof view.senses.others[number] | null>((near, o) => !near || hypot(o.centre.x - view.head.x, o.centre.z - view.head.z)
        < hypot(near.centre.x - view.head.x, near.centre.z - view.head.z) ? o : near, null);
    if (!foe || view.down || view.senses.out) {
      state.action = null; state.phase = "guard";
      return { move: null, face: report.heading, hands: guard, combat: null };
    }
    state.foe = foe.id;
    const part = foe.segments.get("head"), at = part?.centre ?? foe.centre, velocity = part?.velocity ?? foe.velocity;
    const target: Vec3 = [at.x + COMBAT.prediction * velocity.x, at.y + COMBAT.prediction * velocity.y, at.z + COMBAT.prediction * velocity.z];
    const dx = target[0] - view.head.x, dz = target[2] - view.head.z, far = hypot(dx, dz), face = atan2(dx, dz);
    const turn = wrap(face - report.heading), aligned = Math.abs(wrap(face - view.stance.facing)) < STRAFE.turned;
    const radius = foe.spec.segments.find(s => s.name === "head")?.shape;
    const skin = radius?.kind === "sphere" || radius?.kind === "capsule" ? radius.radius.value : 0;
    const distance = Math.max(0, placedReach(spec, hand, target[1] - view.head.y) - COMBAT.reserve + skin + (config.spacing ?? 0));
    const toward = far > 0 ? ((view.stance.velocity.x - velocity.x) * dx + (view.stance.velocity.z - velocity.z) * dz) / far : 0;
    const delta = far - distance, anticipated = delta - Math.max(0, toward) * COMBAT.braking;
    const maximum = envelope?.walk.value ?? COMBAT.lateral;
    const touching = (view.handFeedback?.left.impulse ?? 0) + (view.handFeedback?.right.impulse ?? 0) > 0;
    state.pressure = touching && strike.phase !== "swing" ? state.pressure + dt : 0;
    if (!strike.hand && (state.pressure >= COMBAT.pressure || delta < -COMBAT.band)) {
      state.escape = COMBAT.escape; state.angle *= -1; state.pressure = 0; state.ready = 0;
    }
    let hands = guard;
    if (config.defense !== false) {
      const cover = threatOf(view, THREAT, { out: .3, horizon: .3 });
      if (cover) hands = { left: { kind: "guard", cover }, right: { kind: "guard", cover } };
    }
    if (strike.hand) {
      state.phase = strike.phase ?? "return";
      // Committed paths retain the observed aim; preparation and return keep locomotion available.
      const speed = anticipated < -COMBAT.band ? -maximum * STRAFE.share : 0;
      return { move: strike.phase === "swing" ? null : [speed * cos(turn), speed * sin(turn)], face,
        hands, combat: state.action };
    }
    if (state.escape > 0) {
      state.escape -= dt; state.action = null; state.phase = "escape";
      const forward = -maximum * STRAFE.share, lateral = maximum * STRAFE.share * state.angle;
      return { move: [forward * cos(turn) - lateral * sin(turn), forward * sin(turn) + lateral * cos(turn)], face, hands, combat: null };
    }
    if (Math.abs(delta) <= COMBAT.band && aligned && view.stance.velocity.length() <= COMBAT.readySpeed) state.ready += dt;
    else state.ready = 0;
    if (state.ready >= COMBAT.settle && view.time >= ATTACK_PATH.startup) {
      state.phase = "attack"; state.action = { hand, target, family: cycles % 2 === 0 ? "straight" : "cross" };
      return { move: null, face, hands, combat: state.action };
    }
    const speed = Math.max(-maximum * STRAFE.share, Math.min(maximum, anticipated / COMBAT.braking));
    state.phase = Math.abs(turn) > STRAFE.turned ? "align" : delta < -COMBAT.band ? "escape" : "approach";
    return { move: [speed * cos(turn), speed * sin(turn)], face, hands, combat: null };
  } };
}
