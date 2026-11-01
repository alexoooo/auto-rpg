/**
 * **How a cell is judged from its rows**: each reading's rows on the cell's body (and loadout,
 * where the drill lays its trials out by loadout) against the reading's bar (`Judge`), in the
 * drill's own figures.
 */
import { loadoutKey, type Loadout } from "../../core/items/held.ts";
import type { Json } from "../evaluation.ts";
import type { Cell, Judge, Reading } from "./cells.ts";

/** A row as the table reads it: its condition and its reading. */
export interface TableRow { readonly condition: Json; readonly reading: Json }

/** What one reading of a cell came to: met, short of its bar, or no rows; its figures in words. */
export interface Verdict { readonly state: "met" | "short" | "unread"; readonly figures: string }

/** How many of the target's sixteen falls a group must stand within 6 s; the median it must stand by, s (`risingReport`'s gates). */
const WITHIN6 = 15, MEDIAN = 10, CAP = 30;

/** The share of thrown blows a strike must land (the plan's 90 %). */
const LANDS = .9;

type Strike = { readonly outcome: string; readonly began: number | null; readonly down: boolean };
type Fall = { readonly stood: boolean; readonly verified: number | null; readonly takeover: unknown };
type Walk = { readonly kind: string; readonly fell: boolean; readonly along: number | null };

/** The loadout a row's condition was played holding: its own, or empty and `held` in the right (the target's). */
const loadoutOf = (condition: Record<string, unknown>): Loadout | null => condition.loadout ? condition.loadout as Loadout
  : typeof condition.held === "string" ? { left: "empty", right: condition.held as Loadout["right"] } : null;

/** The rows of `rows` on `cell`'s body, and on its loadout where `reading` names one. */
export function rowsOn(cell: Cell, reading: Reading, rows: readonly TableRow[]): readonly TableRow[] {
  const loadout = "judge" in reading ? reading.loadout : undefined;
  return rows.filter(({ condition }) => {
    const one = condition as Record<string, unknown>;
    if (one.model !== cell.body) return false;
    const held = loadout && loadoutOf(one);
    return !loadout || (held !== null && held !== undefined && loadoutKey(held) === loadoutKey(loadout));
  });
}

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b), half = sorted.length >> 1;
  return sorted.length % 2 ? sorted[half]! : (sorted[half - 1]! + sorted[half]!) / 2;
};

/** `rows` judged by `judge` (`Judge`). */
export function verdictOf(judge: Judge, rows: readonly TableRow[]): Verdict {
  if (rows.length === 0) return { state: "unread", figures: "no rows" };
  switch (judge) {
    case "landed": case "on-body": {
      const readings = rows.map((row) => row.reading as unknown as Strike), fell = readings.filter((one) => one.down).length;
      const counted = judge === "landed" ? readings.filter((one) => one.began !== null)
        : readings.filter((one) => one.outcome === "landed" || one.outcome === "weak" || one.outcome === "elsewhere");
      const landed = counted.filter((one) => one.outcome === "landed").length;
      const met = counted.length > 0 && landed >= LANDS * counted.length && fell === 0;
      return { state: met ? "met" : "short", figures: `${landed} of ${counted.length} ${judge === "landed" ? "thrown" : "on the body"}, ${fell} fell, ${rows.length} trials` };
    }
    case "target": {
      const falls = rows.map((row) => ({ ...(row.reading as unknown as Fall), degrees: (row.condition as { degrees?: number }).degrees ?? 0 })).filter((one) => one.takeover !== null);
      const time = (one: Fall) => one.stood && one.verified !== null ? one.verified : null;
      const stood = falls.filter((one) => time(one) !== null).length, within6 = falls.filter((one) => (time(one) ?? Infinity) <= 6).length;
      const middle = median(falls.map((one) => time(one) ?? CAP)), cardinals = falls.filter((one) => one.degrees % 90 === 0);
      const met = falls.length === 16 && within6 >= WITHIN6 && cardinals.every((one) => (time(one) ?? Infinity) <= 6) && middle !== null && middle <= MEDIAN;
      return { state: met ? "met" : "short", figures: `${stood} of ${falls.length} stood, ${within6} within 6 s, median ${middle?.toFixed(1) ?? "-"} s` };
    }
    case "walk": {
      const readings = rows.map((row) => row.reading as unknown as Walk), fell = readings.filter((one) => one.fell).length;
      const forward = readings.filter((one) => one.kind === "walk" && one.along !== null).map((one) => one.along!);
      return { state: fell === 0 ? "met" : "short", figures: `${fell} of ${readings.length} fell, walk along ${median(forward)?.toFixed(2) ?? "-"} of the pace asked (median)` };
    }
    default: { const never: never = judge; throw new Error(`no judge ${String(never)}`); }
  }
}
