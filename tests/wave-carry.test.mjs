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
      if (first === null) first = { mine: left.view.self.vitality, theirs: right.view.self.vitality,
        modules: left.moduleReport() };
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
  return { seed, ended: won.bar, reopened: opened.mine, expected: Object.fromEntries(won.report.map(module => [module.slot, module.durability])), modules: opened.modules };
};

/** Exercise different wound distributions from real fights. Carry is per-module durability:
 * individual vitality weights and refitting a severed module can legitimately change the bar.
 * Compare the actual carried quantities rather than a drift bound fitted to six old outcomes.
 */
const CARRY_SEEDS = [20260918, 20260939, 20260946, 20260960, 20260974, 20260988];

test("a wave carries every module's durability into the next physical body", async () => {
  const rounds = [];
  for (const seed of CARRY_SEEDS) rounds.push(await aroundTheEdge(seed));

  for (const { seed, expected: carried, modules } of rounds) {
    for (const [slot, expected] of Object.entries(carried)) {
      const actual = modules.find(module => module.slot === slot);
      assert.ok(actual, "rebuilt body lost " + slot);
      assert.ok(Math.abs(actual.durability - expected) < 1e-6,
        "seed " + seed + ": " + slot + " wounds changed: " + expected + " -> " + actual.durability);
    }
  }

  // Injured and relatively healthy winners must still reopen as different physical bodies.
  const worst = rounds.reduce((a, b) => (a.ended < b.ended ? a : b));
  const best = rounds.reduce((a, b) => (a.ended > b.ended ? a : b));
  assert.ok(best.reopened - worst.reopened > 0.3,
    `a nearly finished body must open far below a barely scratched one:`
    + ` ${worst.reopened} vs ${best.reopened}`);
});
