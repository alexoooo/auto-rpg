import { deepFreeze } from "../../state.ts";
import type { PartField } from "../fields.ts";
import type { PartLookup } from "../lookup.ts";
import { anyBody, type KeysOf, type Part, type PartConfig } from "../parts.ts";
import { onOffer, type Option, type Situation } from "./option.ts";
import { eventOf } from "./percepts.ts";
import { OBEDIENCE, TERMS, WEIGHTS, worth, type Terms, type Weights } from "./value.ts";

/**
 * When a chooser decides afresh: every `rethink` s, and at once on an event (`eventOf`); the
 * running option is worth `keep` more than its value while it goes on, so that two near alike do
 * not trade places each decision.
 */
export interface Deciding { readonly rethink: number; readonly keep: number }

/** How a ranked chooser decides (`Deciding`). */
const RANKED_DECIDING: Deciding = Object.freeze({ rethink: .2, keep: .5 });

/** How a valued chooser decides: a running option kept a second's worth (`worth`) above its rivals. */
const VALUED_DECIDING: Deciding = Object.freeze({ rethink: RANKED_DECIDING.rethink, keep: 1 });

/** An option's worth at a decision, and the terms it was weighed from; none for a fixed worth. */
export interface Offer {
  readonly name: string;
  readonly worth: number;
  readonly terms: Terms | null;
}

/** How a chooser prices the option at `i` of its options, now. */
export type Appraise = (option: Option, i: number, now: Situation) => Offer;

/**
 * **A chooser**: of a body's options, the one it runs, which fills the intent's commitment or its
 * footwork (`Layer`); the layers under it fill the rest (`approach`, `cover`). Its memory is in
 * `state`, plain data.
 */
export interface Chooser {
  readonly state: object;
  /** The option running, after deciding at `now` if it has not yet this step: null with none. */
  decide(now: Situation): Option | null;
  /** The option running, as the last decision left it: null with none. */
  readonly running: Option | null;
  /** What it chose among at its last decision. */
  readonly offers: readonly Offer[];
}

/**
 * **A chooser one option deep**: of `options`, the one the body runs, by its worth as `appraise`
 * prices it. Once a control step (`decide`), on an event, when the running option is over or out
 * of its entry, or `rethink` s on, it takes the option on offer (`onOffer`) of the highest worth,
 * the running one's raised by `keep`, the first of equals; a running option that does not yield
 * is kept while it goes on. Its memory is which option runs (its place in `options`, or -1), when
 * it decided, when it next rethinks, the event it decided on, and the offers it chose from.
 */
export function chooser(options: readonly Option[], appraise: Appraise, deciding: Deciding): Chooser {
  const state = { running: -1, decided: -Infinity, next: -Infinity, event: "", offers: [] as Offer[] };
  const current = (): Option | null => state.running < 0 ? null : options[state.running]!;
  return {
    state,
    get running() { return current(); },
    get offers() { return state.offers; },
    decide(now) {
      if (state.decided === now.time) return current();
      state.decided = now.time;
      const event = eventOf(now), running = current();
      const over = running !== null && (running.ended(now) || !onOffer(running, now));
      if (!over && event === state.event && now.time < state.next) return running;
      state.event = event;
      state.next = now.time + deciding.rethink;
      if (running && !over && !running.yields(now)) return running;
      if (running && over) { running.end(); state.running = -1; }
      let best = -1, top = -Infinity;
      state.offers = [];
      options.forEach((option, i) => {
        if (!onOffer(option, now)) return;
        const offer = appraise(option, i, now), value = offer.worth + (i === state.running ? deciding.keep : 0);
        state.offers.push(offer);
        if (value > top) { best = i; top = value; }
      });
      if (best !== state.running) {
        if (state.running >= 0) options[state.running]!.end();
        state.running = best;
        if (best >= 0) options[best]!.begin(now);
      }
      return current();
    },
  };
}

/** **A kind of chooser**: a part of role `chooser` that owns its config's keys and faults, and makes the chooser over a body's options. */
export interface ChooserPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "chooser";
  readonly keys: KeysOf<C>;
  make(config: C, options: readonly Option[]): Chooser;
}

/** The chooser `config` names, as `parts` finds it, over `options`. */
export const chooserOf = (parts: PartLookup, config: PartConfig, options: readonly Option[]): Chooser => parts.of("chooser", config).make(config, options);

/** How many options ahead a chooser looks: one, until its options' profiles are measured (the Options plan's depth 2). */
const DEPTH = 1;

/** A depth other than the one a chooser looks (`DEPTH`), as a fault. */
const depthFaults = (config: { readonly depth: number }): readonly string[] => config.depth === DEPTH ? [] : [`depth: ${DEPTH}`];

/** **The valued chooser's config**: its depth, and what it weighs each term by over the fighter's own (`WEIGHTS`). */
interface ValuedConfig { readonly kind: "valued"; readonly depth: number; readonly weights?: Readonly<Partial<Weights>> }

/**
 * The valued chooser's obedience (`OBEDIENCE`): a choice written as the weight of its orders, the
 * steady level as no weight written, so the preset is unchanged; a weight that is no level reads
 * as none of them.
 */
const OBEDIENCE_FIELD: PartField<ValuedConfig> = {
  kind: "choice", key: "weights", label: "Obedience", options: OBEDIENCE.map(([value, name]) => [value, name] as const),
  read: (config) => OBEDIENCE.find(([, , orders]) => orders === (config.weights?.orders ?? WEIGHTS.orders))?.[0] ?? "",
  write: (config, text) => {
    const level = OBEDIENCE.find(([value]) => value === text);
    if (!level) return null;
    const { orders: _, ...others } = config.weights ?? {}, weights = level[2] === WEIGHTS.orders ? others : { ...others, orders: level[2] };
    const { weights: __, ...rest } = config;
    return Object.keys(weights).length > 0 ? { ...rest, weights } : rest;
  },
};

/** **Valued**: each option worth its hand-built model's terms (`Terms`), weighed by the config's weights over `WEIGHTS` (`worth`). */
export const VALUED_CHOOSER: ChooserPart<ValuedConfig> = deepFreeze({
  role: "chooser", label: "By worth", stage: "game", fields: [OBEDIENCE_FIELD], slots: [], defaults: { kind: "valued", depth: DEPTH },
  keys: { kind: true, depth: true, weights: true }, fits: anyBody,
  faults: (config: ValuedConfig) => [...depthFaults(config),
    ...Object.entries(config.weights ?? {}).flatMap(([term, weight]) => TERMS.includes(term as typeof TERMS[number]) && Number.isFinite(weight) && weight >= 0 ? [] : [`weights.${term}: a term (${TERMS.join(", ")}) of a finite weight, not negative`])],
  make: (config: ValuedConfig, options: readonly Option[]) => {
    const weights = { ...WEIGHTS, ...config.weights };
    return chooser(options, (option, _, now) => {
      const terms = option.models["hand-built"](now), value = worth(terms, weights);
      if (!Number.isFinite(value)) throw new Error(`${option.name} is worth ${value}`);
      return { name: option.name, worth: value, terms };
    }, VALUED_DECIDING);
  },
});

/** The ranked chooser's config: its depth. */
interface RankedConfig { readonly kind: "ranked"; readonly depth: number }

/** **Ranked**: each option worth its place, the first the most. */
export const RANKED_CHOOSER: ChooserPart<RankedConfig> = deepFreeze({
  role: "chooser", label: "By rank", stage: "game", fields: [], slots: [], defaults: { kind: "ranked", depth: DEPTH },
  keys: { kind: true, depth: true }, fits: anyBody, faults: depthFaults,
  make: (_config: RankedConfig, options: readonly Option[]) => chooser(options, (option, i) => ({ name: option.name, worth: options.length - i, terms: null }), RANKED_DECIDING),
});
