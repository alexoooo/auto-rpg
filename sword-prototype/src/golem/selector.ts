import type { BodyView, Intent, Mind } from "../mind.ts";
import { isShield } from "../hands.ts";
import { armClass, reachBand } from "./champion.ts";
import { SELECTOR_TABLE } from "./selector-table.ts";

/**
 * The golem's mind that picks a mind: `golem-selector`. Session 09 of the style set.
 *
 * Nine minds went into the league of Session 08, and it says plainly that no one of them is best
 * everywhere: the brawler takes the maul, the skirmisher converts a reach edge, the fencer holds
 * the middle, and eight of the eleven build classes cannot finish a bout at all so that whichever
 * mind stands in them draws. This mind reads its own arm and the arm in front of it at its first
 * view, looks the pair up in a table fitted from a tournament, and *is* the winner of that cell
 * for the rest of the bout.
 *
 * **What a cell is.** `myArm|theirArm`, both the `armClass` of `src/golem/champion.ts`: a weapon kind
 * crossed with a reach band, `paired-` in front when one terminal fills both sockets. Mine is
 * read from my capabilities, which are mine to read; theirs is `opponentArmClass` below, which
 * reads the same class off what an opponent publishes and nothing else.
 *
 * **Fixed at the first ask.** Every candidate is a director over one of two executors, so
 * switching mid-bout is a line of code -- and it is not this line, because a cell has a few
 * hundred bouts behind it and a per-ask choice would need the same evidence per *state*. Session
 * 11 records that; the table is the unit of evidence this session can afford.
 *
 * **The winner's curse is the whole difficulty.** With a hundred cells and nine candidates, the best
 * raw cell mean is a maximum over nine noisy numbers and is biased upward by roughly the noise;
 * a table of raw cell winners would look excellent on the fit and level on a held-out seed. Two
 * things answer it, both carried over from the matchup set's tuning session: the score is shrunk
 * cell toward my class toward the candidate's marginal with a pseudo-count of `shrink` bouts, and
 * a cell's winner then has to beat the *marginal* winner at that cell by `SELECTOR_MARGIN` before
 * it is allowed to play at all. A cell with three bouts in it plays the mind that wins overall.
 */
export const SELECTOR_VERSION = 1;

/** How much a cell's winner must beat the marginal winner by, in points a bout, to play. */
export const SELECTOR_MARGIN = 0.03;

/** Bouts and points a candidate took, at one level of the table. */
export interface SelectorCell {
  readonly n: number;
  readonly points: number;
}

export interface SelectorTable {
  readonly version: number;
  /** The fit run's seed, and the date it was written. */
  readonly seed: number;
  readonly date: string;
  readonly bouts: number;
  /** The pseudo-count, in bouts, each level is shrunk toward its parent by. */
  readonly shrink: number;
  /** The candidates, in the order the fit found them. */
  readonly minds: readonly string[];
  /** Every candidate over every bout it fought: the root of the shrinkage. */
  readonly marginal: Readonly<Record<string, SelectorCell>>;
  /** Keyed `myArm|mind`: the middle level, which is what a body of my kind does. */
  readonly byClass: Readonly<Record<string, SelectorCell>>;
  /** Keyed `myArm|theirArm|mind`: the leaf. */
  readonly cells: Readonly<Record<string, SelectorCell>>;
}

/** The table of no evidence: every cell falls through to nothing and `choose` returns null. */
export const NO_SELECTOR: SelectorTable = Object.freeze({
  version: SELECTOR_VERSION, seed: 0, date: "", bouts: 0, shrink: 32,
  minds: [], marginal: {}, byClass: {}, cells: {},
});

/** Refuse a table by version, and by a candidate the caller cannot build. */
export function checkSelector(table: SelectorTable, registered: readonly string[] = []): SelectorTable {
  if (table.version !== SELECTOR_VERSION) {
    throw new Error(`selector table is version ${table.version}; this build reads version ${SELECTOR_VERSION}`);
  }
  for (const mind of table.minds) {
    if (registered.length > 0 && !registered.includes(mind)) {
      throw new Error(`selector table names "${mind}", which this build has no factory for`);
    }
  }
  return table;
}

/**
 * The arm class of the body in front, from what it publishes and nothing else.
 *
 * `armClass` reads capabilities -- which hand can thrust, whether one terminal fills both sockets
 * -- and an opponent view carries none, by the frozen choice of the golem set's Session 00. Both
 * of those facts have a published shadow:
 *
 * - **The armed hand** is the longest live hand that is not a shield, primary on a tie. A capped
 *   socket publishes its cap's 0.24 m against a blade's 1.4, so the hand `armClass` picks for
 *   having strokes is the hand this picks for being long, on every build in the pool; a test
 *   asserts the two agree over all of it rather than trusting the argument.
 * - **A paired grip** is one effector in two sockets, so both hands publish the same socket in
 *   world space. Two sockets are a body's width apart and never coincide, so shoulders within a
 *   millimetre of each other is a paired grip and nothing else is.
 */
export function opponentArmClass(them: BodyView): string {
  let armed: "primary" | "secondary" = "primary";
  let best = -1;
  for (const name of ["primary", "secondary"] as const) {
    const hand = them.hands[name];
    if (hand.lost || isShield(hand.weapon)) continue;
    if (hand.reach > best) { best = hand.reach; armed = name; }
  }
  const a = them.hands.primary.shoulder;
  const b = them.hands.secondary.shoulder;
  const paired = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-3;
  const hand = them.hands[armed];
  return `${paired ? "paired-" : ""}${hand.weapon}/${reachBand(hand.reach)}`;
}

/** The cell a bout falls in, from the two classes. */
export function cellKey(mine: string, theirs: string): string {
  return `${mine}|${theirs}`;
}

const mean = (cell: SelectorCell | undefined): number => (cell && cell.n > 0 ? cell.points / cell.n : 0);

/**
 * What one candidate is worth in one cell: its cell mean shrunk toward its mean on my class,
 * shrunk toward its mean everywhere. The same three-level arithmetic `outcomeIn` uses on the duel
 * model, with bouts where that has windows.
 */
export function scoreIn(table: SelectorTable, mind: string, mine: string, theirs: string): number {
  const k = table.shrink;
  const top = mean(table.marginal[mind]);
  const mid = table.byClass[`${mine}|${mind}`];
  const midN = mid ? mid.n : 0;
  const midMean = ((mid ? mid.points : 0) + k * top) / (midN + k);
  const leaf = table.cells[`${cellKey(mine, theirs)}|${mind}`];
  const leafN = leaf ? leaf.n : 0;
  return ((leaf ? leaf.points : 0) + k * midMean) / (leafN + k);
}

/** What the choice was, and why, so a test and the entry can read it rather than infer it. */
export interface SelectorChoice {
  readonly cell: string;
  readonly mind: string;
  /** The candidate with the best marginal mean, which plays unless a cell beats it. */
  readonly marginal: string;
  /** The cell's own best candidate, shrunk. */
  readonly best: string;
  readonly bestScore: number;
  readonly marginalScore: number;
  /** How many bouts the cell itself had, over every candidate. */
  readonly bouts: number;
}

/**
 * The mind to play in a cell, or null when the table has no candidates at all.
 *
 * Ties go to the earlier candidate in `minds`, which is the order the fit found them in and is
 * therefore the run's policy order: a deterministic answer matters more than which one it is,
 * because two builds of the same table must pick the same mind for the same body.
 */
export function choose(table: SelectorTable, mine: string, theirs: string): SelectorChoice | null {
  if (table.minds.length === 0) return null;
  let marginal = table.minds[0];
  for (const mind of table.minds) if (mean(table.marginal[mind]) > mean(table.marginal[marginal])) marginal = mind;
  let best = table.minds[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  let bouts = 0;
  for (const mind of table.minds) {
    const score = scoreIn(table, mind, mine, theirs);
    if (score > bestScore) { bestScore = score; best = mind; }
    bouts += table.cells[`${cellKey(mine, theirs)}|${mind}`]?.n ?? 0;
  }
  const marginalScore = scoreIn(table, marginal, mine, theirs);
  const mind = bestScore - marginalScore >= SELECTOR_MARGIN ? best : marginal;
  return { cell: cellKey(mine, theirs), mind, marginal, best, bestScore, marginalScore, bouts };
}

export interface GolemSelectorMind extends Mind {
  readonly name: "golem-selector";
  /** The mind chosen at the first view; null before it. */
  readonly chosen: Mind | null;
  readonly choice: SelectorChoice | null;
}

/**
 * The selector mind: it reads both classes off the first view, chooses, builds that mind, and is
 * it from then on. Built lazily for the reason `golemChampionMind` is -- a policy factory takes a
 * seed and nothing else, and the classes are in the view.
 *
 * `factories` is handed in rather than imported, because the candidates are the registered
 * policies and this module is one of them; importing the registry here would be a cycle, and the
 * one place that knows every mind is the registry itself.
 */
export function golemSelectorMind(
  seed: number, table: SelectorTable = SELECTOR_TABLE,
  factories: Readonly<Record<string, (seed: number) => Mind>> = {},
): GolemSelectorMind {
  checkSelector(table, Object.keys(factories));
  let chosen: Mind | null = null;
  let choice: SelectorChoice | null = null;
  return {
    name: "golem-selector",
    get chosen(): Mind | null { return chosen; },
    get choice(): SelectorChoice | null { return choice; },
    decide(view, dt): Intent {
      if (chosen === null) {
        choice = choose(table, armClass(view.self), opponentArmClass(view.opponent));
        const make = choice === null ? undefined : factories[choice.mind];
        if (make === undefined) {
          const named = choice === null ? "nothing" : `"${choice.mind}"`;
          throw new Error(`golem-selector chose ${named}, which it was handed no factory for`);
        }
        chosen = make(seed);
      }
      return chosen.decide(view, dt);
    },
  };
}
