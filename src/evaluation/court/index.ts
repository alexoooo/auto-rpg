/**
 * **The court task**: does a mind bring its striker round the obstacle court's column into its
 * swing's window, without touching the furniture or falling? From each spawn, at each gap, against
 * a target that stands or walks across the line. The subject is the approaching mind; the
 * reference is Option Mind.
 */
import { recordingKey } from "../../core/world/recording.ts";
import { mindSubject, type Evaluation, type Json } from "../evaluation.ts";
import { sha256Text } from "../sha256.ts";
import { createCourtCases, type CourtCondition, type CourtReading } from "./cases.ts";
import { type GameContext } from "../../game/arena/context.ts";

export function createCourtIndex(context: GameContext) {
  const { controllers: CONTROLLERS, minds: MINDS } = context.catalog;
  const { COURT_CASES } = createCourtCases(context);

  const COURT: Evaluation<CourtCondition, CourtReading> = {
    id: "court",
    title: "The court task",
    group: "skills",
    question: "Does a mind bring its striker round the court's column into its swing's window, clear of the furniture and on its feet?",
    protocols: COURT_CASES,
    defaultProtocol: "standard",
    schedule: "all",
    analysis: {},
    /** The minds named, by id or kind or given whole. None names Option Mind. */
    subjects(choice) {
      return (choice.length > 0 ? choice : ["option"]).map((one) => typeof one !== "string" ? mindSubject(one.id, one.label, one.value, one)
        : Object.hasOwn(MINDS, one) ? mindSubject(one, MINDS[one].label, MINDS[one].config as unknown as Json, MINDS[one])
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

  return { COURT };
}
