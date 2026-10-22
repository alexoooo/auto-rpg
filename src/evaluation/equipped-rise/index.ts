/**
 * **Equipped falls**: does a riser stand from the target's shoves with sword and buckler as with
 * the club? Read by the target's figures and the bed's report by body and loadout, not the target.
 */
import type { Evaluation } from "../evaluation.ts";
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
  subjects: riserSubjects,
  figures: FALL_FIGURES,
  summary: (table) => fallSummary(table, false),
};
