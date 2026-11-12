/**
 * **How a cell is judged from its trials**: what a trial keeps for its judge (`keep`), each
 * trial's value in the game's own terms (`trialValue`), the reading's value their mean over its
 * whole protocol (`valueOf`), and a version against another paired trial by trial, beyond the
 * spread of the trials (`compareValues`); with the figures beside it and a strike's hit against
 * the person's (`personOf`).
 */
import { loadoutKey, type Loadout } from "../../core/bodies/items/held.ts";
import type { Json } from "../evaluation.ts";
import { coverValue, type CoverReading } from "../cover/read.ts";
import { STAND_WITHIN } from "../fall.ts";
import { ordersValue } from "../order-time.ts";
import { ROW_HEAD, rounded, type Kept, type Result } from "../results.ts";
import { mean, medianOf, pairBootstrap } from "../stats.ts";
import { BAR, strikeOffered, strikeTrade, type StrikeReading } from "../strike/read.ts";
import type { WayUpReading } from "../way-up/cases.ts";
import { ATTEMPT_CAP, attemptsValue, wayUpAttempts } from "../way-up/read.ts";
import type { Cell, HitFigure, Judge, Reading } from "./cells.ts";

/**
 * **What a fall costs** a trial of any skill but a way up's that ends down, s: the reference time
 * to stand (`STAND_WITHIN`), the same on every body, so no cell moves for a way up it does not read.
 */
export const FALL_PRICE = STAND_WITHIN;

/** A reading as its judge needs it: how its trials are valued, and for a strike what its figure reads of the hit. */
type Judged = Pick<Reading, "judge"> & { readonly hit?: HitFigure };

/** A trial as the table reads it: its condition's name (`caseName`), what its judge keeps of it (null for a fault), and its outcome's label where its result says. */
export interface Trial { readonly at: string; readonly kept: Kept | null; readonly outcome: string | null }

/** A result's trials on the conditions `names`, its list's. */
export const resultTrials = (result: Pick<Result, "trials" | "outcomes">, names: readonly string[]): Trial[] =>
  (result.trials ?? []).map((row, k) => ({ at: names[k]!, kept: row && row.slice(ROW_HEAD), outcome: row && (result.outcomes?.[row[1]!]?.label ?? null) }));

/** What a value is counted in, and which way is better. */
export interface ValueUnit { readonly unit: string; readonly better: "higher" | "lower" }

/** Each judge's value: a way up's seconds an attempt, a move's seconds lost against its orders, a blow's life traded a second, a cover's life lost. */
export function unitOf(judge: Judge): ValueUnit {
  switch (judge) {
    case "way-up": return { unit: "s an attempt", better: "lower" };
    case "orders": return { unit: "s lost against the orders", better: "lower" };
    case "strike": return { unit: "hp a second traded", better: "higher" };
    case "cover": return { unit: "hp lost a trial", better: "lower" };
    default: { const never: never = judge; throw new Error(`no judge ${String(never)}`); }
  }
}

/** The movement a value reads: the seconds lost against the orders and how long down at the end, absent from a reading made before they were read. */
type Moved = { readonly lost?: number; readonly downFor?: number | null; readonly fell: boolean };

/** What a hit gives a strike's figure (`StrikeHit`). */
type Hit = { readonly speed: number | null; readonly energy: number; readonly closing: number; readonly held: { readonly value: number } | null };

const flag = (value: boolean): number => value ? 1 : 0;
const number = (value: number | null | undefined): number | null => value == null ? null : rounded(value);

/**
 * **What a trial keeps for its judge**, from its drill's reading `read`: the numbers its value and
 * the figures beside it are made of.
 * - `way-up`: the attempts at the way up (null for a fall not made, 0 for one not exercised), those
 *   that reached where it goes and their seconds together (`wayUpAttempts`); whether the body stood.
 * - `orders`: the seconds lost against the orders (null where the reading has none); how long down
 *   at the end, s (null where it stood); whether it fell.
 * - `strike`: the life traded, hp, and the cycle before a fall's rise, s (`strikeTrade`; null for an
 *   action not begun); whether the striker fell; what the figure reads of the hit (null where
 *   nothing hit).
 * - `cover`: the life lost, hp (null where the opponent attempted no attack); the blows that
 *   touched, those the buckler met first, the life lost on the head, hp; whether it fell.
 */
export function keep(reading: Judged, read: Json): Kept {
  switch (reading.judge) {
    case "way-up": {
      const r = read as unknown as WayUpReading, one = wayUpAttempts(r);
      return [one?.attempts ?? null, one?.reached ?? null, number(one?.reachedSeconds), flag(r.stood && r.verified !== null)];
    }
    case "orders": { const r = read as unknown as Moved; return [number(r.lost), number(r.downFor), flag(r.fell)]; }
    case "strike": {
      const r = read as unknown as StrikeReading & { readonly hit: Hit | null };
      const trade = r.taken === undefined || r.recovers === undefined ? null : strikeTrade(r);
      return [number(trade?.net), number(trade?.cycle), flag(r.down), r.hit === null || reading.hit === undefined ? null : rounded(figureOf(reading.hit, r.hit))];
    }
    case "cover": { const r = read as unknown as CoverReading; return [number(coverValue(r)), r.blows, r.shielded, rounded(r.headTaken), flag(r.down)]; }
    default: { const never: never = reading.judge; throw new Error(`no judge ${String(never)}`); }
  }
}

/**
 * **One trial's value** as `judge` reads what it kept (`keep`) and its outcome, a fall's rest
 * costing `rise` s (the table's `FALL_PRICE`). A way up's is its seconds an attempt (`attemptsValue`,
 * an attempt not reaching where it goes at `ATTEMPT_CAP`). A strike's is its life traded over its cycle, a fall
 * adding its rise; a blow not begun where the drill asked for it (`strikeOffered`) is
 * worth 0. Null where the trial does not count: a fall not made or not exercised, a blow whose
 * fixture did not reach its case, a cover never attacked.
 */
export function trialValue(judge: Judge, { kept, outcome }: { readonly kept: Kept; readonly outcome: string | null }, rise: number): number | null {
  switch (judge) {
    case "way-up": return kept[0] === null ? null : attemptsValue({ attempts: kept[0]!, reached: kept[1]!, reachedSeconds: kept[2]! });
    case "cover": return kept[0]!;
    case "orders": return kept[0] === null ? null : ordersValue({ lost: kept[0]!, downFor: kept[1]! }, rise);
    case "strike": return kept[0] !== null ? kept[0]! / (kept[1]! + (kept[2] ? rise : 0)) : strikeOffered(outcome) ? 0 : null;
    default: { const never: never = judge; throw new Error(`no judge ${String(never)}`); }
  }
}

/**
 * The loadout a condition is played holding: its own; or `left` (empty where it names none) and
 * `held` in the right (the Cover drill's); empty hands where it names neither.
 */
const loadoutOf = (condition: Record<string, unknown>): Loadout => condition.loadout ? condition.loadout as Loadout
  : { left: (condition.left ?? "empty") as Loadout["left"], right: (condition.held ?? "empty") as Loadout["right"] };

/** Those of `cases` on `cell`'s body, and on its loadout where `reading` lays its trials out by loadout. */
export function casesOn<T extends { readonly condition: Json }>(cell: Pick<Cell, "body" | "loadout">, reading: Pick<Reading, "byLoadout">, cases: readonly T[]): T[] {
  return cases.filter(({ condition }) => {
    const one = condition as Record<string, unknown>;
    return one.model === cell.body && (!reading.byLoadout || loadoutKey(loadoutOf(one)) === loadoutKey(cell.loadout));
  });
}

/**
 * **A reading's value**: each counted trial's, by its condition's name; whether the protocol is
 * whole (every case has a trial, none faulted); the trials' mean (null where it is not whole or
 * none counts); and the figures beside it in words.
 */
export interface Valued { readonly trials: ReadonlyMap<string, number>; readonly whole: boolean; readonly value: number | null; readonly figures: string }

/**
 * **`trials` valued as `reading` reads them**, a fall's rest costing `rise` s, against the
 * protocol's `required` cases by name: valued only where every case has a trial and none faulted,
 * so one trial never stands for a protocol.
 */
export function valueOf(reading: Judged, trials: readonly Trial[], required: readonly string[], rise: number): Valued {
  const present = new Set(trials.map(trial => trial.at)), missing = required.filter(name => !present.has(name)).length;
  const read = trials.filter(trial => trial.kept !== null), faulted = trials.length - read.length;
  const values = new Map<string, number>();
  for (const trial of read) {
    const value = trialValue(reading.judge, { kept: trial.kept!, outcome: trial.outcome }, rise);
    if (value !== null) values.set(trial.at, value);
  }
  const whole = trials.length > 0 && missing === 0 && faulted === 0;
  const coverage = missing || faulted ? `; ${required.length - missing} of ${required.length} cases, ${faulted} faulted` : "";
  return { trials: values, whole, value: whole && values.size > 0 ? mean([...values.values()]) : null,
    figures: `${values.size} of ${trials.length} trials counted, ${figuresOf(reading, read)}${coverage}` };
}

/** How many of `trials` came to each outcome, the commonest first: `23 landed, 6 outside`. */
export function outcomeCounts(trials: readonly Trial[]): string {
  const counts = new Map<string, number>();
  for (const { outcome } of trials) if (outcome !== null) counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([label, count]) => `${count} ${label}`).join(", ");
}

/** What `reading`'s trials came to beside their value, in words. */
function figuresOf(reading: Judged, trials: readonly Trial[]): string {
  const rows = trials.map(trial => trial.kept!);
  switch (reading.judge) {
    case "way-up": {
      const made = rows.filter(row => row[0] !== null), exercised = made.filter(row => row[0]! > 0);
      const attempts = exercised.reduce((sum, row) => sum + row[0]!, 0), reached = exercised.reduce((sum, row) => sum + row[1]!, 0);
      return `${attempts} attempts over ${exercised.length} falls, ${reached} reached, the rest at ${ATTEMPT_CAP} s; `
        + `${made.length - exercised.length} falls not exercised, ${rows.length - made.length} not made; ${made.filter(row => row[3]).length} of ${made.length} stood`;
    }
    case "orders": return `${rows.filter(row => row[2]).length} fell, ${rows.filter(row => row[1] !== null).length} ended down`;
    case "strike": {
      const begun = trials.filter(trial => trial.kept![0] !== null);
      const declined = trials.filter(trial => trial.kept![0] === null && strikeOffered(trial.outcome));
      const onMark = begun.filter(trial => (trial.outcome === "landed" || trial.outcome === "weak") && trial.kept![3] !== null);
      const hit = reading.hit === undefined ? "" : `; the hit's ${medianOf(onMark.map(trial => trial.kept![3]!))?.toFixed(2) ?? "-"} ${reading.hit === "energy" ? "J" : "m/s"} on the mark (median; the person's ${personOf(reading.hit)})`;
      return `${begun.length} begun, ${onMark.length} on the mark, ${rows.filter(row => row[2]).length} fell, `
        + `${declined.length} not begun at 0; ${outcomeCounts(trials)}${hit}`;
    }
    case "cover": {
      const blows = rows.reduce((sum, row) => sum + row[1]!, 0);
      return `${rows.reduce((sum, row) => sum + row[2]!, 0)} of ${blows} blows met by the buckler first, `
        + `${rows.reduce((sum, row) => sum + row[3]!, 0).toFixed(1)} hp on the head, ${rows.filter(row => row[4]).length} fell, ${rows.filter(row => row[0] === null).length} unattacked`;
    }
    default: { const never: never = reading.judge; throw new Error(`no judge ${String(never)}`); }
  }
}

/**
 * What a hit gives the figure `figure` reads (`HitFigure`): a limb's speed over its last run in;
 * the contact's energy; its closing speed; an edge's far end's speed, as its bar read it (`held`).
 */
function figureOf(figure: HitFigure, hit: Hit): number {
  switch (figure) {
    case "fist": case "foot": return hit.speed ?? 0;
    case "energy": return hit.energy;
    case "point": return hit.closing;
    case "edge": return hit.held?.value ?? 0;
    default: { const never: never = figure; throw new Error(`no hit figure ${String(never)}`); }
  }
}

/** **The person's figure** for a hit's `figure` (`BAR`, `src/evaluation/strike/read.ts`): a scale beside a value, deciding nothing. */
export function personOf(figure: HitFigure): string {
  switch (figure) {
    case "fist": return `${BAR.speed.right} m/s rear hand, ${BAR.speed.left} m/s lead`;
    case "foot": return `${BAR.foot} m/s`;
    case "energy": return `${BAR.held.energy} J`;
    case "point": return `${BAR.held.point} m/s`;
    case "edge": return `${BAR.held.edge} m/s`;
    default: { const never: never = figure; throw new Error(`no hit figure ${String(never)}`); }
  }
}

/**
 * **A version against another**, trial by trial on the conditions both counted: the mean
 * difference (`now` less `then`) with its 95 % paired bootstrap interval, and the verdict: `better`
 * or `worse` where the interval leaves zero on that side (`better` the way `unit` says), else
 * `within` the spread of the trials; `unpaired` where no condition counted in both.
 */
export function compareValues(now: ReadonlyMap<string, number>, then: ReadonlyMap<string, number>, unit: ValueUnit):
  { readonly verdict: "better" | "worse" | "within" | "unpaired"; readonly pairs: number; readonly difference: number | null; readonly low: number | null; readonly high: number | null } {
  const differences = [...now].flatMap(([key, value]) => then.has(key) ? [value - then.get(key)!] : []);
  const estimate = pairBootstrap(differences, mean);
  if (estimate === null) return { verdict: "unpaired", pairs: 0, difference: null, low: null, high: null };
  // The interval turned so that a gain is positive.
  const [low, high] = unit.better === "higher" ? [estimate.low, estimate.high] : [-estimate.high, -estimate.low];
  const verdict = low > 0 ? "better" : high < 0 ? "worse" : "within";
  return { verdict, pairs: differences.length, difference: estimate.value, low: estimate.low, high: estimate.high };
}
