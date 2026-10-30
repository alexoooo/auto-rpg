/**
 * **The Gait drill**: how long does each gait leave a body unbraced once it stops to strike, and
 * does it stay up? A subject is a mind; the drill Commander orders it at a still target by a gait
 * and a speed, to stop and strike, so the gaits are read on the mind's body and parts as it carries
 * the orders out. Its records price the gaits.
 */
import { recordingKey } from "../../core/recording.ts";
import type { Evaluation, Json } from "../evaluation.ts";
import { mindSubjects } from "../locomotion/index.ts";
import { sha256Text } from "../sha256.ts";
import { GAIT_CASES, type GaitCondition } from "./cases.ts";
import type { GaitReading } from "./read.ts";

/** What the strip shows a trial as: its outcome, and whether it passed (its strike admitted, the subject up). */
const gaitOutcome = (reading: GaitReading) => ({ label: reading.outcome, passed: reading.outcome === "ready" });

export const GAIT: Evaluation<GaitCondition, GaitReading> = {
  id: "gait",
  title: "The Gait drill",
  group: "skills",
  question: "How long does each gait leave a body unbraced once it stops to strike, and does it stay up?",
  protocols: GAIT_CASES,
  defaultProtocol: "stopped",
  schedule: "all",
  analysis: {},
  subjects: (choice) => mindSubjects(choice, ["option"]),
  outcome: gaitOutcome,
  figures: [
    { name: "ready", unit: "share of trials, its strike admitted after the stop", kind: "rate", better: "higher", of: (r) => r.outcome === "ready" },
    { name: "braced", unit: "s from the stop to its strike admitted, the median", kind: "median", better: "lower", of: (r) => r.braced },
    { name: "moving", unit: "m/s at the stop, the median", kind: "median", better: "higher", of: (r) => r.moving },
    { name: "fell", unit: "share of trials", kind: "rate", better: "lower", of: (r) => r.down },
  ],
  /** Each subject's trials as a table, in the conditions' order. */
  summary({ subjects, cases }) {
    const rows = cases.map(({ subjects: [id], condition, reading }) => ({ subject: id, ...condition, ...reading }));
    const fixed = (value: number | null) => value === null ? "-" : value.toFixed(2);
    return {
      lines: subjects.flatMap((subject) => [
        `${subject.label} (${sha256Text(recordingKey(subject.value)).slice(0, 16)})`, "",
        "| Model | Gait | Asked, m/s | Hand | Outcome | Speed, m/s | Braced, s |",
        "|---|---|---|---|---|---|---|",
        ...rows.filter((row) => row.subject === subject.id).map((r) =>
          `| ${r.model} | ${r.gait} | ${r.speed} | ${r.hand} | ${r.outcome} | ${fixed(r.moving)} | ${fixed(r.braced)} |`),
        "",
      ]),
      json: rows.map(({ subject, model, gait, hand, outcome, braced }) => ({ subject, model, gait, hand, outcome, braced })) as unknown as Json,
    };
  },
};
