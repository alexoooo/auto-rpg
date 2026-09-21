/** Experimental legal-Intent controllers. No world/body handles enter this module. */
import type { Mind } from "../mind.ts";
import { originalMind as policyMind } from "./lab-baselines.ts";
import { aimAt, canAttack, distance, reachForDistance, writeAim } from "./tactics.ts";

/** Independent off-hand thrust clock; the original Duelist continues driving feet and main hand.
 * Paired-grip weapons keep the original executor, because those hands form one mechanism. */
export function pairedMind(seed: number): Mind {
  const base = policyMind("golem-duelist", seed);
  let elapsed = 0, active = false, cooldown = 0.35 + (seed % 7) * 0.04;
  const aim = { swing: 0, lift: 0, horizontal: 0 };
  return { name: "lab-paired", decide(view, dt) {
    const intent = structuredClone(base.decide(view, dt));
    const caps = view.self.capabilities;
    if (!caps || caps.pairedHands || view.self.hands.primary.lost || view.self.hands.secondary.lost
      || !canAttack(caps.effectors.primary) || !canAttack(caps.effectors.secondary)) return intent;
    const me = view.self.hands.secondary, cap = caps.effectors.secondary;
    const mark = { x: view.opponent.ground.x, y: view.opponent.ground.y + view.opponent.vitalHeight,
      z: view.opponent.ground.z };
    cooldown -= dt;
    // Avoid replacing a secondary stroke already chosen by the main executor.
    if (!active && cooldown <= 0 && intent.actingHand !== "secondary" && distance(me.shoulder, mark) < me.reach * 1.05) {
      active = true; elapsed = 0;
    }
    if (!active) return intent;
    elapsed += dt;
    const target = aimAt(me.shoulder, mark, view.self.facing + view.self.trunkTwist * caps.trunkTwistMax, me.outboard, aim);
    const extending = elapsed >= 0.16 && elapsed < 0.36;
    const reach = reachForDistance(distance(me.shoulder, mark), me.reach, cap, 0);
    writeAim(intent.secondary, cap, target, me.outboard, 0, 0, 0,
      extending ? reach : -0.65);
    intent.secondary.thrust = extending;
    intent.secondary.guard = false;
    intent.secondary.roll = 0;
    intent.secondary.wristBend = 0;
    if (elapsed >= 0.58) { active = false; cooldown = 0.25; }
    return intent;
  } };
}

/** Within-bout bandit over distinct original strategies. All histories advance continuously.
 * Only observed vitality changes are credited; never reads opponent identity or future state. */
export function adaptiveMind(seed: number): Mind {
  const names = ["golem-duelist", "golem-form", "golem-guardian", "golem-brawler"];
  const minds = names.map((name, i) => policyMind(name, seed + i));
  const counts = names.map(() => 0), values = names.map(() => 0);
  let chosen = 0, next = 4, initial: number | null = null, rounds = 0;
  return { name: "lab-adaptive", decide(view, dt) {
    const advantage = view.self.vitality - view.opponent.vitality;
    if (initial === null) initial = advantage;
    if (view.clock >= next) {
      counts[chosen]++; rounds++;
      values[chosen] += (advantage - initial - values[chosen]) / counts[chosen];
      const unexplored = counts.indexOf(0);
      chosen = unexplored >= 0 ? unexplored : values.reduce((best, value, i) =>
        value + 0.15 * Math.sqrt(Math.log(rounds + 1) / counts[i]) >
        values[best] + 0.15 * Math.sqrt(Math.log(rounds + 1) / counts[best]) ? i : best, 0);
      initial = advantage; next = view.clock + 4;
    }
    const commands = minds.map((mind) => mind.decide(view, dt));
    return commands[chosen];
  } };
}

export const MIXTURE_MEMBERS = ["golem-duelist", "golem-form", "golem-guardian", "golem-brawler"] as const;
export interface MixtureSpec { kind: "mixture"; weights: number[][]; seconds: number }
export function mixtureMind(spec: MixtureSpec, seed: number): Mind {
  if (spec.weights.length !== MIXTURE_MEMBERS.length || spec.weights.some((r) => r.length !== 8 || r.some((x) => !Number.isFinite(x)))
    || !Number.isFinite(spec.seconds) || spec.seconds < 0.25 || spec.seconds > 8) throw new Error("invalid mixture policy");
  const minds = MIXTURE_MEMBERS.map((name, i) => policyMind(name, seed + i));
  let selected = 0, next = 0;
  return { name: "lab-mixture", decide(view, dt) {
    if (view.clock >= next) {
      const features = [1, view.measure / 4, view.self.vitality, view.opponent.vitality,
        (view.self.reach - view.opponent.reach) / 3, view.opponent.tipSpeed / 30,
        view.self.hands.secondary.lost ? 1 : 0, view.clock / 150];
      const scores = spec.weights.map((w) => w.reduce((s, x, i) => s + x * features[i], 0));
      selected = scores.indexOf(Math.max(...scores)); next = view.clock + spec.seconds;
    }
    return minds.map((mind) => mind.decide(view, dt))[selected];
  } };
}
