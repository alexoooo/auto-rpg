import { BASE_OPTIONS, optionMind } from "../minds/option/index.ts";

/** The shared root kind with application defaults for omitted options. */
export const OPTION_MIND = optionMind({ options: BASE_OPTIONS, chooser: { kind: "tree" }, predictions: { kind: "measured" } });
