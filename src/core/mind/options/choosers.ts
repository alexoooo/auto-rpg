import { RANKED_CHOOSER, VALUED_CHOOSER } from "./chooser.ts";

/**
 * **Every chooser, by its kind** (`ChooserPart`), in the order a picker offers them: what the
 * options fighter's chooser slot holds, a line here registering one. This module holds its imports
 * and this list and nothing else: a case's code reads it as where each kind's own code begins
 * (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const CHOOSERS = { valued: VALUED_CHOOSER, ranked: RANKED_CHOOSER };
