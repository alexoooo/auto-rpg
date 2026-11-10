/**
 * **How a cell is judged from its rows**: each trial's value in the game's own terms (`trialValue`),
 * the reading's value their mean over its whole protocol (`valueOf`), and a version against another
 * paired trial by trial, beyond the spread of the trials (`compareValues`); with the figures beside
 * it, a strike's hit against the person's (`personOf`), and a cell's baseline (`baselineOf`).
 */
import { recordingKey } from "../../core/world/recording.ts";
import { loadoutKey, type Loadout } from "../../core/bodies/items/held.ts";
import type { Json } from "../evaluation.ts";
import { coverValue, type CoverReading } from "../cover/read.ts";
import { timeToStand, type FallReading } from "../fall.ts";
import { ordersValue } from "../order-time.ts";
import { mean, medianOf, pairBootstrap } from "../stats.ts";
import { BAR, strikeValue, type StrikeReading } from "../strike/read.ts";
import type { Cell, HitFigure, Judge, Reading } from "./cells.ts";

/** A row as the table reads it: its condition and its reading. */
interface TableRow { readonly key?: string; readonly condition: Json; readonly reading: Json; readonly fault?: { readonly message: string } | null }

/** What a value is counted in, and which way is better. */
export interface ValueUnit { readonly unit: string; readonly better: "higher" | "lower" }

/** Each judge's value: a stand's seconds, a move's seconds lost against its orders, a blow's life traded a second, a cover's life lost. */
export function unitOf(judge: Judge): ValueUnit {
  switch (judge) {
    case "stand": return { unit: "s to stand", better: "lower" };
    case "orders": return { unit: "s lost against the orders", better: "lower" };
    case "strike": return { unit: "hp a second traded", better: "higher" };
    case "cover": return { unit: "hp lost a trial", better: "lower" };
    default: { const never: never = judge; throw new Error(`no judge ${String(never)}`); }
  }
}

/** The movement a value reads: the seconds lost against the orders and how long down at the end, absent from rows read before they were. */
type Moved = { readonly lost?: number; readonly downFor?: number | null; readonly fell: boolean };

/**
 * **One trial's value** as `judge` reads it, a fall's rest costing `rise` s (the body's time to
 * stand): null where the trial does not count (a fall not made, a blow not begun, a cover never
 * attacked) or its row predates the value.
 */
export function trialValue(judge: Judge, reading: Json, rise: number): number | null {
  switch (judge) {
    case "stand": return timeToStand(reading as unknown as FallReading);
    case "orders": { const r = reading as unknown as Moved; return r.lost === undefined ? null : ordersValue({ lost: r.lost, downFor: r.downFor ?? null }, rise); }
    case "strike": { const r = reading as unknown as StrikeReading; return r.taken === undefined || r.recovers === undefined ? null : strikeValue(r, rise); }
    case "cover": return coverValue(reading as unknown as CoverReading);
    default: { const never: never = judge; throw new Error(`no judge ${String(never)}`); }
  }
}

/**
 * The loadout a row's condition was played holding: its own; or `left` (empty where it names none)
 * and `held` in the right (the Cover drill's); empty hands where it names neither.
 */
const loadoutOf = (condition: Record<string, unknown>): Loadout => condition.loadout ? condition.loadout as Loadout
  : { left: (condition.left ?? "empty") as Loadout["left"], right: (condition.held ?? "empty") as Loadout["right"] };

/** The rows of `rows` on `cell`'s body, and on its loadout where `reading` lays its trials out by loadout. */
export function rowsOn(cell: Pick<Cell, "body" | "loadout">, reading: Pick<Reading, "byLoadout">, rows: readonly TableRow[]): readonly TableRow[] {
  return rows.filter(({ condition }) => {
    const one = condition as Record<string, unknown>;
    return one.model === cell.body && (!reading.byLoadout || loadoutKey(loadoutOf(one)) === loadoutKey(cell.loadout));
  });
}

/** **A reading's value**: each counted trial's, by its condition; their mean (null where none counts, or the protocol is not whole); and the figures beside it in words. */
export interface Valued { readonly trials: ReadonlyMap<string, number>; readonly value: number | null; readonly figures: string }

/**
 * **`rows` valued as `reading` reads them**, a fall's rest costing `rise` s, against the protocol's
 * `required` cases by condition: valued only where every case has a row and none faulted, so one
 * trial never stands for a protocol.
 */
export function valueOf(reading: Pick<Reading, "judge"> & { readonly hit?: HitFigure }, rows: readonly TableRow[], required: readonly { readonly condition: Json }[], rise: number): Valued {
  const present = new Set(rows.map(row => recordingKey(row.condition))), missing = required.filter(one => !present.has(recordingKey(one.condition))).length;
  const faulted = rows.filter(row => row.fault != null || row.reading === null).length;
  const trials = new Map<string, number>();
  for (const row of rows) {
    if (row.fault != null || row.reading === null) continue;
    const value = trialValue(reading.judge, row.reading, rise);
    if (value !== null) trials.set(recordingKey(row.condition), value);
  }
  const whole = rows.length > 0 && missing === 0 && faulted === 0;
  const coverage = missing || faulted ? `; ${required.length - missing} of ${required.length} cases, ${faulted} faulted` : "";
  return { trials, value: whole && trials.size > 0 ? mean([...trials.values()]) : null,
    figures: `${trials.size} of ${rows.length} trials counted, ${figuresOf(reading, rows.filter(row => row.fault == null && row.reading !== null))}${coverage}` };
}

/** What `reading`'s rows came to beside their value, in words. */
function figuresOf(reading: Pick<Reading, "judge"> & { readonly hit?: HitFigure }, rows: readonly TableRow[]): string {
  const readings = rows.map(row => row.reading as Record<string, unknown>);
  switch (reading.judge) {
    case "stand": {
      const made = readings.filter(one => one.takeover !== null), times = made.map(one => timeToStand(one as unknown as FallReading)!);
      return `${made.filter(one => one.stood && one.verified !== null).length} of ${made.length} falls stood, ${readings.length - made.length} not made, `
        + `median ${medianOf(times)?.toFixed(1) ?? "-"} s, ${times.filter(time => time <= 10).length} within the owner's 10 s`;
    }
    case "orders": return `${readings.filter(one => one.fell).length} fell, ${readings.filter(one => one.downFor != null).length} ended down`;
    case "strike": {
      const strikes = readings as unknown as (StrikeReading & { readonly hit: Hit | null })[], begun = strikes.filter(one => one.began !== null);
      const onMark = begun.filter(one => (one.outcome === "landed" || one.outcome === "weak") && one.hit !== null);
      const hit = reading.hit === undefined ? "" : `, the hit's ${medianOf(onMark.map(one => figureOf(reading.hit!, one.hit!)))?.toFixed(2) ?? "-"} ${reading.hit === "energy" ? "J" : "m/s"} on the mark (median; the person's ${personOf(reading.hit)})`;
      return `${begun.length} begun, ${onMark.length} on the mark, ${strikes.filter(one => one.outcome === "landed").length} landed, `
        + `${strikes.filter(one => one.down).length} fell, ${strikes.filter(one => one.outcome === "refused").length} refused${hit}`;
    }
    case "cover": {
      const covers = readings as unknown as CoverReading[], blows = covers.reduce((sum, one) => sum + one.blows, 0);
      return `${covers.reduce((sum, one) => sum + one.shielded, 0)} of ${blows} blows met by the buckler first, `
        + `${covers.reduce((sum, one) => sum + one.headTaken, 0).toFixed(1)} hp on the head, ${covers.filter(one => one.down).length} fell, ${covers.filter(one => one.attempted !== true).length} unattacked`;
    }
    default: { const never: never = reading.judge; throw new Error(`no judge ${String(never)}`); }
  }
}

type Hit = { readonly speed: number | null; readonly energy: number; readonly closing: number; readonly held: { readonly value: number } | null };

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

/**
 * **A cell's baseline for one reading** (`assets/evaluations/<drill>/baselines.json`, a list of
 * these): its body and loadout, the reading's protocol and subject, and where its rows are: the
 * record's file, the subject's id in it and its version. Written once, when the cell's work begins
 * (`npm run evaluate -- table --baseline`), and never overwritten.
 */
interface Baseline {
  readonly body: string;
  readonly loadout: string;
  readonly protocol: string;
  readonly subject: string;
  readonly record: string;
  /** Every compatible partial record contributing to this baseline, where more than one does. */
  readonly records?: readonly string[];
  readonly id: string;
  readonly version: string;
}

/** `cell`'s baseline for `reading` among its drill's `baselines`; null where it has none. */
export const baselineOf = (baselines: readonly Baseline[], cell: Pick<Cell, "body" | "loadout">, reading: Pick<Reading, "protocol" | "subject">): Baseline | null =>
  baselines.find((one) => one.body === cell.body && one.loadout === loadoutKey(cell.loadout) && one.protocol === reading.protocol && one.subject === reading.subject) ?? null;
