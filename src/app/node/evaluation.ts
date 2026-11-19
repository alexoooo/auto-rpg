import { CONTEXT } from "./context.ts";
import { evaluationApplication } from "../evaluation.ts";

/** Node evaluation composition. */
export const { buildBout, BOUT_WORLD, buildTeamBout, EVALUATIONS, buildFall, LONE_WORLD, MATCH_CASES, MATCH, playCase, playRow, risingMind, risingTrial, risingReport,
  STRIKE, TABLE_SKILLS, tableCells, WORLD_BUILDERS, loadsOf } = evaluationApplication(CONTEXT);
