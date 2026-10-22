/**
 * **The court task**: does a mind bring its striker round the obstacle court's column into its
 * swing's window, without touching the furniture or falling? From each spawn, at each gap, against
 * a target that stands or walks across the line. The subject is the approaching mind; the
 * reference is the Duellist.
 */
import { CONTROLLERS, MINDS } from "../../core/mind/controllers.ts";
import { recordingKey } from "../../core/recording.ts";
import type { Evaluation, Json, Subject } from "../evaluation.ts";
import { sha256Text } from "../sha256.ts";
import { COURT_CASES, type CourtCondition, type CourtReading } from "./cases.ts";

/** A mind as a subject. */
const mindSubject = (id: string, label: string, value: Json): Subject => ({ id, label, parts: [{ id: `mind:${id}`, value }], value });

export const COURT: Evaluation<CourtCondition, CourtReading> = {
  id: "court",
  title: "The court task",
  group: "skills",
  question: "Does a mind bring its striker round the court's column into its swing's window, clear of the furniture and on its feet?",
  protocols: COURT_CASES,
  defaultProtocol: "standard",
  schedule: "all",
  analysis: {},
  /** The minds named, by id or kind or given whole. None names the Duellist. */
  subjects(choice) {
    return (choice.length > 0 ? choice : ["duellist"]).map((one) => typeof one !== "string" ? mindSubject(one.id, one.label, one.value)
      : Object.hasOwn(MINDS, one) ? mindSubject(one, MINDS[one].label, MINDS[one].config as unknown as Json)
      : Object.hasOwn(CONTROLLERS, one) ? mindSubject(one, CONTROLLERS[one].label, CONTROLLERS[one].defaults as unknown as Json)
      : (() => { throw new Error(`${one} is no mind: name a mind (${Object.keys(MINDS).join(", ")}), a kind, or a config`); })());
  },
  figures: [
    { name: "arrived", unit: "share of cases", kind: "rate", better: "higher", of: (r) => r.arrived !== null },
    { name: "arrival", unit: "s, of those arrived", kind: "median", better: "lower", of: (r) => r.arrived },
    { name: "furniture contact", unit: "steps", kind: "mean", better: "lower", of: (r) => r.contactSteps },
    { name: "falls", unit: "a case", kind: "mean", better: "lower", of: (r) => r.falls },
  ],
  /** Each subject's cases as a table, in the conditions' order. */
  summary({ subjects, cases }) {
    const rows = cases.map(({ subjects: [id], condition, reading }) => ({ subject: id, ...condition, ...reading }));
    return {
      lines: subjects.flatMap((subject) => [
        `${subject.label} (${sha256Text(recordingKey(subject.value)).slice(0, 16)})`, "",
        "| Striker | Gap, m | Side | Target | Arrived, s | Furniture contact steps | Falls |", "|---|---|---|---|---|---|---|",
        ...rows.filter((row) => row.subject === subject.id).map((row) =>
          `| ${row.model} | ${row.gap} | ${row.side} | ${row.target} | ${row.arrived?.toFixed(2) ?? "never"} | ${row.contactSteps} | ${row.falls} |`),
        "",
      ]),
      json: rows as unknown as Json,
    };
  },
};
