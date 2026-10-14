import { impactEnergy } from "../../rules/impact.ts";
import { landed } from "../../skills/action-instances.ts";
import type { Ended } from "../../skills/action.ts";
import type { BodySpec, Side } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";
import type { Situation } from "./option.ts";

/**
 * **What running an option from now is expected to bring**, over its run: how long it runs, s;
 * the energy its blows put into the focus, J; the cost of the blows it takes (`cost`); its
 * progress on the orders (`ORDERED`); and the chance it ends with the body down.
 */
export interface Terms {
  readonly duration: number;
  readonly dealt: number;
  readonly taken: number;
  readonly orders: number;
  readonly fall: number;
}

/** What each term is worth (`worth`): a joule dealt, a unit of cost taken, a unit of progress on orders, a fall. */
export interface Weights {
  readonly dealt: number;
  readonly taken: number;
  readonly orders: number;
  readonly fall: number;
}

/**
 * The options fighter's weights: a blow taken weighs as a blow dealt; a metre walked as ordered
 * weighs as 30 J dealt, so that orders are obeyed past a weak blow and not into a heavy one; a
 * fall as a 55 J blow taken.
 */
export const WEIGHTS: Weights = deepFreeze({ dealt: 1, taken: 1, orders: 30, fall: 100 });

/** The terms of every weight, in the order a config's faults name them. */
export const TERMS: readonly (keyof Weights)[] = Object.freeze(["dealt", "taken", "orders", "fall"]);

/** The time beyond an option's run over which its terms are spread (`worth`), s: an option's worth is a rate, but a short run does not magnify a cost it cannot avoid. */
const HORIZON = 1;

/** An option's worth: its weighted terms, a second of its run and `HORIZON`. */
export const worth = (terms: Terms, weights: Weights): number =>
  (weights.dealt * terms.dealt - weights.taken * terms.taken + weights.orders * terms.orders - weights.fall * terms.fall) / (terms.duration + HORIZON);

/** The blow, J, below which a blow taken costs less than its energy and above which more. */
const HEAVY = 30;

/** **The cost of a blow taken** of `energy` J: growing as its square, so a jab costs little and a heavy blow a lot. */
export const cost = (energy: number): number => energy * energy / HEAVY;

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

/** Joules dealt to a foe the orders name that count as a unit of progress on them. */
const ORDERED = 30;

/** The progress on the orders of dealing `dealt` J to the focus: some only where the orders name it. */
export const orderedDealt = (now: Situation, dealt: number): number => now.orders?.foe !== undefined && now.orders.foe === now.focus?.id ? dealt / ORDERED : 0;

/** The cost of `seconds` s within the focus's reach, at most, from `apart` m head to head. */
export const exposed = (now: Situation, seconds: number, apart = now.reach.apart): number => apart <= now.reach.theirs ? now.exposure * seconds : 0;

/** A clinch: a standing focus within `within` m, centre to centre, where a body goes down `falls` times a second. */
export const CLINCH = deepFreeze({ within: .65, falls: .2 });

/** The chance of going down in `seconds` s of a clinch, if the body is in one. */
export const clinched = (now: Situation, seconds: number): number => now.focus && !now.focus.down && now.apart < CLINCH.within ? Math.min(1, CLINCH.falls * seconds) : 0;
