import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { rigidPoints } from "../../build/rigid.ts";
import { pointAtToRef, poseAngles, specChainTo } from "../../control/kinematics.ts";
import type { MotorUnmet } from "../../control/motor.ts";
import type { StancePhase } from "../../control/stance.ts";
import { hypot } from "../../math/real.ts";
import type { LegsUnmet } from "../../skills/skill.ts";
import { guardPosture } from "../../skills/guard.ts";
import { rangeOf } from "../../skills/strike.ts";
import type { BodySpec, Side } from "../../spec/body.ts";
import type { Cover } from "../intent.ts";
import type { Orders } from "../orders.ts";
import type { BodySense } from "../senses.ts";
import type { Sight } from "../tactics.ts";
import { READINGS, type threatReader } from "../threat.ts";
import type { DownModel } from "./down.ts";
import { blowEnergy, lifeOf, record } from "./value.ts";

/**
 * What every percept reads from, once a step: the body's sight and spec, its orders, the foe it
 * fights (its focus, `situationReader`), the blow predicted to reach its head and the threat
 * reader that predicted it, and how its ways up from the ground are priced (`DownModel`).
 */
export interface Seen {
  readonly sight: Sight;
  readonly spec: BodySpec;
  readonly orders: Orders | null;
  readonly focus: BodySense | null;
  readonly blow: ReturnType<Threats["blowOf"]>;
  readonly threats: Threats;
  readonly downs: readonly DownModel[];
}

type Threats = ReturnType<typeof threatReader>;

/**
 * **A percept**: one named reading of what the body senses, read once a step (`situationReader`).
 * Its cue, where it has one, is what of it a chooser watches (`eventOf`): a change in the cue is an
 * event, on which the chooser decides at once.
 */
export interface Percept<V> {
  read(seen: Seen): V;
  cue?(value: V): unknown;
}

/**
 * Head to head across the ground to the focus, m; the most at which its hands reach this body's
 * head and this body's reach its; and the range head to head at which the two guards' farthest
 * points meet (`guardAhead`).
 */
export interface Reach { readonly apart: number; readonly theirs: number; readonly mine: number; readonly guards: number }

/**
 * The chance a foe's blow predicted to reach the head lands; and how many blows a second a
 * standing foe throws within its reach, of which as many land as of the body's own (`record`): two
 * bodies trading blows land alike.
 */
const LANDS = .3, RATE = 1;

/** Which feet the ground bears (`StanceReading.touching`): both, one, or none. */
type Bearing = "both" | "left" | "right" | "none";

/** The feet `touching` says the ground bears. */
const bearingOf = (touching: Readonly<Record<Side, boolean>>): Bearing =>
  touching.left ? touching.right ? "both" : "left" : touching.right ? "right" : "none";

/**
 * **What a foe's body is doing**, read from what is sensed of it: striking, a blow of its predicted
 * to reach the head (`READINGS.predicted`); down by its spec's rule (`BodySense.down`), and rising,
 * down with its centre of mass going up faster than `RISING`; else clear.
 */
type FoePhase = "striking" | "down" | "rising" | "clear";

/** How fast a fallen body's centre of mass goes up for it to read as rising, m/s. */
const RISING = 0.2;

/** The phase (`FoePhase`) of `focus`, `blow` the blow predicted to reach the head; clear with no focus. */
function foePhase(focus: BodySense | null, blow: Seen["blow"]): FoePhase {
  if (!focus) return "clear";
  if (focus.down) return focus.velocity.y > RISING ? "rising" : "down";
  return blow?.foe.id === focus.id ? "striking" : "clear";
}

/** Whether `spec` has both hands to strike with: what the reach readings measure. */
const twoHanded = (spec: BodySpec): boolean => ["hand.left", "hand.right"].every((hand) => spec.effectors?.some((effector) => effector.segment === hand) ?? false);

/** How far a hand of `striker` reaches a head `up` m over its own, m head to head across the ground: its range's outer bound. */
const outer = (striker: BodySpec, up: number): number => { const range = rangeOf(striker, "right", up); return range.reach + range.along[1]; };

/** Each spec's guard's reach ahead of its head, found once: a spec is immutable, and so is what is read from it. */
const GUARDS = new WeakMap<BodySpec, number>();

/**
 * **How far ahead of its head `spec`'s guard holds its farthest point**, m: of each hand's points
 * and what it holds (`rigidPoints`), in the reference pose with the guard's angles
 * (`guardPosture`), along the body frame's forward; 0 for a body with no hands.
 */
function guardAhead(spec: BodySpec): number {
  let ahead = GUARDS.get(spec);
  if (ahead !== undefined) return ahead;
  const angles = poseAngles(spec, guardPosture(spec)), head = spec.segments.find((segment) => segment.name === "head")?.centreOfMass.value[2] ?? 0, at = new Vector3();
  ahead = 0;
  for (const segment of spec.segments) {
    if (segment.name !== "hand.left" && segment.name !== "hand.right") continue;
    const chain = specChainTo(spec, segment.name), turned = chain.map((joint) => angles[joint.spec.name] ?? joint.spec.dofs.map(() => 0));
    for (const point of rigidPoints(spec, segment).values()) ahead = Math.max(ahead, pointAtToRef(chain, turned, point.value, at).z - head);
  }
  GUARDS.set(spec, ahead);
  return ahead;
}

/** The heavier of `striker`'s two hands' blows on `struck`'s head, J. */
const heavier = (striker: BodySpec, struck: BodySpec): number => Math.max(blowEnergy(striker, "left", struck), blowEnergy(striker, "right", struck));

/** The own life a second within a standing focus's reach is expected to cost (`LANDS`, `RATE`); 0 with none. */
const exposureOf = ({ focus, sight, spec }: Seen): number => focus && !focus.down ? RATE * record(sight.report.ledger, null).lands * lifeOf(heavier(focus.spec, spec), spec) : 0;

/**
 * **What a fall is expected to cost**, own life: the focus's blows while the body is down, at its
 * exposure (`exposureOf`), over the cheapest of its ways up that stands (its time down, less the
 * share of blows it keeps off, over its chance of standing); all the life it has where none stands.
 */
function downCostOf(seen: Seen): number {
  const exposure = exposureOf(seen);
  let least = seen.sight.view.senses.life;
  for (const down of seen.downs) if (down.stands > 0) least = Math.min(least, exposure * down.seconds * (1 - down.shelter) / down.stands);
  return least;
}

/**
 * **Every percept the options fighter reads**, by name, in the order they are read: whether the
 * body is down; its orders; its focus; how far off the focus is, centre to centre across the
 * ground (Infinity with none); a foe's blow closing on the head (`READINGS.threat`) and one
 * predicted to reach it (`READINGS.predicted`); the own life that blow is expected to take (at the
 * speed it closes and the chance it lands, `LANDS`), 0 with none; the reach head to head (`Reach`:
 * Infinity and noughts with no focus); the own life a second within a standing focus's reach is
 * expected to cost (`exposureOf`), 0 with none; what a fall would cost (`downCostOf`), own life;
 * and the focus's life a blow of each hand at its head takes (`blowEnergy`, `lifeOf`), 0 with no
 * focus. The gait's: where the stance is in a step (`StanceReading.phase`),
 * which feet the ground bears (`Bearing`) and the centre of mass's speed over the ground, m/s. What
 * the controllers did not carry out: the legs' (`SkillReport.legs`) and the motor's
 * (`BodyView.unmet`). The focus's phase (`FoePhase`), and the time to contact of the blow it
 * strikes with, s (Infinity with none). Its cues: going down or getting up, other orders, another
 * focus, a threat or a blow coming.
 */
export const PERCEPTS = Object.freeze({
  down: { read: (seen) => seen.sight.view.down, cue: (down) => down } as Percept<boolean>,
  orders: { read: (seen) => seen.orders, cue: (orders) => orders } as Percept<Orders | null>,
  focus: { read: (seen) => seen.focus, cue: (focus) => focus?.id ?? null } as Percept<BodySense | null>,
  apart: { read: ({ focus, sight }) => focus ? hypot(focus.centre.x - sight.view.stance.centre.x, focus.centre.z - sight.view.stance.centre.z) : Infinity } as Percept<number>,
  threat: { read: (seen) => seen.threats.threatOf(seen.sight.view, READINGS.threat), cue: (threat) => threat !== null } as Percept<Cover | null>,
  incoming: { read: (seen) => seen.blow?.cover ?? null, cue: (incoming) => incoming !== null } as Percept<Cover | null>,
  danger: { read: ({ blow, spec }) => blow ? LANDS * lifeOf(blowEnergy(blow.foe.spec, blow.hand, spec, blow.closing), spec) : 0 } as Percept<number>,
  reach: { read: ({ focus, sight, spec }): Reach => {
    if (!focus) return { apart: Infinity, theirs: 0, mine: 0, guards: 0 };
    const mine = sight.view.head, theirs = focus.segments.get(focus.spec.marks.high)?.centre ?? focus.centre;
    return { apart: hypot(theirs.x - mine.x, theirs.z - mine.z), theirs: twoHanded(focus.spec) ? outer(focus.spec, mine.y - theirs.y) : 0,
      mine: twoHanded(spec) ? outer(spec, theirs.y - mine.y) : 0, guards: guardAhead(spec) + guardAhead(focus.spec) };
  } } as Percept<Reach>,
  exposure: { read: exposureOf } as Percept<number>,
  downCost: { read: downCostOf } as Percept<number>,
  blows: { read: ({ focus, spec }): Readonly<Record<Side, number>> => ({ left: focus ? lifeOf(blowEnergy(spec, "left", focus.spec), focus.spec) : 0,
    right: focus ? lifeOf(blowEnergy(spec, "right", focus.spec), focus.spec) : 0 }) } as Percept<Readonly<Record<Side, number>>>,
  stride: { read: ({ sight }) => sight.view.stance.phase } as Percept<StancePhase>,
  bearing: { read: ({ sight }) => bearingOf(sight.view.stance.touching) } as Percept<Bearing>,
  speed: { read: ({ sight }) => hypot(sight.view.stance.velocity.x, sight.view.stance.velocity.z) } as Percept<number>,
  legsUnmet: { read: ({ sight }) => sight.report.legs } as Percept<LegsUnmet>,
  motorUnmet: { read: ({ sight }) => sight.view.unmet } as Percept<MotorUnmet>,
  phase: { read: ({ focus, blow }) => foePhase(focus, blow) } as Percept<FoePhase>,
  contact: { read: ({ focus, blow }) => focus && blow?.foe.id === focus.id ? blow.seconds : Infinity } as Percept<number>,
});

/** What each percept reads, by its name. */
export type Percepts = { readonly [K in keyof typeof PERCEPTS]: typeof PERCEPTS[K] extends Percept<infer V> ? V : never };

/** The percepts' names that have a cue, in their order. */
const CUED = Object.freeze((Object.keys(PERCEPTS) as (keyof typeof PERCEPTS)[]).filter((name) => PERCEPTS[name].cue !== undefined));

/** **What changes the situation enough to decide at once** (`Percept.cue`): every cue's value, as one text a chooser compares with the last. */
export const eventOf = (now: Percepts): string =>
  JSON.stringify(CUED.map((name) => (PERCEPTS[name] as Percept<unknown>).cue!(now[name])));
