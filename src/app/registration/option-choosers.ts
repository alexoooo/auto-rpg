import { RANKED_CHOOSER, TREE_CHOOSER, VALUED_CHOOSER } from "../../minds/option/chooser.ts";

/**
 * **Every chooser, by its kind** (`ChooserPart`), in the order a picker offers them: a line here
 * registers one.
 */
export const CHOOSERS = { valued: VALUED_CHOOSER, tree: TREE_CHOOSER, ranked: RANKED_CHOOSER };
