import { deepFreeze } from "../../state.ts";
import type { Situation } from "./option.ts";
import { dealtAt } from "./percepts.ts";
import { CLINCH } from "./value.ts";

/**
 * **Where an option leaves the body**, as a position reads it: the range head to head to the focus,
 * m (`Reach.apart`'s; Infinity with no focus), and the chance it is down there.
 */
export interface Place {
  readonly apart: number;
  readonly down: number;
}

/** **The place the body holds now** (`Place`). */
export const here = (now: Situation): Place => ({ apart: now.reach.apart, down: now.down ? 1 : 0 });

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
 * down there; and, standing at a standing focus, the range against both reaches: what its own
 * strikes deal the focus there over the time a place is held (`pressing`), less what the focus's
 * deal it (`pressure`), and late in the bout the lead at stake: a lead held within the focus's
 * reach, or a lead behind kept out of its own.
 *
 * Its rate of play is what holding the place costs a second: the focus's pressure where it stands,
 * and in a clinch (`CLINCH`) its falls, so an option that leaves the clinch gains what holding it
 * would have cost.
 */
export const FEW_TERMS: PositionValue = deepFreeze({
  name: "few terms",
  of(now: Situation, place: Place, seconds: number): number {
    const lead = now.lead, fallen = place.down * now.downCost, focus = now.focus;
    if (!focus || focus.down || !Number.isFinite(place.apart)) return lead - fallen;
    const { theirs, mine } = now.reach;
    const exchange = dealtAt(now.pressing, now, place.apart, mine, TERMS.held) - dealtAt(now.pressure, now, place.apart, theirs, TERMS.held);
    const stake = lead > 0 ? place.apart <= theirs ? lead : 0 : place.apart <= mine ? 0 : -lead;
    return lead - fallen + (1 - place.down) * (exchange - lateness(now, seconds) * stake);
  },
  rate(now: Situation): number {
    const focus = now.focus;
    if (!focus || focus.down) return 0;
    const clinch = !now.down && now.apart < CLINCH.within ? now.downCost * CLINCH.falls : 0;
    return -dealtAt(now.pressure, now, now.reach.apart, now.reach.theirs, 1) - clinch;
  },
});
