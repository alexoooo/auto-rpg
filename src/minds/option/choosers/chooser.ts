import type { PartLookup } from "../../../parts/lookup.ts";
import type { PartConfig } from "../../../parts/parts.ts";
import { selectSet, type Appraise, type Chance, type Cue, type Deciding, type Holding } from "./select-set.ts";
import type { Chooser } from "../contract/chooser.ts";
import type { ExchangePredictor } from "../contract/predictors.ts";
import { placed } from "../situation/imagined.ts";
import type { Option } from "../contract/option.ts";
import type { Situation } from "../contract/situation.ts";
import type { Objective } from "../contract/objective.ts";
import { threatened } from "../situation/reach-memory.ts";
import { unchanged } from "../options/outcomes.ts";
import type { Lines } from "./search.ts";

/**
 * **What a chooser watches** (`Cue`): the cues of the cued percepts its last decision asked for
 * (`Cues`), counted afresh as each decision begins. Its memory is their names.
 */
function watching(): Cue & { readonly state: { watched: string[] } } {
  const state = { watched: [] as string[] };
  return {
    state,
    event: (now) => now.cues.event(now, state.watched),
    deciding: (now) => now.cues.clear(),
    decided: (now) => { state.watched = now.cues.asked(); },
  };
}

/**
 * **The one policy** (`selectSet`) over `options`, priced by `appraise`, its event the cues its last
 * decision read (`watching`), drawn by `chance` where it gives a margin, each other foe's price held as
 * `holding` says where it is not null; its memory the selection's, what it watches, the memory of the `objective`
 * it prices by, where that keeps one (`Objective.state`), and the chooser's `own`.
 */
export const chooser = ({ options, appraise, deciding, chance, objective, holding, own }: {
  readonly options: readonly Option[]; readonly appraise: Appraise; readonly deciding: Deciding; readonly chance: Chance;
  readonly objective: Objective | null; readonly holding: Holding | null; readonly own: Readonly<Record<string, object>>;
}): Chooser => {
  const cue = watching();
  return selectSet({ choices: options, appraise, deciding, cue, chance,
    memory: { cue: cue.state, ...(objective?.state ? { objective: objective.state } : {}), ...own }, holding });
};

/**
 * The chooser `config` names, as `parts` finds it, over `given`'s `options`, its chances drawn from its
 * `seed`, for its `body` (`bodyOf`), its search asking its `exchange` of the foe.
 */
export const chooserOf = (parts: PartLookup, config: PartConfig, given: { readonly options: readonly Option[]; readonly seed: number; readonly body: string; readonly exchange: ExchangePredictor }): Chooser =>
  parts.of("chooser", config).make({ config, parts, ...given });

/**
 * **A chooser's appraisal by a search** (`search`, `treeSearch`), made once a decision for each
 * state by `make`: a running choice's price, its line, its model's terms with what it is expected to
 * leave as a readout shows it (`OfferTerms`: the range and the chance of being down, by the
 * chances of the ways it ends), how much its line is worth beyond what its own model brings
 * (`moves`), and what letting it go costs (`letGo`: the life it loses while it comes back beyond
 * what holding as long costs, `threatened`, none below nothing).
 */
export function searching(make: (now: Situation) => Lines): Appraise {
  const searches = new Map<Situation, Lines>();
  let time = NaN;
  return (option, _i, now, target) => {
    if (now.time !== time) { searches.clear(); time = now.time; }
    let lines = searches.get(now);
    if (!lines) searches.set(now, lines = make(now));
    const priced = lines(option, target);
    if (!priced) return null;
    const { worth, terms } = priced;
    let range = 0, down = 0;
    for (const outcome of terms.outcomes) {
      const end = unchanged(outcome.leaves) ? now : placed(now, outcome.leaves, terms.duration);
      range += outcome.chance * end.range; down += outcome.chance * (end.down ? 1 : 0);
    }
    const letGo = terms.letGo ? Math.max(0, terms.letGo.taken - threatened(now, terms.letGo.seconds)) : 0;
    return { name: option.name, kind: option.kind, worth, terms: { open: option.open === true, duration: terms.duration, dealt: terms.dealt, taken: terms.taken, orders: terms.orders, exit: { range, down } },
      moves: worth - (terms.dealt - terms.taken), letGo };
  };
}
