import type { Controller } from "./controller.ts";
import { FIGHTER_MIND } from "./fighter-kind.ts";
import { QUADRUPED_MIND } from "../reptile/kind.ts";

/**
 * **The toolkit's kinds of mind**, in the order a picker offers them; the entrants' follow
 * (`src/entrants/index.ts`). This module holds its imports and this list and nothing else: a
 * case's code reads it as where each kind's own code begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const MIND_KINDS: readonly Controller[] = [FIGHTER_MIND, QUADRUPED_MIND];
