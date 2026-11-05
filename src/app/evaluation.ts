import { createBaselineCases } from "../evaluation/baseline/cases.ts";
import { createBaselineIndex } from "../evaluation/baseline/index.ts";
import { createBout } from "../evaluation/bout.ts";
import { createCode } from "../evaluation/code.ts";
import { createCourtCases } from "../evaluation/court/cases.ts";
import { createCourtIndex } from "../evaluation/court/index.ts";
import { createCoverCases } from "../evaluation/cover/cases.ts";
import { createCoverIndex } from "../evaluation/cover/index.ts";
import { createCrowdCases } from "../evaluation/crowd/cases.ts";
import { createCrowdIndex } from "../evaluation/crowd/index.ts";
import { createCryptClearCases } from "../evaluation/crypt-clear/cases.ts";
import { createCryptClearIndex } from "../evaluation/crypt-clear/index.ts";
import { createCrypt } from "../evaluation/crypt.ts";
import { createDrillOpponents } from "../evaluation/drill-opponents.ts";
import { createEvaluations } from "../evaluation/evaluations.ts";
import { createFall } from "../evaluation/fall.ts";
import { createLocomotionCases } from "../evaluation/locomotion/cases.ts";
import { createLocomotionIndex } from "../evaluation/locomotion/index.ts";
import { createLone } from "../evaluation/lone.ts";
import { createMatchCases } from "../evaluation/match/cases.ts";
import { createMatchIndex } from "../evaluation/match/index.ts";
import { createPlay } from "../evaluation/play.ts";
import { createRiseCases } from "../evaluation/rise/cases.ts";
import { createRiseIndex } from "../evaluation/rise/index.ts";
import { createRisingTargetCases } from "../evaluation/rising-target/cases.ts";
import { createRisingTargetIndex } from "../evaluation/rising-target/index.ts";
import { createRising } from "../evaluation/rising.ts";
import { createStandCases } from "../evaluation/stand/cases.ts";
import { createStandIndex } from "../evaluation/stand/index.ts";
import { createStrikeCases } from "../evaluation/strike/cases.ts";
import { createStrikeIndex } from "../evaluation/strike/index.ts";
import { createTableCells } from "../evaluation/table/cells.ts";
import { createTechnique } from "../evaluation/technique.ts";
import { createTournamentEntrants } from "../evaluation/tournament/entrants.ts";
import { createTournamentIndex } from "../evaluation/tournament/index.ts";
import { createUnseenCases } from "../evaluation/unseen/cases.ts";
import { createUnseenIndex } from "../evaluation/unseen/index.ts";
import { createWorlds } from "../evaluation/world-builders.ts";
import type { GameContext } from "../game/arena/context.ts";

/** Evaluation definitions and builders bound to the application choices. */
export function evaluationApplication(context: GameContext) {
  return {
    ...createBaselineCases(context),
    ...createBaselineIndex(context),
    ...createBout(context),
    ...createCode(context),
    ...createCourtCases(context),
    ...createCourtIndex(context),
    ...createCoverCases(context),
    ...createCoverIndex(context),
    ...createCrowdCases(context),
    ...createCrowdIndex(context),
    ...createCryptClearCases(context),
    ...createCryptClearIndex(context),
    ...createCrypt(context),
    ...createDrillOpponents(context),
    ...createEvaluations(context),
    ...createFall(context),
    ...createLocomotionCases(context),
    ...createLocomotionIndex(context),
    ...createLone(context),
    ...createMatchCases(context),
    ...createMatchIndex(context),
    ...createPlay(context),
    ...createRiseCases(context),
    ...createRiseIndex(context),
    ...createRisingTargetCases(context),
    ...createRisingTargetIndex(context),
    ...createRising(context),
    ...createStandCases(context),
    ...createStandIndex(context),
    ...createStrikeCases(context),
    ...createStrikeIndex(context),
    ...createTableCells(context),
    ...createTechnique(context),
    ...createTournamentEntrants(context),
    ...createTournamentIndex(context),
    ...createUnseenCases(context),
    ...createUnseenIndex(context),
    ...createWorlds(context),
  };
}
