import type { Controller } from "./controller.ts";
import { FIGHTER_MIND } from "./fighter-kind.ts";
import { QUADRUPED_MIND } from "../reptile/kind.ts";
import { VANGUARD_MIND } from "../entrants/vanguard/mind.ts";
import { OPTION_MIND } from "../entrants/option/mind.ts";
import { SKELETON_OPTION_MIND } from "../entrants/option-skeleton/mind.ts";
import { DRILL_OPPONENT_MIND } from "../entrants/drill-opponent/mind.ts";
import { BARE_MIND } from "../entrants/bare/mind.ts";

/**
 * **Every kind of mind's controller**, in the order a picker offers them: a line here registers one
 * (`CONTROLLERS`). This module holds its imports and this list and nothing else: a case's code
 * reads it as where each kind's own code begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const MIND_KINDS: readonly Controller[] = [FIGHTER_MIND, QUADRUPED_MIND, VANGUARD_MIND, OPTION_MIND, SKELETON_OPTION_MIND, DRILL_OPPONENT_MIND, BARE_MIND];
