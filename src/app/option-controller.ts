import { optionController } from "../minds/option/index.ts";

/** The shared root kind with application defaults for omitted options. */
export const OPTION_MIND = optionController({ chooser: { kind: "tree" }, predictions: { kind: "measured" } });
