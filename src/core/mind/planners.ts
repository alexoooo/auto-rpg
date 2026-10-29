import { BEHAVIOUR_TACTICS } from "./action-tactics.ts";
import { GAIT_DRILL_TACTICS } from "./drill-gait.ts";
import { DRILL_TACTICS } from "./drill-tactics.ts";
import { SCRIPT_TACTICS } from "./script-tactics.ts";
import { STAND_TACTICS } from "./stand-tactics.ts";

/**
 * **Every kind of tactics, by its kind** (`TacticsPart`), in the order a picker offers them: what a
 * mind's `tactics` slot holds, a line here registering one. This module holds its imports and this
 * list and nothing else: a case's code reads it as where each kind's own code begins (`caseCoder`,
 * `scripts/build-identity.mjs`).
 */
export const PLANNERS = { script: SCRIPT_TACTICS, stand: STAND_TACTICS, behaviours: BEHAVIOUR_TACTICS, drill: DRILL_TACTICS, "drill-gait": GAIT_DRILL_TACTICS };
