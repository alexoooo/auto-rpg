import { impactEnergy } from "../../combat/impact.ts";
import { lifeFactor } from "../../combat/pool.ts";
import { sideDamage, type Rulebook } from "../../combat/rulebook.ts";
import { energyShares } from "../../combat/share.ts";
import { landed } from "../../skills/framework/action-instances.ts";
import type { Ended } from "../../skills/framework/action.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { Vec3 } from "../../core/quantity.ts";
import { distance } from "../../core/bodies/spec/vec.ts";
import { rigidPoints } from "../../core/bodies/build/rigid.ts";
import { effectorAim } from "../../control/effectors.ts";
import { deepFreeze } from "../../core/state.ts";
import type { Situation } from "./option.ts";
import type { Spot } from "../../skills/intent/action-window.ts";
import type { Position } from "../../control/ground-reading.ts";
import { segmentOf } from "../../core/bodies/spec/body.ts";
import type { Deciding } from "../choice.ts";

/** How an Option Mind's chooser decides (`Deciding`): it rethinks every 0.2 s. A foe's mind is taken for one like it (`Pressure.latency`). */
export const DECIDING: Deciding = Object.freeze({ rethink: .2 });

/**
 * **Where an Option leaves the body**: what of the situation it changes, each a percept by its name
 * (`PERCEPTS`): where on the ground the body stands and the way it faces (`where`), its bearing
 * around the focus where the focus has not turned to face it there (`around`; else as `where`
 * reads it), what bears it (`posture`; down unless standing) and its velocity over the ground,
 * m/s (`velocity`); and, where it reckons it, the seconds before the focus's pressure reaches the
 * body there (`grace`, `Situation.grace`). What it does not name is as it was, the foe included
 * (`placed`).
 */
export interface Leaves {
  readonly where?: Spot;
  readonly around?: number;
  readonly posture?: Position;
  readonly grace?: number;
  readonly velocity?: Ground;
}

/** **One way an Option ends**: where it leaves the body (`Leaves`), and the chance it ends so. */
export interface Outcome {
  readonly leaves: Leaves;
  readonly chance: number;
}

/** Leaving the body as it is: nothing changed. */
export const AS_IS: Leaves = Object.freeze({});

/** **Ending one way**: leaving the body as it is (`AS_IS`), for certain. */
export const UNMOVED: readonly Outcome[] = Object.freeze([Object.freeze({ leaves: AS_IS, chance: 1 })]);

/** Where a fall leaves the body where nothing measured where it comes to rest: on its back. */
const FALLEN: Position = "back";

/** No motion over the ground. */
export const STILL: Ground = Object.freeze({ x: 0, z: 0 });

/**
 * **Up, or fallen**: leaving the body as `up` says in the share it stays up, lying in `posture`
 * (`FALLEN` unless given) in the share `down`; one outcome where either share is none.
 */
export function upOrDown(up: Leaves, down: number, posture: Position = FALLEN): readonly Outcome[] {
  if (!(down > 0)) return [{ leaves: up, chance: 1 }];
  const fallen: Outcome = { leaves: { posture, velocity: STILL }, chance: Math.min(1, down) };
  return down >= 1 ? [fallen] : [{ leaves: up, chance: 1 - down }, fallen];
}

/**
 * **What running an Option from a state is expected to bring**, over its run, in life (a share of
 * a body's full life, the verdict's unit) where it is a payoff: how long it runs, s; the focus's
 * life its blows take; its own life the blows it takes take, the blow coming included; the metres
 * it walks as ordered; the ways it ends (`Outcome`), whose chances sum to one; and, where it runs
 * and may be let go now, before its point of no return, what letting it go leaves: the seconds
 * until its body could begin it again, and its own life lost meanwhile.
 */
export interface Terms {
  readonly duration: number;
  readonly dealt: number;
  readonly taken: number;
  readonly orders: number;
  readonly outcomes: readonly Outcome[];
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
 * one weight of an option's worth, by its value and name, each set for the play it gives: its own
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
export const FIRST: Obedience = OBEDIENCE[2]![2];

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
 * side's damage (`sideDamage`) at the segment's cost in life (`lifeFactor`), over the struck body's
 * full life. An edge or a point is priced as its blunt impact, the limb's own model.
 */
export function blowLife(rules: Rulebook, striker: BodySpec, limb: string, struck: BodySpec, closing = BLOW_SPEED, at = struck.marks.high): number {
  const face = segmentOf(struck, at)?.surface?.stiffness.value ?? null;
  const share = energyShares([strikingStiffness(striker, limb), face])[1]!;
  return sideDamage(rules, "blunt", blowEnergy(striker, limb, struck, at, closing), share, 0) * lifeFactor(rules, struck, at) / struck.wounds.hp.value;
}

/** What an action is taken to do before its body has a record of it, set by hand: land this share of its blows, each running this long, s; worth `weight` records. */
const PRIOR = Object.freeze({ lands: .3, seconds: .6, weight: 3 });

/**
 * What a body's own record says of an action of its with its limbs, or of every action with none
 * named, from its ledger: the share of its tries at a body that landed, and how long one ran, s;
 * each with its prior (`PRIOR`), so that the first tries move it and none leaves it the prior. A
 * try is a blow committed, or one its executor gave up on by itself (`stalled`), which landed nothing.
 */
export function record(ledger: readonly Ended[], action: { readonly name: string; readonly effectors: readonly string[] } | null): { readonly lands: number; readonly seconds: number } {
  let tries = 0, hits = 0, seconds = 0;
  for (const ended of ledger) {
    if (action !== null && (ended.action !== action.name || !action.effectors.includes(ended.effector))) continue;
    if (!ended.committed && ended.ending.kind !== "stalled" || ended.target.kind !== "body") continue;
    tries += 1; seconds += ended.ended - ended.began;
    if (landed(ended)) hits += 1;
  }
  return { lands: (hits + PRIOR.lands * PRIOR.weight) / (tries + PRIOR.weight), seconds: (seconds + PRIOR.seconds * PRIOR.weight) / (tries + PRIOR.weight) };
}

/**
 * A clinch, set by hand until a drill measures one: a focus within `within` m, centre to
 * centre, where a body goes down `falls` times a second, standing (tangled with it) or lying (its
 * limbs underfoot).
 */
export const CLINCH = deepFreeze({ within: .65, falls: .2 });

/** The chance of going down in `seconds` s of a clinch, if the body is in one `apart` m centre to centre from the focus (as it stands at `now` unless given). */
export const clinched = (now: Situation, seconds: number, apart = now.apart): number => now.focus && apart < CLINCH.within ? Math.min(1, CLINCH.falls * seconds) : 0;

/** A point on the ground, or a motion over it: x and z, m or m/s. */
export interface Ground { readonly x: number; readonly z: number }
