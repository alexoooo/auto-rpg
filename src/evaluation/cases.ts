import type { Cases } from "./evaluation.ts";
import { MATCH_CASES } from "./match/cases.ts";
import { TOURNAMENT_CASES } from "./tournament/cases.ts";
import { UNSEEN_CASES } from "./unseen/cases.ts";

/** Every evaluation's case modules, by its id and then the protocol's name: what a worker plays. */
export const CASES: Readonly<Record<string, Readonly<Record<string, Cases>>>> = Object.freeze({
  match: MATCH_CASES as unknown as Readonly<Record<string, Cases>>,
  tournament: TOURNAMENT_CASES as unknown as Readonly<Record<string, Cases>>,
  unseen: UNSEEN_CASES as unknown as Readonly<Record<string, Cases>>,
});
