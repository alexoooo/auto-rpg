import type { Controller } from "../minds/catalog/controller.ts";
import { OPTION_MIND } from "./option-controller.ts";

/**
 * **The toolkit's kinds of mind**: a line here registers one; an entrant brings its own in its
 * manifest (`Entrant.minds`). This module holds its imports and this list and nothing else: a
 * case's code reads it as where each kind's own code begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const MIND_KINDS: readonly Controller[] = [OPTION_MIND];
