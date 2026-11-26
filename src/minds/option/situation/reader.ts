import { hypot } from "../../../core/math/real.ts";
import type { Rulebook } from "../../../combat/rulebook.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { Orders } from "../../orders.ts";
import type { BodySense } from "../../../core/bodies/senses.ts";
import type { Sight } from "../../decider.ts";
import { READINGS, threatReader } from "../../../skills/perception/threat.ts";
import type { Situation, SituationReader } from "../contract/situation.ts";
import type { PartLookup } from "../../../parts/lookup.ts";
import type { PartConfig } from "../../../parts/parts.ts";
import { perceiver, type ReaderSeen } from "./percepts.ts";
import { reachMemory } from "./reach-memory.ts";
import type { ExchangePredictor } from "../contract/predictors.ts";
import type { OptionRecord } from "../contract/context.ts";
import { optionRecord } from "./record.ts";
import { riseMemory } from "./rise-memory.ts";

/**
 * What a situation reader reads with: the body's `spec`, the world's rate `hz`, the fight's `rules`
 * (`BodyHost.rules`), what reads each prediction (`exchange`), its orders read
 * through `ordersOf`, its Options' record of their tries (`record`; absent, none), whose ending a try its rise memory
 * reads (`riseMemory`) with the ground techniques (`techniques`) found by the lookup (`parts`).
 */
interface Reading {
  readonly spec: BodySpec;
  readonly hz: number;
  /** How often its mind looks for a change it watches, Hz (`OptionMindConfig.rate`, the world's where it names none). */
  readonly rate: number;
  /** The steps its body's command waits (`Body.delay`), at which a profile is read. */
  readonly delay: number;
  readonly rules: Rulebook;
  /** What the body and its foe are expected to do to each other (`ExchangePredictor`). */
  readonly exchange: ExchangePredictor;
  readonly ordersOf: (sight: Sight) => Orders | null;
  readonly record?: OptionRecord;
  readonly parts: PartLookup;
  readonly techniques: readonly PartConfig[];
}

/** What a lazy input of a step's `ReaderSeen` holds before it is first asked for. */
const UNREAD = Symbol("unread");

/**
 * **One step's sight read for every foe**: its orders, and the blow predicted to reach the head
 * and a foe's weapon to ward off, each read the first time the step asks for it (`UNREAD` until
 * then): what the situations at each foe share.
 */
interface Sensed {
  readonly sight: Sight;
  readonly orders: Orders | null;
  blow: ReaderSeen["blow"] | typeof UNREAD;
  ward: ReaderSeen["ward"] | typeof UNREAD;
}

/** A situation's `ReaderSeen` as the reader makes it: its step's (`Sensed`) at its focus. */
type SeenAt = { -readonly [K in "sight" | "orders" | "focus"]: ReaderSeen[K] } & { step: Sensed };

/**
 * **A body's situation reader** (`SituationReader`) with `reading` (`Reading`): each percept (`PERCEPTS`)
 * and prediction read the first time it is asked, at a focus (`perceiver`), and a foe's blow and
 * weapon to ward off (`Seen.blow`, `ReaderSeen.ward`) the first time a step asks for either at any focus.
 * The foes it may focus on are the one its orders name, else every foe in the fight; it reads at
 * the one it kept (`keep`) while that one is in the fight, else the nearest, and at each other one
 * as it is asked (`others`), so a chooser prices its options at every foe and keeps the situation
 * it chose. Its memory is the kept focus's id, what it keeps of the body's rise (`riseMemory`),
 * read as each step is, and of each foe's reach (`reachMemory`), counted as a decision reads it.
 */
export function situationReader(reading: Reading): SituationReader {
  const { spec, hz, rate, delay, rules, ordersOf } = reading;
  const risen = riseMemory(reading.record ?? optionRecord(), reading.parts, reading.techniques), reach = reachMemory();
  const threats = threatReader(), state = { focus: null as string | null, risen: risen.state, reach: reach.state }, perceiving = perceiver(reading.exchange);
  /** What every `ReaderSeen` it makes holds of the reader: one prototype, its step's lazy inputs read through `SeenAt.step`. */
  const base = Object.defineProperties({ spec, hz, rate, delay, rules, risen, reach }, {
    blow: { get(this: SeenAt): ReaderSeen["blow"] {
      const step = this.step;
      return step.blow === UNREAD ? step.blow = threats.blowOf(step.sight.view, READINGS.predicted) : step.blow;
    } },
    ward: { get(this: SeenAt): ReaderSeen["ward"] {
      const step = this.step;
      return step.ward === UNREAD ? step.ward = threats.threatOf(step.sight.view, READINGS.ward) : step.ward;
    } },
  });
  /** Whether `other` is a foe in the fight that `orders` let the body focus on. */
  const candidate = (sight: Sight, orders: Orders | null, other: BodySense): boolean =>
    !other.out && other.side !== sight.view.senses.side && (orders?.foe === undefined || other.id === orders.foe);
  const focusOf = (sight: Sight, orders: Orders | null): BodySense | null => {
    const { senses, stance } = sight.view;
    let near: BodySense | null = null, distance = Infinity;
    for (const other of senses.others) {
      if (!candidate(sight, orders, other)) continue;
      if (other.id === state.focus) return other;
      const apart = hypot(other.centre.x - stance.centre.x, other.centre.z - stance.centre.z);
      if (apart < distance) { near = other; distance = apart; }
    }
    return near;
  };
  /** The situation `step` reads at `focus`. */
  const at = (step: Sensed, focus: BodySense | null): Situation => {
    const seen = Object.create(base) as SeenAt;
    seen.sight = step.sight; seen.orders = step.orders; seen.focus = focus; seen.step = step;
    return perceiving.at(seen as unknown as ReaderSeen);
  };
  /** The last `read`'s step and focus. */
  let last: Sensed | null = null, lastFocus: BodySense | null = null;
  return {
    state,
    // The situation at the focus (`focusOf`), its rise memory read first.
    read(sight: Sight): Situation {
      risen.read(sight);
      const orders = ordersOf(sight);
      last = { sight, orders, blow: UNREAD, ward: UNREAD }; lastFocus = focusOf(sight, orders);
      return at(last, lastFocus);
    },
    others(): readonly Situation[] {
      if (!last) return NONE;
      const { sight, orders } = last;
      let others: Situation[] | null = null;
      for (const other of sight.view.senses.others)
        if (other !== lastFocus && candidate(sight, orders, other)) (others ??= []).push(at(last, other));
      return others ?? NONE;
    },
    keep(now: Situation): void { state.focus = now.focus?.id ?? null; },
  };
}

/** No other situation. */
const NONE: readonly Situation[] = Object.freeze([]);
