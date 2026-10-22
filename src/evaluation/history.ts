/**
 * **An evaluation's history**: its records grouped into pools, and each subject's versions named.
 * A pool shares a protocol and an environment, so its versions are compared directly; each case
 * is read once, by its key, whichever records hold it. Records are given oldest first.
 */
import { recordingKey } from "../core/recording.ts";
import type { RecordedSubject, RecordHeader, RecordLine } from "./record.ts";

/** A record as read: its file name, header and lines. */
export interface Kept {
  readonly name: string;
  readonly header: RecordHeader;
  readonly lines: readonly RecordLine[];
}

/** What a pool rates: an id at one version, `<id> <version>`. */
export const versionName = (id: string, version: string): string => `${id} ${version}`;

/** A case of a pool: its line, its subjects by version name, and the first record that holds it. */
export interface PoolCase {
  readonly line: RecordLine;
  readonly subjects: readonly string[];
  readonly record: string;
}

/** Records of one protocol and environment, and their cases. */
export interface Pool {
  /** `recordingKey` of the records' `pool`. */
  readonly key: string;
  readonly protocol: string;
  readonly environment: string;
  readonly records: readonly Kept[];
  /** Each distinct case once, in the order the records first hold them. */
  readonly cases: readonly PoolCase[];
  /** Each id's version in the newest record that names it, by version name. */
  readonly newest: ReadonlyMap<string, string>;
  /** Each version's newest record that holds one of its cases, by file name. */
  readonly last: ReadonlyMap<string, string>;
}

/** `records`' pools, in the order of each pool's first record. */
export function poolsOf(records: readonly Kept[]): Pool[] {
  const pools = new Map<string, { protocol: string; environment: string; records: Kept[]; cases: Map<string, PoolCase>; newest: Map<string, string>; last: Map<string, string> }>();
  for (const record of records) {
    const { header } = record, key = recordingKey(header.pool);
    let pool = pools.get(key);
    if (!pool) pools.set(key, pool = { ...header.pool, records: [], cases: new Map(), newest: new Map(), last: new Map() });
    pool.records.push(record);
    const named = new Map(header.subjects.map((subject) => [subject.id, versionName(subject.id, subject.version.version)]));
    for (const subject of header.subjects) pool.newest.set(subject.id, named.get(subject.id)!);
    for (const line of record.lines) {
      const subjects = line.subjects.map((id) => {
        const name = named.get(id);
        if (name === undefined) throw new Error(`${record.name} has a case of ${id}, which its header does not name`);
        return name;
      });
      for (const name of subjects) pool.last.set(name, record.name);
      if (!pool.cases.has(line.key)) pool.cases.set(line.key, { line, subjects, record: record.name });
    }
  }
  return [...pools].map(([key, pool]) => ({ key, ...pool, cases: [...pool.cases.values()] }));
}

/** A version as its id's history names it: `<id> v<n> (<date>, <commit8>)`, `n` its order of first appearance. */
export interface NamedVersion {
  readonly name: string;
  readonly label: string;
  readonly order: number;
  /** As the first record that names it keeps it. */
  readonly subject: RecordedSubject;
  readonly first: Kept;
}

/** Every version `records` name, by version name, numbered within its id in the order records first name them. */
export function versionsOf(records: readonly Kept[]): Map<string, NamedVersion> {
  const versions = new Map<string, NamedVersion>(), counts = new Map<string, number>();
  for (const record of records) for (const subject of record.header.subjects) {
    const name = versionName(subject.id, subject.version.version);
    if (versions.has(name)) continue;
    const order = (counts.get(subject.id) ?? 0) + 1;
    counts.set(subject.id, order);
    versions.set(name, { name, order, subject, first: record,
      label: `${subject.id} v${order} (${record.header.date}, ${record.header.commit.slice(0, 8)})` });
  }
  return versions;
}
