import { hypot } from "../../../math/real.ts";
import type { Rulebook } from "../../../rules/rulebook.ts";
import type { BodySpec } from "../../../spec/body.ts";
import type { Orders } from "../../../mind/orders.ts";
import type { Profile } from "../../../mind/profile.ts";
import type { BodySense } from "../../../mind/senses.ts";
import type { Sight } from "../../../mind/tactics.ts";
import { READINGS, threatReader } from "../../../mind/threat.ts";
import type { DownModel } from "./down.ts";
import type { Position } from "../../../mind/ground/reading.ts";
import type { Situation } from "./option.ts";
import { PERCEPTS, predictor, type Seen } from "./percepts.ts";

/**
 * What a situation reader reads with: the body's `spec`, the world's rate `hz`, the fight's `rules`
 * (`BodyHost.rules`), its own strikes measured (`strikes`, `measuredProfile`) and every striker's
 * (`measured`, `dataOf("strike-profiles")`), its orders read
 * through `ordersOf`, the prices of its ways up from the ground (`downs`), and the seconds until
 * it is braced as its rise reads them (`unbraced`; absent, braced at once).
 */
export interface Reading {
  readonly spec: BodySpec;
  readonly hz: number;
  readonly rules: Rulebook;
  readonly strikes: readonly Profile[];
  readonly measured: readonly Profile[];
  readonly ordersOf: (sight: Sight) => Orders | null;
  readonly riseFrom?: (posture: Position) => DownModel | null;
  readonly unbraced?: (sight: Sight) => number;
}

/**
 * **A body's situation reader** (`Situation`) with `reading` (`Reading`): each percept (`PERCEPTS`)
 * read once a step, and the predictions (`predictor`) read as they are asked, at a focus. The foes
 * it may focus on are the one its orders name, else every foe in the fight; it reads at the one it
 * kept (`keep`) while that one is in the fight, else the nearest, and at each other one as it is
 * asked (`others`), so a chooser prices its options at every foe and keeps the situation it chose.
 * Its memory is the kept focus's id.
 */
export function situationReader(reading: Reading) {
  const { spec, hz, rules, strikes, measured, ordersOf } = reading, riseFrom = reading.riseFrom ?? (() => null), unbraced = reading.unbraced ?? (() => 0);
  const threats = threatReader(), state = { focus: null as string | null }, predicting = predictor();
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
  /** The situation at `focus`, its predictions read through `predicting`. */
  const at = (sight: Sight, orders: Orders | null, focus: BodySense | null, blow: Seen["blow"], predicting: ReturnType<typeof predictor>): Situation => {
    const seen: Seen = { sight, spec, hz, rules, strikes, measured, orders, focus, blow, threats, riseFrom, unbraced };
    predicting.reset(seen);
    const read: Record<string, unknown> = { sight, time: sight.view.time, predictions: predicting.predictions };
    for (const [name, percept] of Object.entries(PERCEPTS)) read[name] = percept.read(seen);
    return read as unknown as Situation;
  };
  let last: { readonly sight: Sight; readonly orders: Orders | null; readonly focus: BodySense | null; readonly blow: Seen["blow"] } | null = null;
  return {
    state,
    /** The situation at the focus (`focusOf`), now. */
    read(sight: Sight): Situation {
      const orders = ordersOf(sight), focus = focusOf(sight, orders), blow = threats.blowOf(sight.view, READINGS.predicted);
      last = { sight, orders, focus, blow };
      return at(sight, orders, focus, blow, predicting);
    },
    /** The situation at each other foe it may focus on, as the last `read` saw them: none where it may focus on one alone. */
    others(): readonly Situation[] {
      if (!last) return NONE;
      const { sight, orders, focus, blow } = last;
      let others: Situation[] | null = null;
      for (const other of sight.view.senses.others)
        if (other !== focus && candidate(sight, orders, other)) (others ??= []).push(at(sight, orders, other, blow, predictor()));
      return others ?? NONE;
    },
    /** Keep `now`'s focus: the one it reads at while it is in the fight. */
    keep(now: Situation): void { state.focus = now.focus?.id ?? null; },
  };
}

/** No other situation. */
const NONE: readonly Situation[] = Object.freeze([]);
