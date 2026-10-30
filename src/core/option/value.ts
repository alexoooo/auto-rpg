import { impactEnergy } from "../rules/impact.ts";
import { sideDamage, type Rulebook } from "../rules/rulebook.ts";
import { energyShares } from "../rules/share.ts";
import { landed } from "../skills/action-instances.ts";
import type { Ended } from "../skills/action.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { distance } from "../spec/vec.ts";
import { rigidPoints } from "../build/rigid.ts";
import { effectorAim } from "../control/effectors.ts";
import { deepFreeze } from "../state.ts";
import type { Situation } from "./option.ts";
import { here, type Place, type PositionValue } from "./position.ts";
import { segmentOf } from "../spec/body.ts";

/**
 * **What running an option from now is expected to bring**, over its run, in life (a share of a
 * body's full life, the verdict's unit) where it is a payoff: how long it runs, s; the focus's life
 * its blows take; its own life the blows it takes take, the blow coming included; the metres it
 * walks as ordered; where it leaves the body (`Place`: how far
 * from the focus, and the chance it is down); and, where it runs and may be let go now, before its
 * point of no return, what letting it go leaves: the seconds until its body could begin it again,
 * and its own life lost meanwhile.
 */
export interface Terms {
  readonly duration: number;
  readonly dealt: number;
  readonly taken: number;
  readonly orders: number;
  readonly exit: Place;
  readonly letGo?: { readonly seconds: number; readonly taken: number };
}

/**
 * **What carrying out the orders is worth**, life: a metre walked as ordered (`metre`), and how
 * much more than another's a foe's life is worth where the orders name it (`foe`, a share of it).
 */
export interface Obedience { readonly metre: number; readonly foe: number }

/** An obedience level's value (`OBEDIENCE`). */
export type ObedienceLevel = "own" | "steady" | "orders";

/**
 * **How far a person's orders are carried out through blows coming**, a player's choice and the
 * one weight of an option's worth, by its value and name, each the owner's decision: its own
 * judgement (a metre 1/60 of a life, a named foe's life a third more), steady (orders obeyed past
 * a one-two at hand and a weak blow coming, not into a heavy one: a metre 0.075 of a life, a named
 * foe's life one and a half times more) and orders first (a metre a third of a life, a named foe's
 * life twenty thirds more). Without orders it changes nothing.
 */
export const OBEDIENCE: readonly (readonly [value: ObedienceLevel, name: string, worth: Obedience])[] = deepFreeze([
  ["own", "Own judgement", { metre: 1 / 60, foe: 1 / 3 }], ["steady", "Steady", { metre: .075, foe: 1.5 }], ["orders", "Orders first", { metre: 1 / 3, foe: 20 / 3 }]]);

/** The steady level: the valued chooser's own. */
export const STEADY: Obedience = OBEDIENCE[1]![2];

/** Orders first: the level firm orders are carried out at (`Orders.firm`), whatever the chooser's own. */
const FIRST: Obedience = OBEDIENCE[2]![2];

/**
 * **An option's worth beside the defaults holding the position**, life, by `position`: its payoff
 * (the focus's life it takes, more where the orders name the focus, less its own it loses beyond
 * the blow coming, which holding takes as well, and the metres it walks as ordered, each at
 * `obedience`), the position where it leaves
 * the body less the position now, and its time at the rate of play. With it, how much the position
 * changes (`moves`), and what letting it go now costs (`letGo`): the life it loses while it comes
 * back beyond what holding the position as long costs, none below nothing, and none where it may
 * not be let go.
 */
export function worth(terms: Terms, now: Situation, obedience: Obedience, position: PositionValue): { readonly worth: number; readonly moves: number; readonly letGo: number } {
  const moves = position.of(now, terms.exit, terms.duration) - position.of(now, here(now), 0), rate = position.rate(now);
  const letGo = terms.letGo ? Math.max(0, terms.letGo.taken + rate * terms.letGo.seconds) : 0;
  const named = now.orders?.foe !== undefined && now.orders.foe === now.focus?.id, obeying = now.orders?.firm ? FIRST : obedience;
  return { worth: terms.dealt * (named ? 1 + obeying.foe : 1) - (terms.taken - now.predictions.danger) + obeying.metre * terms.orders + moves - rate * terms.duration, moves, letGo };
}

/** How fast a limb closes on what it strikes in a blow not under way to measure, m/s. */
const BLOW_SPEED = 5;

/** Each spec's striking masses by limb, found once: a spec is immutable. */
const limbs = new WeakMap<BodySpec, Map<string, number>>();

/**
 * The mass `limb` of `spec` (an effector's segment, `hand.left`, `foot.right`) strikes with, kg:
 * its chain's segments, from its effector's base out, and what they hold; 0 for no effector.
 */
function strikingMass(spec: BodySpec, limb: string): number {
  let masses = limbs.get(spec);
  if (!masses) limbs.set(spec, masses = new Map());
  const known = masses.get(limb);
  if (known !== undefined) return known;
  const effector = spec.effectors?.find((e) => e.segment === limb);
  let total = 0;
  if (effector) for (let at: string | undefined = effector.segment; at !== undefined && at !== effector.base; at = spec.joints.find((joint) => joint.child === at)?.parent) {
    const name = at;
    total += segmentOf(spec, name)?.mass.value ?? 0;
    for (const item of spec.held ?? []) if (item.segment === name) total += item.item.mass.value;
  }
  masses.set(limb, total);
  return total;
}

/** Each spec's striking limbs, found once: a spec is immutable. */
const STRIKERS = new WeakMap<BodySpec, readonly string[]>();

/**
 * **The limbs `spec` strikes with**: the segments of its effectors (`BodySpec.effectors`) that are
 * not supports, which it can swing at another body: a human's hands and feet, a reptile's mouth.
 */
export function strikersOf(spec: BodySpec): readonly string[] {
  let limbs = STRIKERS.get(spec);
  if (!limbs) STRIKERS.set(spec, limbs = Object.freeze((spec.effectors ?? []).filter((effector) => !effector.support).map((effector) => effector.segment)));
  return limbs;
}

/** Each spec's reach by limb, found once: a spec is immutable. */
const REACHES = new WeakMap<BodySpec, Map<string, number>>();

/**
 * **How far `limb` of `spec` reaches**, m across the ground ahead of its centre of mass, as its spec
 * builds it: the joint its effector's chain leaves its base by (`EffectorSpec.base`), and the chain
 * from there out to the point it strikes with (`effectorAim`: what it holds, else its own) laid
 * straight ahead; 0 for a limb that is no effector.
 */
export function limbReach(spec: BodySpec, limb: string): number {
  let reaches = REACHES.get(spec);
  if (!reaches) REACHES.set(spec, reaches = new Map());
  const known = reaches.get(limb);
  if (known !== undefined) return known;
  const effector = spec.effectors?.find((e) => e.segment === limb), segment = segmentOf(spec, limb);
  let reach = 0;
  if (effector && segment) {
    const joints: Vec3[] = [];
    for (let at = effector.segment; at !== effector.base;) {
      const joint = spec.joints.find((one) => one.child === at);
      if (!joint) break;
      joints.unshift(joint.centre.value);
      at = joint.parent;
    }
    const point = rigidPoints(spec, segment).get(effectorAim(spec, limb))?.value;
    if (point && joints.length) {
      let length = distance(joints[joints.length - 1]!, point), mass = 0, ahead = 0;
      for (let i = 1; i < joints.length; i++) length += distance(joints[i - 1]!, joints[i]!);
      for (const one of spec.segments) { mass += one.mass.value; ahead += one.mass.value * one.centreOfMass.value[2]; }
      reach = Math.max(0, joints[0]![2] - ahead / mass + length);
    }
  }
  reaches.set(limb, reach);
  return reach;
}

/** The mass of `spec`'s segment `at`, kg; the body's with no such segment. */
const segmentMass = (spec: BodySpec, at: string): number => segmentOf(spec, at)?.mass.value ?? spec.mass.value;

/** The energy of a blow of `limb` of `striker` on `struck`'s segment `at`, J: as the rules price an impact (`impactEnergy`), closing at `closing` m/s. */
function blowEnergy(striker: BodySpec, limb: string, struck: BodySpec, at: string, closing: number): number {
  const mass = strikingMass(striker, limb);
  return mass > 0 ? impactEnergy(mass, segmentMass(struck, at), closing) : 0;
}

/** How stiff the face `limb` of `spec` strikes with is, N/m: what it holds, else the limb's own; null for a rigid one. */
function strikingStiffness(spec: BodySpec, limb: string): number | null {
  const held = spec.held?.find((item) => item.segment === limb);
  return (held ? held.item.surface : segmentOf(spec, limb)?.surface)?.stiffness.value ?? null;
}

/**
 * **The life a blow of `limb` of `striker` takes from `struck`'s segment `at`** (`limb` an
 * effector's segment, `hand.left` or `foot.right`; `at` its head, its `marks.high`, unless named),
 * by `rules`: its energy closing at `closing` m/s into that segment (`blowEnergy`), the segment's
 * share of it by the two faces' stiffness (`energyShares`), priced blunt as the rules price a
 * side's damage (`sideDamage`), over the struck body's hit points. An edge or a point is priced as
 * its blunt impact, the limb's own model.
 */
export function blowLife(rules: Rulebook, striker: BodySpec, limb: string, struck: BodySpec, closing = BLOW_SPEED, at = struck.marks.high): number {
  const face = segmentOf(struck, at)?.surface?.stiffness.value ?? null;
  const share = energyShares([strikingStiffness(striker, limb), face])[1]!;
  return sideDamage(rules, "blunt", blowEnergy(striker, limb, struck, at, closing), share, 0) / struck.wounds.hp.value;
}

/** What an action is taken to do before its body has a record of it, the owner's decision: land this share of its blows, each running this long, s; worth `weight` records. */
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

/**
 * A clinch, the owner's decision until a drill measures one: a focus within `within` m, centre to
 * centre, where a body goes down `falls` times a second, standing (tangled with it) or lying (its
 * limbs underfoot, `docs/reference/ground-combat.md#policy-settings`).
 */
export const CLINCH = deepFreeze({ within: .65, falls: .2 });

/** The chance of going down in `seconds` s of a clinch, if the body is in one `apart` m centre to centre from the focus (as it stands now unless given). */
export const clinched = (now: Situation, seconds: number, apart = now.apart): number => now.focus && apart < CLINCH.within ? Math.min(1, CLINCH.falls * seconds) : 0;
