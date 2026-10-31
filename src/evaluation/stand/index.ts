/**
 * **The Stand drill**: does a mind's body keep its feet when shoved, standing in guard, walking and
 * mid-strike, how many steps does it take, how soon does it settle, and does a strike shoved
 * mid-flight still finish? Each rung is a protocol (rung 0, `guard`; rung 1, `walking`; rung 2,
 * `striking`), its trials laid out by body, hand, height, way and size (`cases.ts`). The subject is
 * a mind and one of its strike actions, as the Strike drill's is (`option/straight-punch`).
 */
import { recordingKey } from "../../core/recording.ts";
import type { Evaluation, Json } from "../evaluation.ts";
import { sha256Text } from "../sha256.ts";
import { strikeSubjects } from "../strike/index.ts";
import { STAND_CASES, type StandCondition } from "./cases.ts";
import type { StandReading } from "./read.ts";

/** The subject drilled when none is named: the reference mind's straight punch. */
const DRILLED = ["option/straight-punch"];

/** What a trial was, in a few words. */
const trialText = (c: StandCondition): string => `${c.impulse} N s at ${c.way}°, ${c.height}${c.hand ? `, ${c.hand} hand striking` : ""}`;

/**
 * What the strip shows a trial as, and why it failed: not shoved (the striking limb never flew,
 * outside the entry condition), fallen (balance lost), unsettled (still moving at the end), its
 * strike unfinished; passed where it settled on its feet and any strike finished.
 */
function standOutcome(r: StandReading): { readonly label: string; readonly passed: boolean; readonly why?: string } {
  if (r.shoved === null) return { label: "unshoved", passed: false, why: "outside the entry condition: the striking limb never flew fast enough to be shoved" };
  if (!r.upright) return { label: "fell", passed: false, why: `balance lost: down ${(r.fellAt! - r.shoved).toFixed(2)} s after the shove` };
  if (r.settled === null) return { label: "unsettled", passed: false, why: "still moving at the end" };
  if (r.strike && !r.strike.finished) return { label: "unfinished", passed: false, why: `the strike did not finish: ${r.strike.outcome}` };
  return { label: "settled", passed: true };
}

export const STAND: Evaluation<StandCondition, StandReading> = {
  id: "stand",
  title: "The Stand drill",
  group: "skills",
  question: "Does a mind's body keep its feet when shoved, standing, walking and mid-strike, and settle soon?",
  protocols: STAND_CASES,
  defaultProtocol: "guard",
  schedule: "all",
  analysis: {},
  subjects: (choice) => strikeSubjects(choice, DRILLED),
  outcome: standOutcome,
  figures: [
    { name: "upright", unit: "share of shoved trials on its feet to the end", kind: "rate", better: "higher", of: (r) => r.shoved === null ? null : r.upright },
    { name: "settled", unit: "share of shoved trials settled on its feet", kind: "rate", better: "higher", of: (r) => r.shoved === null ? null : r.settled !== null },
    { name: "steps", unit: "feet landed from the shove until settled, the median", kind: "median", better: "lower", of: (r) => r.settled === null ? null : r.steps },
    { name: "to settle", unit: "s from the shove, the median", kind: "median", better: "lower", of: (r) => r.settled },
    { name: "finished", unit: "share of strikes shoved mid-flight that finished", kind: "rate", better: "higher", of: (r) => r.strike && r.shoved !== null ? r.strike.finished : null },
  ],
  /** Each subject's trials as a table, in the conditions' order. */
  summary({ subjects, cases }) {
    const f = (x: number | null, d = 2) => x === null ? "-" : x.toFixed(d);
    return {
      lines: subjects.flatMap((subject) => [
        `${subject.label} (${sha256Text(recordingKey(subject.value)).slice(0, 16)})`, "",
        "| Model | Trial | Outcome | Shoved, s | Fell, s | Steps | Settled, s | Strike |", "|---|---|---|---|---|---|---|---|",
        ...cases.filter((one) => one.subjects[0] === subject.id).map(({ condition: c, reading: r }) =>
          `| ${c.model} | ${trialText(c)} | ${standOutcome(r).label} | ${f(r.shoved)} | ${f(r.fellAt)} | ${r.steps} | ${f(r.settled)} | ${r.strike ? `${r.strike.outcome}${r.strike.finished ? ", finished" : ""}` : "-"} |`),
        "",
      ]),
      json: cases.map(({ subjects: [subject], condition, reading }) => ({ subject, trial: trialText(condition), model: condition.model,
        upright: reading.upright, steps: reading.steps, settled: reading.settled, finished: reading.strike?.finished ?? null })) as unknown as Json,
    };
  },
};
