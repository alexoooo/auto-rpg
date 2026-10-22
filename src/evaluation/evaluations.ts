import type { Evaluation } from "./evaluation.ts";
import { EQUIPPED_RISE } from "./equipped-rise/index.ts";
import { MATCH } from "./match/index.ts";
import { RISING_TARGET } from "./rising-target/index.ts";
import { TOURNAMENT } from "./tournament/index.ts";
import { UNSEEN } from "./unseen/index.ts";

/** **Every evaluation**, by its id: the one catalogue. */
export const EVALUATIONS: Readonly<Record<string, Evaluation>> = Object.freeze({
  match: MATCH as unknown as Evaluation,
  tournament: TOURNAMENT as unknown as Evaluation,
  unseen: UNSEEN as unknown as Evaluation,
  "rising-target": RISING_TARGET as unknown as Evaluation,
  "equipped-rise": EQUIPPED_RISE as unknown as Evaluation,
});
