/**
 * **The runner**: an evaluation's cases for its subjects, each under a key that changes only when
 * something it plays changes; the cases not yet played, played on lanes; and what the complete
 * rows give each subject.
 */
import type { EngineName } from "../core/engine/engines.ts";
import { recordingKey } from "../core/recording.ts";
import type { Side } from "../core/spec/body.ts";
import { senseDelayOf } from "../arena/duel.ts";
import type { CaseWorld, Evaluation, Json, Subject, Table } from "./evaluation.ts";
import { runLanes, type Spawn } from "./lanes.ts";
import { pairsOf, type Schedule } from "./schedule.ts";
import type { Row } from "./play.ts";
import { sha256Text } from "./sha256.ts";
import { mean, median, pairBootstrap, wilson, type Estimate } from "./stats.ts";

/** One case: its subjects by id (a contest's left first), condition and world; how long it may last, s; its key and code. */
export interface Case {
  readonly subjects: readonly string[];
  readonly condition: Json;
  readonly world: CaseWorld;
  readonly seconds: number;
  readonly key: string;
  readonly code: string;
}

/** The unit of evidence: in a contest, one condition with each side on the left; else one case. */
export type Unit = readonly Case[];

/** **A condition left unplayed** for its subjects (a contest's pair), and why: each seated subject's faults there (`Cases.faults`), prefixed with its id. */
export interface Dropped {
  readonly subjects: readonly string[];
  readonly condition: Json;
  readonly reasons: readonly string[];
}

/** What a worker is given to play a case, as plain data. */
interface CaseJob {
  readonly evaluation: string;
  readonly protocol: string;
  readonly key: string;
  readonly condition: Json;
  readonly world: CaseWorld;
  readonly seconds: number;
}

/**
 * A case's key: the digest of everything it plays. The world holds every subject's value in full
 * and no index or label, so adding a subject changes no other key; `code` is what the code it runs
 * is (the environment and its minds' own code, `caseCoder`).
 */
const keyOf = (fields: { evaluation: string; play: Json; engine: EngineName; world: CaseWorld; seconds: number; code: string }): string =>
  sha256Text(recordingKey(fields)).slice(0, 32);

/** `world` with a bout's reaction time written in its recipe (`senseDelayOf`), so its key and record name it. */
function named(world: CaseWorld): CaseWorld {
  return world.kind === "bout" ? { ...world, recipe: { ...world.recipe, senseDelay: senseDelayOf(world.recipe) } } : world;
}

/** The reaction times, s, `units`' bouts are played under, each once, in the order met. */
export const senseDelaysOf = (units: readonly Unit[]): number[] =>
  [...new Set(units.flat().flatMap((one) => one.world.kind === "bout" ? [senseDelayOf(one.world.recipe)] : []))];

/**
 * The cases of `evaluation` on `protocol` for `subjects`, unit by unit, in the definition's order:
 * arity 0 each condition; 1 each subject on each condition it fits; 2 each pair `schedule` makes
 * on each condition both fit, the first on the left then the second; each case's code what `code`
 * makes of its world. Beside them, each condition a subject or pair does not fit, and why
 * (`Dropped`). Refused for a subject that fits no condition, or a pair that share none.
 */
export function casesOf(evaluation: Evaluation, protocol: string, subjects: readonly Subject[],
  { engine, code: codeOf, schedule }: { engine: EngineName; code: (world: CaseWorld) => string; schedule: Schedule }): { readonly units: Unit[]; readonly dropped: Dropped[] } {
  const cases = evaluation.protocols[protocol];
  if (!cases) throw new Error(`${evaluation.id} has no protocol ${protocol}: ${Object.keys(evaluation.protocols).join(", ")}`);
  const make = (seated: readonly Subject[], condition: Json): Case => {
    const world = named(cases.world(seated.map((subject) => subject.value), condition, engine, seated.map((subject) => subject.character ?? {}))), code = codeOf(world);
    return { subjects: seated.map((subject) => subject.id), condition, world, seconds: cases.seconds, code,
      key: keyOf({ evaluation: evaluation.id, play: cases.play, engine, world, seconds: cases.seconds, code }) };
  };
  const faults = (subject: Subject, condition: Json) => cases.faults?.(subject.value, condition, subject) ?? [];
  for (const subject of subjects) if (cases.arity > 0 && cases.conditions.every((condition) => faults(subject, condition).length > 0))
    throw new Error(`${subject.label} fits no condition of ${evaluation.id} ${protocol}: ${[...new Set(cases.conditions.flatMap((condition) => faults(subject, condition)))].join("; ")}`);
  const dropped: Dropped[] = [];
  const fitting = (...seated: Subject[]) => cases.conditions.filter((condition) => {
    const reasons = seated.flatMap((subject) => faults(subject, condition).map((fault) => `${subject.id}: ${fault}`));
    if (reasons.length > 0) dropped.push({ subjects: seated.map((subject) => subject.id), condition, reasons });
    return reasons.length === 0;
  });
  switch (cases.arity) {
    case 0: return { units: cases.conditions.map((condition) => [make([], condition)]), dropped };
    case 1: return { units: subjects.flatMap((subject) => fitting(subject).map((condition) => [make([subject], condition)])), dropped };
    case 2: {
      const units: Unit[] = [];
      for (const [a, b] of pairsOf(subjects, schedule)) {
        const both = fitting(a, b);
        if (both.length === 0) throw new Error(`${a.label} and ${b.label} share no condition of ${evaluation.id} ${protocol}`);
        for (const condition of both) units.push([make([a, b], condition), make([b, a], condition)]);
      }
      return { units, dropped };
    }
    default: {
      const never: never = cases.arity;
      throw new Error(`no arity ${String(never)}`);
    }
  }
}

/** The order units run in: by their first case's key, a shuffle that neither lane count nor finishing order changes. */
export const runOrder = (units: readonly Unit[]): Unit[] => [...units].sort((a, b) => a[0].key < b[0].key ? -1 : a[0].key > b[0].key ? 1 : 0);

/**
 * Play every case of `units` with no row in `rows` on `lanes` workers, in the units' order, until
 * `stop` says so: each row is handed to `onRow` as it comes, each case whose worker died or overran
 * to `onLost`, and left without a row.
 */
export async function runEvaluation(units: readonly Unit[], rows: ReadonlyMap<string, Row>, { evaluation, protocol, lanes, spawn, minutes, onRow, onLost, stop }: {
  evaluation: string; protocol: string; lanes: number; spawn: Spawn<CaseJob, Row>; minutes: number;
  onRow(row: Row, job: CaseJob): void; onLost(job: CaseJob, reason: string): void; stop?(): boolean;
}): Promise<void> {
  const jobs: CaseJob[] = [];
  for (const unit of units) for (const one of unit) if (!rows.has(one.key) && !jobs.some((job) => job.key === one.key))
    jobs.push({ evaluation, protocol, key: one.key, condition: one.condition, world: one.world, seconds: one.seconds });
  await runLanes(jobs, { lanes, spawn, minutes, onLost, stop, onAnswer: (job, row) => {
    if (row.key !== job.key) throw new Error(`a worker answered ${job.key} with ${row.key}`);
    onRow(row, job);
  } });
}

/** `units`' cases with their rows, for a summary; the cases whose row is a fault apart. Every row must be present. */
export function tableOf(subjects: readonly Subject[], units: readonly Unit[], rows: ReadonlyMap<string, Row>): { table: Table; faults: readonly (Case & { fault: NonNullable<Row["fault"]> })[] } {
  const cases: Table["cases"][number][] = [], faults: (Case & { fault: NonNullable<Row["fault"]> })[] = [];
  for (const unit of units) for (const one of unit) {
    const row = rows.get(one.key);
    if (!row) throw new Error(`case ${one.key} has no row`);
    if (row.fault) faults.push({ ...one, fault: row.fault });
    else cases.push({ subjects: one.subjects, condition: one.condition, reading: row.reading!, digest: row.digest! });
  }
  return { table: { subjects, cases }, faults };
}

/**
 * Each figure for each subject over the units with no fault, with its 95 % interval: a rate over
 * cases (Wilson), a mean or median over units, a contest's pair taken whole (`pairBootstrap`).
 * A contest's subject is read from the side it played.
 */
export function figuresOf(evaluation: Evaluation, subjects: readonly Subject[], units: readonly Unit[], rows: ReadonlyMap<string, Row>): { subject: string; figure: string; unit: string; units: number; estimate: Estimate | null }[] {
  const sides: readonly Side[] = ["left", "right"];
  const clean = units.filter((unit) => unit.every((one) => rows.get(one.key)?.fault === null));
  return subjects.flatMap((subject) => evaluation.figures.map((figure) => {
    const values = clean.map((unit) => unit.flatMap((one) => {
      const seat = one.subjects.indexOf(subject.id);
      if (seat < 0 && one.subjects.length > 0) return [];
      const value = figure.of(rows.get(one.key)!.reading!, sides[Math.max(0, seat)]);
      return value === null ? [] : [typeof value === "boolean" ? (value ? 1 : 0) : value];
    })).filter((values) => values.length > 0);
    const estimate = figure.kind === "rate"
      ? wilson(values.flat().filter((v) => v === 1).length, values.flat().length)
      : pairBootstrap(values.map(mean), figure.kind === "mean" ? mean : median);
    return { subject: subject.id, figure: figure.name, unit: figure.unit, units: values.length, estimate };
  }));
}
