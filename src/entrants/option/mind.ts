import type { MindPreset } from "../../minds/index.ts";
import type { OptionMindConfig } from "../../minds/option/index.ts";
import { deepFreeze } from "../../core/state.ts";

/**
 * Its Option configuration names no Options, so it fights by every one registered (`optionsOf`),
 * of which a body offers those whose skill it fits, with the limbs it has (`skillsOf`). It decides
 * at 60 Hz, every other control step (`OptionMindConfig.rate`), where its strike and gait profiles
 * are measured.
 */
const OPTION_DEFAULTS: OptionMindConfig = deepFreeze({ kind: "option", chooser: { kind: "tree" }, rate: 60 });

/**
 * Its config, on any body it fits, for fights and for measuring its profiles; and the drills' mind
 * (`option-drill`), on no menu: on its priors (`PRIOR_PREDICTIONS`), its
 * options run by their rank (`RANKED_CHOOSER`), nothing priced, searched or drawn. A drill (the
 * table's cells, their opponents, a skill's search) drives a skill fast and the same each time, and
 * no profile decides what its mind does there. And beside it, to compare in the Arena, the searches
 * measured stronger than it (the mind plan's Found better), each with what it reads in its note
 * (`assets/minds/notes.json`): the fitted leaf with the mean backup (`best` 0) at aggression 4,
 * alone, with initiative 0.3 and at horizon 60; the tail's leaf with the mean backup; and the
 * warm start at 100 runs.
 */
export const OPTION_PRESETS: Readonly<Record<string, MindPreset>> = deepFreeze({
  option: { label: "Option Mind", config: OPTION_DEFAULTS },
  "option-drill": { label: "Option Mind for drills", config: { ...OPTION_DEFAULTS, chooser: { kind: "ranked" }, predictions: { kind: "prior" } }, offered: false },
  "option-fitted-initiative": { label: "Option Mind, fitted mean, initiative 0.3", config: { ...OPTION_DEFAULTS, chooser: { kind: "tree", leaf: "fitted", best: 0, objective: { kind: "few-terms", aggression: 4, initiative: .3 } } } },
  "option-fitted": { label: "Option Mind, fitted mean", config: { ...OPTION_DEFAULTS, chooser: { kind: "tree", leaf: "fitted", best: 0, objective: { kind: "few-terms", aggression: 4 } } } },
  "option-fitted-horizon": { label: "Option Mind, fitted mean, horizon 60 s", config: { ...OPTION_DEFAULTS, chooser: { kind: "tree", leaf: "fitted", best: 0, horizon: 60, objective: { kind: "few-terms", aggression: 4 } } } },
  "option-mean": { label: "Option Mind, mean", config: { ...OPTION_DEFAULTS, chooser: { kind: "tree", best: 0 } } },
  "option-warm": { label: "Option Mind, warm start, 100 runs", config: { ...OPTION_DEFAULTS, chooser: { kind: "tree", runs: 100, keeps: .5 } } },
});
