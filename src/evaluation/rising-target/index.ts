/**
 * **The stand-up target** (`docs/reference/rising.md#the-owners-target`): how long does a riser take to stand from the target's 240
 * falls, on every body and loadout? A riser is a mind by its preset's or kind's name (`mindSubjects`), or
 * Option Mind getting up by its techniques (`risingMind`): the game's Stand up's (`STAND_UP`)
 * unless others are named. The summary is the bed's report (`risingReport`).
 */
import { isWayUp, type TechniqueName } from "../../skills/recovery/technique.ts";
import { mindSubject, type Evaluation, type Figure, type Json, type Subject, type SubjectChoice, type Table } from "../evaluation.ts";
import { FALL_CAP, timeToStand, type BuiltFall, type FallReading } from "../fall.ts";
import { createLocomotionIndex } from "../locomotion/index.ts";
import { createRising, STAND_WITHIN, type RisingRow } from "../rising.ts";
import { createRisingTargetCases, type TargetCondition } from "./cases.ts";
import { type GameContext } from "../../game/arena/context.ts";

/** A riser as a subject: its id, the label shown, and its mind whole. */
const riserSubject = mindSubject;

/** Whether a fall was made: the body was taken over by its rise; one not made did not reach its case. */
const made = (r: FallReading): boolean => r.takeover !== null;

/**
 * What a riser is read by: the falls made; and over those, the mean time to stand, its value; the
 * failure-inclusive median; stood at all; and stood within the reference time (`STAND_WITHIN`), a
 * reference figure beside them.
 */
export const FALL_FIGURES: readonly Figure<FallReading>[] = [
  { name: "falls made", unit: "share of shoves", kind: "rate", better: "higher", of: made },
  { name: "time to stand", unit: "s, the mean, a fall made and not stood at the cap", kind: "mean", better: "lower", of: timeToStand },
  { name: "median time to stand", unit: "s, a fall made and not stood at the cap", kind: "median", better: "lower", of: timeToStand },
  { name: "stood", unit: "share of falls made", kind: "rate", better: "higher", of: (r) => made(r) ? r.stood && r.verified !== null : null },
  { name: `within ${STAND_WITHIN} s`, unit: "share of falls made", kind: "rate", better: "higher", of: (r) => made(r) ? timeToStand(r)! <= STAND_WITHIN : null },
];

export function createRisingTargetIndex(context: GameContext) {
  const { controllers: CONTROLLERS, minds: MINDS } = context.catalog;
  const TECHNIQUES = context.techniques;
  const { mindSubjects } = createLocomotionIndex(context);
  const { risingMind, risingReport } = createRising(context);
  const { RISING_TARGET_CASES } = createRisingTargetCases(context);

  /** The ways up among the techniques (`isWayUp`), by kind. */
  const WAYS_UP = (Object.keys(TECHNIQUES) as TechniqueName[]).filter((kind) => isWayUp(TECHNIQUES[kind]));

  /**
   * The risers named: `game`, the game's Stand up (`STAND_UP`), `stand-up` with every way up, a way up's name
   * for a stand-up with it alone, or a mind given whole; the game's Stand up when none is.
   */
  function riserSubjects(choice: SubjectChoice): readonly Subject[] {
    return (choice.length > 0 ? choice : ["game"]).map((one) => typeof one !== "string" ? riserSubject(one.id, one.label, one.value, one)
      : one === "game" ? riserSubject(one, "The game's Stand up", risingMind() as unknown as Json)
      : one === "stand-up" ? riserSubject(one, "Stand up, every technique", risingMind(WAYS_UP) as unknown as Json)
      : (WAYS_UP as readonly string[]).includes(one) ? riserSubject(one, `Stand up by ${TECHNIQUES[one as TechniqueName].label}`, risingMind([one as TechniqueName]) as unknown as Json)
      : (() => { throw new Error(`${one} is no riser: game, stand-up or a way up (${WAYS_UP.join(", ")})`); })());
  }

  /** The bed's report (`risingReport`) for each subject's falls: lines by group, whether they are the target's conditions, and the reports without their rows. */
  function fallSummary<C extends Json>({ subjects, cases }: Table<C, FallReading>, target: boolean): { lines: readonly string[]; json: Json } {
    const reports = subjects.map((subject) => {
      const rows = cases.filter((one) => one.subjects[0] === subject.id).map(({ condition, reading }) => ({ ...(condition as object), ...reading, cap: FALL_CAP }) as unknown as RisingRow);
      const { mode, groups, conditions, techniques, claims } = risingReport(rows, target);
      return { subject: subject.id, mode, groups, conditions, techniques, claims };
    });
    const lines = reports.flatMap(({ subject, groups, conditions }) => [
      `${subject}:`, "", `| Group | Mean, s | Median, s | Stood | Within ${STAND_WITHIN} s | Within 12 s | Not exercised |`, "|---|---|---|---|---|---|---|",
      ...[...groups].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0).map((g) => `| ${g.key} | ${g.mean?.toFixed(2) ?? "none"} | ${g.median?.toFixed(2) ?? "none"} | ${g.stood}/${g.exercised} | ${g.within}/${g.exercised} | ${g.within12}/${g.exercised} | ${g.noTakeover} |`),
      ...(conditions ? ["", `conditions: ${Object.entries(conditions).map(([condition, held]) => `${condition} ${held ? "held" : "not held"}`).join(", ")}`] : []), "",
    ]);
    return { lines, json: JSON.parse(JSON.stringify(reports)) as Json };
  }

  const RISING_TARGET: Evaluation<TargetCondition, FallReading, BuiltFall> = {
    id: "rising-target",
    title: "The owner's stand-up target",
    group: "skills",
    question: "How long does a riser take to stand from the owner's 240 falls, every body in every loadout?",
    protocols: RISING_TARGET_CASES,
    defaultProtocol: "standard",
    schedule: "all",
    analysis: {},
    /** A mind by its preset's or kind's name (`mindSubjects`), or a stand-up's riser by its name (`riserSubjects`); the game's Stand up where none is named. */
    subjects: (choice) => choice.flatMap((one) => typeof one === "string" && (Object.hasOwn(MINDS, one) || Object.hasOwn(CONTROLLERS, one)) ? mindSubjects([one], []) : riserSubjects([one]))
      .concat(choice.length ? [] : riserSubjects([])),
    figures: FALL_FIGURES,
    summary: (table) => fallSummary(table, true),
  };

  return { RISING_TARGET, fallSummary };
}
