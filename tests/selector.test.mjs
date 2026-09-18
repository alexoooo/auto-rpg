// The selector and the table it plays from. Session 09 of the style set.
//
// The mind is small -- read two classes, look up a cell, be that mind for the bout -- and the
// whole of its difficulty is in the two things around it: whether the class it reads off the body
// in front is the class that body reads off itself, and whether a cell with nine bouts in it is
// allowed to overrule a candidate that wins everywhere. The first is measured here against the
// reference pool rather than argued; the second is the shrinkage and the margin rule, tested on
// synthetic rows where the answer is known by construction.
import test from "node:test";
import assert from "node:assert/strict";

import { armClass } from "../src/golem/champion.ts";
import {
  NO_SELECTOR, SELECTOR_MARGIN, SELECTOR_VERSION, cellKey, checkSelector, choose,
  golemSelectorMind, opponentArmClass, scoreIn,
} from "../src/golem/selector.ts";
import { SELECTOR_TABLE } from "../src/golem/selector-table.ts";
import { GOLEM_CANDIDATES } from "../src/golem/golem-policies.ts";
import { POLICIES } from "../src/mind.ts";
import { fitSelector, pointsFor } from "../scripts/fit-selector.mjs";
import { REFERENCE_BUILDS } from "../scripts/tournament.mjs";

process.env.SWORD_MEASURE_LIBRARY = "1";
const { freshHavok, runBout } = await import("../scripts/measure.mjs");

const SEED = 20260909;

/** One row of a tournament, as far as the fit reads one: two policies, two classes, a winner. */
const row = (left, right, mine, theirs, winner) => ({
  winner,
  left: { policy: left, arm: mine },
  right: { policy: right, arm: theirs },
});

const X = "golem-fencer";
const Y = "golem-brawler";

/**
 * `n` bouts of one candidate in one cell, `p` of them won.
 *
 * The other side is a policy the fit is not asked about, so a row counts once and the numbers
 * below are the ones the design intends rather than the ones a mirror of them produced.
 */
const bouts = (n, p, mind, mine, theirs) => Array.from({ length: n }, (_, i) =>
  row(mind, "sparring-partner", mine, theirs, i < Math.round(n * p) ? "left" : "right"));

const SYNTHETIC = [
  // The bulk of the log, where the marginal winner is decided.
  ...bouts(600, 0.70, X, "sword/mid", "sword/mid"),
  ...bouts(600, 0.30, Y, "sword/mid", "sword/mid"),
  // A cell the other candidate owns, with enough bouts behind it to say so.
  ...bouts(300, 0.35, X, "sword/long", "club/long"),
  ...bouts(300, 0.95, Y, "sword/long", "club/long"),
  // A cell the marginal winner also wins.
  ...bouts(300, 0.80, X, "club/long", "sword/long"),
  ...bouts(300, 0.20, Y, "club/long", "sword/long"),
  // Three bouts each, one candidate taking all three: the winner's curse in miniature.
  ...bouts(3, 0.00, X, "whip/mid", "sword/long"),
  ...bouts(3, 1.00, Y, "whip/mid", "sword/long"),
  // Five each, four of them the other candidate's: enough for the shrinkage to leave it on top
  // of the cell and not nearly enough for the margin rule to let it play.
  ...bouts(5, 0.20, X, "empty/short", "sword/long"),
  ...bouts(5, 0.80, Y, "empty/short", "sword/long"),
];

test("a_cell_plays_its_own_winner_only_when_the_evidence_beats_the_marginal_winner", () => {
  assert.equal(pointsFor({ winner: "left" }, "left"), 1);
  assert.equal(pointsFor({ winner: null }, "left"), 0.5);
  assert.equal(pointsFor({ winner: "right" }, "left"), 0);
  const { table, counted, skipped } = fitSelector(SYNTHETIC, { minds: [X, Y], seed: 1, date: "2026-09-07" });
  assert.equal(skipped, 0);
  assert.equal(counted, 2416, "one side a row: the sparring partner is not a candidate");
  assert.deepEqual([...table.minds], [X, Y]);
  assert.equal(table.shrink, 32);
  // X wins overall; Y wins the long-blade-against-a-club cell by more than the margin.
  const overall = (mind) => table.marginal[mind].points / table.marginal[mind].n;
  assert.ok(overall(X) > overall(Y), `${overall(X).toFixed(3)} vs ${overall(Y).toFixed(3)}`);
  const owned = choose(table, "sword/long", "club/long");
  assert.equal(owned.marginal, X);
  assert.equal(owned.best, Y);
  assert.equal(owned.mind, Y, "a cell with three hundred bouts behind it may overrule the marginal");
  assert.ok(owned.bestScore - owned.marginalScore > SELECTOR_MARGIN);
  assert.equal(owned.cell, cellKey("sword/long", "club/long"));
  assert.equal(owned.bouts, 600);
  // The cell the marginal winner also wins plays it, and so does the cell nobody has evidence on.
  assert.equal(choose(table, "club/long", "sword/long").mind, X);
  // Three bouts to nothing leaves the sweeping candidate on top of the cell -- the shrinkage
  // pulls a 1.0 to 0.53 and a 0.0 to 0.53, and 0.53 is still the larger -- so this is exactly the
  // case the margin rule exists for, and the edge it has to refuse is two thousandths of a point.
  const thin = choose(table, "whip/mid", "sword/long");
  assert.equal(thin.bouts, 6);
  assert.equal(thin.best, Y, "the shrunk cell winner is the one that took all three");
  assert.equal(thin.mind, X, "three bouts cannot overrule the mind that wins everywhere");
  assert.ok(thin.bestScore > thin.marginalScore
    && thin.bestScore - thin.marginalScore < SELECTOR_MARGIN,
    `the edge was ${(thin.bestScore - thin.marginalScore).toFixed(4)}`);
  // Five bouts to one says the same thing one bout further along.
  const close = choose(table, "empty/short", "sword/long");
  assert.equal(close.best, Y);
  assert.equal(close.mind, X, "and a cell's winner plays only above the margin");
  assert.ok(close.bestScore - close.marginalScore < SELECTOR_MARGIN,
    `the edge was ${(close.bestScore - close.marginalScore).toFixed(4)}`);
  // A cell the log never visited falls through both levels to the candidate's marginal mean.
  const unseen = choose(table, "paired-club/long", "paired-club/long");
  assert.equal(unseen.mind, X);
  assert.ok(Math.abs(scoreIn(table, X, "paired-club/long", "paired-club/long") - overall(X)) < 1e-9);
});

test("a_table_is_refused_by_version_and_by_a_candidate_the_build_cannot_make", () => {
  const { table } = fitSelector(SYNTHETIC, { minds: [X, Y] });
  assert.equal(checkSelector(table), table);
  assert.throws(() => checkSelector({ ...table, version: 99 }), /version 99; this build reads version 1/);
  assert.throws(() => checkSelector({ ...table, minds: ["golem-oracle"] }, [X, Y]),
    /names "golem-oracle", which this build has no factory for/);
  assert.equal(checkSelector(SELECTOR_TABLE, Object.keys(GOLEM_CANDIDATES)).version, SELECTOR_VERSION);
  assert.equal(choose(NO_SELECTOR, "sword/long", "sword/long"), null, "a table of no candidates chooses nothing");
  // The candidates are the registered golem minds save the selector itself, which cannot pick
  // itself without recursion and cannot be fitted against a table it is inside, and save
  // `golem-snapshot`, which is a slot a fetch fills: a selector that could pick it would be a
  // table whose meaning depends on which checkpoint the page happened to load.
  const registered = POLICIES.map((policy) => policy.name).filter((name) => name.startsWith("golem-"));
  assert.deepEqual([...Object.keys(GOLEM_CANDIDATES)].sort(),
    registered.filter((name) => name !== "golem-selector" && name !== "golem-snapshot").sort());
  assert.ok(!("golem-selector" in GOLEM_CANDIDATES));
});

/**
 * The read of the body in front against the read a body makes of itself.
 *
 * `armClass` has capabilities and `opponentArmClass` has only what a view publishes, so the two
 * are different functions of the same body and the claim that they agree is a measurement. One
 * short bout per pair of reference builds puts every build on both sides of a view at once: the
 * left fighter's `view.self` and the right fighter's `view.opponent` are the same golem.
 */
test("the_class_read_off_an_opponent_is_the_class_that_body_reads_off_itself", async () => {
  const physics = await freshHavok();
  const seen = new Map();
  for (let i = 0; i < REFERENCE_BUILDS.length; i += 2) {
    const left = REFERENCE_BUILDS[i];
    const right = REFERENCE_BUILDS[(i + 1) % REFERENCE_BUILDS.length];
    let first = null;
    runBout({
      left: "golem-duelist", right: "golem-duelist",
      leftUnit: "golem", rightUnit: "golem",
      leftGolem: left.setup, rightGolem: right.setup,
      locomotionMode: "supported",
      seeds: [SEED, SEED + 1],
      maxSeconds: 0.5,
      physics,
      onSample: (sample) => { first ??= sample; },
    });
    assert.ok(first !== null, `${left.name} vs ${right.name} produced no sample`);
    for (const [me, them] of [["left", "right"], ["right", "left"]]) {
      const name = me === "left" ? left.name : right.name;
      seen.set(name, { self: armClass(first[me].view.self), opponent: opponentArmClass(first[them].view.opponent) });
    }
  }
  assert.equal(seen.size, REFERENCE_BUILDS.length, "every reference build stood on one side of a view");
  for (const [name, read] of seen) {
    assert.equal(read.opponent, read.self, `${name}: read as ${read.opponent} from outside, ${read.self} from inside`);
  }
  // And the reads are not all one string, which is the way this test could pass for nothing.
  assert.ok(new Set([...seen.values()].map((read) => read.self)).size >= 4,
    `the pool produced ${new Set([...seen.values()].map((r) => r.self)).size} distinct classes`);
});

test("the_selector_reads_both_classes_off_its_first_view_and_is_that_mind_for_the_bout", async () => {
  const { table } = fitSelector([
    ...bouts(400, 0.20, X, "sword/long", "paired-club/long"),
    ...bouts(400, 0.90, Y, "sword/long", "paired-club/long"),
    ...bouts(400, 0.80, X, "sword/long", "sword/long"),
    ...bouts(400, 0.20, Y, "sword/long", "sword/long"),
  ], { minds: [X, Y], seed: SEED, date: "2026-09-07" });
  const physics = await freshHavok();
  const against = async (setup, expected, expectedCell) => {
    const mind = golemSelectorMind(SEED, table, GOLEM_CANDIDATES);
    assert.equal(mind.name, "golem-selector");
    assert.equal(mind.chosen, null, "nothing is built before the first view");
    assert.equal(mind.choice, null);
    const result = runBout({
      left: "golem-selector", right: "golem-fencer",
      leftUnit: "golem", rightUnit: "golem",
      leftGolem: REFERENCE_BUILDS[0].setup, rightGolem: setup,
      locomotionMode: "supported",
      leftMind: mind,
      seeds: [SEED, SEED + 3],
      maxSeconds: 3,
      physics,
    });
    assert.ok(result.seconds >= 2.9, `the bout ran ${result.seconds.toFixed(1)} s`);
    assert.equal(mind.choice.cell, expectedCell);
    assert.equal(mind.choice.mind, expected);
    assert.equal(mind.chosen.name, expected, "the mind after the choice is the mind chosen");
    return mind;
  };
  // A blade against a maul is the cell the brawler owns; a blade against a blade is not.
  const maul = REFERENCE_BUILDS.find((build) => build.name === "maul");
  await against(maul.setup, Y, "sword/long|paired-club/long");
  await against(REFERENCE_BUILDS[0].setup, X, "sword/long|sword/long");
  // A table naming a candidate the caller cannot build is refused when the mind is made, not
  // at the first view, so a run fails at its start rather than in its ninth bout.
  assert.throws(() => golemSelectorMind(SEED, table, { [X]: GOLEM_CANDIDATES[X] }),
    /names "golem-brawler", which this build has no factory for/);
});
