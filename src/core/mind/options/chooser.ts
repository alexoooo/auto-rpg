import { randomStream } from "../../math/random.ts";
import { deepFreeze } from "../../state.ts";
import type { PartField } from "../fields.ts";
import type { PartLookup } from "../lookup.ts";
import { anyBody, type KeysOf, type Part, type PartConfig } from "../parts.ts";
import { onOffer, type Option, type Situation } from "./option.ts";
import { eventOf } from "./percepts.ts";
import { FEW_TERMS } from "./position.ts";
import { OBEDIENCE, STEADY, worth, type ObedienceLevel, type Terms } from "./value.ts";

/**
 * When a chooser decides afresh: every `rethink` s, and at once on an event (`eventOf`); the
 * running option is worth `keep` more than its value while it goes on, so that two near alike do
 * not trade places each decision.
 */
export interface Deciding { readonly rethink: number; readonly keep: number }

/**
 * **Choosing by chance**: among the options worth more than the best less `margin` (in the worth's unit), one drawn in
 * proportion to what each is worth above that floor, from a stream begun at `seed`. A margin of
 * 0 draws nothing and takes the best.
 */
export interface Chance { readonly margin: number; readonly seed: number }

/** How a ranked chooser decides (`Deciding`). */
const RANKED_DECIDING: Deciding = Object.freeze({ rethink: .2, keep: .5 });

/** How a valued chooser decides: a running option kept above its rivals by 1/600 of a life (`worth`), the owner's decision. */
const VALUED_DECIDING: Deciding = Object.freeze({ rethink: RANKED_DECIDING.rethink, keep: 1 / 600 });

/**
 * An option's worth at a decision, the terms it was weighed from, how much it changes the position
 * and what letting it go costs, running (`worth`); none for a fixed worth, which costs nothing to let go.
 */
export interface Offer {
  readonly name: string;
  readonly worth: number;
  readonly terms: Terms | null;
  readonly moves: number | null;
  readonly letGo: number;
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
 * of its entry, when it reaches its exit, or `rethink` s on, it takes the option on offer (`onOffer`) of the highest worth,
 * the running one's raised by `keep` and what letting it go costs (`Offer.letGo`), the first of equals, or one drawn by `chance` where it gives
 * a margin; a running option that does not yield is kept while it goes on. Standing, it takes one
 * only worth more than the defaults holding the position, none; down there are no defaults, and it
 * takes the best. Its memory is which option runs (its place in `options`, or -1), when it decided, when it next rethinks, the event it
 * decided on, whether the running option was at its exit, the offers it chose from, and, where it draws, its stream's word.
 */
export function chooser(options: readonly Option[], appraise: Appraise, deciding: Deciding, chance: Chance = { margin: 0, seed: 0 }): Chooser {
  if (!(chance.margin >= 0) || !Number.isFinite(chance.margin)) throw new Error(`a chooser's margin is finite and not negative, not ${chance.margin}`);
  const stream = chance.margin > 0 ? randomStream(chance.seed) : null;
  const state = { running: -1, decided: -Infinity, next: -Infinity, event: "", exiting: false, offers: [] as Offer[], ...(stream ? { random: stream.state } : {}) };
  const values: number[] = [];
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
      const exiting = running !== null && !over && running.exit(now)?.kind === "ready";
      if (!over && event === state.event && now.time < state.next && exiting === state.exiting) return running;
      state.event = event;
      state.exiting = exiting;
      state.next = now.time + deciding.rethink;
      if (running && !over && !running.yields(now)) return running;
      if (running && over) { running.end(); state.running = -1; }
      let best = -1, top = now.down ? -Infinity : 0;
      state.offers = [];
      values.length = 0;
      options.forEach((option, i) => {
        values.push(-Infinity);
        if (!onOffer(option, now)) return;
        const offer = appraise(option, i, now), value = offer.worth + (i === state.running ? deciding.keep + offer.letGo : 0);
        state.offers.push(offer);
        values[i] = value;
        if (value > top) { best = i; top = value; }
      });
      if (stream && best >= 0) best = drawn(values, top - chance.margin, best, stream.next);
      if (best !== state.running) {
        if (state.running >= 0) options[state.running]!.end();
        state.running = best;
        if (best >= 0) options[best]!.begin(now);
      }
      state.exiting = best >= 0 && options[best]!.exit(now)?.kind === "ready";
      return current();
    },
  };
}

/**
 * Of `values` (each option's, -Infinity off offer), one worth more than `floor`, drawn by `next` in
 * proportion to its worth above the floor; `best` alone where no other is, with nothing drawn.
 */
function drawn(values: readonly number[], floor: number, best: number, next: () => number): number {
  let total = 0, count = 0;
  for (const value of values) if (value > floor) { total += value - floor; count++; }
  if (count < 2) return best;
  let left = next() * total;
  for (let i = 0; i < values.length; i++) {
    const value = values[i]!;
    if (!(value > floor)) continue;
    left -= value - floor;
    if (left < 0) return i;
  }
  return best;
}

/** **A kind of chooser**: a part of role `chooser` that owns its config's keys and faults, and makes the chooser over a body's options. */
export interface ChooserPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "chooser";
  readonly keys: KeysOf<C>;
  /** The chooser over `options`, its chances drawn from `seed` (`BodyHost.seed`). */
  make(config: C, options: readonly Option[], seed: number): Chooser;
}

/** The chooser `config` names, as `parts` finds it, over `options`, its chances drawn from `seed`. */
export const chooserOf = (parts: PartLookup, config: PartConfig, options: readonly Option[], seed: number): Chooser => parts.of("chooser", config).make(config, options, seed);

/** How many options ahead a chooser looks: one, until its options' profiles are measured (the Options plan's depth 2). */
const DEPTH = 1;

/** A depth other than the one a chooser looks (`DEPTH`), as a fault. */
const depthFaults = (config: { readonly depth: number }): readonly string[] => config.depth === DEPTH ? [] : [`depth: ${DEPTH}`];

/**
 * **The valued chooser's config**: its depth, what a metre walked as ordered is worth, life
 * (`obedience`, a level of `OBEDIENCE`; steady, `STEADY`, unless given), and the margin of worth, life,
 * within which it chooses by chance (`Chance`), none unless given.
 */
interface ValuedConfig { readonly kind: "valued"; readonly depth: number; readonly obedience?: ObedienceLevel; readonly margin?: number }

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

/** **Valued**: each option worth its model's terms (`Terms`) in life beside the position held (`worth`, by the few terms, `FEW_TERMS`), its orders at its obedience. */
export const VALUED_CHOOSER: ChooserPart<ValuedConfig> = deepFreeze({
  role: "chooser", label: "By worth", stage: "game", fields: [OBEDIENCE_FIELD], slots: [], defaults: { kind: "valued", depth: DEPTH },
  keys: { kind: true, depth: true, obedience: true, margin: true }, fits: anyBody,
  faults: (config: ValuedConfig) => [...depthFaults(config),
    ...config.margin === undefined || Number.isFinite(config.margin) && config.margin >= 0 ? [] : ["margin: a finite worth, not negative"],
    ...config.obedience === undefined || OBEDIENCE.some(([value]) => value === config.obedience) ? [] : [`obedience: one of ${OBEDIENCE.map(([value]) => value).join(", ")}`]],
  make: (config: ValuedConfig, options: readonly Option[], seed: number) => {
    const obedience = OBEDIENCE.find(([value]) => value === config.obedience)?.[2] ?? STEADY;
    return chooser(options, (option, _, now) => {
      const terms = option.model(now), { worth: value, moves, letGo } = worth(terms, now, obedience, FEW_TERMS);
      if (!Number.isFinite(value)) throw new Error(`${option.name} is worth ${value}`);
      return { name: option.name, worth: value, terms, moves, letGo };
    }, VALUED_DECIDING, { margin: config.margin ?? 0, seed });
  },
});

/** The ranked chooser's config: its depth. */
interface RankedConfig { readonly kind: "ranked"; readonly depth: number }

/** **Ranked**: each option worth its place, the first the most. */
export const RANKED_CHOOSER: ChooserPart<RankedConfig> = deepFreeze({
  role: "chooser", label: "By rank", stage: "game", fields: [], slots: [], defaults: { kind: "ranked", depth: DEPTH },
  keys: { kind: true, depth: true }, fits: anyBody, faults: depthFaults,
  make: (_config: RankedConfig, options: readonly Option[]) => chooser(options, (option, i) => ({ name: option.name, worth: options.length - i, terms: null, moves: null, letGo: 0 }), RANKED_DECIDING),
});
