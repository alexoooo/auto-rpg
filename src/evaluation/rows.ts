/**
 * **Played rows as they are kept** (`.cache/evaluations/<evaluation>/`): each case's row by its
 * key, with where it came from, so a run plays only what has none.
 */
import { recordingKey } from "../core/world/recording.ts";
import type { Row } from "./play.ts";

/**
 * **Where a kept row came from**: the commit it was played on (null outside a repository), whether
 * a build input differed from that commit, and when it was played (an ISO time). It finds and
 * refuses no row.
 */
export interface RowOrigin {
  readonly commit: string | null;
  readonly changed: boolean;
  readonly date: string;
}

/** A row as it is kept: with its origin. */
export type KeptRow = Row & { readonly from: RowOrigin };

/** Whether `row` was played on `commit` with no build input changed: a row of that commit's code. */
export const playedOn = (row: KeptRow, commit: string | null): boolean => commit !== null && row.from.commit === commit && !row.from.changed;

/** A row is a complete finite reading or a named fault, with its trace, its elapsed time and its origin explicit. */
function requireRow(row: KeptRow, name: string): void {
  recordingKey(row);
  const from = row?.from;
  if (!row || typeof row !== "object" || typeof row.key !== "string" || !row.key
    || !Object.hasOwn(row, "reading") || !Object.hasOwn(row, "digest") || !Object.hasOwn(row, "fault") || !Object.hasOwn(row, "played")
    || row.digest !== null && typeof row.digest !== "string"
    || row.played !== null && (typeof row.played !== "number" || row.played < 0)
    || row.fault === null && (row.reading === null || typeof row.digest !== "string")
    || row.fault !== null && (row.reading !== null || typeof row.fault !== "object" || !row.fault
      || !["error", "invalid", "refused"].includes(row.fault.kind) || typeof row.fault.message !== "string")
    || !from || typeof from !== "object" || from.commit !== null && typeof from.commit !== "string" || typeof from.changed !== "boolean"
    || typeof from.date !== "string" || Number.isNaN(Date.parse(from.date)))
    throw new Error(`${name} has a case row that is not whole`);
}

/**
 * The rows of `sources` by key: the newest of each key stands (`RowOrigin.date`), whatever commit
 * it came from. Two of one key that read differently and both came from one commit with no build
 * input changed stop the run, naming both: a play that does not repeat.
 */
export function indexRows(sources: readonly { readonly name: string; readonly rows: readonly KeptRow[] }[]): Map<string, KeptRow> {
  const newest = new Map<string, KeptRow>(), repeated = new Map<string, { readonly name: string; readonly read: string }>();
  for (const { name, rows } of sources) for (const row of rows) {
    requireRow(row, name);
    if (row.from.commit !== null && !row.from.changed) {
      const play = `${row.key} ${row.from.commit}`, read = recordingKey([row.reading, row.digest, row.fault, row.played]), had = repeated.get(play);
      if (had && had.read !== read) throw new Error(`case ${row.key} reads differently in ${had.name} and ${name}, both played on ${row.from.commit} with no build input changed`);
      repeated.set(play, { name, read });
    }
    const had = newest.get(row.key);
    if (!had || Date.parse(had.from.date) <= Date.parse(row.from.date))
      newest.set(row.key, { key: row.key, reading: row.reading, digest: row.digest, played: row.played, fault: row.fault, from: row.from });
  }
  return newest;
}

/** The oldest of `rows` by when it was played, or null for none: what a report of rows from several commits names. */
export const oldestOf = (rows: readonly KeptRow[]): KeptRow | null =>
  rows.reduce<KeptRow | null>((oldest, row) => oldest === null || Date.parse(row.from.date) < Date.parse(oldest.from.date) ? row : oldest, null);
