/**
 * **A line's end** (`SearchConfig.end`): what a search's line is worth where it stops, from where
 * its last Option leaves the body to the horizon, priced by the objective as the line's own life.
 * Each kind (`LINE_ENDS`) makes a search's leaf from what the search reads (`LineSpace`): the tail,
 * the best Option held or run again (`TAIL`, the game's); by distance (`DISTANCE`); or by the next
 * exchange, at its rate (`EXCHANGE`) or once (`NEXT`). The search asks its leaf and holds none.
 */
import type { PartField } from "../../parts/fields.ts";
import { ARRIVED } from "../../skills/framework/movement.ts";
import { exp, log } from "../../core/math/real.ts";
import type { Pair, Reach } from "./chooser.ts";
import type { Situation } from "./option.ts";
import type { Tally } from "./objective.ts";
import type { Leaves, Terms } from "./value.ts";

/** What a line's end reads of a search's states (`space` in `chooser.ts`), each as the search has it. */
export interface LineSpace {
  /** How far ahead the search looks, s. */
  readonly horizon: number;
  /** What life dealt, and taken, traded evenly over `span` s from `from` s on counts for, a share. */
  dealtWeight(from: number, span: number): number;
  takenWeight(from: number, span: number): number;
  /** What the path that brought `tally` and ends at `end` is worth, priced whole. */
  price(tally: Tally, end: Situation): number;
  /** The Options on offer at `at`, at each of their targets; and those a leaf that reads `reach` reads there. */
  pairsAt(at: Situation): readonly Pair[];
  readsAt(at: Situation, reach: "held" | "arrived"): readonly Pair[];
  /** The model of `pair` from `at`, asked once; and the one a line runs it by `seconds` s into the horizon. */
  modelAt(pair: Pair, at: Situation): Terms | null;
  termsOf(pair: Pair, at: Situation, seconds: number): Terms;
  /** The state `leaves` leaves the body in from `at` after `seconds` s. */
  child(at: Situation, leaves: Leaves, seconds: number): Situation;
  /** Whether a pair is a walk to a site (`Option.sites`). */
  toSite(pair: Pair): boolean;
  /** The worth of the line through `pair` from `at`, `left` deep, after what the path brought (`from`). */
  line(pair: Pair, at: Situation, left: number, from: Tally): number;
}

/** **A leaf**: what a line is worth that ends at `at`, as `reach` says (`Reach`), after what the path brought (`from`). */
export type Leaf = (at: Situation, reach: Reach, from: Tally) => number;

/** Each kind of line's end's settings, by its kind. */
interface LineEndSettings {
  /** **The tail**: none. */
  readonly tail: object;
  /**
   * **By distance**: each side trades life at a steady rate by how far apart the two stand, centre
   * to centre (`Situation.apart`): `dealt` and `taken` a second (a share of a life) at none apart,
   * falling straight to none at `reach`, m, and none with no focus.
   */
  readonly distance: { readonly dealt: number; readonly taken: number; readonly reach: number };
  /**
   * **By the next exchange**: each side trades at the rate of the best try begun from there (life
   * dealt and taken over its time, its own model's), a walk to a site counted with the best try
   * where it arrives; that rate `exchange` times over the time left.
   */
  readonly exchange: { readonly exchange: number };
  /**
   * **By the next exchange, once**: the best try begun from there, a walk to a site counted with
   * the best try where it arrives, its life dealt and taken counted `once` times, and nothing
   * after; an open Option, which has no one try, is none.
   */
  readonly next: { readonly once: number };
}

/** **A line's end** as a config writes it: its kind and that kind's settings (`LineEndSettings`). */
export type LineEnd<K extends keyof LineEndSettings = keyof LineEndSettings> = { [P in K]: { readonly kind: P } & LineEndSettings[P] }[K];

/** **A kind of line's end**: its name in the picker, what the picker writes for it, what is wrong with one, and the leaf it makes for a search. */
interface LineEndKind<E> {
  readonly label: string;
  readonly preset: E;
  faults(end: E): readonly string[];
  leaf(end: E, space: LineSpace): Leaf;
}

/** Whether `x` is a finite number, not negative. */
const share = (x: number): boolean => Number.isFinite(x) && x >= 0;

/**
 * **The tail**: at `at`, the best, to the horizon, of each Option on offer there that leaves the
 * body where it began, run again and again (an open Option, `Option.open`, held, the case of none;
 * unless `held`, any other, `again`), and, where `whole`, of each Option reached at its sites
 * (`Option.sites`: a walk to one, then the best there, `arrived`); the path as it is where none is.
 */
const TAIL: LineEndKind<LineEnd<"tail">> = {
  label: "Tail", preset: { kind: "tail" }, faults: () => [],
  leaf(_end, { horizon, dealtWeight, takenWeight, price, pairsAt, readsAt, modelAt, child, toSite, line }) {
    const leaf: Leaf = (at, reach, from) => {
      let top = -Infinity;
      // A leaf where a walk has arrived never walks on to a site, and a held leaf reads only open Options.
      // Such a leaf models only the pairs it reads. Most leaves are where a walk arrives, so modelling every
      // walk from each of them would be most of a search's cost.
      const pairs = reach === "whole" ? pairsAt(at) : readsAt(at, reach);
      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i]!;
        if (pair.option.open) top = Math.max(top, line(pair, at, 1, from));
        else if (reach === "held") continue;
        else if (toSite(pair)) { if (reach === "whole") top = Math.max(top, line(pair, at, 0, from)); }
        else top = Math.max(top, again(pair, at, from));
      }
      return top > -Infinity ? top : price(from, at);
    };
    /**
     * **`pair` run again and again from `at` to the horizon**, where a try of it leaves
     * the body where it began (`stays`, its staying outcome, by the chance it stays): the life each try
     * deals and takes, the tries as many as fit in the time left, and the orders it carries out once
     * (`Terms.orders`: an order carried out is carried out, and a try that leaves the state as it found
     * it carries out nothing more of it); each the chance of leaving compounding, the body leaving after
     * as many tries as it is expected to, then held where it went (`leaf`, an open Option). -Infinity
     * where no outcome stays, or a try takes no time.
     */
    const again = (pair: Pair, at: Situation, from: Tally): number => {
      const { dealt, taken, orders, seconds } = from, terms = modelAt(pair, at)!, duration = terms.duration;
      if (!(duration > 0) || seconds >= horizon) return -Infinity;
      let stay = 0, there: Situation | null = null;
      for (let i = 0; i < terms.outcomes.length; i++) {
        const end = child(at, terms.outcomes[i]!.leaves, duration);
        if (end.posture === at.posture && Math.abs(end.range - at.range) <= ARRIVED) { stay += terms.outcomes[i]!.chance; there = end; }
      }
      if (!there) return -Infinity;
      // Of `full` whole tries, the chance all stay (`through`), and the tries the body is expected to run where one leaves (`run`).
      const tries = (horizon - seconds) / duration, full = Math.floor(tries), through = full === 0 ? 1 : stay === 0 ? 0 : exp(full * log(stay)), left = 1 - through;
      const o = orders + Math.min(1, tries) * terms.orders;
      const whole = takenWeight(seconds, horizon - seconds), wholeDealt = dealtWeight(seconds, horizon - seconds);
      let worth = through * price({ dealt: dealt + wholeDealt * tries * terms.dealt, taken: taken + whole * tries * terms.taken, orders: o, seconds: horizon }, there);
      if (left > 0) {
        const run = (1 - (full + 1) * through + full * through * stay) / ((1 - stay) * left), part = takenWeight(seconds, run * duration);
        const ran: Tally = { dealt: dealt + dealtWeight(seconds, run * duration) * run * terms.dealt, taken: taken + part * run * terms.taken, orders: o, seconds: seconds + run * duration };
        for (let i = 0; i < terms.outcomes.length; i++) {
          const outcome = terms.outcomes[i]!, end = child(at, outcome.leaves, duration);
          if (end === there || end.posture === at.posture && Math.abs(end.range - at.range) <= ARRIVED) continue;
          worth += left * outcome.chance / (1 - stay) * leaf(end, "held", ran);
        }
      }
      return worth;
    };
    return leaf;
  },
};

/** **By distance** (`LineEndSettings.distance`), at the rate bouts trade with the two in reach. */
const DISTANCE: LineEndKind<LineEnd<"distance">> = {
  label: "By distance", preset: { kind: "distance", dealt: .027, taken: .027, reach: 2 },
  faults: (end) => share(end.dealt) && share(end.taken) && Number.isFinite(end.reach) && end.reach > 0 ? []
    : ["dealt and taken a finite rate, not negative, and reach a finite distance, more than none"],
  leaf: (end, { horizon, dealtWeight, takenWeight, price }) => (at, _reach, { dealt, taken, orders, seconds }) => {
    const left = Math.max(0, horizon - seconds), near = at.focus ? Math.max(0, 1 - at.apart / end.reach) : 0;
    const counts = takenWeight(seconds, left) * left * near, dealing = dealtWeight(seconds, left) * left * near;
    return price({ dealt: dealt + dealing * end.dealt, taken: taken + counts * end.taken, orders, seconds: Math.max(seconds, horizon) }, at);
  },
};

/**
 * **A line's end by the next exchange** (`EXCHANGE`, `NEXT`), at `at`, after what the path brought
 * (`from`): the best of each Option on offer there, one try of it (its life dealt and taken; an
 * open Option's to the horizon) counted `counts` times its rate, a second, or, `once`, `counts`
 * times itself as it fades over its own seconds (`takenWeight`; its life dealt `countsDealt`
 * times, `dealtWeight`), open Options left out; a walk to a site (`Option.sites`) counted with the
 * best try where each way it ends leaves the body. The path as it is where none is.
 */
function exchanged({ horizon, dealtWeight, takenWeight, price, pairsAt, readsAt, termsOf, child, toSite }: LineSpace,
  { at, from, countsDealt, counts, once }: { readonly at: Situation; readonly from: Tally; readonly countsDealt: number; readonly counts: number; readonly once: boolean }): number {
  const { dealt, taken, orders, seconds } = from, end = Math.max(seconds, horizon);
  const atRate = (d: number, t: number, duration: number): number => !(duration > 0) ? -Infinity
    : once ? price({ dealt: dealt + countsDealt * dealtWeight(seconds, duration) * d, taken: taken + counts * takenWeight(seconds, duration) * t, orders, seconds: end }, at)
    : price({ dealt: dealt + countsDealt * d / duration, taken: taken + counts * t / duration, orders, seconds: end }, at);
  let top = -Infinity;
  const pairs = pairsAt(at);
  for (let p = 0; p < pairs.length; p++) {
    const pair = pairs[p]!;
    if (once && pair.option.open) continue;
    const terms = termsOf(pair, at, seconds);
    if (!toSite(pair)) { top = Math.max(top, atRate(terms.dealt, terms.taken, terms.duration)); continue; }
    let worth = 0;
    for (let i = 0; i < terms.outcomes.length; i++) {
      const outcome = terms.outcomes[i]!, there = child(at, outcome.leaves, terms.duration), after = seconds + terms.duration, reads = readsAt(there, "arrived");
      let then = atRate(terms.dealt, terms.taken, terms.duration);
      for (let k = 0; k < reads.length; k++) {
        const next = reads[k]!;
        if (once && next.option.open) continue;
        const tried = termsOf(next, there, after);
        then = Math.max(then, atRate(terms.dealt + tried.dealt, terms.taken + tried.taken, terms.duration + tried.duration));
      }
      worth += outcome.chance * then;
    }
    top = Math.max(top, worth);
  }
  return top > -Infinity ? top : price({ dealt, taken, orders, seconds: end }, at);
}

/** **By the next exchange's rate** (`LineEndSettings.exchange`), at that rate as priced. */
const EXCHANGE: LineEndKind<LineEnd<"exchange">> = {
  label: "By the next exchange's rate", preset: { kind: "exchange", exchange: 1 },
  faults: (end) => share(end.exchange) ? [] : ["exchange a finite share, not negative"],
  leaf: (end, space) => (at, _reach, from) => {
    const left = Math.max(0, space.horizon - from.seconds);
    return exchanged(space, { at, from, countsDealt: space.dealtWeight(from.seconds, left) * left * end.exchange, counts: space.takenWeight(from.seconds, left) * left * end.exchange, once: false });
  },
};

/** **By the next exchange, once** (`LineEndSettings.next`); how each scale plays is in `docs/approaches.md` (minds). */
const NEXT: LineEndKind<LineEnd<"next">> = {
  label: "By the next exchange, once", preset: { kind: "next", once: 3 },
  faults: (end) => share(end.once) ? [] : ["once a finite share, not negative"],
  leaf: (end, space) => (at, _reach, from) => exchanged(space, { at, from, countsDealt: end.once, counts: end.once, once: true }),
};

/** The kinds of line's end, by their kind. */
const LINE_ENDS: { readonly [K in keyof LineEndSettings]: LineEndKind<LineEnd<K>> } = Object.freeze({ tail: TAIL, distance: DISTANCE, exchange: EXCHANGE, next: NEXT });

/** **A search's leaf** by `end` (`LineEnd`; the tail, `TAIL`, where none), over what it reads (`LineSpace`). */
export function leafOf<K extends keyof LineEndSettings>(end: LineEnd<K> | undefined, space: LineSpace): Leaf {
  return end === undefined ? TAIL.leaf({ kind: "tail" }, space) : LINE_ENDS[end.kind].leaf(end, space);
}

/** What is wrong with a line's end a config gives (`end`), each a sentence; none where it gives none. */
export function lineEndFaults(end: LineEnd | undefined): readonly string[] {
  if (end === undefined) return [];
  if (typeof end !== "object" || end === null || !Object.hasOwn(LINE_ENDS, end.kind)) return [`end: a kind, one of ${Object.keys(LINE_ENDS).join(", ")}`];
  return faultsOf(end).map((fault) => `end: ${fault}`);
}

/** What is wrong with `end`, by its kind's faults. */
const faultsOf = <K extends keyof LineEndSettings>(end: LineEnd<K>): readonly string[] => LINE_ENDS[end.kind].faults(end);

/** A config's line's end in the picker: each kind at its preset (`LINE_ENDS`), the tail written as none. */
export function lineEndField<C extends { readonly end?: LineEnd }>(): PartField<C> {
  return {
    kind: "choice", key: "end", label: "Line's end",
    options: Object.entries(LINE_ENDS).map(([kind, end]) => [kind, end.label] as const),
    read: (config) => config.end?.kind ?? "tail",
    write: (config, text) => {
      const { end: _, ...rest } = config;
      if (text === "tail") return rest as C;
      return Object.hasOwn(LINE_ENDS, text) ? { ...rest, end: LINE_ENDS[text as keyof LineEndSettings].preset } as C : null;
    },
  };
}
