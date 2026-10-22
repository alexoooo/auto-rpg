/**
 * **What the Ratings screen shows of a pool**, derived when read: a contest's standings, minds on
 * common ground and the matchup grid; a battery's figures by subject and condition field; a
 * subject's history across pools and its cases. No DOM; records come from `records.ts`.
 */
import { isStalemate } from "../evaluation/compare.ts";
import type { BoutReading } from "../evaluation/contest.ts";
import type { Evaluation, Json } from "../evaluation/evaluation.ts";
import { versionName, type Kept, type NamedVersion, type Pool, type PoolCase } from "../evaluation/history.ts";
import { bradleyTerry, ratingTable, type Game } from "../evaluation/rating.ts";
import { mean, median, pairBootstrap, wilson, type Estimate } from "../evaluation/stats.ts";

/** Whether `pool`'s cases are contests, two subjects with a score for the left. */
export function isContest(evaluation: Evaluation, pool: Pool): boolean {
  const protocol = evaluation.protocols[pool.records[0]!.header.protocol];
  return protocol ? protocol.arity === 2 : pool.cases.every(({ subjects }) => subjects.length === 2);
}

/** The cases a pool reads: those with a reading. */
const clean = (pool: Pool): readonly PoolCase[] => pool.cases.filter(({ line }) => line.fault === null);

/** A version's games in a contest pool: score, margin and stalemates from its own side. */
interface Tally { bouts: number; wins: number; draws: number; losses: number; score: number; margin: number; stalemates: number }

const tally = (cases: readonly PoolCase[], name: string): Tally => {
  const t = { bouts: 0, wins: 0, draws: 0, losses: 0, score: 0, margin: 0, stalemates: 0 };
  for (const { subjects, line } of cases) {
    const seat = subjects.indexOf(name);
    if (seat < 0) continue;
    const reading = line.reading as unknown as BoutReading, score = seat === 0 ? reading.score : 1 - reading.score;
    t.bouts++; t.score += score; t.margin += seat === 0 ? reading.margin : -reading.margin;
    if (score === 1) t.wins++; else if (score === 0) t.losses++; else t.draws++;
    if (isStalemate(reading)) t.stalemates++;
  }
  return { ...t, score: t.bouts ? t.score / t.bouts : 0, margin: t.bouts ? t.margin / t.bouts : 0 };
};

/** A version's standing in a contest pool. */
export interface Standing extends Tally {
  readonly name: string;
  readonly id: string;
  readonly rating: number;
  /** 95 %, from refits to the pairs resampled whole; null where not asked for. */
  readonly interval: readonly [number, number] | null;
  /** Whether it is its id's version in the pool's newest record that names it. */
  readonly newest: boolean;
  /** The newest record holding one of its cases. */
  readonly last: string;
}

/** The games of a contest pool's cases, by index into `names`. */
function gamesOf(cases: readonly PoolCase[], names: readonly string[]): Game[] {
  const index = new Map(names.map((name, k) => [name, k]));
  return cases.map(({ subjects: [left, right], line }) => ({ i: index.get(left!)!, j: index.get(right!)!, score: (line.reading as unknown as BoutReading).score }));
}

/**
 * Every version's Bradley-Terry rating in contest pool `pool` (`rating.ts`), best first, with its
 * interval where `intervals` asks (seconds for a hundred entrants), its games and stalemates.
 */
export function standingsOf(pool: Pool, { intervals }: { intervals: boolean }): Standing[] {
  const cases = clean(pool), names = [...new Set(cases.flatMap(({ subjects }) => subjects))].sort(), games = gamesOf(cases, names);
  const newest = new Set(pool.newest.values());
  const rated = intervals ? ratingTable(names, games) : bradleyTerry(names.length, games).map((rating, k) => ({ id: names[k]!, rating, interval: null }));
  return rated.map(({ id: name, rating, interval }) => ({
    ...tally(cases, name), name, id: name.slice(0, name.lastIndexOf(" ")), rating, interval, newest: newest.has(name), last: pool.last.get(name)!,
  })).sort((a, b) => b.rating - a.rating);
}

/** An entrant id's mind and kit, `mind/character/left,right`; null for an id of another shape. */
export function entrantParts(id: string): { readonly mind: string; readonly kit: string } | null {
  const parts = id.split("/");
  return parts.length === 3 ? { mind: parts[0]!, kit: `${parts[1]}/${parts[2]}` } : null;
}

/** Two minds on common ground: the mean of the first's entrants' ratings less the second's over the kits both have, and how many kits. */
export interface CommonGround {
  readonly minds: readonly string[];
  /** By the row mind, then the column mind; null where they share no kit. */
  readonly cells: readonly (readonly ({ readonly difference: number; readonly kits: number } | null)[])[];
}

/** The minds of the newest versions in `standings`, each pair compared on the kits both have, never averaged over the rest. */
export function commonGround(standings: readonly Standing[]): CommonGround {
  const rating = new Map<string, Map<string, number>>();
  for (const one of standings) {
    const parts = one.newest ? entrantParts(one.id) : null;
    if (!parts) continue;
    if (!rating.has(parts.mind)) rating.set(parts.mind, new Map());
    rating.get(parts.mind)!.set(parts.kit, one.rating);
  }
  const minds = [...rating.keys()].sort((a, b) => mean([...rating.get(b)!.values()]) - mean([...rating.get(a)!.values()]));
  const cells = minds.map((row) => minds.map((column) => {
    if (row === column) return null;
    const mine = rating.get(row)!, theirs = rating.get(column)!, kits = [...mine.keys()].filter((kit) => theirs.has(kit));
    return kits.length ? { difference: mean(kits.map((kit) => mine.get(kit)! - theirs.get(kit)!)), kits: kits.length } : null;
  }));
  return { minds, cells };
}

/** The mean score of each version of `names` against each other, from the row's side; null where they did not meet. */
export function matchupGrid(pool: Pool, names: readonly string[]): (number | null)[][] {
  const index = new Map(names.map((name, k) => [name, k])), sum = names.map(() => names.map(() => 0)), count = names.map(() => names.map(() => 0));
  for (const { subjects: [left, right], line } of clean(pool)) {
    const i = index.get(left!), j = index.get(right!);
    if (i === undefined || j === undefined) continue;
    const score = (line.reading as unknown as BoutReading).score;
    sum[i]![j]! += score; count[i]![j]!++; sum[j]![i]! += 1 - score; count[j]![i]!++;
  }
  return sum.map((row, i) => row.map((total, j) => count[i]![j]! ? total / count[i]![j]! : null));
}

/** A condition field's value as text: a number or text as it is, an object by its values. */
export function fieldText(value: Json | undefined): string {
  if (value === undefined || value === null) return "none";
  if (typeof value !== "object") return String(value);
  return (Array.isArray(value) ? value : Object.values(value)).map((one) => fieldText(one as Json)).join(",");
}

/** The fields a pool's conditions have. */
export const conditionFields = (pool: Pool): string[] =>
  [...new Set(pool.cases.flatMap(({ line }) => line.condition !== null && typeof line.condition === "object" && !Array.isArray(line.condition) ? Object.keys(line.condition) : []))];

/** A battery's row: a version, the value of the field read by (or all), how many cases, and each figure. */
export interface FigureRow {
  readonly name: string;
  readonly value: string | null;
  readonly cases: number;
  readonly figures: readonly (Estimate | null)[];
  readonly last: string;
}

/** Each version's figures in battery pool `pool`, over its cases, split by condition field `by` where given. */
export function batteryRows(evaluation: Evaluation, pool: Pool, by: string | null): FigureRow[] {
  const groups = new Map<string, { name: string; value: string | null; readings: Json[] }>();
  for (const { subjects, line } of clean(pool)) {
    const condition = line.condition as Record<string, Json> | null, value = by === null ? null : fieldText(condition?.[by]);
    for (const name of subjects.length ? subjects : ["(the conditions)"]) {
      const key = JSON.stringify([name, value]);
      if (!groups.has(key)) groups.set(key, { name, value, readings: [] });
      groups.get(key)!.readings.push(line.reading!);
    }
  }
  return [...groups.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : (a.value ?? "") < (b.value ?? "") ? -1 : 1).map(({ name, value, readings }) => ({
    name, value, cases: readings.length, last: pool.last.get(name) ?? pool.records.at(-1)!.name,
    figures: evaluation.figures.map((figure) => {
      const values = readings.flatMap((reading) => {
        const one = figure.of(reading, "left");
        return one === null ? [] : [typeof one === "boolean" ? (one ? 1 : 0) : one];
      });
      return figure.kind === "rate" ? wilson(values.filter((v) => v === 1).length, values.length) : pairBootstrap(values, figure.kind === "mean" ? mean : median);
    }),
  }));
}

/** A version of an id in its history: where it was rated, and how it stood there. */
export interface HistoryRow {
  readonly version: NamedVersion;
  readonly parent: NamedVersion | null;
  /** Each pool it has cases in, by its index in `pools`: its rank and rating in a contest, its cases. */
  readonly pools: readonly { readonly pool: number; readonly cases: number; readonly rank: number | null; readonly of: number | null; readonly rating: number | null }[];
}

/** Every version of `id` in `records`, in order of first appearance, with its parent and its standing in each pool. */
export function historyOf(evaluation: Evaluation, id: string, pools: readonly Pool[], versions: ReadonlyMap<string, NamedVersion>): HistoryRow[] {
  const standings = pools.map((pool) => isContest(evaluation, pool) ? standingsOf(pool, { intervals: false }) : null);
  return [...versions.values()].filter((version) => version.subject.id === id).map((version) => {
    const parent = version.subject.parent ? versions.get(versionName(version.subject.parent.id, version.subject.parent.version.version)) ?? null : null;
    return { version, parent, pools: pools.flatMap((pool, k) => {
      const cases = pool.cases.filter(({ subjects }) => subjects.includes(version.name)).length;
      if (!cases) return [];
      const ranked = standings[k], rank = ranked ? ranked.findIndex((one) => one.name === version.name) : -1;
      return [{ pool: k, cases, rank: rank >= 0 ? rank + 1 : null, of: ranked ? ranked.length : null, rating: rank >= 0 ? ranked![rank]!.rating : null }];
    }) };
  });
}

/** A version's cases in `pool` grouped by `key` (an opponent, a condition): games from its side. */
export function casesBy(pool: Pool, name: string, key: (one: PoolCase, seat: number) => string): { readonly key: string; readonly cases: readonly PoolCase[]; readonly tally: Tally | null }[] {
  const groups = new Map<string, PoolCase[]>();
  for (const one of pool.cases) {
    const seat = one.subjects.indexOf(name);
    if (seat < 0) continue;
    const k = key(one, seat);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(one);
  }
  return [...groups].map(([k, cases]) => ({ key: k, cases, tally: cases.every(({ subjects }) => subjects.length === 2) ? tally(clean({ ...pool, cases }), name) : null }));
}

/** The record line of case `key` in `records`, and the record that holds it first. */
export function findCase(records: readonly Kept[], key: string): { readonly record: Kept; readonly line: Kept["lines"][number] } | null {
  for (const record of records) {
    const line = record.lines.find((one) => one.key === key);
    if (line) return { record, line };
  }
  return null;
}
