/**
 * **How a cell is judged from its rows**: each reading's rows on the cell's body (and loadout,
 * where the drill lays its trials out by loadout), met or short on its bar (`verdictOf`) or
 * scored (`scoreOf`), in the drill's own figures; a scored reading against its baseline
 * (`baselineOf`), with the person's figure beside it (`personOf`).
 */
import { loadoutKey, type Loadout } from "../../core/bodies/items/held.ts";
import type { Json } from "../evaluation.ts";
import { STOPPING_PACE, TURNING_PACE } from "../locomotion/cases.ts";
import { STAND_WITHIN, targetGates } from "../rising.ts";
import { BAR } from "../strike/read.ts";
import type { Cell, HitFigure, MetJudge, Reading, ScoreReading } from "./cells.ts";

/** A row as the table reads it: its condition and its reading. */
export interface TableRow { readonly key?: string; readonly condition: Json; readonly reading: Json; readonly fault?: { readonly message: string } | null }

/** What one met-or-short reading of a cell came to: met, short of its bar, or no rows; its figures in words. */
export interface Verdict { readonly state: "met" | "short" | "unread"; readonly figures: string }

/** What one scored reading of a cell came to: its score, in `unit` (every score is better higher), and the figures beside it in words. */
export interface Score { readonly value: number | null; readonly unit: string; readonly figures: string }

/**
 * The run's bar: a held run's slowest second at least `HELD_PACE`, m/s; a turning run's slowest second at least `PACED` of the pace asked, and its
 * way at most `TRAIL` rad behind the way asked; a stopped run at least `PACED` of its pace when
 * the stop is asked, and halted within `HALT` s.
 */
const HELD_PACE = 3, PACED = .9, TRAIL = .35, HALT = 1.5;

type Hit = { readonly speed: number | null; readonly energy: number; readonly closing: number; readonly held: { readonly value: number } | null };
type Strike = { readonly outcome: string; readonly began: number | null; readonly down: boolean; readonly hit: Hit | null };
type Fall = { readonly stood: boolean; readonly verified: number | null; readonly takeover: number | null };
type Walk = { readonly kind: string; readonly fell: boolean; readonly along: number | null };
type Run = Walk & { readonly held: number | null; readonly trail: number | null; readonly speed: number | null; readonly halt: number | null };
type Cover = { readonly blows: number; readonly shielded: number; readonly down: boolean; readonly outcome?: string; readonly attempted?: boolean };

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

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b), half = sorted.length >> 1;
  return sorted.length % 2 ? sorted[half]! : (sorted[half - 1]! + sorted[half]!) / 2;
};

/** `rows` judged met or short by `judge` (`MetJudge`). */
export function verdictOf(judge: MetJudge, rows: readonly TableRow[], required: readonly { readonly key: string }[]): Verdict {
  const present = new Map(rows.map(row => [row.key, row]));
  const missing = required.filter(one => !present.has(one.key)), faults = rows.filter(row => row.fault != null || row.reading === null);
  if (missing.length || faults.length) return { state: rows.length === 0 ? "unread" : "short", figures: `${required.length - missing.length} of ${required.length} cases, ${missing.length} missing, ${faults.length} faulted` };
  if (required.length === 0 || rows.length === 0) return { state: "unread", figures: "no rows" };
  switch (judge) {
    case "target": {
      const falls = rows.map((row) => {
        const fall = row.reading as unknown as Fall;
        return { degrees: (row.condition as { degrees?: number }).degrees ?? 0, made: fall.takeover !== null, time: fall.stood && fall.verified !== null ? fall.verified : null };
      });
      const { seconds, gates } = targetGates(falls), stood = falls.filter((one) => one.made && one.time !== null);
      const failed = (Object.keys(gates) as (keyof typeof gates)[]).filter((gate) => !gates[gate]);
      return { state: failed.length === 0 ? "met" : "short", figures: `${stood.length} of ${falls.filter(one => one.made).length} actual falls stood, ${falls.filter(one => !one.made).length} not exercised, ${stood.filter((one) => one.time! <= STAND_WITHIN).length} within ${STAND_WITHIN} s, `
        + `median ${seconds.toFixed(1)} s${failed.length ? `; short: ${failed.join(", ")}` : ""}` };
    }
    case "run": {
      const readings = rows.map((row) => row.reading as unknown as Run), missed = readings.filter((one) => !ran(one));
      const kinds = [...new Set(missed.map((one) => one.kind))];
      return { state: missed.length === 0 ? "met" : "short",
        figures: `${readings.length - missed.length} of ${readings.length} met, ${readings.filter((one) => one.fell).length} fell${kinds.length ? `; short: ${kinds.join(", ")}` : ""}` };
    }
    default: { const never: never = judge; throw new Error(`no judge ${String(never)}`); }
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

/** The unit of a hit's figure. */
const unitOf = (figure: HitFigure): string => figure === "energy" ? "J" : "m/s";

/** **The person's figure** for a hit's `figure` (`BAR`, `src/evaluation/strike/read.ts`): a scale beside a score, gating nothing. */
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
 * **`rows` scored as `reading` reads them** (`ScoreJudge`), null where there are none: a strike
 * rung's, the median over the trials begun of the hit's figure (`HitFigure`), a trial whose limb
 * met the mark (landed or weak) at its hit's, any other at 0, with the trials refused and fallen
 * beside; a walk's, the share of its trials not fallen, its forward pace beside; the Cover
 * drill's, the share of the blows that touch the body the buckler meets first.
 */
export function scoreOf(reading: ScoreReading, rows: readonly TableRow[]): Score | null {
  if (rows.length === 0) return null;
  const faulty = rows.filter(row => row.reading === null || row.fault != null);
  if (faulty.length) return { value: null,
    unit: "hit" in reading ? unitOf(reading.hit) : reading.judge === "walk" ? "share not fallen" : "share of blows met by the buckler first",
    figures: `${faulty.length} of ${rows.length} trials faulted` };
  switch (reading.judge) {
    case "landed": case "on-body": {
      const readings = rows.map((row) => row.reading as unknown as Strike), begun = readings.filter((one) => one.began !== null);
      const onMark = begun.filter((one) => (one.outcome === "landed" || one.outcome === "weak") && one.hit !== null);
      const value = median(begun.map((one) => onMark.includes(one) ? figureOf(reading.hit, one.hit!) : 0)) ?? 0;
      return { value, unit: unitOf(reading.hit), figures: `${begun.length} begun, ${onMark.length} on the mark, ${readings.filter((one) => one.outcome === "landed").length} landed, `
        + `${readings.filter((one) => one.down).length} fell, ${readings.filter((one) => one.outcome === "refused").length} refused, ${rows.length} trials` };
    }
    case "walk": {
      const readings = rows.map((row) => row.reading as unknown as Walk), fell = readings.filter((one) => one.fell).length;
      const forward = readings.filter((one) => one.kind === "walk" && one.along !== null).map((one) => one.along!);
      return { value: (readings.length - fell) / readings.length, unit: "share not fallen",
        figures: `${fell} of ${readings.length} fell, walk along ${median(forward)?.toFixed(2) ?? "-"} of the pace asked (median)` };
    }
    case "buckler": {
      const readings = rows.map((row) => row.reading as unknown as Cover), fell = readings.filter((one) => one.down).length;
      const blows = readings.reduce((sum, one) => sum + one.blows, 0), shielded = readings.reduce((sum, one) => sum + one.shielded, 0);
      const unreached = readings.filter(one => one.outcome === "unreached" || one.attempted === false).length;
      const unknown = readings.filter(one => one.outcome !== "unreached" && one.attempted === undefined).length;
      return { value: unreached || unknown ? null : blows > 0 ? shielded / blows : 0, unit: "share of blows met by the buckler first",
        figures: `${shielded} of ${blows} blows, ${fell} fell, ${unreached} unreached, ${rows.length} trials${unknown ? `; ${unknown} attack attempts unrecorded` : ""}` };
    }
    default: { const never: never = reading; throw new Error(`no judge ${String((never as Reading).judge)}`); }
  }
}

/**
 * **A cell's baseline for one reading** (`assets/evaluations/<drill>/baselines.json`, a list of
 * these): its body and loadout, the reading's protocol and subject, and where its rows are: the
 * record's file, the subject's id in it and its version. Written once, when the cell's work
 * begins (`npm run evaluate -- table --baseline`), and never overwritten.
 */
export interface Baseline {
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
