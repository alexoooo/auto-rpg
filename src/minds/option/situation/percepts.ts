import type { StanceReading } from "../../../control/stance/goal.ts";
import { atan2, hypot } from "../../../core/math/real.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { Cover } from "../../../skills/framework/intent.ts";
import { ordersAsked, type Orders } from "../../orders.ts";
import type { Stances } from "../../../skills/framework/profile/profile.ts";
import type { BodySense } from "../../../core/bodies/senses.ts";
import type { Sight } from "../../decider.ts";
import { foePhase, sensedPosture } from "../../../skills/perception/threat.ts";
import { stancesOf } from "../../../skills/perception/stance-numbers.ts";
import { carriageOf } from "../../../skills/locomotion/move/gaits.ts";
import type { RiseMemory } from "./rise-memory.ts";
import type { ExchangePredictor } from "../contract/predictors.ts";
import type { Bearing, Cues, Percepts, Predictions, ReachMemory, Seen, Situation } from "../contract/situation.ts";

/**
 * **What every percept reads from**, a step's: what a predictor reads (`Seen`), and with it the
 * body's orders, a foe's weapon to ward off, read the first time the step asks for it, and what
 * its reader keeps of its rise and of each foe's reach.
 */
export interface ReaderSeen extends Seen {
  readonly orders: Orders | null;
  /** A foe's weapon to ward off, at the hand that holds it (`READINGS.ward`); null with none. */
  readonly ward: Cover | null;
  readonly risen: RiseMemory;
  /** What its reader keeps of the stretches the body has spent within and out of each foe's reach (`reachMemory`). */
  readonly reach: ReachMemory;
}

/**
 * **A percept**: one named reading of what the body senses, read the first time a step asks for it
 * (`perceiver`). Its cue, where it has one, is what of it a chooser watches where its last decision
 * asked for it (`Cues`): a change in the cue is an event, on which the chooser decides at once.
 */
interface Percept<V> {
  read(seen: ReaderSeen): V;
  cue?(value: V): unknown;
}

/** This body's head, and the focus's (its `marks.high`, else its centre). */
const heads = ({ focus, sight }: Seen) => ({ mine: sight.view.head, theirs: focus ? focus.segments.get(focus.spec.marks.high)?.centre ?? focus.centre : null });

/** The feet of `ends` the ground bears. */
const bearingOf = (ends: StanceReading["ends"]): Bearing => Object.keys(ends).filter((end) => ends[end]!.touching);

/** The way `body`'s `marks.base` faces across the ground, as a vector (its +z); null where it is not sensed. */
function aheadOf(body: BodySense): { readonly x: number; readonly z: number } | null {
  const turn = body.segments.get(body.spec.marks.base)?.rotation;
  return turn ? { x: 2 * (turn.x * turn.z + turn.w * turn.y), z: 1 - 2 * (turn.x * turn.x + turn.y * turn.y) } : null;
}

/** **The bearing of the ground point (`x`, `z`) around `body`**, rad from the way it faces (`aheadOf`), positive to its right; 0 where it is not sensed. */
export function bearingAround(body: BodySense, x: number, z: number): number {
  const ahead = aheadOf(body);
  if (!ahead) return 0;
  const to = { x: x - body.centre.x, z: z - body.centre.z };
  return atan2(ahead.z * to.x - ahead.x * to.z, ahead.x * to.x + ahead.z * to.z);
}

/**
 * How late the senses show the focus, s: their reaction time (`Senses.reaction`), which a body
 * carried for less is also read at, as each profile's fights began; where they name none, the
 * senses' time less the focus's. Null with no focus, or one sensed without its time.
 */
export const reactionOf = ({ focus, sight }: Seen): number | null =>
  focus?.time === undefined ? null : sight.view.senses.reaction ?? sight.view.senses.time - focus.time;

/**
 * **How the body and `other` stand toward each other, each in its carriage** (`stancesOf`,
 * `carriageOf`): what the Mind reads a profile at. Read so, a body walking in its own carriage is
 * asked at the stance it stands at, and a stride's swing of the feet asks nothing new.
 */
export function carriedStances(spec: BodySpec, view: Sight["view"], other: BodySense): Stances {
  const { own, target } = stancesOf(spec, view, other);
  return { ...(own ? { own: carriageOf(spec.model, own) } : {}), ...(target ? { target: carriageOf(other.spec.model, target) } : {}) };
}

/** How two bodies stand with no focus: neither read. */
const NO_STANCES: Stances = Object.freeze({});

/** **How each percept is read** (`Percepts`, which says what each is), by its name, in the order a situation keeps them; with its cue, where a chooser watches it (`Percept.cue`). */
const PERCEPTS = Object.freeze<{ readonly [K in keyof Percepts]: Percept<Percepts[K]> }>({
  down: { read: (seen) => seen.sight.view.down, cue: (down) => down },
  posture: { read: ({ sight }) => sight.view.ground?.position ?? (sight.view.down ? "between" : "standing"), cue: (posture) => posture },
  rising: { read: (seen) => seen.risen.state.rising },
  ground: { read: ({ risen, sight }) => risen.state.rising ? sight.view.ground : null },
  tumbled: { read: (seen) => seen.risen.state.tumbled },
  regained: { read: (seen) => seen.risen.state.regained },
  where: { read: ({ sight }) => ({ x: sight.view.stance.centre.x, z: sight.view.stance.centre.z, face: sight.report.legs.heading }) },
  reached: { read: (seen) => seen.reach },
  orders: { read: (seen) => seen.orders, cue: ordersAsked },
  focus: { read: (seen) => seen.focus, cue: (focus) => focus?.id ?? null },
  apart: { read: ({ focus, sight }) => focus ? hypot(focus.centre.x - sight.view.stance.centre.x, focus.centre.z - sight.view.stance.centre.z) : Infinity },
  incoming: { read: (seen) => seen.blow?.cover ?? null, cue: (incoming) => incoming !== null },
  ward: { read: (seen) => seen.ward },
  range: { read: (seen) => { const { mine, theirs } = heads(seen); return theirs ? hypot(theirs.x - mine.x, theirs.z - mine.z) : Infinity; } },
  around: { read: ({ focus, sight }) => focus ? bearingAround(focus, sight.view.stance.centre.x, sight.view.stance.centre.z) : 0 },
  reaction: { read: reactionOf },
  lead: { read: ({ focus, sight }) => focus ? sight.view.senses.life - focus.life : 0 },
  lateness: { read: ({ sight }) => { const { begins, ends, time } = sight.view.senses; return begins === undefined || ends === undefined || !(ends > begins) ? 0 : Math.min(1, Math.max(0, (time - begins) / (ends - begins))); } },
  stride: { read: ({ sight }) => sight.view.stance.phase },
  bearing: { read: ({ sight }) => bearingOf(sight.view.stance.ends) },
  velocity: { read: ({ sight }) => ({ x: sight.view.stance.velocity.x, z: sight.view.stance.velocity.z }) },
  legsUnmet: { read: ({ sight }) => sight.report.legs.unmet },
  motorUnmet: { read: ({ sight }) => sight.view.unmet },
  phase: { read: ({ focus, blow }) => foePhase(focus, blow) },
  foePosture: { read: ({ focus }) => focus ? sensedPosture(focus) : "standing" },
  stances: { read: ({ focus, spec, sight }) => focus ? carriedStances(spec, sight.view, focus) : NO_STANCES },
  contact: { read: ({ focus, blow }) => focus && blow?.foe.id === focus.id ? blow.seconds : Infinity },
});

/** The percepts' names, in their order. */
const PERCEIVED = Object.freeze(Object.keys(PERCEPTS) as (keyof Percepts)[]);

/** The predictions' names, in their order: each is the member of an exchange predictor that reads it (`ExchangePredictor`). */
const PREDICTED = Object.freeze(Object.keys({ danger: 0, pressure: 0, down: 0, turns: 0, blows: 0 } satisfies Record<keyof Predictions, 0>) as (keyof Predictions)[]);

/** The percepts' names that have a cue, in their order. */
const CUED = Object.freeze(PERCEIVED.filter((name) => PERCEPTS[name].cue !== undefined));

/** What a percept or prediction holds before it is first asked for. */
const UNREAD = Symbol("unread");

/** Where a situation and its predictions keep their `Memo`. */
const MEMO = Symbol("memo");

/**
 * **One situation's reading**: what it reads from (`ReaderSeen`), and what each percept and then each
 * prediction read (`UNREAD` until asked).
 */
interface Memo { readonly seen: ReaderSeen; readonly values: unknown[] }

/** A situation or its predictions, keeping its `Memo`. */
type Memoized = Record<typeof MEMO, Memo>;

/**
 * **A body's situations** (`Situation`) read from a step's `ReaderSeen` (`at`): each percept
 * (`PERCEPTS`) and each prediction, which `exchange` reads, read the first time it is asked and kept. Every situation's readings are getters on one prototype made here; a situation keeps its own, so one kept past
 * its step reads its own step. Which cued percepts any of its situations was asked for is counted
 * for a chooser (`Cues`).
 */
export function perceiver(exchange: ExchangePredictor) {
  /** The cued percepts asked for since `Cues.clear`, a bit each, by their place in `CUED`. */
  let asked = 0;
  /** What `percept` reads in `memo`'s situation, at `i` of its values: read the first time it is asked. */
  const perceived = (memo: Memo, i: number, percept: Percept<unknown>): unknown => {
    const value = memo.values[i];
    return value === UNREAD ? memo.values[i] = percept.read(memo.seen) : value;
  };
  /** What reads each prediction, by its name: the member of `exchange` of that name, which answers with that prediction's type. */
  const readers: { readonly [K in keyof Predictions]: (seen: Seen) => Predictions[K] } = exchange;
  /** What `exchange` predicts by its member `name` in `memo`'s situation, at `i` of its values: read the first time it is asked. */
  const predicted = (memo: Memo, i: number, name: keyof Predictions): unknown => {
    const value = memo.values[i];
    return value === UNREAD ? memo.values[i] = readers[name](memo.seen) : value;
  };
  const cues: Cues = {
    event(now, watched) {
      const was = asked, text = JSON.stringify(watched.map((name) => (PERCEPTS[name as keyof Percepts] as Percept<unknown>).cue!(now[name as keyof Percepts])));
      asked = was;
      return text;
    },
    clear() { asked = 0; },
    asked: () => CUED.filter((_, c) => (asked & 1 << c) !== 0),
  };
  const situation = { cues };
  PERCEIVED.forEach((name, i) => {
    const percept = PERCEPTS[name] as Percept<unknown>, bit = CUED.includes(name) ? 1 << CUED.indexOf(name) : 0;
    Object.defineProperty(situation, name, { get(this: Memoized) { asked |= bit; return perceived(this[MEMO], i, percept); } });
  });
  const predictions = {};
  PREDICTED.forEach((name, i) => Object.defineProperty(predictions, name, { get(this: Memoized) { return predicted(this[MEMO], PERCEIVED.length + i, name); } }));
  return {
    /** **The situation `seen` reads**, its percepts and predictions read as they are asked. */
    at(seen: ReaderSeen): Situation {
      const memo: Memo = { seen, values: new Array<unknown>(PERCEIVED.length + PREDICTED.length).fill(UNREAD) };
      const now = Object.create(situation) as Memoized & { sight: Sight; time: number; predictions: Predictions };
      now.sight = seen.sight; now.time = seen.sight.view.time; now[MEMO] = memo;
      const said = Object.create(predictions) as Memoized;
      said[MEMO] = memo;
      now.predictions = said as unknown as Predictions;
      return now as unknown as Situation;
    },
  };
}
