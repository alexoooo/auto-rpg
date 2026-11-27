import type { MindPreset } from "../../minds/index.ts";
import type { OptionMindConfig } from "../../minds/option/index.ts";
import { deepFreeze } from "../../core/state.ts";

/**
 * Its Option configuration names no Options, so it fights by every one registered (`optionsOf`),
 * of which a body offers those whose skill it fits, with the limbs it has (`skillsOf`). It looks
 * for a change it watches at 60 Hz, every other control step (`OptionMindConfig.rate`), where its
 * strike and gait profiles are measured. It searches by tree, each leaf the value fitted to what followed (`leaf` fitted),
 * each state worth the mean of its lines by their runs (`best` 0), at aggression 4, a blow's worth
 * falling by 0.3 a second along a line (`initiative`).
 */
const OPTION_DEFAULTS: OptionMindConfig = deepFreeze({ kind: "option", chooser: { kind: "tree", leaf: "fitted", best: 0, objective: { kind: "few-terms", aggression: 4, initiative: .3 } }, rate: 60 });

/**
 * **The settings every body shares** (`option-shared`). A fix, or a gain in scale or speed, is
 * every body's; only what was chosen for one situation is a body's own. The fixes make prices
 * truer: the leaf is the fitted value, which stands aside on a body it was not fitted on
 * (`fittedOn`); the foe is kept moving over a line's first half second (`carry`); a walk starts at
 * its speed along its way (`walkStart` signed) and a sway leaves the body by its own steps
 * (`sways` own). The gain is in its timing: it looks for a change it watches 20 times a second
 * and searches every 0.1 s. On the empty-handed Warrior, searching every 0.1 s beats 0.2 s, and
 * 20 Hz plays 60 Hz even for a sixth less thinking; the rat plays the Warrior as it did at
 * 60 Hz every 0.2 s (`docs/approaches.md`).
 */
const SHARED = deepFreeze({
  kind: "option", chooser: { kind: "tree", leaf: "fitted", carry: .5 }, predictions: { kind: "measured", walkStart: "signed", sways: "own" }, rate: 20, rethink: .1,
}) satisfies OptionMindConfig;

/** `option-lean`: the shared settings, each state worth its lines' mean (`best` 0) at aggression 4 and initiative 0.3, as read on the empty-handed man. */
const LEAN = deepFreeze({ ...SHARED, chooser: { ...SHARED.chooser, best: 0, objective: { kind: "few-terms", aggression: 4, initiative: .3 } } }) satisfies OptionMindConfig;

/**
 * Its config, on any body it fits, for fights and for measuring its profiles; and the drills' mind
 * (`option-drill`), on no menu: on its priors (`PRIOR_PREDICTIONS`), its
 * options run by their rank (`RANKED_CHOOSER`), nothing priced, searched or drawn. A drill (the
 * table's cells, their opponents, a skill's search) drives a skill fast and the same each time, and
 * no profile decides what its mind does there. And beside it, to compare in the Arena, the Mind it
 * was before (`option-tail`: the tail's leaf, each state worth its best line, the few terms as they
 * stand) and the searches measured stronger than that one, each with what it reads in its note
 * (`assets/minds/notes.json`): the fitted leaf with the mean backup at aggression 4, alone and at
 * horizon 60; the tail's leaf with the mean backup; and the warm start at 100 runs. And this Mind
 * priced against the foe's replies at their mean: one, the foe closing (`option-reply`), as strong
 * as it, quicker to a knockout and about as quick a step; two (`option-replies`), quicker to a
 * knockout still and a step about a fifth slower at its slowest. And that one with its own body
 * priced truer (`option-truer`): a walk starting at its speed along its way, going on away for its
 * gait's lag (`walkStart` signed), a sway leaving the body by its own steps (`sways` own), and the
 * foe kept moving over a line's first half second (`carry`), as strong as `option-reply`.
 *
 * The bodies' defaults are built on the settings every body shares (`option-shared`), each adding
 * only what was chosen for its situation. The empty-handed man's (`option-lean`) adds the mean
 * backup at aggression 4 and initiative 0.3; looking ten times a second with no reply searched, it
 * was as strong as `option-truer` at about half its thinking. The rat's (`option-presses`) presses
 * its attack: each state worth its best line (`best` 1), at aggression 5 and initiative 0.3, so it
 * bites the Warrior more often than it waits. And `option-lean` given no guesses
 * (`option-measured`): a strike, a foe's limb, a blow coming or a way up with no measurement is not
 * priced by hand but left out.
 */
export const OPTION_PRESETS: Readonly<Record<string, MindPreset>> = deepFreeze({
  option: { label: "Option Mind", config: OPTION_DEFAULTS },
  "option-drill": { label: "Option Mind for drills", config: { ...OPTION_DEFAULTS, chooser: { kind: "ranked" }, predictions: { kind: "prior" } }, offered: false },
  "option-shared": { label: "Shared settings", config: SHARED },
  "option-presses": { label: "Presses in", config: { ...SHARED, chooser: { ...SHARED.chooser, best: 1, objective: { kind: "few-terms", aggression: 5, initiative: .3 } } } },
  "option-tail": { label: "Rushes in", config: { ...OPTION_DEFAULTS, chooser: { kind: "tree" } } },
  "option-fitted": { label: "Option Mind, fitted mean", config: { ...OPTION_DEFAULTS, chooser: { kind: "tree", leaf: "fitted", best: 0, objective: { kind: "few-terms", aggression: 4 } } } },
  "option-fitted-horizon": { label: "Option Mind, fitted mean, horizon 60 s", config: { ...OPTION_DEFAULTS, chooser: { kind: "tree", leaf: "fitted", best: 0, horizon: 60, objective: { kind: "few-terms", aggression: 4 } } } },
  "option-mean": { label: "Option Mind, mean", config: { ...OPTION_DEFAULTS, chooser: { kind: "tree", best: 0 } } },
  "option-warm": { label: "Option Mind, warm start, 100 runs", config: { ...OPTION_DEFAULTS, chooser: { kind: "tree", runs: 100, keeps: .5 } } },
  "option-reply": { label: "Option Mind, foe's closing reply", config: { ...OPTION_DEFAULTS, chooser: { ...OPTION_DEFAULTS.chooser, replies: 1, against: "mean" } } },
  "option-replies": { label: "Option Mind, foe's replies", config: { ...OPTION_DEFAULTS, chooser: { ...OPTION_DEFAULTS.chooser, replies: 2, against: "mean" } } },
  "option-truer": {
    label: "Thinks ahead, foe's reply",
    config: { ...OPTION_DEFAULTS, chooser: { ...OPTION_DEFAULTS.chooser, replies: 1, against: "mean", carry: .5 }, predictions: { kind: "measured", walkStart: "signed", sways: "own" } },
  },
  "option-lean": { label: "Thinks ahead", config: LEAN },
  "option-measured": { label: "Option Mind, measured only", config: { ...LEAN, predictions: { ...LEAN.predictions, kind: "measured-only" } } },
});
