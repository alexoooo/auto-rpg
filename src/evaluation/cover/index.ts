/**
 * **The Cover drill**: does a body standing in guard keep a drill opponent's blows off its head,
 * and stay up? Each rung is a protocol (rung 1, `punched`: punches on a rhythm), its trials laid out by body, what the subject holds, offset and
 * range. The subject is a mind; the drill puts its own tactics in the mind's tactics slot, standing
 * and covering as Option Mind does, so the guard and the covers' choice are read on the mind's body and
 * parts.
 */
import { recordingKey } from "../../core/recording.ts";
import type { Evaluation, Json } from "../evaluation.ts";
import { mindSubjects } from "../locomotion/index.ts";
import { sha256Text } from "../sha256.ts";
import { COVER_CASES, type CoverCondition } from "./cases.ts";
import type { CoverReading } from "./read.ts";

/** What the strip shows a trial as: its outcome, and whether it passed (nothing on its head, the subject up). */
const coverOutcome = (reading: CoverReading) => ({ label: reading.outcome, passed: reading.outcome === "covered" || reading.outcome === "untouched" });

export const COVER: Evaluation<CoverCondition, CoverReading> = {
  id: "cover",
  title: "The Cover drill",
  group: "skills",
  question: "Does a body standing in guard keep a drill opponent's blows off its head, and stay up?",
  protocols: COVER_CASES,
  defaultProtocol: "punched",
  schedule: "all",
  analysis: {},
  subjects: (choice) => mindSubjects(choice, ["option"]),
  outcome: coverOutcome,
  figures: [
    { name: "covered", unit: "share of trials, the guard alone met", kind: "rate", better: "higher", of: (r) => r.outcome === "covered" },
    { name: "head hit", unit: "share of trials", kind: "rate", better: "lower", of: (r) => r.touches.head > 0 },
    { name: "head taken", unit: "hit points lost on the head, the mean", kind: "mean", better: "lower", of: (r) => r.headTaken },
    { name: "taken", unit: "hit points lost, the mean", kind: "mean", better: "lower", of: (r) => r.taken },
    { name: "guard", unit: "touches the guard met, the mean", kind: "mean", better: "higher", of: (r) => r.touches.guard },
    { name: "fell", unit: "share of trials", kind: "rate", better: "lower", of: (r) => r.down },
  ],
  /** Each subject's trials as a table, in the conditions' order. */
  summary({ subjects, cases }) {
    const rows = cases.map(({ subjects: [id], condition, reading }) => ({ subject: id, ...condition, ...reading }));
    return {
      lines: subjects.flatMap((subject) => [
        `${subject.label} (${sha256Text(recordingKey(subject.value)).slice(0, 16)})`, "",
        "| Model | Holds | Across, m | Gap, m | Outcome | Head | Guard | Body | Taken | Head taken | Covering, s |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
        ...rows.filter((row) => row.subject === subject.id).map((r) =>
          `| ${r.model} | ${r.left ? `${r.left}, ` : ""}${r.held} | ${r.across} | ${r.gap} | ${r.outcome} | ${r.touches.head} | ${r.touches.guard} | ${r.touches.body} | ${r.taken.toFixed(2)} | ${r.headTaken.toFixed(2)} | ${r.covering.toFixed(2)} |`),
        "",
      ]),
      json: rows.map(({ subject, model, held, left, across, gap, outcome }) => ({ subject, model, held, ...(left ? { left } : {}), across, gap, outcome })) as unknown as Json,
    };
  },
};
