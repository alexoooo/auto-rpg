import { optionMind } from "../minds/option/index.ts";
import { BASE_OPTIONS } from "./option-defaults.ts";

/** The shared root kind with application defaults for omitted options. */
export const OPTION_MIND = optionMind({ options: BASE_OPTIONS, chooser: { kind: "tree" }, predictions: { kind: "measured" }, navigation: { kind: "visibility-navigation" } });
