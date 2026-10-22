/**
 * **Records**: what a run played, kept as games, never rewritten. A header names the run (build,
 * protocol, harness, engine, commit, date, pool) and each subject with its version and parent; then
 * a line per case. Versions and tables are derived when read.
 */
import { recordingIdentity, recordingKey, requireRecordingIdentity, type RecordingIdentity } from "../core/recording.ts";
import type { Json, Subject } from "./evaluation.ts";
import type { Row } from "./play.ts";
import type { Case } from "./run.ts";
import { sha256Text } from "./sha256.ts";

/** The record format. */
const FORMAT = "evaluation/1";

const digest = (value: unknown): string => sha256Text(recordingKey(value)).slice(0, 16);

/** What a version is made of, apart, so a change from its parent is named by kind. */
export interface Version {
  /** Its own content: a mind's config, a body's spec, an item's. */
  readonly own: string;
  /** The protocol its cases played (`Cases.play`). */
  readonly protocol: string;
  /** The code they ran on (`environmentOf`). */
  readonly environment: string;
  /** The digest of the three: the version's name. */
  readonly version: string;
}

/** What a version is changed in from another: its content, protocol, environment. */
type Change = "own" | "protocol" | "environment";

/** The version of `value` in the pool of `play` and `environment`. */
export function versionOf(value: Json, play: Json, environment: string): Version {
  const own = digest(value), protocol = digest(play);
  return { own, protocol, environment, version: digest({ own, protocol, environment }) };
}

/** Which of a version's parts differ from `parent`'s. */
export const changesFrom = (version: Version, parent: Version): Change[] =>
  (["own", "protocol", "environment"] as const).filter((kind) => version[kind] !== parent[kind]);

/** A version named by its id. */
export interface Named {
  readonly id: string;
  readonly version: Version;
}

/** A subject as a record keeps it: in full, with its version, its parent and what changed from it; each part likewise. */
export interface RecordedSubject extends Named {
  readonly label: string;
  readonly value: Json;
  readonly parent: Named | null;
  readonly changes: readonly Change[];
  readonly parts: readonly (Named & { readonly parent: Named | null })[];
}

/** A record's first line. */
export interface RecordHeader {
  readonly identity: RecordingIdentity;
  readonly evaluation: string;
  readonly protocol: string;
  readonly play: Json;
  readonly engine: string;
  readonly harness: string;
  readonly commit: string;
  readonly date: string;
  readonly schedule: string;
  readonly pool: { readonly protocol: string; readonly environment: string };
  readonly subjects: readonly RecordedSubject[];
  /** Where an imported run's rows came from; its cases have no world, and are never played again. */
  readonly imported?: Json;
}

/** A case as a record keeps it: enough to open it again without its definition. */
export type RecordLine = Omit<Case, "seconds"> & Omit<Row, "key">;

/** The identity a record of `play` on `engine` under `harness` carries, at `build`. */
export const recordIdentity = (build: string, engine: string, harness: string, play: Json): RecordingIdentity =>
  recordingIdentity(build, FORMAT, { engine, harness, play });

/**
 * `subject` as recorded in the pool of `play` and `environment`, its parent `parent` (none
 * unless named): its own content its value and its parts' together; each part's parent the
 * parent's part of the same kind (`mind:`, `model:`).
 */
export function recordedSubject(subject: Subject, play: Json, environment: string, parent: RecordedSubject | null): RecordedSubject {
  const own = { value: subject.value, parts: subject.parts.map(({ id, value }) => ({ id, value })) };
  const version = versionOf(own, play, environment), kind = (id: string) => id.slice(0, id.indexOf(":") + 1);
  return {
    id: subject.id, label: subject.label, value: subject.value, version,
    parent: parent && { id: parent.id, version: parent.version },
    changes: parent ? changesFrom(version, parent.version) : [],
    parts: subject.parts.map((part) => {
      const before = parent?.parts.find((one) => kind(one.id) === kind(part.id));
      return { id: part.id, version: versionOf(part.value, play, environment), parent: before ? { id: before.id, version: before.version } : null };
    }),
  };
}

/**
 * A subject of an imported run, whose content the run did not keep: one version for its id,
 * named by the run's commit.
 */
export const importedSubject = (id: string, commit: string, play: Json, environment: string): RecordedSubject => ({
  id, label: `${id} (${commit.slice(0, 8)})`, value: null, version: versionOf({ imported: id, commit }, play, environment),
  parent: null, changes: [], parts: [],
});

/** A record's file name: `<yyyy-mm-dd>-<commit8>-<keys8>.jsonl`, `keys8` the digest of its case keys. */
export const recordName = (header: RecordHeader, lines: readonly RecordLine[]): string =>
  `${header.date}-${header.commit.slice(0, 8)}-${sha256Text(lines.map((line) => line.key).sort().join()).slice(0, 8)}.jsonl`;

/** A record's text: the header, then a line per case. */
export const recordText = (header: RecordHeader, lines: readonly RecordLine[]): string =>
  [header, ...lines].map((line) => JSON.stringify(line)).join("\n") + "\n";

/** A record read from its text: refused unless each line is whole and finite and its header names its format. */
export function readRecord(text: string, name: string): { header: RecordHeader; lines: RecordLine[] } {
  const [first, ...rest] = text.split("\n").filter((line) => line.length > 0).map((line) => JSON.parse(line) as unknown);
  const header = first as RecordHeader;
  if (header?.identity?.protocol !== FORMAT) throw new Error(`${name} is not an ${FORMAT} record`);
  requireRecordingIdentity(header.identity, recordIdentity(header.identity.build, header.engine, header.harness, header.play));
  const lines = rest as RecordLine[];
  for (const line of lines) {
    recordingKey(line);
    if (typeof line.key !== "string" || !Array.isArray(line.subjects) || (line.fault === null) === (line.reading === null))
      throw new Error(`${name} has a case line that is not whole`);
  }
  return { header, lines };
}

/** The row a record's line holds. */
export const rowOf = ({ key, reading, digest: trace, fault }: RecordLine | Row): Row => ({ key, reading, digest: trace, fault });

/** Whether two rows of one key agree in reading, digest and fault. */
export const sameRow = (a: Row, b: Row): boolean => recordingKey(rowOf(a)) === recordingKey(rowOf(b));
