/**
 * **The Rise drill**: does an edge of the staged route, begun once its entry admits the body, take
 * the body to the posture it goes to, and how long does it take? Rung `placed` begins it from its
 * own postures at rest, rung `moving` after the edge before it (`cases.ts`). Its summary is each
 * edge's profile: how often it is done and how long it takes, by how fast the body moved as it
 * was begun.
 */
import type { TechniqueName } from "../../core/recovery/ground/technique.ts";
import { TECHNIQUES } from "../../core/recovery/ground/techniques.ts";
import type { Evaluation, Json, Subject } from "../evaluation.ts";
import type { BuiltTechnique, LinkReading, TechniqueReading } from "../technique.ts";
import { DRILLED, EDGES, RISE_CASES, type RiseCondition } from "./cases.ts";
import { medianOf } from "../stats.ts";

/** An edge as a subject: its technique's config, whose code the case names. */
const edgeSubject = (kind: string): Subject => {
  if (!Object.hasOwn(EDGES, kind)) throw new Error(`${kind} is no edge the Rise drill plays: ${DRILLED.join(", ")}`);
  const value = { kind };
  return { id: kind, label: TECHNIQUES[kind as TechniqueName].label, parts: [{ id: `technique:${kind}`, value }], value };
};

/** The drilled edge's reading: the last of the case's techniques. */
const drilled = (reading: TechniqueReading): LinkReading => reading.links[reading.links.length - 1]!;
/** Whether the drilled edge was begun: a trial whose edge never was is no reading of it. */
const begun = (reading: TechniqueReading): boolean => drilled(reading).entry !== null;
/** Whether the drilled edge was done; null where it was not begun. */
const done = (reading: TechniqueReading): boolean | null => begun(reading) ? drilled(reading).end === "done" : null;

/** What the strip shows a trial as: its edge's end, passed when done or never begun (its own failure is neither). */
const riseOutcome = (reading: TechniqueReading) => {
  const link = drilled(reading);
  return { label: link.end, passed: link.end === "done" || link.entry === null };
};

/** The bands of the speed a body was begun at, m/s: still, slow, moving. */
const BANDS: readonly { readonly name: string; readonly below: number }[] = [{ name: "under 0.1 m/s", below: .1 }, { name: "0.1 to 0.5 m/s", below: .5 }, { name: "0.5 m/s and over", below: Infinity }];

/** An edge's profile over trials: begun, done of those, the median time of those done, s, and the speeds begun at, m/s. */
function profileOf(links: readonly LinkReading[]) {
  const entered = links.filter((link) => link.entry !== null), finished = entered.filter((link) => link.end === "done");
  const speeds = entered.map((link) => link.entry!.speed);
  return { trials: links.length, begun: entered.length, done: finished.length, seconds: medianOf(finished.map((link) => link.seconds)),
    speed: speeds.length ? [Math.min(...speeds), Math.max(...speeds)] : null,
    ends: Object.fromEntries([...new Set(entered.map((link) => link.end))].map((end) => [end, entered.filter((link) => link.end === end).length])) };
}

export const RISE: Evaluation<RiseCondition, TechniqueReading & Json, BuiltTechnique> = {
  id: "rise",
  title: "The Rise drill",
  group: "skills",
  question: "Does an edge of the staged route, begun once its entry admits the body, take the body to its posture, and how fast?",
  protocols: RISE_CASES,
  defaultProtocol: "placed",
  schedule: "all",
  analysis: {},
  subjects(choice) {
    return (choice.length > 0 ? choice : DRILLED).map((one) => typeof one !== "string"
      ? { id: one.id, label: one.label, parts: [{ id: `technique:${one.id}`, value: one.value }], value: one.value } : edgeSubject(one));
  },
  outcome: riseOutcome,
  figures: [
    { name: "done", unit: "share of trials begun", kind: "rate", better: "higher", of: (r) => done(r) },
    { name: "begun", unit: "share of trials", kind: "rate", better: "higher", of: (r) => begun(r) },
    { name: "time", unit: "s from begun to done, the median", kind: "median", better: "lower", of: (r) => done(r) ? drilled(r).seconds : null },
    { name: "speed begun at", unit: "m/s, the centre of mass's, the median", kind: "median", better: "higher", of: (r) => drilled(r).entry?.speed ?? null },
  ],
  /** Each edge's profile by body, and by the speed it was begun at. */
  summary({ subjects, cases }) {
    const f = (x: number | null, d = 2) => x === null ? "-" : x.toFixed(d);
    const profiles = subjects.map((subject) => {
      const mine = cases.filter((one) => one.subjects[0] === subject.id);
      const bodyOf = (condition: RiseCondition) => `${condition.model}${condition.left || condition.held !== "empty" ? ` holding ${condition.left ?? "empty"},${condition.held}` : ""}`;
      const byModel = [...new Set(mine.map((one) => bodyOf(one.condition)))].map((model) => ({ model, ...profileOf(mine.filter((one) => bodyOf(one.condition) === model).map((one) => drilled(one.reading))) }));
      const begunLinks = mine.map((one) => drilled(one.reading)).filter((link) => link.entry !== null);
      const bySpeed = BANDS.map((band, k) => ({ band: band.name, ...profileOf(begunLinks.filter((link) => link.entry!.speed < band.below && (k === 0 || link.entry!.speed >= BANDS[k - 1]!.below))) }));
      return { subject: subject.id, label: subject.label, byModel, bySpeed };
    });
    const row = (name: string, p: ReturnType<typeof profileOf>) => `| ${name} | ${p.begun}/${p.trials} | ${p.done}/${p.begun} | ${f(p.seconds)} | ${p.speed ? `${f(p.speed[0])} to ${f(p.speed[1])}` : "-"} | ${Object.entries(p.ends).map(([end, n]) => `${end} ${n}`).join(", ") || "-"} |`;
    return {
      lines: profiles.flatMap((p) => [`${p.label} (${p.subject}):`, "",
        "| Body or speed begun at | Begun | Done | Time, s | Speed begun at, m/s | Ends |", "|---|---|---|---|---|---|",
        ...p.byModel.map((one) => row(one.model, one)), ...p.bySpeed.filter((one) => one.trials > 0).map((one) => row(one.band, one)), ""]),
      json: profiles as unknown as Json,
    };
  },
};
