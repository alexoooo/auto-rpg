/**
 * **The panel report**: a contest subject against its baseline (its previous version, or another),
 * each against the same panel members at the same conditions. The verdict reads the pairs in a
 * fixed order and stops at the first that settles it (`settle`), so rows played past it, or read
 * from a record, give the same answer. A battery's comparison is its figures' paired differences.
 */
import { recordingKey } from "../core/recording.ts";
import type { Side } from "../core/spec/body.ts";
import type { BoutReading } from "./contest.ts";
import type { Figure, Json, Table } from "./evaluation.ts";
import type { Row } from "./play.ts";
import type { Unit } from "./run.ts";
import { settle, type SettleRule, type Settled } from "./settle.ts";
import { mean, pairBootstrap, wilson, type Estimate } from "./stats.ts";

/** A subject and its counterpart, each against one panel member at one condition. */
interface Slot {
  readonly subject: string;
  readonly baseline: string;
  readonly member: string;
  readonly condition: Json;
  readonly mine: Unit;
  readonly theirs: Unit;
}

/** Who is on the left of a unit's first case, and who on its right: the subject, then its opponent. */
const seatsOf = (unit: Unit): readonly [string, string] => [unit[0].subjects[0], unit[0].subjects[1]];

/**
 * The slots in `units`: each unit of a subject with a counterpart (`counterpart`) against a member
 * of `panel`, beside the counterpart's unit against that member at that condition; in the order of
 * the subject's unit's first key, a shuffle no version or lane count changes. Only a contest has slots.
 */
export function slotsOf(units: readonly Unit[], counterpart: ReadonlyMap<string, string>, panel: readonly string[]): Slot[] {
  const contests = units.filter((unit) => unit[0].subjects.length === 2);
  const at = new Map(contests.map((unit) => [recordingKey([...seatsOf(unit), unit[0].condition]), unit]));
  const slots = contests.flatMap((unit): Slot[] => {
    const [subject, member] = seatsOf(unit), baseline = counterpart.get(subject);
    if (baseline === undefined || !panel.includes(member)) return [];
    const theirs = at.get(recordingKey([baseline, member, unit[0].condition]));
    return theirs ? [{ subject, baseline, member, condition: unit[0].condition, mine: unit, theirs }] : [];
  });
  return slots.sort((a, b) => a.mine[0].key < b.mine[0].key ? -1 : a.mine[0].key > b.mine[0].key ? 1 : 0);
}

/** `subject`'s value of `figure` over `unit`, its sides averaged: undefined while a row is missing, null for a fault. */
function pairValue(unit: Unit, subject: string, figure: Figure<BoutReading>, rows: ReadonlyMap<string, Row>): number | null | undefined {
  const values: number[] = [];
  for (const one of unit) {
    const row = rows.get(one.key);
    if (!row) return undefined;
    if (row.fault) return null;
    const side: Side = one.subjects[0] === subject ? "left" : "right", value = figure.of(row.reading as BoutReading, side);
    if (value === null) return null;
    values.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
  }
  return mean(values);
}

/** Whether a bout reached its cap with both bars full: neither side hurt the other. */
const isStalemate = (reading: BoutReading): boolean => reading.ending === "time" && reading.bars[0] === 1 && reading.bars[1] === 1;

/** A figure over the slots read: the subject's mean, the baseline's, and their paired difference, each with its interval. */
interface Compared {
  readonly figure: string;
  readonly unit: string;
  readonly subject: Estimate | null;
  readonly baseline: Estimate | null;
  readonly difference: Estimate | null;
}

/** The difference of the verdict's figure where one thing is held: a member, a condition. */
interface Held {
  readonly by: string;
  readonly pairs: number;
  readonly subject: number;
  readonly baseline: number;
}

/** One pair, the subject's value of the verdict's figure beside the baseline's. */
interface Matchup {
  readonly subject: string;
  readonly member: string;
  readonly condition: Json;
  readonly mine: number;
  readonly theirs: number;
}

interface PanelReport {
  /** The slots read in order before the first with a row missing, of all. */
  readonly read: number;
  readonly of: number;
  /** The slots read with a fault on either side, left out of every figure. */
  readonly faults: number;
  readonly settled: Settled;
  readonly figures: readonly Compared[];
  readonly members: readonly Held[];
  readonly conditions: readonly Held[];
  /** The pairs where the subject does worst, worst first. */
  readonly worst: readonly Matchup[];
  /** The share of each side's bouts that are stalemates (`isStalemate`). */
  readonly stalemates: { readonly subject: Estimate | null; readonly baseline: Estimate | null };
  /** The subject against its counterpart directly, by figure, over the head-to-head units with every row. */
  readonly headToHead: readonly { readonly figure: string; readonly value: Estimate | null; readonly pairs: number }[];
}

/** How many of the subject's worst pairs a report lists. */
const WORST = 5;

/** A figure turned so higher is better. */
const turned = (figure: Figure<BoutReading>, value: number): number => figure.better === "higher" ? value : -value;

/**
 * The verdict by `rule` on `slots` (in their order) from `rows`: read up to the first slot with a
 * row missing, a slot with a fault on either side left out; with the slots read and those kept.
 */
export function verdictOf(slots: readonly Slot[], rows: ReadonlyMap<string, Row>, figures: readonly Figure<BoutReading>[], rule: SettleRule): { read: number; clean: Slot[]; settled: Settled } {
  const figure = figures.find((one) => one.name === rule.figure);
  if (!figure) throw new Error(`no figure ${rule.figure} to settle on`);
  const clean: Slot[] = [], differences: number[] = [];
  let read = 0;
  for (; read < slots.length; read++) {
    const { mine, theirs, subject, baseline } = slots[read], a = pairValue(mine, subject, figure, rows), b = pairValue(theirs, baseline, figure, rows);
    if (a === undefined || b === undefined) break;
    if (a === null || b === null) continue;
    clean.push(slots[read]); differences.push(turned(figure, a - b));
  }
  return { read, clean, settled: settle(differences, rule) };
}

/**
 * The report on `slots` (in their order) and the `headToHead` units (subject on the first's left)
 * from `rows`: the verdict by `rule` on its figure, read up to the first slot with a row missing,
 * and every figure over the slots read; a figure is turned so higher is better before it is
 * compared.
 */
export function panelReport(slots: readonly Slot[], headToHead: readonly Unit[], rows: ReadonlyMap<string, Row>, figures: readonly Figure<BoutReading>[], rule: SettleRule): PanelReport {
  const { read, clean, settled } = verdictOf(slots, rows, figures, rule), verdictFigure = figures.find((one) => one.name === rule.figure)!;
  const valuesOf = (figure: Figure<BoutReading>) => clean.map((slot) => [pairValue(slot.mine, slot.subject, figure, rows)!, pairValue(slot.theirs, slot.baseline, figure, rows)!] as const);
  const verdictValues = valuesOf(verdictFigure);
  const held = (key: (slot: Slot) => string): Held[] => [...new Set(clean.map(key))].map((by) => {
    const these = verdictValues.filter((_, k) => key(clean[k]) === by);
    return { by, pairs: these.length, subject: mean(these.map(([mine]) => mine)), baseline: mean(these.map(([, theirs]) => theirs)) };
  });
  const bouts = (side: "mine" | "theirs") => clean.flatMap((slot) => slot[side].map((one) => rows.get(one.key)!.reading as BoutReading));
  const stalemate = (readings: readonly BoutReading[]) => wilson(readings.filter(isStalemate).length, readings.length);
  const whole = headToHead.filter((unit) => unit.every((one) => rows.get(one.key)?.fault === null));
  return {
    read, of: slots.length, faults: read - clean.length, settled,
    figures: figures.map((figure) => {
      const values = valuesOf(figure);
      return { figure: figure.name, unit: figure.unit,
        subject: pairBootstrap(values.map(([mine]) => mine), mean), baseline: pairBootstrap(values.map(([, theirs]) => theirs), mean),
        difference: pairBootstrap(values.map(([mine, theirs]) => mine - theirs), mean) };
    }),
    members: held((slot) => slot.member),
    conditions: held((slot) => recordingKey(slot.condition)),
    worst: clean.map((slot, k) => ({ subject: slot.subject, member: slot.member, condition: slot.condition, mine: verdictValues[k][0], theirs: verdictValues[k][1] }))
      .sort((a, b) => turned(verdictFigure, a.mine) - turned(verdictFigure, b.mine)).slice(0, WORST),
    stalemates: { subject: stalemate(bouts("mine")), baseline: stalemate(bouts("theirs")) },
    headToHead: figures.map((figure) => ({ figure: figure.name, pairs: whole.length,
      value: pairBootstrap(whole.map((unit) => pairValue(unit, seatsOf(unit)[0], figure, rows)!), mean) })),
  };
}

/** A battery's change: each figure's mean paired difference, a subject less its baseline, over the conditions both played. */
export interface BatteryComparison {
  readonly conditions: number;
  /** The conditions only one of the two played. */
  readonly only: { readonly subject: number; readonly baseline: number };
  readonly figures: readonly { readonly figure: string; readonly unit: string; readonly better: "higher" | "lower"; readonly pairs: number; readonly difference: Estimate | null }[];
}

/**
 * **A battery's comparison** of `subject` with `baseline` in `table`: for each figure, the mean of
 * its paired differences over the conditions both played where both read it, with its 95 % interval
 * by resampling the conditions; and the conditions one alone played.
 */
export function batteryComparison(table: Table, subject: string, baseline: string, figures: readonly Figure[]): BatteryComparison {
  const readings = (id: string) => new Map(table.cases.filter((one) => one.subjects[0] === id).map((one) => [recordingKey(one.condition), one.reading]));
  const mine = readings(subject), theirs = readings(baseline), shared = [...mine.keys()].filter((key) => theirs.has(key));
  return {
    conditions: shared.length, only: { subject: mine.size - shared.length, baseline: theirs.size - shared.length },
    figures: figures.map((figure) => {
      const value = (reading: Json): number | null => {
        const one = figure.of(reading, "left");
        return one === null ? null : typeof one === "boolean" ? (one ? 1 : 0) : one;
      };
      const differences = shared.flatMap((key) => {
        const a = value(mine.get(key)!), b = value(theirs.get(key)!);
        return a === null || b === null ? [] : [a - b];
      });
      return { figure: figure.name, unit: figure.unit, better: figure.better, pairs: differences.length, difference: pairBootstrap(differences, mean) };
    }),
  };
}
