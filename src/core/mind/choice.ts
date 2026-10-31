import { randomStream } from "../math/random.ts";
import type { Readiness, Resource } from "../skills/framework/action.ts";

/**
 * Where a choice running is (`Choice.status`): `committed`, keeping what it claims; `yields`,
 * given up for a better one if there is one; at its `exit`, where what it holds can be handed to
 * another choice here, which a selection decides afresh at (yielding there too); or `over`, having
 * run its course, to be begun afresh only.
 */
export type Status = "committed" | "yields" | "exit" | "over";

/**
 * **A choice**: one course a selection (`selectSet`) may run in a set of choices whose claims do
 * not overlap, read at a situation `S`: its entry (where it can begin, or, running, go on), the
 * resources it claims and its status. What it does and what it is expected to bring are its
 * user's: a body's option (`Option`, `src/core/option/option.ts`) adds its model and its step.
 */
export interface Choice<S> {
  readonly name: string;
  /** Its memory (`src/core/state.ts`), plain data. */
  readonly state: object;
  /** The resources it takes from the set while it runs (`Resource`; `WHOLE`, all of them): what no other choice chosen beside it may hold. */
  readonly claims: readonly Resource[];
  /**
   * Whether it is a rest choice: one worth no more than it does not take its resource from it. A
   * mark of its own: by rank the rest choices are last, the floor, and by worth a rest choice wins
   * a tie, so neither its rank nor its worth can say it.
   */
  readonly rest?: true;
  /**
   * The targets it may run at, by name, where it has a choice of them: the selection prices it at
   * each (`aim`) and runs it at the best. One with none runs at its own.
   */
  readonly targets?: readonly string[];
  /** Run it at its target at `index` of `targets` from now on: its name, entry, status and worth are there. */
  aim?(index: number): void;
  /** Its entry, now: `ready` to begin or go on, else `waiting` or `blocked`, and why. */
  entry(now: S): Readiness;
  /** Where it is now, running (`Status`). */
  status(now: S): Status;
  begin(now: S): void;
  /** It is over, run out or given up. */
  end(): void;
}

/**
 * **A choice's worth at a decision**, the terms it was weighed from (`T`, its user's: a body's
 * `OfferTerms`), how much it changes the position and what letting it go costs, running; no
 * terms for a fixed worth, which costs nothing to let go.
 */
export interface Priced<T> {
  readonly name: string;
  readonly worth: number;
  readonly terms: T | null;
  readonly moves: number | null;
  readonly letGo: number;
}

/** When a selection decides afresh: every `rethink` s, and at once on an event (its cue's change). */
export interface Deciding { readonly rethink: number }

/**
 * **Choosing by chance**: among the choices worth more than the best less `margin` (in the worth's
 * unit), one drawn in proportion to what each is worth above that floor, from a stream begun at
 * `seed`. A margin of 0 draws nothing and takes the best.
 */
export interface Chance { readonly margin: number; readonly seed: number }

/** No chance: the best is taken, nothing drawn. */
const NO_CHANCE: Chance = Object.freeze({ margin: 0, seed: 0 });

/** How a selection prices the choice at `i` of its choices, now. */
export type Appraise<S, T, C extends Choice<S>> = (choice: C, i: number, now: S) => Priced<T>;

/**
 * **What a selection decided**: the set running, the first chosen first (empty with none), the
 * situation it runs at, and whether it decided afresh at that time, pricing its choices.
 */
export interface Chosen<S, C extends Choice<S>> {
  readonly set: readonly C[];
  readonly at: S;
  readonly fresh: boolean;
}

/**
 * **A selection**: of its choices, the set it runs, whose claims (`Choice.claims`) do not
 * overlap. Its memory is in `state`, plain data.
 */
export interface Selection<S, T, C extends Choice<S>> {
  readonly state: object;
  /**
   * The set running and where (`Chosen`), after deciding at `now` if it has not yet at its time.
   * Deciding afresh with nothing committed, it prices its choices at each of `others` too (the
   * situation at each other target), and runs the set at the one whose best is worth most; else at
   * `now`.
   */
  decide(now: S, others?: () => readonly S[]): Chosen<S, C>;
  /** The set running, as the last decision left it. */
  readonly running: readonly C[];
  /** What it chose among at its last decision. */
  readonly offers: readonly Priced<T>[];
}

/** What a choice that holds nothing holds. */
export const NOTHING: readonly Resource[] = Object.freeze([]);

/** All the resources as a claim: it overlaps every other (`overlaps`). */
export const WHOLE: readonly Resource[] = Object.freeze(["*"]);

/** Whether two claims share a resource, the whole sharing every one. */
export const overlaps = (a: readonly Resource[], b: readonly Resource[]): boolean =>
  a.includes("*") && b.length > 0 || b.includes("*") && a.length > 0 || a.some((resource) => b.includes(resource));

/** Whether `choice` is on offer now: its entry admits. */
export const onOffer = <S>(choice: Choice<S>, now: S): boolean => choice.entry(now).kind === "ready";

/**
 * **The one policy**: of `choices`, the set that runs, by worth as `appraise` prices each. Once a
 * time (`decide`), on an event (a change in what `cue` reads of the situation), when a choice
 * running is over or out of its entry, when the first chosen reaches its exit, or `rethink` s on,
 * it decides afresh: a running choice that does not yield keeps what it claims; with none, it
 * takes the situation (`now`, or one of `others`, another target) whose best choice is worth most,
 * `now` where none is worth more; then, of the choices on offer there (`onOffer`), each running one
 * raised by what letting it go costs (`Priced.letGo`), it takes the best (drawn by `chance` where
 * it gives a margin), then the best of the rest whose claims are still free, the first of equals,
 * until none is left. A rest choice takes a resource nothing else is worth more on: it is chosen
 * with whichever of its claims are still free, the others all of theirs or not at all. Its memory
 * is which choices run (their places in `choices`, the first chosen first), when it decided, when
 * it next rethinks, the event it decided on, whether the first chosen was at its exit, the offers
 * it chose from, its stream's word where it draws, and `memory`'s entries, kept beside them.
 */
export function selectSet<S extends { readonly time: number }, T, C extends Choice<S> = Choice<S>>(choices: readonly C[], appraise: Appraise<S, T, C>,
  deciding: Deciding, cue: (now: S) => string, chance: Chance = NO_CHANCE, memory: Readonly<Record<string, object>> = {}): Selection<S, T, C> {
  if (!(chance.margin >= 0) || !Number.isFinite(chance.margin)) throw new Error(`a selection's margin is finite and not negative, not ${chance.margin}`);
  const stream = chance.margin > 0 ? randomStream(chance.seed) : null;
  const state = { running: [] as number[], decided: -Infinity, next: -Infinity, event: "", exiting: false, offers: [] as Priced<T>[], ...(stream ? { random: stream.state } : {}),
    ...memory };
  const values: number[] = [], order: number[] = [], chosen: number[] = [], held: (readonly Resource[])[] = [], set: C[] = [];
  const current = (): readonly C[] => { set.length = 0; for (const i of state.running) set.push(choices[i]!); return set; };
  /** Whether what the choices chosen hold overlaps `claims`. */
  const taken = (claims: readonly Resource[]): boolean => { for (const one of held) if (overlaps(one, claims)) return true; return false; };
  /**
   * What the choice at `i` would hold beside those chosen: all its claims where none is taken, else
   * none; a rest choice, whichever of its claims are free (it takes what nothing else is worth more on).
   */
  const freeOf = (i: number): readonly Resource[] => {
    const choice = choices[i]!, claims = choice.claims;
    return choice.rest ? claims.filter((claim) => !taken([claim])) : taken(claims) ? NOTHING : claims;
  };
  const free = (i: number): boolean => freeOf(i).length > 0 || choices[i]!.claims.length === 0;
  const take = (i: number): void => { held.push(freeOf(i)); chosen.push(i); };
  const exitingOf = (now: S): boolean => state.running.length > 0 && choices[state.running[0]!]!.status(now) === "exit";
  /** Whether a running `choice` is done: over, or out of its entry. */
  const done = (choice: C, now: S): boolean => choice.status(now) === "over" || !onOffer(choice, now);
  /**
   * Each choice not chosen priced at `now` (`values`, the offers), at each of its targets where it
   * has them and aimed at the best (`Choice.aim`), in the order taken (`order`): the best's worth,
   * -Infinity with none on offer.
   */
  const appraiseAt = (now: S): number => {
    state.offers = [];
    values.length = 0; order.length = 0;
    choices.forEach((choice, i) => {
      values.push(-Infinity);
      if (chosen.includes(i)) return;
      const targets = choice.targets?.length ?? 0;
      let best = -Infinity, at = -1;
      for (let k = 0; k < Math.max(1, targets); k++) {
        if (targets) choice.aim!(k);
        if (!onOffer(choice, now)) continue;
        const offer = appraise(choice, i, now), value = offer.worth + (state.running.includes(i) ? offer.letGo : 0);
        state.offers.push(offer);
        if (value > best) { best = value; at = k; }
      }
      if (at < 0) return;
      if (targets) choice.aim!(at);
      values[i] = best;
      order.push(i);
    });
    // Equals by rank, a rest choice before the rest: a choice takes a resource from rest only worth more.
    order.sort((a, b) => values[b]! - values[a]! || Number(choices[b]!.rest ?? false) - Number(choices[a]!.rest ?? false) || a - b);
    return order.length ? values[order[0]!]! : -Infinity;
  };
  const result = { set: set as readonly C[], at: null as S | null, fresh: false };
  /** What it decided, the set running at `at`, `fresh` where it decided afresh: one record, made once. */
  const decided = (at: S, fresh: boolean): Chosen<S, C> => { current(); result.at = at; result.fresh = fresh; return result as Chosen<S, C>; };
  return {
    state,
    get running() { return current(); },
    get offers() { return state.offers; },
    decide(now, others) {
      if (state.decided === now.time) return decided(result.at ?? now, result.fresh);
      let at = now;
      state.decided = now.time;
      const event = cue(now);
      let over = false;
      for (const i of state.running) if (done(choices[i]!, now)) over = true;
      const exiting = !over && exitingOf(now);
      if (!over && event === state.event && now.time < state.next && exiting === state.exiting) return decided(now, false);
      state.event = event;
      state.next = now.time + deciding.rethink;
      // A choice over or out of its entry is ended: it may only be begun afresh.
      if (over) state.running = state.running.filter((i) => { const choice = choices[i]!, ended = done(choice, now); if (ended) choice.end(); return !ended; });
      chosen.length = 0; held.length = 0;
      // A running choice that does not yield keeps what it claims.
      for (const i of state.running) if (choices[i]!.status(now) === "committed") take(i);
      // With nothing committed, the target whose best choice is worth most; the one at `now` where none is worth more.
      let top = appraiseAt(now);
      if (others && chosen.length === 0) {
        const alternatives = others();
        for (const other of alternatives) {
          const best = appraiseAt(other);
          if (best > top) { top = best; at = other; }
        }
        if (alternatives.length) appraiseAt(at);
        state.event = cue(at);
      }
      // The first, by chance where a margin is given: one drawn among those free worth more than the best free less the margin.
      const best = stream ? order.find(free) : undefined;
      if (stream && best !== undefined) {
        for (const k of order) if (!free(k)) values[k] = -Infinity;
        take(drawn(values, values[best]! - chance.margin, best, stream.next));
      }
      for (const i of order) if (!chosen.includes(i) && free(i)) take(i);
      for (const i of state.running) if (!chosen.includes(i)) choices[i]!.end();
      for (const i of chosen) if (!state.running.includes(i)) choices[i]!.begin(at);
      state.running = [...chosen];
      state.exiting = exitingOf(at);
      return decided(at, true);
    },
  };
}

/**
 * Of `values` (each choice's, -Infinity off offer), one worth more than `floor`, drawn by `next` in
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
