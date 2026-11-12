/**
 * **The way-up drill** (`docs/reference/rising.md#the-way-up-drill`): how does a way up do on the
 * falls a body comes to it from? Each fall is risen by the drills' Option Mind with that way up
 * ranked first (`wayUpMind`), so it runs wherever it is on offer and its other ways up carry the
 * body to where it begins, and is read by that way up's own attempts (`wayUpAttempts`). A subject is
 * `option-drill/<way up>`; with none named, every way up the drills' Mind has that fits a body.
 */
import { loadoutKey } from "../../core/bodies/items/held.ts";
import { HUMANOID_MODELS, modelHolding } from "../../core/bodies/models.ts";
import { type GameContext } from "../../game/arena/context.ts";
import { isWayUp, type TechniqueName } from "../../skills/recovery/technique.ts";
import { mindJson, type Evaluation, type Figure, type Json, type Subject, type SubjectChoice, type Table } from "../evaluation.ts";
import type { BuiltFall } from "../fall.ts";
import type { BuiltBout } from "../bout.ts";
import { REPRESENTATIVE } from "../loadouts.ts";
import { mean } from "../stats.ts";
import { createRising } from "../rising.ts";
import { FALL_FIGURES } from "../rising-target/index.ts";
import { createWayUpCases, type WayUpCase, type WayUpReading, type WayUpValue } from "./cases.ts";
import { ATTEMPT_CAP, attemptsValue, wayUpAttempts, wayUpOutcome } from "./read.ts";

/** The mind every way-up subject ranks its way up in: the drills' Option Mind. */
const DRILL_MIND = "option-drill";

/** What a fall gives its way up beside the falls' own figures: whether it was exercised, its seconds an attempt, and its attempts let go stuck against an object. */
const WAY_UP_FIGURES: readonly Figure<WayUpReading>[] = [
  { name: "exercised", unit: "share of falls made, an attempt at the way up begun", kind: "rate", better: "higher",
    of: (r) => { const one = wayUpAttempts(r); return one === null ? null : one.attempts > 0; } },
  { name: "seconds an attempt", unit: `s, the mean over a fall's attempts at the way up, one not reaching where it goes at ${ATTEMPT_CAP} s`, kind: "mean", better: "lower",
    of: (r) => attemptsValue(wayUpAttempts(r)) },
  { name: "obstructed", unit: "attempts at the way up let go stuck against an object, a fall exercised", kind: "mean", better: "lower",
    of: (r) => { const one = wayUpAttempts(r); return one === null || one.attempts === 0 ? null : one.obstructed; } },
];

export function createWayUpIndex(context: GameContext) {
  const { minds: MINDS, partLookup: parts } = context.catalog;
  const { wayUpMind, drillWaysUp } = createRising(context);
  const { WAY_UP_CASES } = createWayUpCases(context);

  /** The drills' Mind's ways up that fit some body holding a rated loadout: the subjects where none is named. */
  const drilled = (): readonly TechniqueName[] => drillWaysUp().filter((way) => HUMANOID_MODELS.some((model) => REPRESENTATIVE.some((loadout) =>
    parts.of("technique", { kind: way }).fits(modelHolding(model, loadout), parts.of("technique", { kind: way }).defaults, parts) === null)));

  /** A way up named (`option-drill/<way up>`) as a subject, its value the drills' Mind with it first (`WayUpValue`); or a subject given whole. */
  function waySubject(one: SubjectChoice[number]): Subject {
    if (typeof one !== "string") return { id: one.id, label: one.label, value: one.value,
      ...(one.models ? { models: one.models } : {}), ...(one.character ? { character: one.character } : {}) };
    const slash = one.indexOf("/"), mind = one.slice(0, slash), way = one.slice(slash + 1) as TechniqueName;
    const technique = parts.find("technique", { kind: way });
    if (slash < 0 || mind !== DRILL_MIND || !technique || !isWayUp(technique))
      throw new Error(`${one} is no way up: ${DRILL_MIND}/<way up>, one of ${drilled().join(", ")}`);
    const value: WayUpValue = { mind: mindJson(wayUpMind(way)), way };
    return { id: one, label: `${MINDS[DRILL_MIND]!.label}: ${technique.label} first`, value: value as unknown as Json };
  }

  /** Each subject's falls by level (or from bouts), body and loadout: how many were made and exercised, its attempts, those reached and those let go stuck, and its seconds an attempt. */
  function summary({ subjects, cases }: Table<WayUpCase, WayUpReading>): { lines: readonly string[]; json: Json } {
    const reports = subjects.map((subject) => {
      const groups = new Map<string, WayUpReading[]>();
      for (const { subjects: [id], condition, reading } of cases) if (id === subject.id) {
        const key = `${condition.start === "bout" ? "bout" : condition.level}/${condition.model}/${loadoutKey(condition.loadout)}`;
        groups.set(key, [...groups.get(key) ?? [], reading]);
      }
      return { subject: subject.id, groups: [...groups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, readings]) => {
        const read = readings.map(wayUpAttempts), made = read.filter((one) => one !== null), exercised = made.filter((one) => one.attempts > 0);
        const values = exercised.map(attemptsValue) as number[];
        return { key, falls: readings.length, made: made.length, exercised: exercised.length, attempts: exercised.reduce((sum, one) => sum + one.attempts, 0),
          reached: exercised.reduce((sum, one) => sum + one.reached, 0), obstructed: exercised.reduce((sum, one) => sum + one.obstructed, 0), value: values.length ? mean(values) : null };
      }) };
    });
    const lines = reports.flatMap(({ subject, groups }) => [`${subject}:`, "",
      "| Group | Made | Exercised | Attempts | Reached | Stuck | Seconds an attempt |", "|---|---|---|---|---|---|---|",
      ...groups.map((g) => `| ${g.key} | ${g.made}/${g.falls} | ${g.exercised}/${g.made} | ${g.attempts} | ${g.reached} | ${g.obstructed} | ${g.value?.toFixed(2) ?? "none"} |`), ""]);
    return { lines, json: JSON.parse(JSON.stringify(reports)) as Json };
  }

  const WAY_UP: Evaluation<WayUpCase, WayUpReading, BuiltFall | BuiltBout> = {
    id: "way-up",
    title: "The way-up drill",
    group: "skills",
    question: "How does a way up do on the falls a body comes to it from, ranked first by the drills' Mind?",
    protocols: WAY_UP_CASES,
    defaultProtocol: "standard",
    schedule: "all",
    analysis: {},
    subjects: (choice) => (choice.length > 0 ? choice : drilled().map((way) => `${DRILL_MIND}/${way}`)).map(waySubject),
    figures: [...FALL_FIGURES, ...WAY_UP_FIGURES],
    outcome: (reading) => wayUpOutcome(wayUpAttempts(reading)),
    summary,
  };

  return { WAY_UP };
}
