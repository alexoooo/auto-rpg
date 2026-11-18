/**
 * **The back step's evaluation**: does a body that sways back from a foe's straight punches take
 * fewer of them, stay up, and stand in reach again after? Each rung is a protocol (`drilled`, the
 * walked-in attacker; `mind`, the Warrior's own Mind), its trials laid out by the gap it starts at.
 * The subject is a mind, led by the sway Commander, standing and throwing nothing, so the back
 * step is read on the mind's body and gaits.
 */
import { recordingKey } from "../../core/world/recording.ts";
import type { Evaluation, Json } from "../evaluation.ts";
import { sha256Text } from "../sha256.ts";
import { apartOf, REACH, struckOf, type BackStepReading } from "./read.ts";
import { createLocomotionIndex } from "../locomotion/index.ts";
import { createBackStepCases, type BackStepCondition } from "./cases.ts";
import { type GameContext, perContext } from "../../game/arena/context.ts";

/** What the strip shows a trial as: down, or how many punches took a landed blow's life. */
const backStepOutcome = (reading: BackStepReading) => reading.down ? { label: "fell", passed: false }
  : { label: `${reading.taken} of ${reading.thrown} taken`, passed: reading.taken === 0 };

export const createBackStepIndex = perContext((context: GameContext) => {
  const { mindSubjects } = createLocomotionIndex(context);
  const { BACK_STEP_CASES } = createBackStepCases(context);

  const BACK_STEP: Evaluation<BackStepCondition, BackStepReading> = {
    id: "back-step",
    title: "The back step",
    group: "skills",
    question: "Does a body that sways back from a foe's straight punches take fewer of them, stay up, and stand in reach again after?",
    protocols: BACK_STEP_CASES,
    defaultProtocol: "mind",
    schedule: "all",
    analysis: {},
    subjects: (choice) => mindSubjects(choice, ["option"]),
    outcome: backStepOutcome,
    /**
     * A learning environment's percepts, each a second: `struck`, the life the subject lost to the
     * blows of the step just played over its seconds, so that summed over a decision each blow is
     * paid once as it lands; `near`, 1 while the subject stands within its foe's reach (`REACH`),
     * where it is back.
     */
    percepts: {
      struck: (built) => struckOf(built),
      near: (built) => apartOf(built.duel) <= REACH ? 1 : 0,
    },
    figures: [
      { name: "taken", unit: "punches that took a landed blow's life, of those thrown, the trials pooled", kind: "mean", better: "lower", of: (r) => r.thrown > 0 ? r.taken / r.thrown : null },
      { name: "lost", unit: "hit points lost to punches, the mean", kind: "mean", better: "lower", of: (r) => r.lost },
      { name: "back", unit: "punches it was in reach again after, of those it left, the mean", kind: "mean", better: "higher", of: (r) => r.left > 0 ? r.back / r.left : null },
      { name: "fell", unit: "share of trials", kind: "rate", better: "lower", of: (r) => r.down },
    ],
    /** Each trial, beside the pooled shares the back step's bar reads. */
    summary({ subjects, cases }) {
      const rows = cases.map(({ subjects: [id], condition, reading }) => ({ subject: id, ...condition, ...reading }));
      return {
        lines: subjects.flatMap((subject) => {
          const own = rows.filter((row) => row.subject === subject.id), sum = (key: "thrown" | "taken" | "left" | "back") => own.reduce((total, row) => total + row[key], 0);
          return [
            `${subject.label} (${sha256Text(recordingKey(subject.value)).slice(0, 16)}): taken ${sum("taken")} of ${sum("thrown")}, back ${sum("back")} of ${sum("left")}, fell in ${own.filter((row) => row.down).length} of ${own.length}`, "",
            "| Attacker | Gap, m | Thrown | Taken | Lost | Left | Back | Down |",
            "|---|---|---|---|---|---|---|---|",
            ...own.map((r) => `| ${r.attacker} | ${r.gap} | ${r.thrown} | ${r.taken} | ${r.lost.toFixed(2)} | ${r.left} | ${r.back} | ${r.down ? "yes" : ""} |`),
            "",
          ];
        }),
        json: rows.map(({ subject, attacker, gap, thrown, taken, left, back, down }) => ({ subject, attacker, gap, thrown, taken, left, back, down })) as unknown as Json,
      };
    },
  };

  return { BACK_STEP };
});
