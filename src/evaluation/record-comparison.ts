/** Paired historical evidence, read from immutable records without constructing either implementation. */
import { recordingKey } from "../core/recording.ts";
import type { Figure, Json } from "./evaluation.ts";
import type { Kept } from "./history.ts";
import type { RecordedSubject, RecordLine } from "./record.ts";
import { sameRow } from "./record.ts";
import { mean, pairBootstrap } from "./stats.ts";

/** A selected mind or its body/loadout entrants, preserving the source's suffixes. */
export const selectedSubject = (id: string, prefix: string): boolean => id === prefix || id.startsWith(`${prefix}/`);

interface Evidence {
  readonly key: string;
  readonly subject: RecordedSubject;
  readonly opponent: RecordedSubject | null;
  readonly condition: Json;
  readonly sides: Map<number, RecordLine>;
  readonly size: number;
}

/** Configuration and implementation identify an opponent independently of its pool's environment. */
const opponentKey = (subject: RecordedSubject | null): Json => subject === null ? null
  : { id: subject.id, own: subject.version.own, code: subject.version.code ?? null };

/** Non-policy parts hold the body's and equipment's identity, rather than the implementation being compared. */
const fixedParts = (subject: RecordedSubject): Json => subject.parts.filter(part => !/^(mind|commander|tuning):/.test(part.id))
  .map(part => ({ id: part.id, own: part.version.own })).sort((a, b) => a.id.localeCompare(b.id));

function evidence(record: Kept, prefix: string): { readonly units: Map<string, Evidence>; readonly withinSubject: readonly string[] } {
  const subjects = new Map(record.header.subjects.map(subject => [subject.id, subject]));
  if (![...subjects.keys()].some(id => selectedSubject(id, prefix))) throw new Error(`${record.name} has no subject ${prefix}`);
  const units = new Map<string, Evidence>();
  const withinSubject: string[] = [];
  for (const line of record.lines) {
    const seats = line.subjects.flatMap((id, seat) => selectedSubject(id, prefix) ? [seat] : []);
    if (!seats.length) continue;
    if (seats.length === 2 && line.subjects.length === 2) { withinSubject.push(line.key); continue; }
    if (seats.length !== 1 || line.subjects.length < 1 || line.subjects.length > 2)
      throw new Error(`${record.name}: ${line.key} needs exactly one selected subject in a battery or two-subject contest`);
    const seat = seats[0]!, subject = subjects.get(line.subjects[seat]!), other = line.subjects[1 - seat];
    const opponent = other === undefined ? null : subjects.get(other);
    if (!subject || opponent === undefined) throw new Error(`${record.name}: ${line.key} names a subject absent from its header`);
    const key = recordingKey([subject.id.slice(prefix.length), fixedParts(subject), opponentKey(opponent), line.condition]);
    let unit = units.get(key);
    if (!unit) units.set(key, unit = { key, subject, opponent, condition: line.condition, sides: new Map(), size: line.subjects.length });
    if (unit.size !== line.subjects.length) throw new Error(`${record.name}: one condition mixes a battery and a contest`);
    const before = unit.sides.get(seat);
    if (before && (!sameRow(before, line) || recordingKey(before.world) !== recordingKey(line.world)))
      throw new Error(`${record.name}: duplicate evidence differs for ${subject.id}, ${recordingKey(line.condition)}, seat ${seat}`);
    unit.sides.set(seat, line);
  }
  return { units, withinSubject };
}

const complete = (unit: Evidence): boolean => unit.sides.size === unit.size;
const faulty = (unit: Evidence): boolean => [...unit.sides.values()].some(line => line.fault !== null);
const description = (unit: Evidence) => ({ subject: unit.subject.id, opponent: unit.opponent?.id ?? null,
  version: unit.subject.version.version, opponentVersion: unit.opponent?.version.version ?? null,
  condition: unit.condition, keys: [...unit.sides.values()].map(line => line.key) });

/** Remove known participant inputs from a recipe; their versions are compared separately. */
function physicalContext(unit: Evidence, line: RecordLine): string {
  const inputs = new Set([unit.subject.value, unit.opponent?.value].flatMap(value => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
    const mind = (value as { readonly mind?: Json }).mind;
    return [value, ...(mind !== undefined ? [mind] : [])];
  }).map(recordingKey));
  const withoutInputs = (value: Json, key = ""): Json | undefined => {
    if (value === null || typeof value !== "object") return value;
    if (inputs.has(recordingKey(value)) && (Object.keys(value).length > 0 || key === "tuning")) return undefined;
    if (Array.isArray(value)) return value.map(item => withoutInputs(item) ?? null);
    return Object.fromEntries(Object.entries(value).flatMap(([name, item]) => {
      const kept = withoutInputs(item, name);
      return kept === undefined ? [] : [[name, kept]];
    }));
  };
  return recordingKey(withoutInputs(line.world as unknown as Json));
}

/** Missing provenance or changed shared conditions qualify every difference as descriptive. */
function contextOf(baseline: Kept, candidate: Kept, units: readonly Evidence[]): string[] {
  const reasons: string[] = [];
  for (const key of ["evaluation", "protocol", "engine", "harness"] as const)
    if (baseline.header[key] !== candidate.header[key]) reasons.push(`${key} differs`);
  if (recordingKey(baseline.header.play) !== recordingKey(candidate.header.play)) reasons.push("physical protocol differs");
  if (recordingKey(baseline.header.pool) !== recordingKey(candidate.header.pool)) reasons.push("protocol or shared environment identity differs");
  if (baseline.header.imported || candidate.header.imported) reasons.push("imported evidence has incomplete provenance");
  const unknown = (subject: RecordedSubject) => subject.value === null
    || subject.parts.some(part => /^(mind|commander):/.test(part.id)) && !subject.version.code;
  if (units.some(unit => unknown(unit.subject) || unit.opponent !== null && unknown(unit.opponent)))
    reasons.push("a selected subject or opponent has no recorded configuration or code identity");
  return reasons;
}

/**
 * Compare selected subjects on the same entrant suffixes, fixed parts, opponent versions and
 * conditions. A contest contributes only a complete mirrored pair on each version; a fault on
 * either version excludes the pair. Historical keys and readings are never reinterpreted as runs.
 */
export function compareRecords(baseline: Kept, candidate: Kept, subject: string, previous: string,
  figures: readonly Figure[], sourceContext: readonly string[]) {
  const baselineEvidence = evidence(baseline, previous), candidateEvidence = evidence(candidate, subject);
  const before = baselineEvidence.units, after = candidateEvidence.units;
  const pairs = [...after].sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, next]) => {
    const old = before.get(key);
    return old && complete(old) && complete(next) && !faulty(old) && !faulty(next) ? [{ key, old, next }] : [];
  });
  const paired = new Set(pairs.map(pair => pair.key));
  const coverage = ({ units, withinSubject }: ReturnType<typeof evidence>) => ({ units: units.size, withinSubject,
    incomplete: [...units.values()].filter(unit => !complete(unit)).map(description),
    faults: [...units.values()].filter(faulty).map(unit => ({ ...description(unit),
      faults: [...unit.sides.values()].flatMap(line => line.fault ? [{ key: line.key, ...line.fault }] : []) })),
    unmatched: [...units.values()].filter(unit => !paired.has(unit.key)).map(description) });
  const value = (unit: Evidence, figure: Figure): number | null => {
    const values: number[] = [];
    for (const [seat, line] of unit.sides) {
      const read = figure.of(line.reading!, seat === 0 ? "left" : "right");
      if (read === null) return null;
      const number = typeof read === "boolean" ? (read ? 1 : 0) : read;
      if (!Number.isFinite(number)) throw new Error(`${figure.name}: ${line.key} has no finite figure`);
      values.push(number);
    }
    return mean(values);
  };
  const differences = (these: typeof pairs) => figures.map(figure => {
    const values = these.flatMap(pair => {
      const a = value(pair.old, figure), b = value(pair.next, figure);
      return a === null || b === null ? [] : [[a, b] as const];
    });
    return { figure: figure.name, unit: figure.unit, better: figure.better, pairs: values.length,
      baseline: pairBootstrap(values.map(([a]) => a), mean), candidate: pairBootstrap(values.map(([, b]) => b), mean),
      difference: pairBootstrap(values.map(([a, b]) => b - a), mean) };
  });
  const recipes = pairs.flatMap(pair => [...pair.old.sides].flatMap(([seat, line]) =>
    physicalContext(pair.old, line) === physicalContext(pair.next, pair.next.sides.get(seat)!) ? []
      : [`physical recipe differs: ${pair.next.subject.id}, ${recordingKey(pair.next.condition)}, seat ${seat}`]));
  const context = [...new Set([...contextOf(baseline, candidate, [...before.values(), ...after.values()]), ...sourceContext, ...recipes])];
  return {
    baseline: { record: baseline.name, commit: baseline.header.commit, subject: previous },
    candidate: { record: candidate.name, commit: candidate.header.commit, subject },
    context, coverage: { paired: pairs.length, baseline: coverage(baselineEvidence), candidate: coverage(candidateEvidence) },
    figures: differences(pairs),
    opponents: [...new Set(pairs.map(pair => pair.next.opponent?.id ?? null))].map(opponent =>
      ({ opponent, figures: differences(pairs.filter(pair => (pair.next.opponent?.id ?? null) === opponent)) })),
    pairs: pairs.map(pair => ({ baseline: description(pair.old), candidate: description(pair.next) })),
  };
}
