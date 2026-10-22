import { BLADE } from "./blade/index.ts";
import { BUCKLER } from "./buckler/index.ts";
import { COURT } from "./court/index.ts";
import { CROWD } from "./crowd/index.ts";
import { CRYPT_CLEAR } from "./crypt-clear/index.ts";
import type { Evaluation } from "./evaluation.ts";
import { EQUIPPED_RISE } from "./equipped-rise/index.ts";
import { MATCH } from "./match/index.ts";
import { RISING_TARGET } from "./rising-target/index.ts";
import { TOURNAMENT } from "./tournament/index.ts";
import { UNSEEN } from "./unseen/index.ts";

/** **Every evaluation**, by its id: the one catalogue, its protocols the case modules a worker plays. */
export const EVALUATIONS: Readonly<Record<string, Evaluation>> = Object.freeze({
  match: MATCH as unknown as Evaluation,
  tournament: TOURNAMENT as unknown as Evaluation,
  unseen: UNSEEN as unknown as Evaluation,
  "rising-target": RISING_TARGET as unknown as Evaluation,
  "equipped-rise": EQUIPPED_RISE as unknown as Evaluation,
  blade: BLADE as unknown as Evaluation,
  buckler: BUCKLER as unknown as Evaluation,
  court: COURT as unknown as Evaluation,
  crowd: CROWD as unknown as Evaluation,
  "crypt-clear": CRYPT_CLEAR as unknown as Evaluation,
});
