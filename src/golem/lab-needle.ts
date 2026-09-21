/** Experimental head-thrust specialist. Legal public observations and Intent only. */
import type { Mind } from "../mind.ts";
import { hasPoint } from "../hands.ts";
import { originalMind } from "./lab-baselines.ts";
import { aimAt, canAttack, distance, reachForDistance, writeAim } from "./tactics.ts";

export function needleMind(seed: number): Mind {
  const base = originalMind("golem-duelist", seed);
  const aim = { swing: 0, lift: 0, horizontal: 0 };
  let active = false, elapsed = 0, cooldown = 0.12 + (seed % 7) * 0.03;
  return { name: "lab-needle", decide(view, dt) {
    const intent = structuredClone(base.decide(view, dt));
    const caps = view.self.capabilities, me = view.self.hands.primary;
    if (!caps || caps.pairedHands || me.lost || !canAttack(caps.effectors.primary)
      || (!hasPoint(me.weapon) && me.weapon !== "empty")) {
      active = false; elapsed = 0;
      return intent;
    }
    // The head center is approximated from published body dimensions, never private meshes.
    const mark = { x: view.opponent.ground.x,
      y: view.opponent.ground.y + 0.9 * view.opponent.crownHeight,
      z: view.opponent.ground.z };
    cooldown -= dt;
    if (!active && cooldown <= 0 && distance(me.shoulder, mark) < me.reach * 1.05) {
      active = true; elapsed = 0;
    }
    if (!active) return intent;
    elapsed += dt;
    const cap = caps.effectors.primary;
    const target = aimAt(me.shoulder, mark, view.self.facing + view.self.trunkTwist * caps.trunkTwistMax,
      me.outboard, aim);
    const extending = elapsed >= 0.22 && elapsed < 0.34;
    const fraction = Math.max(0, Math.min(1, (elapsed - 0.22) / 0.12));
    const reach = reachForDistance(distance(me.shoulder, mark), me.reach, cap, 0);
    writeAim(intent.primary, cap, target, me.outboard, 0, 0, 0,
      extending ? -0.8 + fraction * (reach + 0.8) : -0.8);
    intent.primary.thrust = extending;
    intent.primary.guard = false;
    intent.primary.roll = 0;
    intent.primary.wristBend = 0;
    intent.actingHand = "primary";
    if (elapsed >= 0.64) { active = false; cooldown = 0.15; }
    return intent;
  } };
}
