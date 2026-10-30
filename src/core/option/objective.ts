import { anyBody } from "../parts/parts.ts";
import { deepFreeze } from "../state.ts";
import type { Situation } from "./option.ts";
import type { ObjectivePart } from "./parts.ts";
import { dealtAt, edgeOf } from "./percepts.ts";
import { atExit, here, type Place } from "./position.ts";
import { CLINCH, FIRST, type Obedience, type Terms } from "./value.ts";

/** What an option is worth beside the defaults holding the position (`Objective.worth`), life; how much the position changes (`moves`); and what letting it go now costs (`letGo`). */
export interface Worth { readonly worth: number; readonly moves: number; readonly letGo: number }

/**
 * **An objective**: what an option's model (`Terms`: its duration, payoff and exit) is worth to the
 * body, in life (the verdict's unit), beside its defaults holding the position, with its orders
 * carried out at `obedience`. One interface, so the few terms (`FEW_TERMS`) and a learned or
 * non-combat value are each an implementation of it; its memory, where it keeps one, is in
 * `state`, plain data, which its chooser keeps with its own.
 */
export interface Objective {
  readonly name: string;
  readonly state?: object;
  worth(terms: Terms, now: Situation, obedience: Obedience): Worth;
}

/**
 * The few terms' weights, the owner's to set for the result: how long a place is held before the
 * body moves on, s, over which what is dealt there counts (`held`); and how long before the clock's
 * verdict the lead comes to count, s, from none to whole (`late`).
 */
const TERMS = deepFreeze({ held: 1, late: 60 });

/** The share of the lead at stake `seconds` s from now: none `TERMS.late` s or more before the clock's verdict, the whole at it. */
const lateness = (now: Situation, seconds: number): number => Math.min(1, Math.max(0, 1 - (now.left - seconds) / TERMS.late));

/** **The seconds the focus takes to face the body** where `place` leaves it: its bearing around the focus (`around`) at the focus's turn (`Predictions.turns`). */
const turning = (now: Situation, place: Place): number => Math.abs(atExit(now, place, "around")) / now.predictions.turns;

/**
 * **What a place is worth by the few terms**, life, reached `seconds` s from now, the rest of the
 * situation as `now` reads it: the lead it expects at the verdict from there; a fall's cost
 * (`downCost`) at the chance the body is down there; and, at a focus, the range against how far
 * each side's strikes reach (`edgeOf`): what its own strikes deal the focus there over the time a
 * place is held once it is braced (`pressing`), less what the focus's deal it over that time once
 * it has turned to face the body (`pressure`, `turning`), and late in the bout the lead at stake: a
 * lead held within the focus's reach, or a lead behind kept out of its own.
 */
function placeWorth(now: Situation, place: Place, seconds: number): number {
  const lead = now.lead, fallen = place.down * (place.posture ? now.predictions.downCostAt(place.posture) : now.predictions.downCost), focus = now.focus;
  if (!focus || !Number.isFinite(place.range)) return lead - fallen;
  const theirs = edgeOf(now, now.predictions.pressure), mine = edgeOf(now, now.predictions.pressing);
  const exchange = dealtAt(now.predictions.pressing, now, place.range, Math.max(0, TERMS.held - atExit(now, place, "unbraced")))
    - dealtAt(now.predictions.pressure, now, place.range, Math.max(0, TERMS.held - turning(now, place)));
  const stake = lead > 0 ? place.range <= theirs ? lead : 0 : place.range <= mine ? 0 : -lead;
  return lead - fallen + (1 - place.down) * (exchange - lateness(now, seconds) * stake);
}

/**
 * **The rate of play by the few terms**, life a second: what a second of the fight is worth to the
 * body with its defaults holding its position, so an option is worth what it brings beyond holding
 * it as long. It is what holding the place costs a second: the focus's pressure where it stands,
 * and in a clinch (`CLINCH`) its falls, so an option that leaves the clinch gains what holding it
 * would have cost.
 */
function rateOfPlay(now: Situation): number {
  const focus = now.focus;
  if (!focus) return 0;
  const clinch = !now.down && now.apart < CLINCH.within ? now.predictions.downCost * CLINCH.falls : 0;
  return -dealtAt(now.predictions.pressure, now, now.range, 1) - clinch;
}

/**
 * **An option's worth by the few terms** beside the defaults holding the position, life: its payoff
 * (the focus's life it takes, more where the orders name the focus, less its own it loses beyond
 * the blow coming, which holding takes as well, and the metres it walks as ordered, each at
 * `obedience`), the position where it leaves the body less the position now (`placeWorth`), and
 * its time at the rate of play (`rateOfPlay`). With it, how much the position changes (`moves`),
 * and what letting it go now costs (`letGo`): the life it loses while it comes back beyond what
 * holding the position as long costs, none below nothing, and none where it may not be let go.
 */
function fewTermsWorth(terms: Terms, now: Situation, obedience: Obedience): Worth {
  const moves = placeWorth(now, terms.exit, terms.duration) - placeWorth(now, here(now), 0), rate = rateOfPlay(now);
  const letGo = terms.letGo ? Math.max(0, terms.letGo.taken + rate * terms.letGo.seconds) : 0;
  const named = now.orders?.foe !== undefined && now.orders.foe === now.focus?.id, obeying = now.orders?.firm ? FIRST : obedience;
  return { worth: terms.dealt * (named ? 1 + obeying.foe : 1) - (terms.taken - now.predictions.danger) + obeying.metre * terms.orders + moves - rate * terms.duration, moves, letGo };
}

/**
 * **The few terms** (`FEW_TERMS`): combat's objective, an option's payoff in the lives it trades
 * and its orders, the position where it leaves the body (`placeWorth`) and its time at the rate of
 * play (`rateOfPlay`).
 */
export const FEW_TERMS: Objective = deepFreeze({ name: "few terms", worth: fewTermsWorth });

/** **The few terms** (`FEW_TERMS`) as a part of role `objective`: what a chooser that values options prices them by. */
export const FEW_TERMS_PART: ObjectivePart<{ readonly kind: "few-terms" }, Objective> = deepFreeze({
  role: "objective", label: "Few terms", stage: "game", fields: [], slots: [], defaults: { kind: "few-terms" }, keys: { kind: true },
  fits: anyBody, faults: () => [], make: () => FEW_TERMS,
});
