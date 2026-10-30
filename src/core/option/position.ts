import type { GaitName } from "../skills/gaits.ts";
import type { Spot } from "../mind/action-window.ts";
import type { Situation } from "./option.ts";
import type { Percepts } from "./percepts.ts";

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

