import type { Controller } from "../core/mind/controller.ts";
import { VANGUARD_MIND } from "../core/entrants/vanguard/mind.ts";
import { OPTION_MIND } from "../core/entrants/option/mind.ts";
import { SKELETON_OPTION_MIND } from "../core/entrants/option-skeleton/mind.ts";
import { DRILL_OPPONENT_MIND } from "../core/entrants/drill-opponent/mind.ts";
import { BARE_MIND } from "../core/entrants/bare/mind.ts";

/**
 * **Every entrant's kind of mind**, in the order a picker offers them, after the toolkit's
 * (`MIND_KINDS`): a line here registers one. This module holds its imports and this list and
 * nothing else: a case's code reads it as where each kind's own code begins (`caseCoder`,
 * `scripts/build-identity.mjs`).
 */
export const ENTRANTS: readonly Controller[] = [VANGUARD_MIND, OPTION_MIND, SKELETON_OPTION_MIND, DRILL_OPPONENT_MIND, BARE_MIND];
