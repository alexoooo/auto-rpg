import type { MindPreset } from "../../minds/index.ts";
import type { OptionMindConfig } from "../../minds/option/index.ts";
import { deepFreeze } from "../../core/state.ts";

/**
 * Its Option configuration names no Options, so it fights by every one registered (`optionsOf`),
 * of which a body offers those whose skill it fits, with the limbs it has (`skillsOf`). It decides
 * at 60 Hz, every other control step (`OptionMindConfig.rate`), where its strike and gait profiles
 * are measured. It searches by tree, each leaf the value fitted to what followed (`leaf` fitted),
 * each state worth the mean of its lines by their runs (`best` 0), at aggression 4, a blow's worth
 * falling by 0.3 a second along a line (`initiative`).
 */
const OPTION_DEFAULTS: OptionMindConfig = deepFreeze({ kind: "option", chooser: { kind: "tree", leaf: "fitted", best: 0, objective: { kind: "few-terms", aggression: 4, initiative: .3 } }, rate: 60 });

/**
 * Its config, on any body it fits, for fights and for measuring its profiles; and the drills' mind
 * (`option-drill`), on no menu: on its priors (`PRIOR_PREDICTIONS`), its
 * options run by their rank (`RANKED_CHOOSER`), nothing priced, searched or drawn. A drill (the
 * table's cells, their opponents, a skill's search) drives a skill fast and the same each time, and
 * no profile decides what its mind does there. And beside it, to compare in the Arena, the Mind it
 * was before (`option-tail`: the tail's leaf, each state worth its best line, the few terms as they
 * stand) and the searches measured stronger than that one (the mind plan's Found better), each with
 * what it reads in its note (`assets/minds/notes.json`): the fitted leaf with the mean backup at
 * aggression 4, alone and at horizon 60; the tail's leaf with the mean backup; and the warm start
 * at 100 runs. And this Mind priced against the foe's replies at their mean: one, the foe closing
 * (`option-reply`), as strong as it, quicker to a knockout and a step about a third slower at its
 * slowest; two (`option-replies`), quicker to a knockout still and slower a step again.
 */
export const OPTION_PRESETS: Readonly<Record<string, MindPreset>> = deepFreeze({
  option: { label: "Option Mind", config: OPTION_DEFAULTS },
  "option-drill": { label: "Option Mind for drills", config: { ...OPTION_DEFAULTS, chooser: { kind: "ranked" }, predictions: { kind: "prior" } }, offered: false },
  "option-tail": { label: "Option Mind, tail leaf, best line", config: { ...OPTION_DEFAULTS, chooser: { kind: "tree" } } },
  "option-fitted": { label: "Option Mind, fitted mean", config: { ...OPTION_DEFAULTS, chooser: { kind: "tree", leaf: "fitted", best: 0, objective: { kind: "few-terms", aggression: 4 } } } },
  "option-fitted-horizon": { label: "Option Mind, fitted mean, horizon 60 s", config: { ...OPTION_DEFAULTS, chooser: { kind: "tree", leaf: "fitted", best: 0, horizon: 60, objective: { kind: "few-terms", aggression: 4 } } } },
  "option-mean": { label: "Option Mind, mean", config: { ...OPTION_DEFAULTS, chooser: { kind: "tree", best: 0 } } },
  "option-warm": { label: "Option Mind, warm start, 100 runs", config: { ...OPTION_DEFAULTS, chooser: { kind: "tree", runs: 100, keeps: .5 } } },
  "option-reply": { label: "Option Mind, foe's closing reply", config: { ...OPTION_DEFAULTS, chooser: { ...OPTION_DEFAULTS.chooser, replies: 1, against: "mean" } } },
  "option-replies": { label: "Option Mind, foe's replies", config: { ...OPTION_DEFAULTS, chooser: { ...OPTION_DEFAULTS.chooser, replies: 2, against: "mean" } } },
});
