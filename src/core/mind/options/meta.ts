import type { ModelKind, Option, Situation } from "./option.ts";
import { worth, type Terms, type Weights } from "./value.ts";

/**
 * When a meta-controller decides afresh: every `rethink` s, and at once on an event; the running
 * option is worth `keep` more than its value while it goes on, so that two near alike do not trade
 * places each decision.
 */
export const DECIDING: Deciding = Object.freeze({ rethink: .2, keep: .5 });

interface Deciding { readonly rethink: number; readonly keep: number }

/** What a valued meta-controller keeps a running option's worth above its rivals' by, a second (`worth`). */
const VALUED: Deciding = Object.freeze({ rethink: DECIDING.rethink, keep: 1 });

/** What changes the situation enough to decide at once: the body going down or getting up, a threat or a blow coming, another focus, other orders. */
const eventOf = (now: Situation): string =>
  JSON.stringify([now.down, now.threat !== null, now.incoming !== null, now.focus?.id ?? null, now.orders]);

/** An option's worth at a decision, and the terms it was weighed from; none for a fixed worth. */
export interface Offer {
  readonly name: string;
  readonly worth: number;
  readonly terms: Terms | null;
}

/** How a meta-controller prices the option at `i` of its options, now. */
type Appraise = (option: Option, i: number, now: Situation) => Offer;

/** **Ranked**: each option worth its fixed value, in the order of the options. */
function ranked(values: readonly number[], count: number): Appraise {
  if (values.length !== count || values.some((value) => !Number.isFinite(value))) throw new Error("a meta-controller needs a finite value for every option");
  return (option, i) => ({ name: option.name, worth: values[i]!, terms: null });
}

/** How a meta-controller prices its options, and when it decides afresh. */
interface Pricing { readonly appraise: Appraise; readonly deciding: Deciding }

/** **Valued**: each option worth its terms by its `kind` of model, weighed by `weights` (`worth`). */
export function valued(kind: ModelKind, weights: Weights): Pricing {
  return { deciding: VALUED, appraise: (option, _, now) => {
    const terms = option.models[kind](now), value = worth(terms, weights);
    if (!Number.isFinite(value)) throw new Error(`${option.name} is worth ${value}`);
    return { name: option.name, worth: value, terms };
  } };
}

/**
 * **A meta-controller**: of `options`, the one the body carries out, by worth: fixed values, in
 * the order of `options` (ranked), or what an appraisal prices each at (`valued`). Once a control
 * step (`decide`), on an event, when the running option is over or unavailable, or `rethink` s on,
 * it takes the available option of the highest worth, the running one's raised by `keep`, the first
 * of equals; a running option that does not yield is kept while it goes on. Its memory is which
 * option runs (its place in `options`, or -1), when it decided, the event it decided on, and the
 * offers it chose from.
 */
export function metaController(options: readonly Option[], values: readonly number[] | Pricing, deciding = DECIDING) {
  const { appraise, deciding: how } = "appraise" in values ? values : { appraise: ranked(values, options.length), deciding };
  const state = { running: -1, decided: -Infinity, next: -Infinity, event: "", offers: [] as Offer[] };
  return {
    state,
    /** The running option, after deciding at `now` if it has not yet: null with none. */
    decide(now: Situation): Option | null {
      if (state.decided === now.time) return state.running < 0 ? null : options[state.running]!;
      state.decided = now.time;
      const event = eventOf(now), current = state.running < 0 ? null : options[state.running]!;
      const over = current !== null && (current.ended(now) || !current.available(now));
      if (!over && event === state.event && now.time < state.next) return current;
      state.event = event;
      state.next = now.time + how.rethink;
      if (current && !over && !current.yields(now)) return current;
      if (current && over) { current.end(); state.running = -1; }
      let best = -1, top = -Infinity;
      state.offers = [];
      options.forEach((option, i) => {
        if (!option.available(now)) return;
        const offer = appraise(option, i, now), value = offer.worth + (i === state.running ? how.keep : 0);
        state.offers.push(offer);
        if (value > top) { best = i; top = value; }
      });
      if (best !== state.running) {
        if (state.running >= 0) options[state.running]!.end();
        state.running = best;
        if (best >= 0) options[best]!.begin(now);
      }
      return best < 0 ? null : options[best]!;
    },
  };
}
