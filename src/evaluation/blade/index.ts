/**
 * **The blade task**: does a striker's sword cut a standing body? Each style of blow at each mark,
 * from each striker's body, read in the rules' units: the swings that cut the trunk or head, their
 * closing speed and energy, the wound, the returns and the striker's falls. The subject is the
 * striker's executor tuning; the reference is the executors' own (`{}`).
 */
import { recordingKey } from "../../core/recording.ts";
import type { Evaluation, Json, Subject } from "../evaluation.ts";
import { sha256Text } from "../sha256.ts";
import { medianOf } from "../stats.ts";
import { BLADE_CASES, type BladeCondition, type BladeReading } from "./cases.ts";

/** A tuning as a subject: the executors' own when empty. */
const tuningSubject = (id: string, label: string, value: Json): Subject => ({ id, label, parts: [{ id: `tuning:${id}`, value }], value });

/** Whether `segment` is the trunk's or the head's. */
const upper = (segment: string): boolean => /^(head|neck|pelvis)|Trunk$/.test(segment);

/**
 * A case's summary: of its committed swings, how many cut (`aligned`: the swing's hardest blow of
 * the cut's mechanism on the trunk or head), and the median cut's closing speed and energy, a swing
 * that cut nothing counted as none; the wound its cuts did; its actions' endings and longest
 * return; and whether the striker fell.
 */
function bladeSummary(reading: BladeReading) {
  const swings = reading.actions.filter((action) => action.committed !== null);
  const cuts = swings.map((swing) => reading.blows.filter((blow) => blow.time >= swing.committed! && blow.time <= swing.ended && upper(blow.segment) && blow.mechanism === reading.mechanism)
    .reduce<BladeReading["blows"][number] | null>((best, blow) => best === null || blow.energy > best.energy ? blow : best, null));
  const returns = reading.actions.map((action) => action.returned).filter((value): value is number => value !== null);
  return { blows: reading.blows.length, upper: reading.blows.filter((blow) => upper(blow.segment)).length,
    swings: swings.length, aligned: cuts.filter((cut) => cut !== null).length,
    closing: medianOf(cuts.map((cut) => cut?.closing ?? 0)), energy: medianOf(cuts.map((cut) => cut?.energy ?? 0)), damage: cuts.reduce((sum, cut) => sum + (cut?.damage ?? 0), 0),
    actions: reading.actions.length, completed: reading.actions.filter((action) => action.ending === "completed").length,
    longestReturn: returns.length ? Math.max(...returns) : null, felled: reading.blows.some((blow) => blow.felled) || reading.down };
}

export const BLADE: Evaluation<BladeCondition, BladeReading> = {
  id: "blade",
  title: "The blade task",
  group: "skills",
  question: "Does a striker's sword cut a standing body, by style and mark, without felling the striker?",
  protocols: BLADE_CASES,
  defaultProtocol: "standard",
  schedule: "all",
  analysis: {},
  /** The tunings named: `default` the executors' own, or a tuning given whole. None names the default. */
  subjects(choice) {
    return (choice.length > 0 ? choice : ["default"]).map((one) => typeof one !== "string" ? tuningSubject(one.id, one.label, one.value)
      : one === "default" ? tuningSubject("default", "the executors' own tuning", {})
      : (() => { throw new Error(`${one} is no tuning: name default, or give a tuning as JSON`); })());
  },
  figures: [
    { name: "cut", unit: "share of committed swings", kind: "mean", better: "higher", of: (r) => { const s = bladeSummary(r); return s.swings ? s.aligned / s.swings : null; } },
    { name: "cut energy", unit: "J, the median swing", kind: "median", better: "higher", of: (r) => bladeSummary(r).energy },
    { name: "wound", unit: "HP", kind: "mean", better: "higher", of: (r) => bladeSummary(r).damage },
    { name: "longest return", unit: "s", kind: "mean", better: "lower", of: (r) => bladeSummary(r).longestReturn },
    { name: "felled", unit: "share of cases", kind: "rate", better: "lower", of: (r) => bladeSummary(r).felled },
  ],
  /** Each subject's cases as a table, in the conditions' order. */
  summary({ subjects, cases }) {
    const f = (x: number | null, d = 2) => x === null ? "-" : x.toFixed(d);
    const rows = cases.map(({ subjects: [id], condition, reading }) => ({ subject: id, ...condition, ...bladeSummary(reading) }));
    return {
      lines: subjects.flatMap((subject) => [
        `${subject.label} (${sha256Text(recordingKey(subject.value)).slice(0, 16)}): ${recordingKey(subject.value)}`, "",
        "| Model | Style | Mark | Blows | On trunk/head | Swings | Cut | Median closing, m/s | Median energy, J | Damage, HP | Actions | Completed | Longest return, s | Felled |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
        ...rows.filter((row) => row.subject === subject.id).map((s) =>
          `| ${s.model} | ${s.style} | ${s.mark} | ${s.blows} | ${s.upper} | ${s.swings} | ${s.aligned} | ${f(s.closing)} | ${f(s.energy)} | ${f(s.damage, 3)} | ${s.actions} | ${s.completed} | ${f(s.longestReturn)} | ${s.felled} |`),
        "",
      ]),
      json: rows as unknown as Json,
    };
  },
};
