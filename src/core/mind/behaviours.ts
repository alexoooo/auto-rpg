import { APPROACH } from "./behaviours/approach.ts";
import { ATTACK } from "./behaviours/attack.ts";
import { CLEAR_OF_FALLEN } from "./behaviours/clear-of-fallen.ts";
import { CLEAR_OF_WALLS } from "./behaviours/clear-of-walls.ts";
import { COVER } from "./behaviours/cover.ts";
import { BREAK_CLINCH } from "./behaviours/distance.ts";
import { EDGE } from "./behaviours/edge.ts";
import { EVADE } from "./behaviours/evade.ts";
import { FOLLOW_ORDERS } from "./behaviours/follow-orders.ts";
import { GROUND } from "./behaviours/ground.ts";

/**
 * **Every behaviour, by its kind** (`BehaviourPart`), in the order a picker offers them: what the
 * behaviour tactics' list holds, a line here registering one. This module holds its imports and
 * this list and nothing else: a case's code reads it as where each kind's own code begins
 * (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const BEHAVIOURS = { "follow-orders": FOLLOW_ORDERS, attack: ATTACK, approach: APPROACH, "break-clinch": BREAK_CLINCH, edge: EDGE, evade: EVADE, "clear-of-walls": CLEAR_OF_WALLS, "clear-of-fallen": CLEAR_OF_FALLEN, ground: GROUND, cover: COVER };
