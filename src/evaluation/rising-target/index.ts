/**
 * **The owner's stand-up target**: does a riser stand from the target's 64 falls within its bar?
 * A riser is a mind's recovery on the bed's host (`risingMind`): the game's Stand up (`STAND_UP`)
 * unless others are named. The summary is the bed's report with the target's gates (`risingReport`).
 */
import { STAND_UP } from "../../core/recovery/ground/stand-up.ts";
import { STAGED_ROUTE } from "../../core/recovery/ground/staged-edges.ts";
import { TECHNIQUES } from "../../core/recovery/ground/techniques.ts";
import type { TechniqueName } from "../../core/recovery/ground/technique.ts";
import type { Evaluation, Figure, Json, Subject, SubjectChoice, Table } from "../evaluation.ts";
import { FALL_CAP, type BuiltFall, type FallReading } from "../fall.ts";
import { risingMind, risingReport, type RisingRow } from "../rising.ts";
import { RISING_TARGET_CASES, type TargetCondition } from "./cases.ts";

/** A riser as a subject: its id, the label shown, and its mind whole. */
const riserSubject = (id: string, label: string, value: Json): Subject => ({ id, label, parts: [{ id: `mind:${id}`, value }], value });

/**
 * The risers named: `game`, the game's Stand up (`STAND_UP`), `support-recovery`, `stand-up` with
 * every technique, `staged` for a stand-up on the staged route (`STAGED_ROUTE`), a technique's name
 * for a stand-up with it alone, or a mind given whole; the game's Stand up when none is.
 */
export function riserSubjects(choice: SubjectChoice): readonly Subject[] {
  return (choice.length > 0 ? choice : ["game"]).map((one) => typeof one !== "string" ? riserSubject(one.id, one.label, one.value)
    : one === "game" ? riserSubject(one, "The game's Stand up", risingMind("stand-up", STAND_UP.techniques.map((technique) => technique.kind as TechniqueName)) as unknown as Json)
    : one === "support-recovery" || one === "stand-up" ? riserSubject(one, one === "stand-up" ? "Stand up, every technique" : "Support recovery", risingMind(one) as unknown as Json)
    : one === "staged" ? riserSubject(one, "Stand up on the staged route", risingMind("stand-up", STAGED_ROUTE) as unknown as Json)
    : Object.hasOwn(TECHNIQUES, one) ? riserSubject(one, `Stand up by ${TECHNIQUES[one as TechniqueName].label}`, risingMind("stand-up", [one as TechniqueName]) as unknown as Json)
    : (() => { throw new Error(`${one} is no riser: game, support-recovery, stand-up, staged or a technique (${Object.keys(TECHNIQUES).join(", ")})`); })());
}

/** Whether a fall was made: the body was taken over by its rise; one not made did not reach its case. */
const made = (r: FallReading): boolean => r.takeover !== null;

/** A fall's time to its verified stand, s; a fall made and not stood counts at the cap; none for one not made. */
const timeOf = (r: FallReading): number | null => !made(r) ? null : r.stood && r.verified !== null ? r.verified : FALL_CAP;

/** What a riser is read by: the falls made; and over those, stood within 6 s, stood at all, and the failure-inclusive median. */
export const FALL_FIGURES: readonly Figure<FallReading>[] = [
  { name: "falls made", unit: "share of shoves", kind: "rate", better: "higher", of: made },
  { name: "within 6 s", unit: "share of falls made", kind: "rate", better: "higher", of: (r) => made(r) ? timeOf(r)! <= 6 : null },
  { name: "stood", unit: "share of falls made", kind: "rate", better: "higher", of: (r) => made(r) ? r.stood && r.verified !== null : null },
  { name: "time to stand", unit: "s, a fall made and not stood at the cap", kind: "median", better: "lower", of: timeOf },
];

/** The bed's report (`risingReport`) for each subject's falls, its gates on the target: lines by group, and the reports without their rows. */
export function fallSummary<C extends Json>({ subjects, cases }: Table<C, FallReading>, target: boolean): { lines: readonly string[]; json: Json } {
  const reports = subjects.map((subject) => {
    const rows = cases.filter((one) => one.subjects[0] === subject.id).map(({ condition, reading }) => ({ ...(condition as object), ...reading, cap: FALL_CAP }) as unknown as RisingRow);
    const { mode, groups, gates, techniques, claims } = risingReport(rows, target);
    return { subject: subject.id, mode, groups, gates, techniques, claims };
  });
  const lines = reports.flatMap(({ subject, groups, gates, claims }) => [
    `${subject}:`, "", "| Group | Within 6 s | Within 12 s | Stood | Median, s | No takeover |", "|---|---|---|---|---|---|",
    ...[...groups].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0).map((g) => `| ${g.key} | ${g.within6}/${g.all} | ${g.within12}/${g.all} | ${g.stood}/${g.all} | ${g.median?.toFixed(2) ?? "none"} | ${g.noTakeover} |`),
    ...(gates ? ["", `gates: ${Object.entries(gates).map(([gate, met]) => `${gate} ${met ? "met" : "not met"}`).join(", ")}`] : []),
    `meets the owner's target: ${claims.meetsOwnerTarget}`, "",
  ]);
  return { lines, json: JSON.parse(JSON.stringify(reports)) as Json };
}

export const RISING_TARGET: Evaluation<TargetCondition, FallReading, BuiltFall> = {
  id: "rising-target",
  title: "The owner's stand-up target",
  group: "skills",
  question: "Does a riser stand from the owner's 64 falls within the target's bar?",
  protocols: RISING_TARGET_CASES,
  defaultProtocol: "standard",
  schedule: "all",
  analysis: {},
  subjects: riserSubjects,
  figures: FALL_FIGURES,
  summary: (table) => fallSummary(table, true),
};
