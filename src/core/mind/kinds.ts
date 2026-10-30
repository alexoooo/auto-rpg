import type { Controller } from "./controller.ts";
import { DRILL_OPPONENT_MIND } from "./drill-opponent.ts";
import { FIGHTER_MIND } from "./fighter-kind.ts";
import { OPTION_MIND } from "../option/mind.ts";
import { QUADRUPED_MIND } from "../reptile/kind.ts";

/**
 * **The toolkit's kinds of mind**: a line here registers one; an entrant brings its own in its
 * manifest (`Entrant.minds`). This module holds its imports and this list and nothing else: a
 * case's code reads it as where each kind's own code begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const MIND_KINDS: readonly Controller[] = [FIGHTER_MIND, QUADRUPED_MIND, OPTION_MIND, DRILL_OPPONENT_MIND];
