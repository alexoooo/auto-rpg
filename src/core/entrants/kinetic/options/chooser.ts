import { randomStream } from "../../../math/random.ts";
import { deepFreeze } from "../../../state.ts";
import type { PartField } from "../../../mind/fields.ts";
import type { PartLookup } from "../../../mind/lookup.ts";
import type { ChooserPart } from "../../../mind/chooser-part.ts";
import { anyBody, slotOne, type PartConfig } from "../../../mind/parts.ts";
import type { Offer } from "../../../mind/tactics.ts";
import { onOffer, overlaps, type Option, type Situation } from "./option.ts";
import { eventOf } from "./percepts.ts";
import { FEW_TERMS_PART, type PositionValue } from "./position.ts";
import { OBEDIENCE, STEADY, worth, type ObedienceLevel } from "./value.ts";

/** When a chooser decides afresh: every `rethink` s, and at once on an event (`eventOf`). */
export interface Deciding { readonly rethink: number }

/**
 * **Choosing by chance**: among the options worth more than the best less `margin` (in the worth's unit), one drawn in
 * proportion to what each is worth above that floor, from a stream begun at `seed`. A margin of
 * 0 draws nothing and takes the best.
 */
export interface Chance { readonly margin: number; readonly seed: number }

/** How a chooser decides (`Deciding`), by rank or by worth. */
const DECIDING: Deciding = Object.freeze({ rethink: .2 });

/** How a chooser prices the option at `i` of its options, now. */
export type Appraise = (option: Option, i: number, now: Situation) => Offer;

/**
 * **A chooser**: of a body's options, the set it runs, whose claims (`Option.claims`) do not
 * overlap. Its memory is in `state`, plain data.
 */
export interface Chooser {
  readonly state: object;
  /** The set running, after deciding at `now` if it has not yet this step, the first chosen first: empty with none. */
  decide(now: Situation): readonly Option[];
  /** The set running, as the last decision left it. */
  readonly running: readonly Option[];
  /** What it chose among at its last decision. */
  readonly offers: readonly Offer[];
}

/**
 * **The one policy**: of `options`, the set the body runs, by worth as `appraise` prices each.
 * Once a control step (`decide`), on an event, when an option running is over or out of its entry,
 * when the first chosen reaches its exit, or `rethink` s on, it decides afresh: a running option
 * that does not yield keeps what it claims; then, of the options on offer (`onOffer`), each running
 * one raised by what letting it go costs (`Offer.letGo`), it takes the best (drawn by
 * `chance` where it gives a margin), then the best of the rest whose claims are still free, the
 * first of equals, until none is left. The rest options (`hold`, `guard`, `brace`) take a resource
 * nothing else is worth more on. Its memory is which options run (their places in `options`, the
 * first chosen first), when it decided, when it next rethinks, the event it decided on, whether the
 * first chosen was at its exit, the offers it chose from, and, where it draws, its stream's word.
 */
export function chooser(options: readonly Option[], appraise: Appraise, deciding: Deciding, chance: Chance = { margin: 0, seed: 0 }): Chooser {
  if (!(chance.margin >= 0) || !Number.isFinite(chance.margin)) throw new Error(`a chooser's margin is finite and not negative, not ${chance.margin}`);
  const stream = chance.margin > 0 ? randomStream(chance.seed) : null;
  const state = { running: [] as number[], decided: -Infinity, next: -Infinity, event: "", exiting: false, offers: [] as Offer[], ...(stream ? { random: stream.state } : {}) };
  const values: number[] = [], order: number[] = [], chosen: number[] = [], set: Option[] = [];
  const current = (): readonly Option[] => { set.length = 0; for (const i of state.running) set.push(options[i]!); return set; };
  const free = (i: number): boolean => { for (const k of chosen) if (overlaps(options[k]!.claims, options[i]!.claims)) return false; return true; };
  const exitingOf = (now: Situation): boolean => state.running.length > 0 && options[state.running[0]!]!.status(now) === "exit";
  /** Whether a running `option` is done: over, or out of its entry. */
  const done = (option: Option, now: Situation): boolean => option.status(now) === "over" || !onOffer(option, now);
  return {
    state,
    get running() { return current(); },
    get offers() { return state.offers; },
    decide(now) {
      if (state.decided === now.time) return current();
      state.decided = now.time;
      const event = eventOf(now);
      let over = false;
      for (const i of state.running) if (done(options[i]!, now)) over = true;
      const exiting = !over && exitingOf(now);
      if (!over && event === state.event && now.time < state.next && exiting === state.exiting) return current();
      state.event = event;
      state.next = now.time + deciding.rethink;
      // An option over or out of its entry is ended: it may only be begun afresh.
      if (over) state.running = state.running.filter((i) => { const option = options[i]!, ended = done(option, now); if (ended) option.end(); return !ended; });
      chosen.length = 0;
      // A running option that does not yield keeps what it claims.
      for (const i of state.running) if (options[i]!.status(now) === "committed") chosen.push(i);
      state.offers = [];
      values.length = 0; order.length = 0;
      options.forEach((option, i) => {
        values.push(-Infinity);
        if (chosen.includes(i) || !onOffer(option, now)) return;
        const offer = appraise(option, i, now), value = offer.worth + (state.running.includes(i) ? offer.letGo : 0);
        state.offers.push(offer);
        values[i] = value;
        order.push(i);
      });
      // Equals by rank, a rest option before the rest: an option takes a resource from rest only worth more.
      order.sort((a, b) => values[b]! - values[a]! || Number(options[b]!.rest ?? false) - Number(options[a]!.rest ?? false) || a - b);
      // The first, by chance where a margin is given: one drawn among those free worth more than the best free less the margin.
      const best = stream ? order.find(free) : undefined;
      if (stream && best !== undefined) {
        for (const k of order) if (!free(k)) values[k] = -Infinity;
        chosen.push(drawn(values, values[best]! - chance.margin, best, stream.next));
      }
      for (const i of order) if (!chosen.includes(i) && free(i)) chosen.push(i);
      for (const i of state.running) if (!chosen.includes(i)) options[i]!.end();
      for (const i of chosen) if (!state.running.includes(i)) options[i]!.begin(now);
      state.running = [...chosen];
      state.exiting = exitingOf(now);
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

/** **A kind of Kinetic's chooser** (`ChooserPart`): over its options (`Option`), the chooser it makes a `Chooser`. */
export type KineticChooserPart<C extends PartConfig = PartConfig> = ChooserPart<C, Option, Chooser>;

/**
 * The chooser `config` names, as `parts` finds it, over `options`, its chances drawn from `seed`:
 * a part of the role makes a chooser over the options it is given (`ChooserPart`), which Kinetic's are.
 */
export const chooserOf = (parts: PartLookup, config: PartConfig, options: readonly Option[], seed: number): Chooser =>
  parts.of("chooser", config).make(config, options, seed, parts) as Chooser;

/** How many options ahead a chooser looks: one, until its options' profiles are measured. */
const DEPTH = 1;

/** A depth other than the one a chooser looks (`DEPTH`), as a fault. */
const depthFaults = (config: { readonly depth: number }): readonly string[] => config.depth === DEPTH ? [] : [`depth: ${DEPTH}`];

/**
 * **The valued chooser's config**: its depth, what a metre walked as ordered is worth, life
 * (`obedience`, a level of `OBEDIENCE`; steady, `STEADY`, unless given), the margin of worth, life,
 * within which it chooses by chance (`Chance`), none unless given, and the position value it prices
 * places by (`position`, a part of role `position`; the few terms, `FEW_TERMS`, unless given).
 */
interface ValuedConfig { readonly kind: "valued"; readonly depth: number; readonly obedience?: ObedienceLevel; readonly margin?: number; readonly position?: PartConfig | null }

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

/** **Valued**: each option worth its model's terms (`Terms`) in life beside the position held (`worth`, by its position value), its orders at its obedience. */
export const VALUED_CHOOSER: KineticChooserPart<ValuedConfig> = deepFreeze({
  role: "chooser", label: "By worth", stage: "game", fields: [OBEDIENCE_FIELD], slots: [slotOne("position", "Position value", "position", true, FEW_TERMS_PART.defaults)],
  defaults: { kind: "valued", depth: DEPTH }, keys: { kind: true, depth: true, obedience: true, margin: true, position: true }, fits: anyBody,
  faults: (config: ValuedConfig) => [...depthFaults(config),
    ...config.margin === undefined || Number.isFinite(config.margin) && config.margin >= 0 ? [] : ["margin: a finite worth, not negative"],
    ...config.obedience === undefined || OBEDIENCE.some(([value]) => value === config.obedience) ? [] : [`obedience: one of ${OBEDIENCE.map(([value]) => value).join(", ")}`]],
  make: (config: ValuedConfig, options: readonly Option[], seed: number, parts: PartLookup) => {
    const obedience = OBEDIENCE.find(([value]) => value === config.obedience)?.[2] ?? STEADY, given = config.position ?? FEW_TERMS_PART.defaults;
    const position = parts.of("position", given).make(given) as PositionValue;
    return chooser(options, (option, _, now) => {
      const terms = option.model(now), { worth: value, moves, letGo } = worth(terms, now, obedience, position);
      if (!Number.isFinite(value)) throw new Error(`${option.name} is worth ${value}`);
      return { name: option.name, worth: value, terms, moves, letGo };
    }, DECIDING, { margin: config.margin ?? 0, seed });
  },
});

/** The ranked chooser's config: its depth. */
interface RankedConfig { readonly kind: "ranked"; readonly depth: number }

/** **Ranked**: each option worth its place, the first the most. */
export const RANKED_CHOOSER: KineticChooserPart<RankedConfig> = deepFreeze({
  role: "chooser", label: "By rank", stage: "game", fields: [], slots: [], defaults: { kind: "ranked", depth: DEPTH },
  keys: { kind: true, depth: true }, fits: anyBody, faults: depthFaults,
  make: (_config: RankedConfig, options: readonly Option[]) => chooser(options, (option, i) => ({ name: option.name, worth: options.length - i, terms: null, moves: null, letGo: 0 }), DECIDING),
});
