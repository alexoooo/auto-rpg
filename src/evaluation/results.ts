/**
 * **Results**: what an evaluation keeps of its runs, as a few numbers a reading
 * (`assets/evaluations/<id>.json`, in Git, so every build carries them). A result is one subject's
 * reading on one protocol: where and when it was read, its figures, and, for a drill, each trial as
 * a short row of numbers on the condition its list names. A subject keeps its newest reading on a
 * protocol, and each earlier one a table cell's baseline names. A contest keeps its standings.
 * Nothing a trial played is kept: a trial is watched by playing it again from its subject and
 * condition.
 */
import { recordingKey } from "../core/world/recording.ts";
import type { Json, Subject } from "./evaluation.ts";
import { sha256Text } from "./sha256.ts";
import type { Estimate } from "./stats.ts";

/** A number as a result keeps it: to four decimals. */
export const rounded = (value: number): number => Math.round(value * 1e4) / 1e4;

/** An estimate as a result keeps it. */
export const roundedEstimate = (estimate: Estimate | null): Estimate | null =>
  estimate && { value: rounded(estimate.value), low: rounded(estimate.low), high: rounded(estimate.high) };

/** A condition's name in a result: the start of its digest. */
export const caseName = (condition: Json): string => sha256Text(recordingKey(condition)).slice(0, 8);

/** The name of a list of conditions (`Results.cases`), by their names in order. */
const listName = (names: readonly string[]): string => sha256Text(names.join()).slice(0, 8);

/** The digest of the keys of the cases a result read, in any order: equal to the cases' now where every one would be found again. */
export const codeOf = (keys: readonly string[]): string => sha256Text([...keys].sort().join()).slice(0, 16);

const digest = (value: unknown): string => sha256Text(recordingKey(value)).slice(0, 16);

/**
 * **A subject's version** on the protocol `play` in `environment` (the code every case runs on),
 * its minds' own code beyond that `code` where it names any (`caseCoder`,
 * `scripts/build-identity.mjs`): the digest of what it plays as (its value, models, character and
 * parts) with those, whatever it is called.
 */
export function versionOf(subject: Subject, play: Json, environment: string, code: string | null = null): string {
  const own = digest({ value: subject.value, models: subject.models ?? null, character: subject.character ?? null,
    parts: subject.parts.map(({ id, value, component }) => ({ id, value, ...(component ? { component: component as unknown as Json } : {}) })) });
  const protocol = digest(play);
  return digest(code === null ? { own, protocol, environment } : { own, protocol, environment, code });
}

/**
 * **A result's harness** (`Result.harness`): Node's core world on `engine`, its native rate, and
 * the steps each body's command waited (`World.delay`). An explicit rate also names the delay in seconds.
 */
export const harnessOf = (engine: string, delay: number, hz?: number): string =>
  `Node, core world (src/core/world/world.ts), ${engine}, ${hz ?? 120} Hz${delay === 0 ? "" : `, each command ${delay} step${delay === 1 ? "" : "s"} late`}${hz === undefined ? "" : `, command delay ${delay / hz} s`}`;

/** **The world's rate, Hz, and command delay, steps, that a `harness` names** (`harnessOf`): no delay where it names none; null where it names no rate. */
export function harnessRule(harness: string): { readonly hz: number; readonly delay: number } | null {
  const hz = Number(/(\d+) Hz/.exec(harness)?.[1]);
  return Number.isFinite(hz) ? { hz, delay: Number(/each command (\d+) steps? late/.exec(harness)?.[1] ?? 0) } : null;
}

/** The numbers a trial keeps; a null among them is a number the trial does not have. */
export type Kept = readonly (number | null)[];

/** What a drill's trial came to in a word, and whether it passed (`Evaluation.outcome`). */
export interface Outcome { readonly label: string; readonly passed: boolean }

/** **One subject's reading on one protocol.** */
export interface Result {
  readonly protocol: string;
  readonly subject: string;
  readonly label: string;
  /** The subject's version (`versionOf`) and the digest of its cases' keys (`codeOf`): both as now where the reading is current. */
  readonly version: string;
  readonly code: string;
  readonly commit: string;
  readonly date: string;
  readonly harness: string;
  /** How many of its cases have a reading. */
  readonly count: number;
  /** Each of the evaluation's figures over them, by its name; a figure with no value is left out. */
  readonly figures: Readonly<Record<string, Estimate>>;
  /** A drill's: the list its trials are on (`Results.cases`), the outcomes they came to, and a row a trial in the list's order. */
  readonly cases?: string;
  readonly outcomes?: readonly Outcome[];
  /**
   * A trial's row: how long it played, s (where a watcher stops it); its outcome, by its index in
   * `outcomes`; then what the table's judge keeps of it (`keep`, `src/evaluation/table/judge.ts`),
   * where the table reads the subject. Null for a trial that ended in a fault.
   */
  readonly trials?: readonly (Kept | null)[];
}

/** The numbers a result's trial row holds before its judge's. */
export const ROW_HEAD = 2;

/**
 * **A table cell's baseline for one reading**: its body and loadout, the reading's protocol and
 * subject, and the version of the subject whose result it is. Written once, when the cell's work
 * begins (`npm run evaluate -- table --baseline`), and never overwritten; the result it names is
 * kept while it does.
 */
export interface Baseline {
  readonly body: string;
  readonly loadout: string;
  readonly protocol: string;
  readonly subject: string;
  readonly version: string;
}

/** An entrant's standing in a contest: its rating with its 95 % interval, and its bouts from its own side. */
export interface Standing {
  readonly id: string;
  readonly rating: number;
  readonly low: number;
  readonly high: number;
  readonly bouts: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly score: number;
  readonly margin: number;
  readonly stalemates: number;
}

/** **A contest's standings** on one protocol, over the bouts of one run, best first. */
export interface Standings {
  readonly protocol: string;
  readonly commit: string;
  readonly date: string;
  readonly harness: string;
  readonly bouts: number;
  readonly rows: readonly Standing[];
}

/** **An evaluation's results**: its lists of conditions by name, its results, its table baselines and its contests' standings. */
export interface Results {
  readonly cases: Readonly<Record<string, readonly string[]>>;
  readonly results: readonly Result[];
  readonly baselines: readonly Baseline[];
  readonly standings: readonly Standings[];
}

/** An evaluation with nothing kept. */
export const NO_RESULTS: Results = Object.freeze({ cases: {}, results: [], baselines: [], standings: [] });

/** `results` with the list of `names` among its lists, and the list's name. */
function withList(results: Results, names: readonly string[]): { readonly results: Results; readonly list: string } {
  const list = listName(names);
  return { list, results: Object.hasOwn(results.cases, list) ? results : { ...results, cases: { ...results.cases, [list]: names } } };
}

/**
 * `results` with `result` as its subject's newest on its protocol, its trials on the conditions
 * `names` where it has them: the subject's other results there go, but those a baseline names.
 */
export function withResult(results: Results, result: Omit<Result, "cases">, names?: readonly string[]): Results {
  const listed = names ? withList(results, names) : null, kept: Result = listed ? { ...result, cases: listed.list } : result, base = listed?.results ?? results;
  const stays = (one: Result) => one.protocol !== kept.protocol || one.subject !== kept.subject
    || one.version !== kept.version && base.baselines.some((baseline) => baseline.protocol === one.protocol && baseline.subject === one.subject && baseline.version === one.version);
  return { ...base, results: [...base.results.filter(stays), kept] };
}

/** `results` with `baseline` added. */
export const withBaseline = (results: Results, baseline: Baseline): Results => ({ ...results, baselines: [...results.baselines, baseline] });

/** `results` with `standings` in place of its protocol's. */
export const withStandings = (results: Results, standings: Standings): Results =>
  ({ ...results, standings: [...results.standings.filter((one) => one.protocol !== standings.protocol), standings] });

/** `subject`'s newest result on `protocol`, or its result at `version` where given; null where it has none. */
export const resultOf = (results: Results, protocol: string, subject: string, version?: string): Result | null =>
  results.results.filter((one) => one.protocol === protocol && one.subject === subject && (version === undefined || one.version === version)).at(-1) ?? null;

/** The baseline of the cell `body` holding `loadout` (`loadoutKey`) for `subject`'s reading on `protocol`; null where it has none. */
export const baselineOf = (results: Results, body: string, loadout: string, protocol: string, subject: string): Baseline | null =>
  results.baselines.find((one) => one.body === body && one.loadout === loadout && one.protocol === protocol && one.subject === subject) ?? null;

/**
 * **Results as their file's text**: an entry a line, so a change to one reading is one changed
 * line; only the lists an entry names, by name.
 */
export function resultsText(results: Results): string {
  const used = new Set(results.results.flatMap((one) => one.cases ?? []));
  const lines = (entries: readonly unknown[]) => entries.map((one) => JSON.stringify(one)).join(",\n");
  return `{\n"cases": {\n${Object.keys(results.cases).filter((list) => used.has(list)).sort().map((list) => `${JSON.stringify(list)}: ${JSON.stringify(results.cases[list])}`).join(",\n")}\n},\n`
    + `"results": [\n${lines(results.results)}\n],\n"baselines": [\n${lines(results.baselines)}\n],\n"standings": [\n${lines(results.standings)}\n]\n}\n`;
}
