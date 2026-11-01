/**
 * **How a cell is judged from its rows**: each reading's rows on the cell's body (and loadout,
 * where the drill lays its trials out by loadout) against the reading's bar (`Judge`), in the
 * drill's own figures.
 */
import { loadoutKey, type Loadout } from "../../core/items/held.ts";
import type { Json } from "../evaluation.ts";
import { STOPPING_PACE, TURNING_PACE } from "../locomotion/cases.ts";
import type { Cell, Judge, Reading } from "./cells.ts";

/** A row as the table reads it: its condition and its reading. */
export interface TableRow { readonly condition: Json; readonly reading: Json }

/** What one reading of a cell came to: met, short of its bar, or no rows; its figures in words. */
export interface Verdict { readonly state: "met" | "short" | "unread"; readonly figures: string }

/** How many of the target's sixteen falls a group must stand within 6 s; the median it must stand by, s (`risingReport`'s gates). */
const WITHIN6 = 15, MEDIAN = 10, CAP = 30;

/** The share of thrown blows a strike must land (90 %). */
const LANDS = .9;

/**
 * The run's bar: a held run's slowest second at least `HELD_PACE`, m/s; a turning run's slowest second at least `PACED` of the pace asked, and its
 * way at most `TRAIL` rad behind the way asked; a stopped run at least `PACED` of its pace when
 * the stop is asked, and halted within `HALT` s.
 */
const HELD_PACE = 3, PACED = .9, TRAIL = .35, HALT = 1.5;

/** The share of the blows that touch a body its buckler must meet first (4 of 5). */
const SHIELDS = .8;

type Strike = { readonly outcome: string; readonly began: number | null; readonly down: boolean };
type Fall = { readonly stood: boolean; readonly verified: number | null; readonly takeover: unknown };
type Walk = { readonly kind: string; readonly fell: boolean; readonly along: number | null };
type Run = Walk & { readonly held: number | null; readonly trail: number | null; readonly speed: number | null; readonly halt: number | null };
type Cover = { readonly blows: number; readonly shielded: number; readonly down: boolean };

/** Whether a run trial met its bar: its pace held, its turn followed, its stop made. */
function ran(one: Run): boolean {
  if (one.fell) return false;
  switch (one.kind) {
    case "run-held": return one.held !== null && one.held >= HELD_PACE;
    case "run-turn": return one.held !== null && one.held >= PACED * TURNING_PACE && one.trail !== null && one.trail <= TRAIL;
    case "run-stop": return one.speed !== null && one.speed >= PACED * STOPPING_PACE && one.halt !== null && one.halt <= HALT;
    default: return false;
  }
}

/**
 * The loadout a row's condition was played holding: its own; or `left` (empty where it names none)
 * and `held` in the right (the target's and the Cover drill's); empty hands where it names neither.
 */
const loadoutOf = (condition: Record<string, unknown>): Loadout => condition.loadout ? condition.loadout as Loadout
  : { left: (condition.left ?? "empty") as Loadout["left"], right: (condition.held ?? "empty") as Loadout["right"] };

/** The rows of `rows` on `cell`'s body, and on its loadout where `reading` lays its trials out by loadout. */
export function rowsOn(cell: Cell, reading: Reading, rows: readonly TableRow[]): readonly TableRow[] {
  return rows.filter(({ condition }) => {
    const one = condition as Record<string, unknown>;
    return one.model === cell.body && (!reading.byLoadout || loadoutKey(loadoutOf(one)) === loadoutKey(cell.loadout));
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
      const landed = counted.filter((one) => one.outcome === "landed").length, refused = readings.filter((one) => one.outcome === "refused").length;
      const met = counted.length > 0 && landed >= LANDS * counted.length && fell === 0;
      return { state: met ? "met" : "short", figures: `${landed} of ${counted.length} ${judge === "landed" ? "thrown" : "on the body"}, ${fell} fell, ${refused} refused, ${rows.length} trials` };
    }
    case "target": {
      const falls = rows.map((row) => ({ ...(row.reading as unknown as Fall), degrees: (row.condition as { degrees?: number }).degrees ?? 0 })).filter((one) => one.takeover !== null);
      const time = (one: Fall) => one.stood && one.verified !== null ? one.verified : null;
      const stood = falls.filter((one) => time(one) !== null).length, within6 = falls.filter((one) => (time(one) ?? Infinity) <= 6).length;
      const middle = median(falls.map((one) => time(one) ?? CAP)), cardinals = falls.filter((one) => one.degrees % 90 === 0);
      const met = falls.length === 16 && within6 >= WITHIN6 && cardinals.every((one) => (time(one) ?? Infinity) <= 6) && middle !== null && middle <= MEDIAN;
      return { state: met ? "met" : "short", figures: `${stood} of ${falls.length} stood, ${within6} within 6 s, median ${middle?.toFixed(1) ?? "-"} s` };
    }
    case "stood": {
      const falls = rows.map((row) => row.reading as unknown as Fall).filter((one) => one.takeover !== null);
      const stood = falls.filter((one) => one.stood && one.verified !== null), middle = median(stood.map((one) => one.verified!));
      return { state: falls.length === 16 && stood.length >= WITHIN6 ? "met" : "short", figures: `${stood.length} of ${falls.length} stood, median ${middle?.toFixed(1) ?? "-"} s of those` };
    }
    case "run": {
      const readings = rows.map((row) => row.reading as unknown as Run), missed = readings.filter((one) => !ran(one));
      const kinds = [...new Set(missed.map((one) => one.kind))];
      return { state: missed.length === 0 ? "met" : "short",
        figures: `${readings.length - missed.length} of ${readings.length} met, ${readings.filter((one) => one.fell).length} fell${kinds.length ? `; short: ${kinds.join(", ")}` : ""}` };
    }
    case "buckler": {
      const readings = rows.map((row) => row.reading as unknown as Cover), fell = readings.filter((one) => one.down).length;
      const blows = readings.reduce((sum, one) => sum + one.blows, 0), shielded = readings.reduce((sum, one) => sum + one.shielded, 0);
      return { state: blows > 0 && shielded >= SHIELDS * blows && fell === 0 ? "met" : "short", figures: `${shielded} of ${blows} blows met by the buckler first, ${fell} fell, ${rows.length} trials` };
    }
    case "walk": {
      const readings = rows.map((row) => row.reading as unknown as Walk), fell = readings.filter((one) => one.fell).length;
      const forward = readings.filter((one) => one.kind === "walk" && one.along !== null).map((one) => one.along!);
      return { state: fell === 0 ? "met" : "short", figures: `${fell} of ${readings.length} fell, walk along ${median(forward)?.toFixed(2) ?? "-"} of the pace asked (median)` };
    }
    default: { const never: never = judge; throw new Error(`no judge ${String(never)}`); }
  }
}
