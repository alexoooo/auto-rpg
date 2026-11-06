/**
 * **Records**: what a run played, kept as games, never rewritten. A header names the run (build,
 * protocol, harness, engine, commit, date, pool) and each subject with its version and parent; then
 * a line per case. Versions and tables are derived when read.
 */
import { recordingIdentity, recordingKey, requireRecordingIdentity, type RecordingIdentity } from "../core/world/recording.ts";
import type { AttributeOverrides } from "../core/bodies/character-attributes.ts";
import type { Refused } from "../core/refusal.ts";
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
  /** The code every case ran on: the environment (`caseCoder`, `scripts/build-identity.mjs`). */
  readonly environment: string;
  /** Its minds' own code beyond the environment, their kinds' and data's (`caseCoder`); absent where it names none. */
  readonly code?: string;
  /** The digest of the others: the version's name. */
  readonly version: string;
}

/** What a version is changed in from another: its content, protocol, environment, own code. */
type Change = "own" | "protocol" | "environment" | "code";

/** The version of `value` in the pool of `play` and `environment`, its minds' own code `code` (none unless given). */
export function versionOf(value: Json, play: Json, environment: string, code: string | null = null): Version {
  const own = digest(value), protocol = digest(play);
  return code === null ? { own, protocol, environment, version: digest({ own, protocol, environment }) }
    : { own, protocol, environment, code, version: digest({ own, protocol, environment, code }) };
}

/** Which of a version's parts differ from `parent`'s. */
const changesFrom = (version: Version, parent: Version): Change[] =>
  (["own", "protocol", "environment", "code"] as const).filter((kind) => (version[kind] ?? null) !== (parent[kind] ?? null));

/** A version named by its id. */
export interface Named {
  readonly id: string;
  readonly version: Version;
}

/** A subject as a record keeps it: in full, with its version, its parent and what changed from it; each part likewise. */
export interface RecordedSubject extends Named {
  readonly label: string;
  readonly value: Json;
  /** Explicit execution facts; absent only in incompatible historical subjects. */
  readonly models?: readonly string[] | null;
  readonly character?: AttributeOverrides | null;
  readonly parent: Named | null;
  readonly changes: readonly Change[];
  readonly parts: readonly (Named & { readonly parent: Named | null; readonly value?: Json; readonly component?: Subject["parts"][number]["component"] })[];
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

/**
 * **A record's harness** (`RecordHeader.harness`): Node's core world on `engine` at 120 Hz, and the
 * steps each body's command waited (`World.delay`) where it waited any.
 */
export const harnessOf = (engine: string, delay: number): string =>
  `Node, core world (src/core/world/world.ts), ${engine}, 120 Hz${delay === 0 ? "" : `, each command ${delay} step${delay === 1 ? "" : "s"} late`}`;

/** **The world's rate, Hz, and command delay, steps, that a record's `harness` names** (`harnessOf`): no delay where it names none; null where it names no rate. */
export function harnessRule(harness: string): { readonly hz: number; readonly delay: number } | null {
  const hz = Number(/(\d+) Hz/.exec(harness)?.[1]);
  return Number.isFinite(hz) ? { hz, delay: Number(/each command (\d+) steps? late/.exec(harness)?.[1] ?? 0) } : null;
}

/** The identity a record of `play` on `engine` under `harness` carries, at `build`. */
export const recordIdentity = (build: string, engine: string, harness: string, play: Json): RecordingIdentity =>
  recordingIdentity(build, FORMAT, { engine, harness, play });

/**
 * `subject` as recorded in the pool of `play` and `environment`, its parent `parent` (none
 * unless named): its own content its value and its parts' together, its own code what `code` gives
 * its parts (`caseCoder`'s `own`); each part's parent the parent's part of the same kind (`mind:`,
 * `model:`).
 */
export function recordedSubject(subject: Subject, play: Json, environment: string, parent: RecordedSubject | null,
  code: (parts: Subject["parts"]) => string | null = () => null): RecordedSubject {
  const own = subjectInputs(subject);
  const version = versionOf(own, play, environment, code(subject.parts)), kind = (id: string) => id.slice(0, id.indexOf(":") + 1);
  return {
    id: subject.id, label: subject.label, value: subject.value, models: subject.models ?? null, character: subject.character ?? null, version,
    parent: parent && { id: parent.id, version: parent.version },
    changes: parent ? changesFrom(version, parent.version) : [],
    parts: subject.parts.map((part) => {
      const before = parent?.parts.find((one) => kind(one.id) === kind(part.id));
      return { ...part, version: versionOf(part.value, play, environment, code([part])), parent: before ? { id: before.id, version: before.version } : null };
    }),
  };
}

/** A subject's complete execution input, independent of its display name. */
const subjectInputs = (subject: Subject): Json => ({ value: subject.value, models: subject.models ?? null, character: subject.character ?? null,
  parts: subject.parts.map(({ id, value, component }) => ({ id, value, ...(component ? { component: component as unknown as Json } : {}) })) });

/** A retained configuration reconstructed only when the record keeps its complete execution facts. */
export function restoredSubject(subject: RecordedSubject): Subject | Refused {
  if (!Object.hasOwn(subject, "models") || !Object.hasOwn(subject, "character") || subject.parts.some(part => !Object.hasOwn(part, "value")))
    return { refused: `${subject.id} has incompatible historical execution metadata; give its complete configuration` };
  return { id: subject.id, label: subject.label, value: subject.value,
    ...(subject.models === null ? {} : { models: subject.models }), ...(subject.character === null ? {} : { character: subject.character }),
    parts: subject.parts.map(part => ({ id: part.id, value: part.value!, ...(part.component ? { component: part.component } : {}) })) };
}

/**
 * A subject of an imported run, whose content the run did not keep: one version for its id,
 * named by the run's commit.
 */
export const importedSubject = (id: string, commit: string, play: Json, environment: string): RecordedSubject => ({
  id, label: `${id} (${commit.slice(0, 8)})`, value: null, version: versionOf({ imported: id, commit }, play, environment),
  parent: null, changes: [], parts: [],
});

/** The end of a record's file name, which names its content: `-<commit8>-<keys8>.jsonl`, `keys8` the digest of its case keys. */
export const recordEnd = (header: RecordHeader, lines: readonly RecordLine[]): string =>
  `-${header.commit.slice(0, 8)}-${sha256Text(lines.map((line) => line.key).sort().join()).slice(0, 8)}.jsonl`;

/**
 * A record's file name: `<yyyy-mm-ddThhmmss>` (UTC), the moment `written` (ISO) it was written,
 * then `recordEnd`; names sort in the order records were written, and a name of a day alone
 * (`<yyyy-mm-dd>`) before that day's timed ones.
 */
export const recordName = (header: RecordHeader, lines: readonly RecordLine[], written: string): string =>
  `${written.slice(0, 10)}T${written.slice(11, 19).replaceAll(":", "")}${recordEnd(header, lines)}`;

/** A record's text: the header, then a line per case. */
export const recordText = (header: RecordHeader, lines: readonly RecordLine[]): string =>
  [header, ...lines].map((line) => JSON.stringify(line)).join("\n") + "\n";

/** A record read from its text: refused unless each line is whole and finite and its header names its format. */
export function readRecord(text: string, name: string): { header: RecordHeader; lines: RecordLine[] } {
  const [first, ...rest] = text.split("\n").filter((line) => line.length > 0).map((line) => JSON.parse(line) as unknown);
  const header = first as RecordHeader;
  if (header?.identity?.protocol !== FORMAT) throw new Error(`${name} is not an ${FORMAT} record`);
  requireRecordingIdentity(header.identity, recordIdentity(header.identity.build, header.engine, header.harness, header.play));
  recordingKey(header);
  if (![header.evaluation, header.protocol, header.engine, header.harness, header.commit, header.date, header.schedule].every(value => typeof value === "string")
    || !header.pool || typeof header.pool.protocol !== "string" || typeof header.pool.environment !== "string"
    || !Array.isArray(header.subjects) || !header.subjects.every(subject => subject && typeof subject.id === "string" && typeof subject.label === "string"
      && Object.hasOwn(subject, "value") && subject.version && typeof subject.version.version === "string" && Array.isArray(subject.parts)
      && (subject.models === undefined || subject.models === null || Array.isArray(subject.models) && subject.models.every((model: unknown) => typeof model === "string"))
      && (subject.character === undefined || subject.character === null || typeof subject.character === "object" && !Array.isArray(subject.character))))
    throw new Error(`${name} has an incomplete header`);
  const subjects = new Set(header.subjects.map(subject => subject.id));
  const lines = rest as RecordLine[];
  for (const line of lines) {
    requireRow(line, name);
    if (!Object.hasOwn(line, "condition") || !Object.hasOwn(line, "world") || typeof line.code !== "string"
      || !Array.isArray(line.subjects) || !line.subjects.every(id => typeof id === "string" && subjects.has(id))
      || line.world !== null && (typeof line.world !== "object" || !["bout", "fall", "crypt", "lone", "technique"].includes(line.world.kind)))
      throw new Error(`${name} has a case line that is not whole`);
    if (!Object.hasOwn(line, "played")) (line as { played: number | null }).played = null;
  }
  indexRows([{ name, rows: lines }]);
  return { header, lines };
}

/** The row a record's line holds; a line without `played` has it null. */
export const rowOf = ({ key, reading, digest: trace, played, fault }: RecordLine | Row): Row => ({ key, reading, digest: trace, played: played ?? null, fault });

/** Whether two rows agree in key, reading, digest and fault; how long each played follows from them. */
export const sameRow = (a: Row, b: Row): boolean =>
  recordingKey([a.key, a.reading, a.digest, a.fault]) === recordingKey([b.key, b.reading, b.digest, b.fault]);

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

/** Admit each case once and require all sources carrying its key to agree before any reader uses it. */
export function indexRows<T extends Row>(sources: readonly { readonly name: string; readonly rows: readonly T[] }[]): Map<string, { readonly name: string; readonly row: T }> {
  const indexed = new Map<string, { readonly name: string; readonly row: T }>();
  for (const { name, rows } of sources) for (const row of rows) {
    requireRow(row, name);
    const had = indexed.get(row.key);
    const metadata = (one: Row): unknown => {
      const line = one as Partial<RecordLine>;
      return [line.world, line.condition, line.code];
    };
    if (had && (!sameRow(had.row, row) || had.row.played != null && row.played != null && had.row.played !== row.played
      || "world" in had.row && "world" in row && recordingKey(metadata(had.row)) !== recordingKey(metadata(row))))
      throw new Error(`case ${row.key} reads differently in ${had.name} and ${name}`);
    if (!had || had.row.played == null && row.played != null) indexed.set(row.key, { name, row });
  }
  return indexed;
}
