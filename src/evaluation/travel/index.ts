import type { Evaluation, Json } from "../evaluation.ts";
import type { BuiltLone } from "../lone.ts";
import type { GameContext } from "../../game/arena/context.ts";
import { createLocomotionIndex } from "../locomotion/index.ts";
import { createTravelCases } from "./cases.ts";
import type { TravelCondition } from "./protocol.ts";
import { travelLegCoverage, type TravelReading } from "./read.ts";

export function createTravelIndex(context: GameContext) {
  const { mindSubjects } = createLocomotionIndex(context);
  const { TRAVEL_CASES } = createTravelCases(context);
  const TRAVEL_DRILL: Evaluation<TravelCondition, TravelReading, BuiltLone> = {
    id: "travel", title: "Warrior travel", group: "skills",
    question: "How much time does the toed Warrior lose against forward, directional, turning and stopping orders without assistance?",
    protocols: TRAVEL_CASES, defaultProtocol: "minimum", schedule: "all", analysis: {},
    subjects: choice => mindSubjects(choice, ["option"]),
    figures: [
      { name: "time lost", unit: "s against the orders (`orderTime`), the mean", kind: "mean", better: "lower", of: r => r.lost ?? null },
      { name: "met", unit: "share meeting every case gate", kind: "rate", better: "higher", of: r => r.met },
      { name: "entry", unit: "share reaching the required entry", kind: "rate", better: "higher", of: r => r.entryMade },
      { name: "held speed", unit: "m/s, slowest rolling second", kind: "median", better: "higher", of: r => r.held },
    ],
    outcome: r => ({ label: r.met ? "met" : r.short.some(reason => reason.includes("entry")) ? "unentered" : "short",
      passed: r.met, why: r.short.join(", ") }),
    summary: table => ({ lines: table.subjects.map(subject => {
      const rows = table.cases.filter(row => row.subjects[0] === subject.id);
      return `${subject.label}: ${rows.filter(row => row.reading.met).length}/${rows.length} met; `
        + `${rows.filter(row => !row.reading.entryMade).length} entries unreached; ${travelLegCoverage(rows)} groups lack both first legs`;
    }), json: table.cases.map(row => ({ condition: row.condition, reading: row.reading })) as unknown as Json }),
  };
  return { TRAVEL_DRILL };
}
