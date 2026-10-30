/**
 * **Equipped falls**: does a riser stand from the target's shoves with sword and buckler as with
 * the club, and with buckler and club? Read by the target's figures and the bed's report by body
 * and loadout, not the target. The riser is a stand-up's, or a whole mind's.
 */
import { CONTROLLERS, MINDS } from "../../entrants/game.ts";
import type { Evaluation } from "../evaluation.ts";
import { mindSubjects } from "../locomotion/index.ts";
import type { BuiltFall, FallReading } from "../fall.ts";
import { FALL_FIGURES, fallSummary, riserSubjects } from "../rising-target/index.ts";
import { EQUIPPED_RISE_CASES, type EquippedCondition } from "./cases.ts";

export const EQUIPPED_RISE: Evaluation<EquippedCondition, FallReading, BuiltFall> = {
  id: "equipped-rise",
  title: "Equipped falls",
  group: "skills",
  question: "Does a riser stand from the target's shoves with sword and buckler as it does with the club?",
  protocols: EQUIPPED_RISE_CASES,
  defaultProtocol: "standard",
  schedule: "all",
  analysis: {},
  /** A stand-up's riser by its name (`riserSubjects`), or a mind (`mindSubjects`) by its preset's or kind's. */
  subjects: (choice) => choice.flatMap((one) => typeof one === "string" && (Object.hasOwn(MINDS, one) || Object.hasOwn(CONTROLLERS, one)) ? mindSubjects([one], []) : riserSubjects([one]))
    .concat(choice.length ? [] : riserSubjects([])),
  figures: FALL_FIGURES,
  summary: (table) => fallSummary(table, false),
};
