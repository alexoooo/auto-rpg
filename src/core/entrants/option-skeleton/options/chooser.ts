import { randomStream } from "../../../math/random.ts";
import { deepFreeze } from "../../../state.ts";
import type { PartField } from "../../../mind/fields.ts";
import type { PartLookup } from "../../../mind/lookup.ts";
import type { ChooserPart } from "../../../mind/chooser-part.ts";
import { anyBody, slotOne, type PartConfig } from "../../../mind/parts.ts";
import type { Offer } from "../../../mind/tactics.ts";
import type { Resource } from "../../../skills/action.ts";
import { NOTHING, onOffer, overlaps, placed, type Option, type Situation } from "./option.ts";
import { eventOf } from "./percepts.ts";
import { FEW_TERMS_PART, type Place, type PositionValue } from "./position.ts";
import { OBEDIENCE, STEADY, worth, type Obedience, type ObedienceLevel } from "./value.ts";

/** When a chooser decides afresh: every `rethink` s, and at once on an event (`eventOf`). */
interface Deciding { readonly rethink: number }

/**
 * **Choosing by chance**: among the options worth more than the best less `margin` (in the worth's unit), one drawn in
 * proportion to what each is worth above that floor, from a stream begun at `seed`. A margin of
 * 0 draws nothing and takes the best.
 */
interface Chance { readonly margin: number; readonly seed: number }

/** How a chooser decides (`Deciding`), by rank or by worth. */
const DECIDING: Deciding = Object.freeze({ rethink: .2 });

/** How a chooser prices the option at `i` of its options, now. */
type Appraise = (option: Option, i: number, now: Situation) => Offer;

/** **What a chooser decided**: the set running, the first chosen first (empty with none), and the situation it runs at. */
interface Chosen {
  readonly set: readonly Option[];
  readonly at: Situation;
}

/**
 * **A chooser**: of a body's options, the set it runs, whose claims (`Option.claims`) do not
 * overlap. Its memory is in `state`, plain data.
 */
interface Chooser {
  readonly state: object;
  /**
   * The set running and where (`Chosen`), after deciding at `now` if it has not yet this step.
   * Deciding afresh with nothing committed, it prices its options at each of `others` too (the
   * situation at each other target), and runs the set at the one whose best is worth most; else at
   * `now`.
   */
  decide(now: Situation, others?: () => readonly Situation[]): Chosen;
  /** The set running, as the last decision left it. */
  readonly running: readonly Option[];
  /** What it chose among at its last decision. */
  readonly offers: readonly Offer[];
}

/**
 * **The one policy**: of `options`, the set the body runs, by worth as `appraise` prices each.
 * Once a control step (`decide`), on an event, when an option running is over or out of its entry,
 * when the first chosen reaches its exit, or `rethink` s on, it decides afresh: a running option
 * that does not yield keeps what it claims; with none, it takes the situation (`now`, or one of
 * `others`, another target) whose best option is worth most, `now` where none is worth more; then,
 * of the options on offer there (`onOffer`), each running
 * one raised by what letting it go costs (`Offer.letGo`), it takes the best (drawn by
 * `chance` where it gives a margin), then the best of the rest whose claims are still free, the
 * first of equals, until none is left. The rest options (`hold`, `guard`, `brace`) take a resource
 * nothing else is worth more on: a rest option is chosen with whichever of its claims are still
 * free, the others all of theirs or not at all. Its memory is which options run (their places in `options`, the
 * first chosen first), when it decided, when it next rethinks, the event it decided on, whether the
 * first chosen was at its exit, the offers it chose from, and, where it draws, its stream's word.
 */
function chooser(options: readonly Option[], appraise: Appraise, deciding: Deciding, chance: Chance = { margin: 0, seed: 0 }): Chooser {
  if (!(chance.margin >= 0) || !Number.isFinite(chance.margin)) throw new Error(`a chooser's margin is finite and not negative, not ${chance.margin}`);
  const stream = chance.margin > 0 ? randomStream(chance.seed) : null;
  const state = { running: [] as number[], decided: -Infinity, next: -Infinity, event: "", exiting: false, offers: [] as Offer[], ...(stream ? { random: stream.state } : {}) };
  const values: number[] = [], order: number[] = [], chosen: number[] = [], held: (readonly Resource[])[] = [], set: Option[] = [];
  const current = (): readonly Option[] => { set.length = 0; for (const i of state.running) set.push(options[i]!); return set; };
  /** Whether what the options chosen hold overlaps `claims`. */
  const taken = (claims: readonly Resource[]): boolean => { for (const one of held) if (overlaps(one, claims)) return true; return false; };
  /**
   * What the option at `i` would hold beside those chosen: all its claims where none is taken, else
   * none; a rest option, whichever of its claims are free (it takes what nothing else is worth more on).
   */
  const freeOf = (i: number): readonly Resource[] => {
    const option = options[i]!, claims = option.claims;
    return option.rest ? claims.filter((claim) => !taken([claim])) : taken(claims) ? NOTHING : claims;
  };
  const free = (i: number): boolean => freeOf(i).length > 0 || options[i]!.claims.length === 0;
  const take = (i: number): void => { held.push(freeOf(i)); chosen.push(i); };
  const exitingOf = (now: Situation): boolean => state.running.length > 0 && options[state.running[0]!]!.status(now) === "exit";
  /** Whether a running `option` is done: over, or out of its entry. */
  const done = (option: Option, now: Situation): boolean => option.status(now) === "over" || !onOffer(option, now);
  /**
   * Each option not chosen priced at `now` (`values`, the offers), at each of its targets where it
   * has them and aimed at the best (`Option.aim`), in the order taken (`order`): the best's worth,
   * -Infinity with none on offer.
   */
  const appraiseAt = (now: Situation): number => {
    state.offers = [];
    values.length = 0; order.length = 0;
    options.forEach((option, i) => {
      values.push(-Infinity);
      if (chosen.includes(i)) return;
      const targets = option.targets?.length ?? 0;
      let best = -Infinity, at = -1;
      for (let k = 0; k < Math.max(1, targets); k++) {
        if (targets) option.aim!(k);
        if (!onOffer(option, now)) continue;
        const offer = appraise(option, i, now), value = offer.worth + (state.running.includes(i) ? offer.letGo : 0);
        state.offers.push(offer);
        if (value > best) { best = value; at = k; }
      }
      if (at < 0) return;
      if (targets) option.aim!(at);
      values[i] = best;
      order.push(i);
    });
    // Equals by rank, a rest option before the rest: an option takes a resource from rest only worth more.
    order.sort((a, b) => values[b]! - values[a]! || Number(options[b]!.rest ?? false) - Number(options[a]!.rest ?? false) || a - b);
    return order.length ? values[order[0]!]! : -Infinity;
  };
  const result = { set: set as readonly Option[], at: null as Situation | null };
  /** What it decided, the set running at `at`: one record, made once. */
  const decided = (at: Situation): Chosen => { current(); result.at = at; return result as Chosen; };
  return {
    state,
    get running() { return current(); },
    get offers() { return state.offers; },
    decide(now, others) {
      if (state.decided === now.time) return decided(result.at ?? now);
      let at = now;
      state.decided = now.time;
      const event = eventOf(now);
      let over = false;
      for (const i of state.running) if (done(options[i]!, now)) over = true;
      const exiting = !over && exitingOf(now);
      if (!over && event === state.event && now.time < state.next && exiting === state.exiting) return decided(now);
      state.event = event;
      state.next = now.time + deciding.rethink;
      // An option over or out of its entry is ended: it may only be begun afresh.
      if (over) state.running = state.running.filter((i) => { const option = options[i]!, ended = done(option, now); if (ended) option.end(); return !ended; });
      chosen.length = 0; held.length = 0;
      // A running option that does not yield keeps what it claims.
      for (const i of state.running) if (options[i]!.status(now) === "committed") take(i);
      // With nothing committed, the target whose best option is worth most; the one at `now` where none is worth more.
      let top = appraiseAt(now);
      if (others && chosen.length === 0) {
        const alternatives = others();
        for (const other of alternatives) {
          const best = appraiseAt(other);
          if (best > top) { top = best; at = other; }
        }
        if (alternatives.length) appraiseAt(at);
        state.event = eventOf(at);
      }
      // The first, by chance where a margin is given: one drawn among those free worth more than the best free less the margin.
      const best = stream ? order.find(free) : undefined;
      if (stream && best !== undefined) {
        for (const k of order) if (!free(k)) values[k] = -Infinity;
        take(drawn(values, values[best]! - chance.margin, best, stream.next));
      }
      for (const i of order) if (!chosen.includes(i) && free(i)) take(i);
      for (const i of state.running) if (!chosen.includes(i)) options[i]!.end();
      for (const i of chosen) if (!state.running.includes(i)) options[i]!.begin(at);
      state.running = [...chosen];
      state.exiting = exitingOf(at);
      return decided(at);
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

/** **A kind of Option Mind's chooser** (`ChooserPart`): over its options (`Option`), the chooser it makes a `Chooser`. */
type OptionChooserPart<C extends PartConfig = PartConfig> = ChooserPart<C, Option, Chooser>;

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
 * `obedience` by `position` (`worth`): where the option leaves the body at a spot (`Place.at`, a
 * walk's), the best worth of the options that answer there (`Option.at`, at the situation the place
 * predicts, `placed`), none below nothing (the rest options' floor), at the chance the body is up
 * there; less the best of them on offer here, so the option is priced against them as they stand
 * now. Only a walk is looked past: a strike, a cover or a rest option leaves the body where it
 * stands, and the best there is the best here. It reads the options' models at the place, never
 * the world. Its memory is the best here, for the situation it was read at.
 */
function lookingPast(options: readonly Option[], obedience: Obedience, position: PositionValue): (now: Situation, exit: Place) => number {
  const past = options.filter((option) => option.at !== undefined), memo = { now: null as Situation | null, here: 0 };
  const here = (now: Situation): number => {
    if (memo.now === now) return memo.here;
    let best = 0;
    for (const option of past) if (onOffer(option, now)) best = Math.max(best, worth(option.model(now), now, obedience, position).worth);
    memo.now = now; memo.here = best;
    return best;
  };
  return (now, exit) => {
    const there = placed(now, exit);
    let best = 0;
    for (const option of past) {
      const terms = option.at!(now, there, exit);
      if (terms) best = Math.max(best, worth(terms, there, obedience, position).worth);
    }
    return (1 - exit.down) * best - here(now);
  };
}

/**
 * **The valued chooser's config**: its depth (`VALUED_DEPTHS`), what a metre walked as ordered is worth, life
 * (`obedience`, a level of `OBEDIENCE`; steady, `STEADY`, unless given), the margin of worth, life,
 * within which it chooses by chance (`Chance`), none unless given, and the position value it prices
 * places by (`position`, a part of role `position`; the few terms, `FEW_TERMS`, unless given).
 */
interface ValuedConfig { readonly kind: "skeleton-valued"; readonly depth: number; readonly obedience?: ObedienceLevel; readonly margin?: number; readonly position?: PartConfig | null }

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
 * **Valued**: each option worth its model's terms (`Terms`) in life beside the position held
 * (`worth`, by its position value), its orders at its obedience; at depth 2, a walk worth as well the
 * best option where it leaves the body (`lookingPast`).
 */
export const VALUED_CHOOSER: OptionChooserPart<ValuedConfig> = deepFreeze({
  role: "chooser", label: "By worth", stage: "game", fields: [OBEDIENCE_FIELD], slots: [slotOne("position", "Position value", "position", true, FEW_TERMS_PART.defaults)],
  defaults: { kind: "skeleton-valued", depth: 2 }, keys: { kind: true, depth: true, obedience: true, margin: true, position: true }, fits: anyBody,
  faults: (config: ValuedConfig) => [...depthFaults(VALUED_DEPTHS)(config),
    ...config.margin === undefined || Number.isFinite(config.margin) && config.margin >= 0 ? [] : ["margin: a finite worth, not negative"],
    ...config.obedience === undefined || OBEDIENCE.some(([value]) => value === config.obedience) ? [] : [`obedience: one of ${OBEDIENCE.map(([value]) => value).join(", ")}`]],
  make: (config: ValuedConfig, options: readonly Option[], seed: number, parts: PartLookup) => {
    const obedience = OBEDIENCE.find(([value]) => value === config.obedience)?.[2] ?? STEADY, given = config.position ?? FEW_TERMS_PART.defaults;
    const position = parts.of("position", given).make(given) as PositionValue, past = config.depth >= 2 ? lookingPast(options, obedience, position) : null;
    return chooser(options, (option, _, now) => {
      const terms = option.model(now), { worth: own, moves, letGo } = worth(terms, now, obedience, position);
      const value = past && terms.exit.at ? own + past(now, terms.exit) : own;
      if (!Number.isFinite(value)) throw new Error(`${option.name} is worth ${value}`);
      return { name: option.name, worth: value, terms, moves, letGo };
    }, DECIDING, { margin: config.margin ?? 0, seed });
  },
});

/** The ranked chooser's config: its depth (`RANKED_DEPTH`). */
interface RankedConfig { readonly kind: "skeleton-ranked"; readonly depth: number }

/** **Ranked**: each option worth its place, the first the most. */
export const RANKED_CHOOSER: OptionChooserPart<RankedConfig> = deepFreeze({
  role: "chooser", label: "By rank", stage: "game", fields: [], slots: [], defaults: { kind: "skeleton-ranked", depth: RANKED_DEPTH },
  keys: { kind: true, depth: true }, fits: anyBody, faults: depthFaults([RANKED_DEPTH]),
  make: (_config: RankedConfig, options: readonly Option[]) => chooser(options, (option, i) => ({ name: option.name, worth: options.length - i, terms: null, moves: null, letGo: 0 }), DECIDING),
});
