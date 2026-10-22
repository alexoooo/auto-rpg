import { BLADE_CASES } from "./blade/cases.ts";
import { BUCKLER_CASES } from "./buckler/cases.ts";
import { COURT_CASES } from "./court/cases.ts";
import { CROWD_CASES } from "./crowd/cases.ts";
import type { Cases } from "./evaluation.ts";
import { EQUIPPED_RISE_CASES } from "./equipped-rise/cases.ts";
import { MATCH_CASES } from "./match/cases.ts";
import { RISING_TARGET_CASES } from "./rising-target/cases.ts";
import { TOURNAMENT_CASES } from "./tournament/cases.ts";
import { UNSEEN_CASES } from "./unseen/cases.ts";

/** Every evaluation's case modules, by its id and then the protocol's name: what a worker plays. */
export const CASES: Readonly<Record<string, Readonly<Record<string, Cases>>>> = Object.freeze({
  match: MATCH_CASES as unknown as Readonly<Record<string, Cases>>,
  tournament: TOURNAMENT_CASES as unknown as Readonly<Record<string, Cases>>,
  unseen: UNSEEN_CASES as unknown as Readonly<Record<string, Cases>>,
  "rising-target": RISING_TARGET_CASES as unknown as Readonly<Record<string, Cases>>,
  "equipped-rise": EQUIPPED_RISE_CASES as unknown as Readonly<Record<string, Cases>>,
  blade: BLADE_CASES as unknown as Readonly<Record<string, Cases>>,
  buckler: BUCKLER_CASES as unknown as Readonly<Record<string, Cases>>,
  court: COURT_CASES as unknown as Readonly<Record<string, Cases>>,
  crowd: CROWD_CASES as unknown as Readonly<Record<string, Cases>>,
});
