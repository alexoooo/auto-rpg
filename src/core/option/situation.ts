import { hypot } from "../math/real.ts";
import type { Rulebook } from "../rules/rulebook.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Orders } from "../intent/orders.ts";
import type { Profile } from "../skills/framework/profile.ts";
import type { BodySense } from "../mind/senses.ts";
import type { Sight } from "../mind/decider.ts";
import { READINGS, threatReader } from "../perception/threat.ts";
import type { Situation } from "./option.ts";
import type { PartLookup } from "../parts/lookup.ts";
import { perceiver, type ModelledStrike, type Seen } from "./percepts.ts";
import { optionRecord, type OptionRecord } from "./record.ts";
import { riseMemory } from "./rise-memory.ts";

/**
 * What a situation reader reads with: the body's `spec`, the world's rate `hz`, the fight's `rules`
 * (`BodyHost.rules`), its own strikes (`strikes`, each with its profile, its options' `Option.modelled`) and every striker's
 * (`measured`, `dataOf("strike-profiles")`), its orders read
 * through `ordersOf`, its Options' record of their tries (`record`; absent, none), whose ending a try its rise memory
 * reads (`riseMemory`), and the lookup its percept and prediction parts are found by (`parts`).
 */
export interface Reading {
  readonly spec: BodySpec;
  readonly hz: number;
  /** The rate its mind decides at, Hz (`OptionMindConfig.rate`); the world's unless given. */
  readonly rate?: number;
  /** The steps its body's command waits (`Body.delay`), at which a profile is read. */
  readonly delay: number;
  readonly rules: Rulebook;
  readonly strikes: readonly ModelledStrike[];
  readonly measured: readonly Profile[];
  readonly ordersOf: (sight: Sight) => Orders | null;
  readonly record?: OptionRecord;
  readonly parts: PartLookup;
}

/** What a lazy input of a step's `Seen` holds before it is first asked for. */
const UNREAD = Symbol("unread");

/**
 * **One step's sight read for every foe**: its orders, and the blow predicted to reach the head
 * and a foe's weapon to ward off, each read the first time the step asks for it (`UNREAD` until
 * then): what the situations at each foe share.
 */
interface Sensed {
  readonly sight: Sight;
  readonly orders: Orders | null;
  blow: Seen["blow"] | typeof UNREAD;
  ward: Seen["ward"] | typeof UNREAD;
}

/** A situation's `Seen` as the reader makes it: its step's (`Sensed`) at its focus. */
type SeenAt = { -readonly [K in "sight" | "orders" | "focus"]: Seen[K] } & { step: Sensed };

/**
 * **A body's situation reader** (`Situation`) with `reading` (`Reading`): each percept (`PERCEPTS`)
 * and prediction read the first time it is asked, at a focus (`perceiver`), and a foe's blow and
 * weapon to ward off (`Seen.blow`, `Seen.ward`) the first time a step asks for either at any focus.
 * The foes it may focus on are the one its orders name, else every foe in the fight; it reads at
 * the one it kept (`keep`) while that one is in the fight, else the nearest, and at each other one
 * as it is asked (`others`), so a chooser prices its options at every foe and keeps the situation
 * it chose. Its memory is the kept focus's id and what it keeps of the body's rise (`riseMemory`),
 * read as each step is.
 */
export function situationReader(reading: Reading) {
  const { spec, hz, delay, rules, strikes, measured, ordersOf } = reading, rate = reading.rate ?? hz;
  const risen = riseMemory(reading.record ?? optionRecord());
  const threats = threatReader(), state = { focus: null as string | null, risen: risen.state }, perceiving = perceiver(reading.parts);
  /** What every `Seen` it makes holds of the reader: one prototype, its step's lazy inputs read through `SeenAt.step`. */
  const base = Object.defineProperties({ spec, hz, rate, delay, rules, strikes, measured, threats, risen }, {
    blow: { get(this: SeenAt): Seen["blow"] {
      const step = this.step;
      return step.blow === UNREAD ? step.blow = threats.blowOf(step.sight.view, READINGS.predicted) : step.blow;
    } },
    ward: { get(this: SeenAt): Seen["ward"] {
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
    return perceiving.at(seen as unknown as Seen);
  };
  /** The last `read`'s step and focus. */
  let last: Sensed | null = null, lastFocus: BodySense | null = null;
  return {
    state,
    /** The situation at the focus (`focusOf`), now, its rise memory read first. */
    read(sight: Sight): Situation {
      risen.read(sight);
      const orders = ordersOf(sight);
      last = { sight, orders, blow: UNREAD, ward: UNREAD }; lastFocus = focusOf(sight, orders);
      return at(last, lastFocus);
    },
    /** The situation at each other foe it may focus on, as the last `read` saw them: none where it may focus on one alone. */
    others(): readonly Situation[] {
      if (!last) return NONE;
      const { sight, orders } = last;
      let others: Situation[] | null = null;
      for (const other of sight.view.senses.others)
        if (other !== lastFocus && candidate(sight, orders, other)) (others ??= []).push(at(last, other));
      return others ?? NONE;
    },
    /** Keep `now`'s focus: the one it reads at while it is in the fight. */
    keep(now: Situation): void { state.focus = now.focus?.id ?? null; },
  };
}

/** No other situation. */
const NONE: readonly Situation[] = Object.freeze([]);
