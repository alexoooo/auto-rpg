import test from "node:test";
import assert from "node:assert/strict";

import { freshHavok, runBout } from "./harness/bout-runner.mjs";
import { defaultGolemSetup } from "../src/golem/build.ts";
import { carriedGolem } from "../src/waves.ts";

/**
 * The one seam `tests/waves.test.mjs` cannot reach: `GolemSetup.wear` against the physics.
 *
 * Everything else about a run is rules over strings and is argued with in that file. This is the
 * claim that the strings do something -- that a body handed the wear of the wave it just fought
 * stands up already hurt, and stands up hurt in *proportion*. Without it `waves.ts` could be
 * perfectly self-consistent and still hand the arena a number nothing reads, which is exactly
 * the shape of defect a wave mode would hide: you would simply never notice that wave nine was
 * as easy as wave one.
 */
const barAtStart = async (wear) => {
  const setup = defaultGolemSetup();
  let first = null;
  runBout({
    left: "golem-fencer", right: "golem-fencer", leftUnit: "golem", rightUnit: "golem",
    leftGolem: wear === null ? setup : { ...setup, wear },
    rightGolem: setup,
    locomotionMode: "supported", seeds: [20260918, 20260919],
    // One sample is the whole question. The cap is the smallest the runner accepts rather than a
    // fight length: nothing here is about how the bout goes.
    maxSeconds: 0.25, physics: await freshHavok(),
    onSample: ({ left, right }) => {
      if (first === null) first = { mine: left.view.self.vitality, theirs: right.view.self.vitality };
    },
  });
  assert.ok(first, "the bout produced no sample to read");
  return first;
};

test("a body carrying a wave's wounds stands up already hurt", async () => {
  const whole = await barAtStart(null);
  assert.equal(whole.mine, whole.theirs, "two default bodies open level");
  assert.ok(whole.mine > 0.99, "and they open whole");

  const hurt = await barAtStart({ torso: 0.5 });
  assert.ok(hurt.mine < whole.mine - 0.05,
    `a half-spent trunk should open below a whole one: ${hurt.mine} vs ${whole.mine}`);
  assert.ok(hurt.theirs > 0.99, "and only the side that was given it");

  // Proportion, not merely presence. A trunk at a quarter must cost more than a trunk at a half,
  // or `wear` is a flag the build reads as damaged-or-not and the ramp has one rung.
  const worse = await barAtStart({ torso: 0.25 });
  assert.ok(worse.mine < hurt.mine - 0.05,
    `a quarter should cost more than a half: ${worse.mine} vs ${hurt.mine}`);
});

/** Fight one wave to a verdict, then reopen the winner's body from its own report. */
const aroundTheEdge = async (seed) => {
  const setup = defaultGolemSetup();
  let last = null;
  const decided = runBout({
    left: "golem-fencer", right: "golem-brawler", leftUnit: "golem", rightUnit: "golem",
    leftGolem: setup, rightGolem: setup, locomotionMode: "supported",
    seeds: [seed, seed + 1], maxSeconds: 90, physics: await freshHavok(),
    onSample: ({ left, right }) => {
      last = {
        left: { bar: left.view.self.vitality, report: left.moduleReport?.() ?? [] },
        right: { bar: right.view.self.vitality, report: right.moduleReport?.() ?? [] },
      };
    },
  });
  assert.ok(decided.winner === "left" || decided.winner === "right",
    `seed ${seed} drew, and a draw has no body to carry`);
  const won = decided.winner === "left" ? last.left : last.right;
  const { wear } = carriedGolem(setup, won.report);
  const opened = await barAtStart(wear);
  return { seed, ended: won.bar, reopened: opened.mine };
};

/**
 * The six seeds this runs, and why these six.
 *
 * The bound below is a measurement. Twelve real bouts to a verdict, the winner's own
 * `moduleReport()` carried through `carriedGolem` into a fresh build, and the bar that body
 * opens on read back:
 *
 * | seed | ended | reopened | drift | | seed | ended | reopened | drift |
 * | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
 * | 20260918 * | 0.7969 | 0.7943 | -0.003 | | 20260960 * | 0.2471 | 0.3277 | +0.081 |
 * | 20260925   | 0.6263 | 0.6321 | +0.006 | | 20260967   | 0.2984 | 0.3547 | +0.056 |
 * | 20260932   | 0.4707 | 0.5039 | +0.033 | | 20260974 * | 0.1293 | 0.2123 | +0.083 |
 * | 20260939 * | 0.2613 | 0.3010 | +0.040 | | 20260981   | 0.7674 | 0.8030 | +0.036 |
 * | 20260946 * | 0.7881 | 0.7699 | -0.018 | | 20260988 * | 0.3263 | 0.3735 | +0.047 |
 * | 20260953   | 0.7083 | 0.7326 | +0.024 | | 20260995   | 0.4351 | 0.4589 | +0.024 |
 *
 * The starred six are the ones asserted here: both ends of the drift (-0.018 and +0.083) and both
 * ends of the bar (0.129 and 0.797), so the test carries the worst case rather than the average
 * one. All twelve cost 11 s, which is not a price a suite should pay every run for six more
 * points inside a range the six already span.
 *
 * The drift is small and it leans one way: **the rebuilt body is a little kinder than the one that
 * earned the wounds, and most so when the wounds are worst.** That is `register`'s uniform scale
 * over a module's parts meeting `vitality`'s uneven per-part weights -- a fight kills particular
 * parts, and spreading that loss evenly across the module it belongs to is worth up to about 0.08
 * of bar to a body that is nearly finished. It is a simplification of the carry, not a leak in it,
 * and it errs towards the player, so it is one this mode can ship.
 *
 * The claim is therefore the three things measured, not a formula. This test's first draft
 * asserted a formula -- that a body reported at 0.4 in every slot opens near 0.4 -- and it opens
 * at **0**. `vitality()` is a weighted injury sum whose weights total well above 1: a ruined head
 * alone, or a ruined trunk alone, spends the whole bar. So 0.6 of injury everywhere is a corpse,
 * and the bar never was the mean of the module fractions.
 */
const CARRY_SEEDS = [20260918, 20260939, 20260946, 20260960, 20260974, 20260988];

test("the bar a wave ends on is the bar the next wave opens on", async () => {
  const rounds = [];
  for (const seed of CARRY_SEEDS) rounds.push(await aroundTheEdge(seed));

  for (const { seed, ended, reopened } of rounds) {
    assert.ok(Math.abs(reopened - ended) < 0.1,
      `seed ${seed}: a wave's wounds must survive the rebuild: ${ended} -> ${reopened}`);
    assert.ok(reopened > ended - 0.05,
      `seed ${seed}: and the rebuild must never be the harsher one: ${ended} -> ${reopened}`);
  }

  // The ramp itself. Both assertions above would pass on a carry that quietly pulled every body
  // towards the middle, and that is precisely the defect a wave mode hides: the spread the fights
  // earned has to still be a spread on the far side of the rebuild, or wave nine is wave one.
  const worst = rounds.reduce((a, b) => (a.ended < b.ended ? a : b));
  const best = rounds.reduce((a, b) => (a.ended > b.ended ? a : b));
  assert.ok(best.reopened - worst.reopened > 0.3,
    `a nearly finished body must open far below a barely scratched one:`
    + ` ${worst.reopened} vs ${best.reopened}`);
});
