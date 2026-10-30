import type { GaitName } from "../../../skills/gaits.ts";
import type { Spot } from "../../../mind/action-window.ts";
import type { PositionPart } from "../../../mind/option-part.ts";
import { anyBody } from "../../../mind/parts.ts";
import { deepFreeze } from "../../../state.ts";
import { hasBlade } from "../weapon.ts";
import type { Situation } from "./option.ts";
import type { Percepts } from "./percepts.ts";
import { dealtAt, edgeOf } from "./percepts.ts";
import { CLINCH } from "./value.ts";

/**
 * **Where an option leaves the body**: a prediction of the percepts it leaves, each by its name
 * (`PERCEPTS`): the range head to head to the focus (`range`, m; Infinity with no focus), the
 * chance it is down there (`down`'s), and the seconds until it is braced there, all its strikes
 * ready (`unbraced`, a gait's, `Going`); and any other percept it says it changes (`posture`,
 * `around`). A percept it does not name is as it is now (`atExit`). A walk's names where on the
 * ground it ends (`at`, a `Spot`), which the chooser looks past (`Option.at`), and the seconds until
 * each of its strikes is ready there, by the action's name (`ready`).
 */
export type Place = { readonly range: number; readonly down: number }
  & { readonly [K in Exclude<keyof Percepts, "range" | "down">]?: Percepts[K] }
  & { readonly at?: Spot; readonly ready?: Readonly<Record<string, number>> };

/** **A percept where `place` leaves the body** (`Place`): its prediction, where it names one; else as it is now. */
export const atExit = <K extends Exclude<keyof Percepts, "range" | "down">>(now: Situation, place: Place, name: K): Percepts[K] =>
  (place[name] ?? now[name]) as Percepts[K];

/**
 * **A gait an option goes by**: its name (`Gait`, null for legs that walk by none) and label, and
 * what it leaves the body once stopped from its top speed, as its profile measured it stopping to
 * throw each of the body's strikes (`dataOf("gait-profiles")`; unmeasured, braced at once and up):
 * the seconds until each strike is ready, by the action's name (`ready`), the most of them
 * (`braced`), and the chance it fell, the most of its profiles' (`down`).
 */
export interface Going {
  readonly gait: GaitName | null;
  readonly label: string;
  readonly ready: Readonly<Record<string, number>>;
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

/** **The seconds the focus takes to face the body** where `place` leaves it: its bearing around the focus (`around`) at the focus's turn (`Predictions.turns`). */
const turning = (now: Situation, place: Place): number => Math.abs(atExit(now, place, "around")) / now.predictions.turns;

/**
 * **The position's few terms**: the lead; a fall's cost (`downCost`) at the chance the body is
 * down there; and, at a focus, the range against how far each side's strikes
 * reach (`edgeOf`): what its own
 * strikes deal the focus there over the time a place is held once it is braced (`pressing`), less
 * what the focus's deal it over that time once it has turned to face the body (`pressure`,
 * `turning`), and the lead at stake: a positive lead risked within a blade's reach throughout
 * the bout, and the lead late in other exchanges, or a deficit kept out of its own reach.
 *
 * Its rate of play is what holding the place costs a second: the focus's pressure where it stands,
 * and in a clinch (`CLINCH`) its falls, so an option that leaves the clinch gains what holding it
 * would have cost.
 */
export const FEW_TERMS: PositionValue = deepFreeze({
  name: "few terms",
  of(now: Situation, place: Place, seconds: number): number {
    const lead = now.lead, fallen = place.down * (place.posture ? now.predictions.downCostAt(place.posture) : now.predictions.downCost), focus = now.focus;
    if (!focus || !Number.isFinite(place.range)) return lead - fallen;
    const theirs = edgeOf(now, now.predictions.pressure), mine = edgeOf(now, now.predictions.pressing);
    const exchange = dealtAt(now.predictions.pressing, now, place.range, Math.max(0, TERMS.held - atExit(now, place, "unbraced")))
      - dealtAt(now.predictions.pressure, now, place.range, Math.max(0, TERMS.held - turning(now, place)));
    const stake = lead > 0 ? place.range <= theirs ? lead : 0 : place.range <= mine ? 0 : -lead;
    return lead - fallen + (1 - place.down) * (exchange - (lead > 0 && hasBlade(focus.spec) ? 1 : lateness(now, seconds)) * stake);
  },
  rate(now: Situation): number {
    const focus = now.focus;
    if (!focus) return 0;
    const clinch = !now.down && now.apart < CLINCH.within ? now.predictions.downCost * CLINCH.falls : 0;
    return -dealtAt(now.predictions.pressure, now, now.range, 1) - clinch;
  },
});

/** **The few terms** (`FEW_TERMS`) as a part of role `position`: what a chooser that values places prices them by. */
export const FEW_TERMS_PART: PositionPart<{ readonly kind: "skeleton-few-terms" }, PositionValue> = deepFreeze({
  role: "position", label: "Few terms", stage: "game", fields: [], slots: [], defaults: { kind: "skeleton-few-terms" }, keys: { kind: true },
  fits: anyBody, faults: () => [], make: () => FEW_TERMS,
});
