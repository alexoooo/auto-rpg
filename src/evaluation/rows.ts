/**
 * **Played rows as a run keeps them while it works** (`.tmp/evaluations/<evaluation>/<commit>/`): each
 * case's row once, by its key, so a run plays only what has none.
 */
import { recordingKey } from "../core/world/recording.ts";
import type { Row } from "./play.ts";

/** A row is a complete finite reading or a named fault, with its trace and elapsed time explicit. */
function requireRow(row: Row, name: string): void {
  recordingKey(row);
  if (!row || typeof row !== "object" || typeof row.key !== "string" || !row.key
    || !Object.hasOwn(row, "reading") || !Object.hasOwn(row, "digest") || !Object.hasOwn(row, "fault")
    || row.digest !== null && typeof row.digest !== "string"
    || row.played !== undefined && row.played !== null && (typeof row.played !== "number" || row.played < 0)
    || row.fault === null && (row.reading === null || typeof row.digest !== "string")
    || row.fault !== null && (row.reading !== null || typeof row.fault !== "object" || !row.fault
      || !["error", "invalid", "refused"].includes(row.fault.kind) || typeof row.fault.message !== "string"))
    throw new Error(`${name} has a case row that is not whole`);
}

/**
 * The rows of `sources` by key, each admitted once: two that read differently under one key stop
 * the run, naming both. A row that says how long it played is kept over one that does not.
 */
export function indexRows(sources: readonly { readonly name: string; readonly rows: readonly Row[] }[]): Map<string, Row> {
  const indexed = new Map<string, { readonly name: string; readonly row: Row }>();
  const read = (row: Row): string => recordingKey([row.reading, row.digest, row.fault]);
  for (const { name, rows } of sources) for (const row of rows) {
    requireRow(row, name);
    const had = indexed.get(row.key);
    if (had && (read(had.row) !== read(row) || had.row.played !== null && row.played != null && had.row.played !== row.played))
      throw new Error(`case ${row.key} reads differently in ${had.name} and ${name}`);
    if (!had || had.row.played === null && row.played != null)
      indexed.set(row.key, { name, row: { key: row.key, reading: row.reading, digest: row.digest, played: row.played ?? null, fault: row.fault } });
  }
  return new Map([...indexed].map(([key, { row }]) => [key, row]));
}
