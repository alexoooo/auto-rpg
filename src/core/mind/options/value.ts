import { impactEnergy } from "../../rules/impact.ts";
import { blowDamage, rulebook } from "../../rules/rulebook.ts";
import { landed } from "../../skills/action-instances.ts";
import type { Ended } from "../../skills/action.ts";
import type { BodySpec, Side } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";
import type { Situation } from "./option.ts";

/**
 * **What running an option from now is expected to bring**, over its run, in life (a share of a
 * body's full life, the verdict's unit) where it is a payoff: how long it runs, s; the focus's life
 * its blows take; its own life the blows it takes take; its progress on the orders, a metre walked
 * as ordered (`ORDERED`); and the chance it ends with the body down, which costs what a fall costs
 * (the `downCost` percept).
 */
export interface Terms {
  readonly duration: number;
  readonly dealt: number;
  readonly taken: number;
  readonly orders: number;
  readonly fall: number;
}

/**
 * **How far a person's orders are carried out through blows coming**, a player's choice and the
 * one weight of an option's worth: what a metre walked as ordered is worth, in life, at each level,
 * by its value and name: as much as a blow on the Warrior (6 hit points of 100 J) of 10 J (its own
 * judgement), 45 J (steady: orders obeyed past a one-two at hand and a weak blow coming, not into
 * a heavy one) and 200 J (orders first). Without orders it changes nothing.
 */
export const OBEDIENCE: readonly (readonly [value: string, name: string, orders: number])[] = deepFreeze([
  ["own", "Own judgement", 1 / 60], ["steady", "Steady", .075], ["orders", "Orders first", 1 / 3]]);

/** The steady level's worth of a metre walked as ordered, life: the valued chooser's own. */
export const STEADY = OBEDIENCE[1]![2];

/** The time beyond an option's run over which its terms are spread (`worth`), s: an option's worth is a rate, but a short run does not magnify a cost it cannot avoid. */
const HORIZON = 1;

/**
 * **An option's worth**, life a second: the focus's life it takes less its own it loses, a fall's
 * chance at what a fall costs (`downCost`, life), its progress on the orders at `obedience` (life a
 * metre), over a second of its run and `HORIZON`.
 */
export const worth = (terms: Terms, obedience: number, downCost: number): number =>
  (terms.dealt - terms.taken + obedience * terms.orders - downCost * terms.fall) / (terms.duration + HORIZON);

/** The rules a fight is played by, whose arithmetic prices a blow (`blowDamage`). */
const RULES = rulebook("arena");

/** **The life a blunt blow of `energy` J takes from `struck`**: its damage by the rules (`blowDamage`) over its full hit points. */
export const lifeOf = (energy: number, struck: BodySpec): number => blowDamage(RULES, "blunt", energy) / struck.wounds.hp.value;

/** How fast a hand closes on a head in a blow not under way to measure, m/s. */
const BLOW_SPEED = 5;

/** Each spec's striking masses, found once: a spec is immutable. */
const arms = new WeakMap<BodySpec, Readonly<Record<Side, number>>>();

/** The mass a hand of `spec` strikes with, kg: its arm's segments, from its effector's base out, and what the hand holds. */
function strikingMass(spec: BodySpec, hand: Side): number {
  let masses = arms.get(spec);
  if (!masses) {
    const of = (side: Side): number => {
      const effector = spec.effectors?.find((e) => e.segment === `hand.${side}`);
      if (!effector) return 0;
      let total = 0;
      for (let at: string | undefined = effector.segment; at !== undefined && at !== effector.base; at = spec.joints.find((joint) => joint.child === at)?.parent) {
        const name = at;
        total += spec.segments.find((segment) => segment.name === name)?.mass.value ?? 0;
        for (const item of spec.held ?? []) if (item.segment === name) total += item.item.mass.value;
      }
      return total;
    };
    arms.set(spec, masses = { left: of("left"), right: of("right") });
  }
  return masses[hand];
}

/** The head's mass of `spec`, kg: the segment its high mark names. */
const headMass = (spec: BodySpec): number => spec.segments.find((segment) => segment.name === spec.marks.high)?.mass.value ?? spec.mass.value;

/** The energy of a blow of `hand` of `striker` on `struck`'s head, J: as the rules price an impact (`impactEnergy`), closing at `closing` m/s. */
export function blowEnergy(striker: BodySpec, hand: Side, struck: BodySpec, closing = BLOW_SPEED): number {
  const mass = strikingMass(striker, hand);
  return mass > 0 ? impactEnergy(mass, headMass(struck), closing) : 0;
}

/** What an action is taken to do before its body has a record of it: land this share of its blows, each running this long, s; worth `weight` records. */
const PRIOR = Object.freeze({ lands: .3, seconds: .6, weight: 3 });

/**
 * What a body's own record says of an action of its, or of every action with none named, from its
 * ledger: the share of its committed blows that landed, and how long one ran, s; each with its
 * prior (`PRIOR`), so that the first blows move it and none leaves it the prior.
 */
export function record(ledger: readonly Ended[], action: string | null): { readonly lands: number; readonly seconds: number } {
  let committed = 0, hits = 0, seconds = 0;
  for (const ended of ledger) {
    if (action !== null && ended.action !== action || !ended.committed) continue;
    committed += 1; seconds += ended.ended - ended.began;
    if (landed(ended)) hits += 1;
  }
  return { lands: (hits + PRIOR.lands * PRIOR.weight) / (committed + PRIOR.weight), seconds: (seconds + PRIOR.seconds * PRIOR.weight) / (committed + PRIOR.weight) };
}

/** The focus's life dealt to a foe the orders name that counts as a metre on them: a 30 J blow on the Warrior. */
const ORDERED = .05;

/** The progress on the orders of taking `dealt` of the focus's life: some only where the orders name it. */
export const orderedDealt = (now: Situation, dealt: number): number => now.orders?.foe !== undefined && now.orders.foe === now.focus?.id ? dealt / ORDERED : 0;

/** A clinch: a standing focus within `within` m, centre to centre, where a body goes down `falls` times a second. */
export const CLINCH = deepFreeze({ within: .65, falls: .2 });

/** The chance of going down in `seconds` s of a clinch, if the body is in one. */
export const clinched = (now: Situation, seconds: number): number => now.focus && !now.focus.down && now.apart < CLINCH.within ? Math.min(1, CLINCH.falls * seconds) : 0;
