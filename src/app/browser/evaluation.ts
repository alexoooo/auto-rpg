import { CONTEXT } from "./context.ts";
import { evaluationApplication } from "../evaluation.ts";

/** Browser evaluation composition. */
export const { BASELINE_CASES, BASELINE, buildBout, BOUT_WORLD, buildTeamBout, caseNames, partNames, COURT_CASES, COURT, COVER_CASES, COVER, CROWD_MIND, CROWD_CASES, CROWD, CRYPT_CLEAR_CASES, CRYPT_CLEAR, CRYPT_WORLD, opponentOf, STANDS, MOVES, DRILL_OPPONENTS, EVALUATIONS, fallStart, buildStandFall, buildFall, FALL_WORLD, LOCOMOTION_CASES, mindSubjects, LOCOMOTION, LONE_WORLD, MATCH_CASES, MATCH, playCase, playRow, RISE_CASES, RISE, RISING_TARGET_CASES, RISING_TARGET, fallSummary, risingMind, risingTrial, techniqueTrial, risingReport, STAND_CASES, STAND, faultsOf, STRIKE_CASES, strikeSubjects, STRIKE, TABLE_SKILLS, tableCells, buildTechnique, TECHNIQUE_WORLD, entrantSubjects, TOURNAMENT, UNSEEN_CASES, UNSEEN, WORLD_BUILDERS } = evaluationApplication(CONTEXT);
