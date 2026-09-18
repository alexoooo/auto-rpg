import type { GolemSetup } from "../bout.ts";
import { randomGolemSetup } from "./build.ts";

/**
 * Can this pair of bodies end a bout? Session 01 of the learn set.
 *
 * ## Why a predicate, and why it is in `src/` rather than in a script
 *
 * The owner's brief for this plan set opens with one sentence: *"only look at viable matchups,
 * including the Random setup in the UI -- no time on layouts that can't kill"*. Before this module
 * there was no place that sentence could be written down. `poolFor` in
 * `scripts/train-ppo.mjs` could cut a *training* pool by armed terminal, and it was the only
 * thing in the tree that could; the rating, the two probes, the league and the screen's Random
 * button all drew from the whole pool, and every one of them was paying for the same thing.
 *
 * What it was paying for is measured rather than argued. A bout on a pair that cannot end is
 * amplified critic noise in a rollout -- every action in the episode has the same return, so the
 * advantage over it is the critic's residual, and `ppoFit` normalises advantages across the whole
 * batch, which scales that residual up to stand beside the real signal. In a rating it is half a
 * point by construction: two full bars at the cap is a draw whatever either mind did. And on the
 * screen it is a person pressing Random and watching two things circle each other for a minute.
 *
 * So the predicate lives here, beside the build it is about, and every pool in the set draws
 * through it. `--terminals all` is the way back to the whole pool and exists for the close-out's
 * final tables and for nothing else.
 *
 * ## The class is the unit, not the draw
 *
 * `armedTerminal` classes a build by the terminal on the hand that fights -- its primary, or its
 * secondary when the primary is capped. That is the function `buildClass` and the whole rating
 * table were already keyed through, and it moved here from `scripts/tournament.mjs` (which
 * re-exports it, so no caller changed) because a predicate about bodies cannot live in the
 * harness that measures them.
 *
 * A draw index is a fact about one seed. "A maul finishes and a whip does not" is a fact about
 * weapons, and it survives a change of seed, a change of pool size and a change of mind. So the
 * predicate is by class first (`VIABLE_TERMINALS`) and by unordered class pair second
 * (`VIABLE_PAIRS`), and never by build name. The cost of that choice is stated plainly: a class
 * is admitted or refused whole, so a viable class carries a few builds that are individually
 * hopeless and a refused one loses a few that were not.
 *
 * ## The two tables that chose the constants
 *
 * Both were taken by `scripts/viability.mjs` on 2026-09-09, which regenerates them and prints the
 * literal below: `--bouts 8 --seed 20260906 --random 40 --workers 30`, 52 builds, 60 s cap, 56
 * minutes of wall clock. The reference mind is `golem-driver` -- hand-written, third of fourteen
 * on random pairs, and *not* a learned mind, because a viability set fitted around whatever the
 * current fit happens to be good at is a set that moves with the thing it is measuring.
 *
 * **The idle probe** -- every build in the 52-build pool against a motionless copy of itself,
 * both corners, 8 bouts a build, 416 bouts. If a mind cannot kill something that never moves,
 * never blocks and never steps away, the layout cannot decide anything:
 *
 * | armed terminal | builds | kill rate | dummy bar left |
 * | --- | ---: | ---: | ---: |
 * | maul | 7 | 98 % | 0.093 |
 * | mace | 8 | 53 % | 0.428 |
 * | blade | 14 | 1 % | 0.779 |
 * | plate | 9 | 0 % | 0.899 |
 * | fist | 8 | 0 % | 0.914 |
 * | whip | 4 | 0 % | 0.968 |
 * | none | 2 | 0 % | 0.990 |
 *
 * **The random pairs** -- `golem-driver` on both sides, two different bodies, 10,608 bouts over
 * 5,304 pairings, 4,903 decided, 46 % overall, summed per unordered class pair:
 *
 * | class pair | bouts | decided |
 * | --- | ---: | ---: |
 * | maul vs maul | 196 | 100 % |
 * | blade vs maul | 768 | 98 % |
 * | fist vs maul | 402 | 97 % |
 * | mace vs maul | 452 | 96 % |
 * | maul vs plate | 494 | 93 % |
 * | maul vs whip | 226 | 87 % |
 * | fist vs mace | 534 | 76 % |
 * | mace vs whip | 228 | 76 % |
 * | mace vs mace | 224 | 74 % |
 * | maul vs none | 92 | 71 % |
 * | blade vs mace | 890 | 63 % |
 * | mace vs plate | 606 | 36 % |
 * | blade vs blade | 796 | 36 % |
 * | blade vs whip | 408 | 32 % |
 * | blade vs fist | 826 | 22 % |
 * | blade vs plate | 1056 | 14 % |
 * | mace vs none | 134 | 10 % |
 * | plate vs whip | 312 | 10 % |
 * | whip vs whip | 54 | 7 % |
 * | fist vs plate | 608 | 7 % |
 * | fist vs none | 128 | 5 % |
 * | none vs plate | 114 | 5 % |
 * | fist vs whip | 248 | 5 % |
 * | plate vs plate | 288 | 4 % |
 * | blade vs none | 162 | 2 % |
 * | fist vs fist | 262 | 1 % |
 * | none vs whip | 80 | 0 % |
 * | none vs none | 20 | 0 % |
 *
 * The floor is half and it falls in one place: between `blade vs mace` at 63 % and `mace vs plate`
 * at 36 %. Eleven of the twenty-eight pairs are above it, seventeen below, and nothing sits within
 * fifteen points of the line, so the cut is not a knife-edge on this seed.
 *
 * ## The rule, and the thing the measurement said that the plan did not expect
 *
 * A class is viable when a hand-coded mind on it kills a motionless copy of itself in at least
 * half its bouts, **or** a random pair of it against an already-viable class decides at least
 * half. The first rule is the floor -- a class that cannot finish a dummy finishes nothing -- and
 * it admits `maul` at 98 % and `mace` at 53 % and nothing else. The second was meant to let a
 * plate fight a maul: a plate cannot kill a plate and has no business in a mirrored pool, and a
 * maul against a plate is a fight that ends.
 *
 * **It let everything fight a maul.** The maul decides against all seven classes -- 98 % against a
 * blade, 97 % against a fist, 93 % against a plate, 87 % against a whip, 71 % against a body with
 * no terminal at all -- so the second rule admits every class on the shelf and `VIABLE_TERMINALS`
 * is the whole shelf. That is not a bug in the rule and not a rounding accident; it is the
 * measurement saying the plan's frozen unit was the wrong one. **No class is dead weight. Only
 * pairs are.** `viableBuild` accepts every body the registry can make, and `VIABLE_PAIRS` carries
 * the entire predicate.
 *
 * Two consequences are named here rather than discovered later:
 *
 * - `--terminals all` is today the same pool as the default, so every pool that filters by class
 *   alone -- `poolFor`, `ratePolicy`, and through them the trainer's rollouts and the two probes
 *   -- had nothing removed from it by the class filter. The word still works and the filter still
 *   refuses a class name with a typo; it simply has nothing to cut. What the class filter could not
 *   do, `viableMirror` does, and the section below is that.
 * - `defaultGolemSetup` is a blade and `blade vs blade` decides 36 %, so the showcase mirror the
 *   app opens on is a pair this module refuses. Moving the default is not available: it is the
 *   reference body a dozen sweeps in `docs/measurements.md` were taken on, and every one of those
 *   constants would lose its provenance. `tests/bout.test.mjs` records the fact instead, so it is
 *   a thing somebody decided rather than a thing nobody looked at.
 *
 * ## The mirror, which is the cut the class filter could not make
 *
 * A **viable mirror** is a body whose own class can finish its own class: `viableMirror(setup)` is
 * `viablePair(setup, setup)`, and `VIABLE_MIRRORS` is the class-level form of it, derived from
 * `VIABLE_PAIRS` rather than measured again so that a re-run of `scripts/viability.mjs` moves both
 * together. **Two classes have one.** `maul|maul` decides 100 % and `mace|mace` 74 %; the other
 * five self-pairs are `blade|blade` at 36 %, `plate|plate` at 4 %, `whip|whip` at 7 %, `fist|fist`
 * at 1 % and `none|none` at 0 %, and none of them is in the pair table.
 *
 * It matters because most of the tree's bouts are mirrored and nobody had noticed the predicate did
 * not cover them. `collectRollouts` in `scripts/train-ppo.mjs` schedules with `mirror: true`, so
 * both corners hold the *same* build and the pair a rollout is actually collected on is
 * `(class, class)` -- and `viableBuild`, which accepts every class, was the only thing standing in
 * front of it. The mirrored rating in `ratePolicy`, `leagueMatrix`, and both probes against a
 * motionless copy are the same arrangement. So a pool asked for mirrored bouts filters by
 * `viableMirror` and a pool asked for random pairs rejects on the pairing through `viablePair`,
 * which is what `--pairs viable` in `scripts/tournament.mjs` has always done for its plain runs.
 *
 * **This is a much sharper cut than the class filter, and it is a real narrowing.** Of the 52
 * builds the default pool draws at seed 20260906, 15 have a viable mirror -- the 7 mauls and the 8
 * maces of the idle table above -- and 37 do not, so a mirrored pool is a maul-and-mace pool and a
 * mind trained on it never mirrors a blade. The honest statement of the cost is that the record
 * already showed what those bouts were worth: mirrored, a blade decides 41 % of its bouts, a plate
 * 2 %, a fist 2 %, and a whip and an unarmed body 0 %, so the 37 builds this removes were paying
 * the batch normalisation in `ppoFit` for critic residual and paying a rating half a point by
 * construction. `--terminals all` is the one word that puts them back, for the mirror as for the
 * class, and the close-out's whole-pool table is why it exists.
 *
 * ## What the predicate is not
 *
 * It is not a menu. The owner can still build anything by hand on the setup screen, and a
 * hand-built pair this module refuses is fought with a line of caption saying so and Begin still
 * enabled. Only the *draw* changes -- and because the class filter turned out vacuous, the draw is
 * where the whole of this module's effect on the screen now lives: `randomViableOpponent` redraws
 * against *what is standing on the other side*, which is the only form of the rule that can keep
 * the owner's dozen presses of Random on fights that end.
 */

/** The hand a build fights with: its primary, or its secondary when the primary is capped. */
export function armedHand(build: GolemSetup): "primary" | "secondary" {
  return build.primary.terminal !== "none" ? "primary" : "secondary";
}

/** The terminal in that hand, which is the class every table here is keyed by. */
export function armedTerminal(build: GolemSetup): string {
  return build[armedHand(build)].terminal;
}

/**
 * The classes a pool draws from by default. Measured; regenerate with `scripts/viability.mjs`.
 *
 * Every class the shelf offers, which is the measurement's answer and not a placeholder -- see the
 * rule above. It stays a constant rather than being deleted because the *rule* is what this module
 * ships and the rule has a term for it: a re-measurement on a different mind, or after a change to
 * what a maul does, is expected to shorten this list, and `--terminals all` has to keep meaning
 * something when it does.
 */
export const VIABLE_TERMINALS: readonly string[] = Object.freeze([
  "maul", "mace", "blade", "plate", "fist", "whip", "none",
]);

/** Class pairs, unordered, that decide at least half their bouts on random pairs. */
export const VIABLE_PAIRS: ReadonlySet<string> = new Set([
  "blade|mace", "blade|maul", "fist|mace",
  "fist|maul", "mace|mace", "mace|maul",
  "mace|whip", "maul|maul", "maul|none",
  "maul|plate", "maul|whip",
]);

/** Two class names in one key, ordered so that a pair reads the same from either side. */
export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * The classes whose own class they can finish: `maul` and `mace`, and nothing else.
 *
 * Derived from `VIABLE_PAIRS` rather than written out, because it *is* the self-pairs of that table
 * and a second literal would be a second thing to re-measure. A re-run of `scripts/viability.mjs`
 * that admits a third mirror admits it here in the same paste.
 */
export const VIABLE_MIRRORS: ReadonlySet<string> = new Set(
  VIABLE_TERMINALS.filter((terminal) => VIABLE_PAIRS.has(pairKey(terminal, terminal))),
);

/** Whether this body is worth putting in a pool at all. */
export const viableBuild = (setup: GolemSetup): boolean => VIABLE_TERMINALS.includes(armedTerminal(setup));

/** Whether these two bodies can finish each other. */
export const viablePair = (a: GolemSetup, b: GolemSetup): boolean =>
  VIABLE_PAIRS.has(pairKey(armedTerminal(a), armedTerminal(b)));

/**
 * Whether this body can finish a copy of itself, which is the question a mirrored bout asks.
 *
 * `viablePair(setup, setup)` said once with a name, so that the five pools which schedule both
 * corners from one build ask it in one word instead of each spelling out the argument twice. It is
 * the predicate that does the work the class filter turned out not to do -- see the mirror section
 * above -- and it refuses 37 of the 52 builds in the default pool where `viableBuild` refuses none.
 */
export const viableMirror = (setup: GolemSetup): boolean => VIABLE_MIRRORS.has(armedTerminal(setup));

/**
 * The one line the setup screen puts under a hand-built pair the predicate refuses, or null.
 *
 * Here rather than in `src/setup.ts` for the reason that file states about its own reducers: the
 * screen has no test, because the Node runner has no DOM, so a rule written there is a rule
 * nothing can go red about. The screen renders this string and decides nothing.
 */
export const unviablePairNote = (a: GolemSetup, b: GolemSetup): string | null =>
  viablePair(a, b) ? null : "these two cannot finish each other";

/**
 * How many draws the viable draws below will make before giving up.
 *
 * Thirty-two, against `randomGolemSetup`'s eight, and the two bounds guard different things. That
 * one is a guard on an invariant -- every id it draws is one the registry offers, so a refusal
 * there should never happen -- and eight is generous for something that cannot occur. This one is
 * a *rejection sampler* over a real acceptance rate: `randomViableOpponent` drawing against a body
 * armed with nothing has one partner class in seven to find, so a run of refusals is expected
 * rather than a defect, and a bound tight enough to trip on ordinary bad luck would put an
 * exception on the screen's Random button.
 */
export const VIABLE_DRAW_TRIES = 32;

/**
 * A body drawn at random from the classes that can finish a fight.
 *
 * `randomGolemSetup` over the same seeded stream, redrawn until `viableBuild` accepts -- so the
 * draw is still a pure function of `rng` and a corner that records its seed can be drawn again by
 * anybody with the number, which is the property the screen's seed caption is worth having for.
 * Rejection rather than a restricted shelf, deliberately: a second list of "the terminals Random
 * is allowed to pick" would be a copy of `VIABLE_TERMINALS` in the shape of a picker, and this
 * plan set has spent enough on second copies of one rule.
 *
 * **On the measured table this rejects nothing**, because every class is viable, so it is
 * `randomGolemSetup` with a rule attached rather than a filter doing work. It is still the
 * function the screen and the harness call, so a re-measurement that refuses a class changes the
 * draw everywhere without changing a caller. The bound and its message are what will matter then;
 * today only `randomViableOpponent` can trip a bound.
 */
export function randomViableGolemSetup(rng: () => number, tries: number = VIABLE_DRAW_TRIES): GolemSetup {
  let last = "";
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const setup = randomGolemSetup(rng);
    if (viableBuild(setup)) return setup;
    last = armedTerminal(setup);
  }
  throw new Error(`${tries} random golem builds in a row were unviable, the last a "${last}"`);
}

/**
 * A body drawn at random that can finish, and be finished by, the one already standing there.
 *
 * This is the draw the screen's Random button uses, and after the measurement it is the only one
 * of the three that does anything: `viableBuild` accepts every class, so drawing the two sides
 * independently would put an unviable pair on the screen more often than not -- 4,903 of 10,608
 * random pairs decided, a shade under half. Drawing the *opponent* is what the owner's sentence
 * asked for. It throws past the bound naming both classes, because a Random button that quietly
 * handed back a body that cannot fight what it was drawn against would be the "nearly right
 * control" `golemSetupRefusal` exists to refuse.
 */
export function randomViableOpponent(
  rng: () => number,
  other: GolemSetup,
  tries: number = VIABLE_DRAW_TRIES,
): GolemSetup {
  let last = "";
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const drawn = randomViableGolemSetup(rng, tries);
    if (viablePair(other, drawn)) return drawn;
    last = armedTerminal(drawn);
  }
  throw new Error(
    `${tries} viable bodies in a row could not finish a "${armedTerminal(other)}", the last a "${last}"`,
  );
}

/**
 * A whole matchup: two viable bodies that `viablePair` also accepts against each other.
 *
 * Two questions and not one, for the reason the class tables give -- a class can be worth drawing
 * and still be a poor matchup against one particular other class -- so this redraws the *pair*
 * rather than only the two bodies. The right side is what moves: a caller that wants both sides
 * redrawn calls it again.
 */
export function randomViablePair(rng: () => number, tries: number = VIABLE_DRAW_TRIES): [GolemSetup, GolemSetup] {
  const a = randomViableGolemSetup(rng, tries);
  return [a, randomViableOpponent(rng, a, tries)];
}
