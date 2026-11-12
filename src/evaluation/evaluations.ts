import type { Evaluation } from "./evaluation.ts";
import { createBaselineIndex } from "./baseline/index.ts";
import { createCourtIndex } from "./court/index.ts";
import { createCrowdIndex } from "./crowd/index.ts";
import { createCoverIndex } from "./cover/index.ts";
import { createCryptClearIndex } from "./crypt-clear/index.ts";
import { createLocomotionIndex } from "./locomotion/index.ts";
import { createTravelIndex } from "./travel/index.ts";
import { createMatchIndex } from "./match/index.ts";
import { createRiseIndex } from "./rise/index.ts";
import { createRisingTargetIndex } from "./rising-target/index.ts";
import { createStandIndex } from "./stand/index.ts";
import { createStrikeIndex } from "./strike/index.ts";
import { createTournamentIndex } from "./tournament/index.ts";
import { createUnseenIndex } from "./unseen/index.ts";
import { createWayUpIndex } from "./way-up/index.ts";
import { type GameContext } from "../game/arena/context.ts";

export function createEvaluations(context: GameContext) {
  const { BASELINE } = createBaselineIndex(context);
  const { COURT } = createCourtIndex(context);
  const { CROWD } = createCrowdIndex(context);
  const { COVER } = createCoverIndex(context);
  const { CRYPT_CLEAR } = createCryptClearIndex(context);
  const { LOCOMOTION } = createLocomotionIndex(context);
  const { TRAVEL_DRILL } = createTravelIndex(context);
  const { MATCH } = createMatchIndex(context);
  const { RISE } = createRiseIndex(context);
  const { RISING_TARGET } = createRisingTargetIndex(context);
  const { STAND } = createStandIndex(context);
  const { STRIKE } = createStrikeIndex(context);
  const { TOURNAMENT } = createTournamentIndex(context);
  const { UNSEEN } = createUnseenIndex(context);
  const { WAY_UP } = createWayUpIndex(context);

  /** **Every evaluation**, by its id: the one catalogue, its protocols the case modules a worker plays. */
  const EVALUATIONS: Readonly<Record<string, Evaluation>> = Object.freeze({
    baseline: BASELINE as unknown as Evaluation,
    match: MATCH as unknown as Evaluation,
    tournament: TOURNAMENT as unknown as Evaluation,
    unseen: UNSEEN as unknown as Evaluation,
    "rising-target": RISING_TARGET as unknown as Evaluation,
    court: COURT as unknown as Evaluation,
    crowd: CROWD as unknown as Evaluation,
    "crypt-clear": CRYPT_CLEAR as unknown as Evaluation,
    strike: STRIKE as unknown as Evaluation,
    cover: COVER as unknown as Evaluation,
    stand: STAND as unknown as Evaluation,
    locomotion: LOCOMOTION as unknown as Evaluation,
    travel: TRAVEL_DRILL as unknown as Evaluation,
    rise: RISE as unknown as Evaluation,
    "way-up": WAY_UP as unknown as Evaluation,
  });

  return { EVALUATIONS };
}
