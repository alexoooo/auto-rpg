import { deepFreeze } from "../state.ts";
import type { PartField } from "../parts/fields.ts";
import type { PartLookup } from "../parts/lookup.ts";
import type { ChooserPart } from "./parts.ts";
import { anyBody, slotOne, type PartConfig } from "../parts/parts.ts";
import type { OfferTerms } from "../mind/engagement.ts";
import { onOffer, selectSet, type Appraise, type Chance, type Deciding, type Selection } from "../mind/choice.ts";
import { placed, type Option, type Situation } from "./option.ts";
import { eventOf } from "./percepts.ts";
import { FEW_TERMS_PART, type Objective } from "./objective.ts";
import type { Place } from "./position.ts";
import { OBEDIENCE, STEADY, type Obedience, type ObedienceLevel } from "./value.ts";

/** How a chooser decides (`Deciding`): it rethinks every 0.2 s. */
const DECIDING: Deciding = Object.freeze({ rethink: .2 });

/**
 * **A chooser**: of a body's options, the set it runs, whose claims (`Option.claims`) do not
 * overlap: the toolkit's set selection (`selectSet`) over options, priced in a body's terms
 * (`OfferTerms`), each decision's event its percepts' cues (`eventOf`).
 */
export type Chooser = Selection<Situation, OfferTerms, Option>;

/**
 * **The one policy** (`selectSet`) over `options`, priced by `appraise`, its event the percepts'
 * cues (`eventOf`), drawn by `chance` where it gives a margin; its memory the selection's, and the
 * memory of the `objective` it prices by, where that keeps one (`Objective.state`).
 */
const chooser = (options: readonly Option[], appraise: Appraise<Situation, OfferTerms, Option>, deciding: Deciding, chance?: Chance, objective: Objective | null = null): Chooser =>
  selectSet<Situation, OfferTerms, Option>(options, appraise, deciding, eventOf, chance, objective?.state ? { objective: objective.state } : {});

/** **A kind of Option Mind's chooser** (`ChooserPart`): over its options (`Option`), the chooser it makes a `Chooser`. */
export type OptionChooserPart<C extends PartConfig = PartConfig> = ChooserPart<C, Option, Chooser>;

/**
 * The chooser `config` names, as `parts` finds it, over `options`, its chances drawn from `seed`:
 * a part of the role makes a chooser over the options it is given (`ChooserPart`), which Option Mind's are.
 */
export const chooserOf = (parts: PartLookup, config: PartConfig, options: readonly Option[], seed: number): Chooser =>
  parts.of("chooser", config).make(config, options, seed, parts) as Chooser;

/** How many options ahead the ranked chooser looks: the one it takes. */
const RANKED_DEPTH = 1;

/** How many options ahead the valued chooser looks: the one it takes, or that and the best where it leaves the body (`lookingPast`). */
const VALUED_DEPTHS: readonly number[] = Object.freeze([1, 2]);

/** A depth other than those a chooser looks (`depths`), as a fault. */
const depthFaults = (depths: readonly number[]) => (config: { readonly depth: number }): readonly string[] =>
  depths.includes(config.depth) ? [] : [`depth: ${depths.join(" or ")}`];

/**
 * **What looking one option past an option adds to its worth**, life, over `options` priced at
 * `obedience` by `objective` (`Objective.worth`): where the option leaves the body at a spot (`Place.at`, a
 * walk's), the best worth of the options that answer there (`Option.at`, at the situation the place
 * predicts, `placed`), none below nothing (the rest options' floor), at the chance the body is up
 * there; less the best of them on offer here, so the option is priced against them as they stand
 * now. Only a walk is looked past: a strike, a cover or a rest option leaves the body where it
 * stands, and the best there is the best here. It reads the options' models at the place, never
 * the world. Its memory is the best here, for the situation it was read at.
 */
function lookingPast(options: readonly Option[], obedience: Obedience, objective: Objective): (now: Situation, exit: Place) => number {
  const past = options.filter((option) => option.at !== undefined), memo = { now: null as Situation | null, here: 0 };
  const here = (now: Situation): number => {
    if (memo.now === now) return memo.here;
    let best = 0;
    for (const option of past) if (onOffer(option, now)) best = Math.max(best, objective.worth(option.model(now), now, obedience).worth);
    memo.now = now; memo.here = best;
    return best;
  };
  return (now, exit) => {
    const there = placed(now, exit);
    let best = 0;
    for (const option of past) {
      const terms = option.at!(now, there, exit);
      if (terms) best = Math.max(best, objective.worth(terms, there, obedience).worth);
    }
    return (1 - exit.down) * best - here(now);
  };
}

/**
 * **The valued chooser's config**: its depth (`VALUED_DEPTHS`), what a metre walked as ordered is worth, life
 * (`obedience`, a level of `OBEDIENCE`; steady, `STEADY`, unless given), the margin of worth, life,
 * within which it chooses by chance (`Chance`), none unless given, and the objective it prices
 * options by (`objective`, a part of role `objective`; the few terms, `FEW_TERMS`, unless given).
 */
interface ValuedConfig { readonly kind: "valued"; readonly depth: number; readonly obedience?: ObedienceLevel; readonly margin?: number; readonly objective?: PartConfig | null }

/**
 * The valued chooser's obedience (`OBEDIENCE`): a choice written as its level's value, the steady
 * level as none written, so the preset is unchanged.
 */
const OBEDIENCE_FIELD: PartField<ValuedConfig> = {
  kind: "choice", key: "obedience", label: "Obedience", options: OBEDIENCE.map(([value, name]) => [value, name] as const),
  read: (config) => config.obedience ?? "steady",
  write: (config, text) => {
    const level = OBEDIENCE.find(([value]) => value === text);
    if (!level) return null;
    const { obedience: _, ...rest } = config;
    return level[2] === STEADY ? rest : { ...rest, obedience: level[0] };
  },
};

/**
 * **Valued**: each option worth its model's terms (`Terms`) in life beside the position held, by
 * its objective (`Objective.worth`), its orders at its obedience; at depth 2, a walk worth as well the
 * best option where it leaves the body (`lookingPast`).
 */
export const VALUED_CHOOSER: OptionChooserPart<ValuedConfig> = deepFreeze({
  role: "chooser", label: "By worth", stage: "game", fields: [OBEDIENCE_FIELD], slots: [slotOne("objective", "Objective", "objective", true, FEW_TERMS_PART.defaults)],
  defaults: { kind: "valued", depth: 2 }, keys: { kind: true, depth: true, obedience: true, margin: true, objective: true }, fits: anyBody,
  faults: (config: ValuedConfig) => [...depthFaults(VALUED_DEPTHS)(config),
    ...config.margin === undefined || Number.isFinite(config.margin) && config.margin >= 0 ? [] : ["margin: a finite worth, not negative"],
    ...config.obedience === undefined || OBEDIENCE.some(([value]) => value === config.obedience) ? [] : [`obedience: one of ${OBEDIENCE.map(([value]) => value).join(", ")}`]],
  make: (config: ValuedConfig, options: readonly Option[], seed: number, parts: PartLookup) => {
    const obedience = OBEDIENCE.find(([value]) => value === config.obedience)?.[2] ?? STEADY, given = config.objective ?? FEW_TERMS_PART.defaults;
    const objective = parts.of("objective", given).make(given) as Objective, past = config.depth >= 2 ? lookingPast(options, obedience, objective) : null;
    return chooser(options, (option, _, now) => {
      const terms = option.model(now), { worth: own, moves, letGo } = objective.worth(terms, now, obedience);
      const value = past && terms.exit.at ? own + past(now, terms.exit) : own;
      if (!Number.isFinite(value)) throw new Error(`${option.name} is worth ${value}`);
      return { name: option.name, worth: value, terms, moves, letGo };
    }, DECIDING, { margin: config.margin ?? 0, seed }, objective);
  },
});

/** The ranked chooser's config: its depth (`RANKED_DEPTH`). */
interface RankedConfig { readonly kind: "ranked"; readonly depth: number }

/** **Ranked**: each option worth its place, the first the most. */
export const RANKED_CHOOSER: OptionChooserPart<RankedConfig> = deepFreeze({
  role: "chooser", label: "By rank", stage: "game", fields: [], slots: [], defaults: { kind: "ranked", depth: RANKED_DEPTH },
  keys: { kind: true, depth: true }, fits: anyBody, faults: depthFaults([RANKED_DEPTH]),
  make: (_config: RankedConfig, options: readonly Option[]) => chooser(options, (option, i) => ({ name: option.name, worth: options.length - i, terms: null, moves: null, letGo: 0 }), DECIDING),
});
