import type { GaitName } from "../../../skills/gaits.ts";
import type { PositionPart } from "../../../mind/option-part.ts";
import { anyBody } from "../../../mind/parts.ts";
import { deepFreeze } from "../../../state.ts";
import type { Situation } from "./option.ts";
import type { Percepts } from "./percepts.ts";
import { dealtAt, edgeOf } from "./percepts.ts";
import { CLINCH } from "./value.ts";

/**
 * **Where an option leaves the body**: a prediction of the percepts it leaves, each by its name
 * (`PERCEPTS`): the range head to head to the focus (`range`, m; Infinity with no focus), the
 * chance it is down there (`down`'s), and the seconds until it is braced there, its strikes ready
 * (`unbraced`, a gait's, `Going`); and any other percept it says it changes (`posture`, `around`).
 * A percept it does not name is as it is now (`atExit`).
 */
export type Place = { readonly range: number; readonly down: number }
  & { readonly [K in Exclude<keyof Percepts, "range" | "down">]?: Percepts[K] };

/** **A percept where `place` leaves the body** (`Place`): its prediction, where it names one; else as it is now. */
export const atExit = <K extends Exclude<keyof Percepts, "range" | "down">>(now: Situation, place: Place, name: K): Percepts[K] =>
  (place[name] ?? now[name]) as Percepts[K];

/**
 * **A gait an option goes by**: its name (`GAITS`), and what it leaves the body once stopped from
 * its top speed: the seconds until it is braced, its strike ready, and the chance it fell (its
 * profile, `dataOf("gait-profiles")`; unmeasured, braced at once and up).
 */
export interface Going {
  readonly gait: GaitName;
  readonly braced: number;
  readonly down: number;
}

/**
 * **The place the body holds now** (`Place`): down, or on its feet while its rise runs, counted
 * down until the rise braces it (`Situation.unbraced`).
 */
export const here = (now: Situation): Place => ({ range: now.range, down: now.down || now.unbraced > 0 ? 1 : 0 });

/** **Where a standing option leaves the body**, from here: `place`, counted down as the body is here, which only its rise stands. */
export const fromHere = (now: Situation, place: Place): Place => ({ ...place, down: Math.max(place.down, here(now).down) });

/**
 * **The value of a position**: what a place is worth to the body, in life (the verdict's unit), the
 * lead it expects at the verdict from there; and the rate of play, what a second of the fight is
 * worth as it plays now. One interface, so the few terms (`FEW_TERMS`) and a learned value are
 * each an implementation of it.
 */
export interface PositionValue {
  readonly name: string;
  /** What `place`, reached `seconds` s from now, is worth, life, the rest of the situation as `now` reads it. */
  of(now: Situation, place: Place, seconds: number): number;
  /**
   * The rate of play, life a second: what a second of the fight is worth to the body with its
   * defaults holding its position, so an option is worth what it brings beyond holding it as long.
   */
  rate(now: Situation): number;
}

/**
 * The few terms' weights, the owner's to set for the result: how long a place is held before the
 * body moves on, s, over which what is dealt there counts (`held`); and how long before the clock's
 * verdict the lead comes to count, s, from none to whole (`late`).
 */
const TERMS = deepFreeze({ held: 1, late: 60 });

/** The share of the lead at stake `seconds` s from now: none `TERMS.late` s or more before the clock's verdict, the whole at it. */
const lateness = (now: Situation, seconds: number): number => Math.min(1, Math.max(0, 1 - (now.left - seconds) / TERMS.late));

/**
 * **The position's few terms**: the lead; a fall's cost (`downCost`) at the chance the body is
 * down there; and, standing at a standing focus, the range against how far each side's strikes
 * reach (`edgeOf`): what its own
 * strikes deal the focus there over the time a place is held once it is braced (`pressing`), less
 * what the focus's deal it over all of it (`pressure`), and late in the bout the lead at stake: a lead held within the focus's
 * reach, or a lead behind kept out of its own.
 *
 * Its rate of play is what holding the place costs a second: the focus's pressure where it stands,
 * and in a clinch (`CLINCH`) its falls, so an option that leaves the clinch gains what holding it
 * would have cost.
 */
export const FEW_TERMS: PositionValue = deepFreeze({
  name: "few terms",
  of(now: Situation, place: Place, seconds: number): number {
    const lead = now.lead, fallen = place.down * (place.posture ? now.predictions.downCostAt(place.posture) : now.predictions.downCost), focus = now.focus;
    if (!focus || focus.down || !Number.isFinite(place.range)) return lead - fallen;
    const theirs = edgeOf(now, now.predictions.pressure), mine = edgeOf(now, now.predictions.pressing);
    const exchange = dealtAt(now.predictions.pressing, now, place.range, Math.max(0, TERMS.held - atExit(now, place, "unbraced"))) - dealtAt(now.predictions.pressure, now, place.range, TERMS.held);
    const stake = lead > 0 ? place.range <= theirs ? lead : 0 : place.range <= mine ? 0 : -lead;
    return lead - fallen + (1 - place.down) * (exchange - lateness(now, seconds) * stake);
  },
  rate(now: Situation): number {
    const focus = now.focus;
    if (!focus || focus.down) return 0;
    const clinch = !now.down && now.apart < CLINCH.within ? now.predictions.downCost * CLINCH.falls : 0;
    return -dealtAt(now.predictions.pressure, now, now.range, 1) - clinch;
  },
});

/** **The few terms** (`FEW_TERMS`) as a part of role `position`: what a chooser that values places prices them by. */
export const FEW_TERMS_PART: PositionPart<{ readonly kind: "few-terms" }, PositionValue> = deepFreeze({
  role: "position", label: "Few terms", stage: "game", fields: [], slots: [], defaults: { kind: "few-terms" }, keys: { kind: true },
  fits: anyBody, faults: () => [], make: () => FEW_TERMS,
});
