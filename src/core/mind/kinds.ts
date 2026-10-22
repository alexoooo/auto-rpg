import type { Controller } from "./controller.ts";
import { FIGHTER_MIND } from "./fighter-kind.ts";
import { OPTIONS_MIND } from "./options/kind.ts";
import { QUADRUPED_MIND } from "../reptile/kind.ts";
import { DIRECT_MIND } from "../entrants/direct/mind.ts";
import { TEMPO_MIND } from "../entrants/tempo/mind.ts";

/**
 * **Every kind of mind's controller**, in the order a picker offers them: a line here registers one
 * (`CONTROLLERS`). This module holds its imports and this list and nothing else: a case's code
 * reads it as where each kind's own code begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const MIND_KINDS: readonly Controller[] = [OPTIONS_MIND, FIGHTER_MIND, QUADRUPED_MIND, DIRECT_MIND, TEMPO_MIND];
