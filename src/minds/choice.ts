import { hasResource, BODY_RESOURCE } from "../skills/framework/action.ts";
import { randomStream } from "../core/math/random.ts";
import { hold, stillHeld, unheld, type Drift, type Held } from "../control/held.ts";
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
 * user's: a body's option (`Option`, `src/minds/option/option.ts`) adds its model and its step.
 */
export interface Choice<S> {
  readonly name: string;
  /** Its memory (`src/core/world/state.ts`), plain data. */
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

/**
 * When a selection decides afresh: at once on an event (its cue's change), and else on its body's
 * `phase` of each `rethink` s (`BodyHost.phase`, 0 unless given): the first such time at least
 * half a period on, so a body decides at least every one and a half periods and bodies of one
 * fight decide on different steps. A running choice with targets keeps the one it runs at for
 * `keep` s (0 unless given): it, and each choice that claims what it claims, is priced at that
 * target alone (by name) where it has it on offer, so two targets near alike are not taken by
 * turns, nor one target and another by two choices with both.
 */
export interface Deciding { readonly rethink: number; readonly phase?: number; readonly keep?: number }

/** **When `deciding` next decides with no event**, deciding at `now` s: the first time on its phase at least half a period on (`Deciding`). */
export function nextDecision(deciding: Deciding, now: number): number {
  const phase = deciding.phase ?? 0, periods = now / deciding.rethink - phase;
  return deciding.rethink * (Math.floor(periods + 1 / 2) + 1 + phase);
}

/**
 * **Choosing by chance**: among the choices worth more than the best less `margin` (in the worth's
 * unit), one drawn in proportion to what each is worth above that floor, from a stream begun at
 * `seed`. A margin of 0 draws nothing and takes the best.
 */
export interface Chance { readonly margin: number; readonly seed: number }

/**
 * **How a selection holds its price of another situation** (`Selection.decide`'s `others`): the
 * best worth it found there, kept by the name `key` gives the situation and made again once that
 * situation's cue or the set running changes, an input of `drift` moves past its tolerance or
 * `rethink` s pass (`stillHeld`). The situation it runs at is priced afresh.
 */
export interface Holding<S> {
  readonly rethink: number;
  key(other: S): string;
  drift(other: S): readonly Drift[];
}

/**
 * **What a selection watches of a situation** (`selectSet`): its event (`event`), a text whose
 * change decides afresh at once. One that learns what to watch from what its decisions read is
 * told as each decision afresh begins (`deciding`) and once it has decided (`decided`), its event
 * then read again.
 */
export interface Cue<S> {
  event(now: S): string;
  deciding?(now: S): void;
  decided?(now: S): void;
}

/** No chance: the best is taken, nothing drawn. */
const NO_CHANCE: Chance = Object.freeze({ margin: 0, seed: 0 });

/** How a selection prices the choice at `i` of its choices, now, at the target at `target` of its targets (0 for one with none); null where it is not on offer there. */
export type Appraise<S, T, C extends Choice<S>> = (choice: C, i: number, now: S, target: number) => Priced<T> | null;

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
   * situation at each other target, each held as its `Holding` says where it gives one), and runs
   * the set at the one whose best is worth most, priced afresh; else at `now`.
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
export const WHOLE: readonly Resource[] = Object.freeze([BODY_RESOURCE]);

/** Whether two claims share a resource, the whole sharing every one. */
export const overlaps = (a: readonly Resource[], b: readonly Resource[]): boolean =>
  hasResource(a, BODY_RESOURCE) && b.length > 0 || hasResource(b, BODY_RESOURCE) && a.length > 0 || a.some((resource) => hasResource(b, resource));

/** Whether `choice` is on offer now: its entry admits. */
export const onOffer = <S>(choice: Choice<S>, now: S): boolean => choice.entry(now).kind === "ready";

/**
 * **The one policy**: of `choices`, the set that runs, by worth as `appraise` prices each. Once a
 * time (`decide`), on an event (a change in what `cue` reads of the situation, `Cue`), when a choice
 * running is over or out of its entry, when the first chosen reaches its exit, or `rethink` s on,
 * it decides afresh: a running choice that does not yield keeps what it claims; with none, it
 * takes the situation (`now`, or one of `others`, another target) whose best choice is worth most,
 * `now` where none is worth more; then, of the choices on offer there (`onOffer`), each running one
 * raised by what letting it go costs (`Priced.letGo`) at the target it runs at, it takes the best (drawn by `chance` where
 * it gives a margin), then the best of the rest whose claims are still free, the first of equals,
 * until none is left. Another situation's best is held as `holding` says where it is given. A
 * rest choice takes a resource nothing else is worth more on: it is chosen
 * with whichever of its claims are still free, the others all of theirs or not at all. Its memory
 * is which choices run (their places in `choices`, the first chosen first), when it decided, when
 * it next rethinks, the event at the situation it chose as it decided, whether the first chosen was at its exit, the offers
 * it chose from, its stream's word where it draws, each other situation's best held, and
 * `memory`'s entries, kept beside them.
 */
export function selectSet<S extends { readonly time: number }, T, C extends Choice<S> = Choice<S>>(choices: readonly C[], appraise: Appraise<S, T, C>,
  deciding: Deciding, cue: Cue<S>, chance: Chance = NO_CHANCE, memory: Readonly<Record<string, object>> = {}, holding: Holding<S> | null = null): Selection<S, T, C> {
  if (!(chance.margin >= 0) || !Number.isFinite(chance.margin)) throw new Error(`a selection's margin is finite and not negative, not ${chance.margin}`);
  const stream = chance.margin > 0 ? randomStream(chance.seed) : null;
  const state = { running: [] as number[], decided: -Infinity, next: -Infinity, event: "", exiting: false, offers: [] as Priced<T>[],
    aims: choices.map(() => -1), since: choices.map(() => -Infinity), ...(stream ? { random: stream.state } : {}),
    ...(holding ? { others: {} as Record<string, { held: Held; best: number }> } : {}), ...memory };
  const values: number[] = [], order: number[] = [], chosen: number[] = [], held: (readonly Resource[])[] = [], set: C[] = [], bests: number[] = [];
  /** The target each choice was aimed at by the last pricing, -1 where it has none or none was on offer. */
  const aimed: number[] = choices.map(() => -1);
  /**
   * The index among `choice`'s targets of the one a running choice claiming what it claims has
   * kept since less than `Deciding.keep` before `time`, by name; -1 where none is kept or it has not that one.
   */
  const keptTarget = (choice: C, time: number): number => {
    for (const r of state.running) {
      const running = choices[r]!, k = state.aims[r]!;
      if (k < 0 || time - state.since[r]! >= (deciding.keep ?? 0) || !overlaps(running.claims, choice.claims)) continue;
      const at = choice.targets!.indexOf(running.targets![k]!);
      if (at >= 0) return at;
    }
    return -1;
  };
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
   * -Infinity with none on offer. Within `Deciding.keep` of a running choice aiming at its target,
   * it and each choice claiming what it claims are priced at that target alone where they have it on offer.
   */
  const appraiseAt = (now: S): number => {
    state.offers = [];
    values.length = 0; order.length = 0;
    choices.forEach((choice, i) => {
      values.push(-Infinity);
      aimed[i] = -1;
      if (chosen.includes(i)) return;
      const targets = choice.targets?.length ?? 0, kept = targets > 0 ? keptTarget(choice, now.time) : -1;
      let best = -Infinity, at = -1;
      for (let pass = kept >= 0 ? 0 : 1; pass < 2 && at < 0; pass++) {
        for (let k = pass === 0 ? kept : 0; k < (pass === 0 ? kept + 1 : Math.max(1, targets)); k++) {
          if (targets) choice.aim!(k);
          if (!onOffer(choice, now)) continue;
          // What letting it go costs raises the target it runs at alone: run at another, it is let go.
          const offer = appraise(choice, i, now, k);
          if (!offer) continue;
          const runs = state.running.includes(i) && (!targets || k === state.aims[i]);
          const value = offer.worth + (runs ? offer.letGo : 0);
          state.offers.push(offer);
          if (value > best) { best = value; at = k; }
        }
      }
      if (at < 0) return;
      aimed[i] = targets ? at : -1;
      if (targets) choice.aim!(at);
      values[i] = best;
      order.push(i);
    });
    // Equals by rank, a rest choice before the rest: a choice takes a resource from rest only worth more.
    order.sort((a, b) => values[b]! - values[a]! || Number(choices[b]!.rest ?? false) - Number(choices[a]!.rest ?? false) || a - b);
    return order.length ? values[order[0]!]! : -Infinity;
  };
  /** The best worth at `other`, another situation, at `time`: as held where `holding` holds it, else priced (`appraiseAt`) and held. */
  const otherBest = (other: S, time: number): number => {
    if (!holding) return appraiseAt(other);
    const key = holding.key(other), event = `${cue.event(other)} ${state.running.join(",")}`, drift = holding.drift(other);
    const others = state.others!;
    let kept = others[key];
    if (kept && stillHeld(kept.held, time, holding.rethink, event, drift, () => true)) return kept.best;
    const best = appraiseAt(other);
    if (!kept) others[key] = kept = { held: unheld(), best };
    kept.best = best;
    hold(kept.held, time, event, drift);
    return best;
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
      const event = cue.event(now);
      let over = false;
      for (const i of state.running) if (done(choices[i]!, now)) over = true;
      const exiting = !over && exitingOf(now);
      if (!over && event === state.event && now.time < state.next && exiting === state.exiting) return decided(now, false);
      cue.deciding?.(now);
      state.next = nextDecision(deciding, now.time);
      // A choice over or out of its entry is ended: it may only be begun afresh.
      if (over) state.running = state.running.filter((i) => { const choice = choices[i]!, ended = done(choice, now); if (ended) choice.end(); return !ended; });
      chosen.length = 0; held.length = 0;
      // A running choice that does not yield keeps what it claims.
      for (const i of state.running) if (choices[i]!.status(now) === "committed") take(i);
      // With nothing committed, the target whose best choice is worth most; the one at `now` where none is worth more.
      // The others are priced before `now`, so the choices are left priced and aimed at `now` unless another wins.
      if (others && chosen.length === 0) {
        const alternatives = others();
        bests.length = 0;
        for (const other of alternatives) bests.push(otherBest(other, now.time));
        let top = appraiseAt(now);
        for (let k = 0; k < alternatives.length; k++) if (bests[k]! > top) { top = bests[k]!; at = alternatives[k]!; }
        if (at !== now) appraiseAt(at);
      } else appraiseAt(now);
      // The first, by chance where a margin is given: one drawn among those free worth more than the best free less the margin.
      const best = stream ? order.find(free) : undefined;
      if (stream && best !== undefined) {
        for (const k of order) if (!free(k)) values[k] = -Infinity;
        take(drawn(values, values[best]! - chance.margin, best, stream.next));
      }
      for (const i of order) if (!chosen.includes(i) && free(i)) take(i);
      for (const i of state.running) if (!chosen.includes(i)) choices[i]!.end();
      for (const i of chosen) if (!state.running.includes(i)) choices[i]!.begin(at);
      // Each choice begun, or aimed at another target, keeps it from now (`Deciding.keep`).
      for (const i of chosen) if (aimed[i]! >= 0 && (!state.running.includes(i) || aimed[i] !== state.aims[i])) { state.aims[i] = aimed[i]!; state.since[i] = now.time; }
      state.running = [...chosen];
      state.exiting = exitingOf(at);
      cue.decided?.(at);
      state.event = cue.event(at);
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
