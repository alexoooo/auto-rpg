import type { Evaluation } from "./evaluation.ts";
import { MATCH } from "./match/index.ts";
import { TOURNAMENT } from "./tournament/index.ts";
import { UNSEEN } from "./unseen/index.ts";

/** **Every evaluation**, by its id: the one catalogue. */
export const EVALUATIONS: Readonly<Record<string, Evaluation>> = Object.freeze({
  match: MATCH as unknown as Evaluation,
  tournament: TOURNAMENT as unknown as Evaluation,
  unseen: UNSEEN as unknown as Evaluation,
});
