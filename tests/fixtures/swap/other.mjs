/**
 * **A second fixture entrant** (`OTHER`): one option kind of its own (`other:stub-option`) and no
 * presets, so a tree can name two entrants' kinds. Registered beside the swap fixture's (`kinds.mjs`).
 */
import { STUB_OPTION } from "./stub-option.mjs";

/** The swap fixture's counted hold under this entrant's scope. */
export const OTHER_OPTION = Object.freeze({ ...STUB_OPTION, label: "Counted hold (second stub)", defaults: Object.freeze({ kind: "other:stub-option" }) });

export const OTHER = Object.freeze({ name: "other", parts: [OTHER_OPTION], presets: Object.freeze({}) });
