import test from "node:test";
import assert from "node:assert/strict";

import {
  afterWave,
  carriedGolem,
  mendedGolem,
  startRun,
  waveEnemy,
  waveMatchup,
} from "../src/waves.ts";
import { NAMED_BUILDS, namedBuild } from "../src/golem/roster.ts";
import { defaultMatchup, matchupFromQuery, matchupQuery, modeOf } from "../src/bout.ts";
import { defaultGolemSetup } from "../src/golem/build.ts";

const yours = () => ({
  ...defaultMatchup().left, unit: "golem", golem: defaultGolemSetup(),
});

test("a run is the whole roster in an order its seed alone decides", () => {
  const run = startRun(20260918);
  assert.deepEqual([...run.order].sort(), NAMED_BUILDS.map((b) => b.name).sort(),
    "every body appears exactly once");
  assert.deepEqual(startRun(20260918).order, run.order, "the same seed is the same run");
  // Not an assertion about shuffling quality -- just that the seed reaches the order at all.
  const others = [1, 2, 3, 4, 5].map((s) => startRun(s).order.join(","));
  assert.ok(new Set(others).size > 1, "different seeds are different runs");
  for (const name of run.order) assert.ok(namedBuild(name), `"${name}" is a build the game has`);
});

test("the queue cycles rather than running out, and a wave names a body and a mind", () => {
  const run = startRun(7);
  const first = waveEnemy(run);
  assert.equal(first.build.name, run.order[0]);
  const wrapped = waveEnemy({ ...run, wave: run.order.length + 1 });
  assert.equal(wrapped.build.name, run.order[0], "wave 13 is wave 1's body again");
  // A run that outlives the roster is the point rather than an edge: nothing about wave 40 is
  // supposed to be unreachable, and what makes it hard is the body you bring to it.
  assert.ok(waveEnemy({ ...run, wave: 97 }).policy.length > 0);
});

test("you are on the left in every wave, and the wave is a golem on a policy", () => {
  const run = startRun(11);
  const mine = yours();
  const matchup = waveMatchup(run, mine);
  assert.equal(matchup.left.control, mine.control, "the screen still says who drives you");
  assert.deepEqual(matchup.left.golem, mine.golem, "and you fight in your own body");
  assert.equal(matchup.right.control, "mind");
  assert.equal(matchup.right.unit, "golem");
  assert.deepEqual(matchup.right.golem, waveEnemy(run).build.setup);
  assert.equal(matchup.right.policy, waveEnemy(run).policy);
});

test("winning is the only way forward and losing ends it for good", () => {
  const run = startRun(3);
  assert.equal(afterWave(run, true).wave, 2);
  assert.equal(afterWave(run, true).over, false);
  const lost = afterWave(run, false);
  assert.equal(lost.over, true);
  assert.equal(lost.wave, 1, "the wave that beat you is the wave you died on");
  assert.deepEqual(afterWave(lost, true), lost, "and a finished run stays finished");
});

test("the body that walks out of a wave is the body that walks into the next one", () => {
  const golem = defaultGolemSetup();
  const report = [
    { slot: "locomotion", id: "x", severed: false, durability: 0.81, severedIntact: false },
    { slot: "torso", id: "x", severed: false, durability: 0.62, severedIntact: false },
    { slot: "head", id: "x", severed: false, durability: 1, severedIntact: false },
    { slot: "primary", id: "x", severed: false, durability: 0.44, severedIntact: false },
    { slot: "secondary", id: "x", severed: true, durability: 0.19, severedIntact: true },
  ];
  const carried = carriedGolem(golem, report);
  assert.deepEqual(carried.wear,
    { locomotion: 0.81, torso: 0.62, head: 1, primary: 0.44, secondary: 0.19 },
    "all five slots, and an arm that came off is put back on at what it had left");
  assert.equal(carried.primary.durability, golem.primary.durability,
    "the bin's own field is not this function's to write");
  assert.equal(carried.locomotion, golem.locomotion, "and the build itself is untouched");

  // A maul is one module in two sockets, so a report can be short. What it does not mention is
  // whole, which is the same reading `wear`'s own doc gives for an absent slot.
  assert.deepEqual(carriedGolem(golem, report.slice(0, 2)).wear,
    { locomotion: 0.81, torso: 0.62 });

  // A run ends where its wounds do. The bin part fitted to the hand is not a wound and stays.
  const salvaged = { ...golem, primary: { ...golem.primary, salvage: "bin-1", durability: 0.7 } };
  const mended = mendedGolem(carriedGolem(salvaged, report));
  assert.equal(mended.wear, undefined, "a new run starts whole");
  assert.equal(mended.primary.durability, 0.7, "but a salvaged blade stays as worn as it is");
});

test("a carried body survives the link codec, and an impossible one does not", () => {
  const start = defaultMatchup();
  const mine = { ...start.left, unit: "golem", golem: carriedGolem(defaultGolemSetup(), [
    { slot: "torso", id: "x", severed: false, durability: 0.5, severedIntact: false },
  ]) };
  const matchup = { left: mine, right: start.right };
  assert.deepEqual(matchupFromQuery(matchupQuery(matchup)), matchup);

  const broken = (wear) => matchupFromQuery(matchupQuery({
    ...matchup, left: { ...mine, golem: { ...mine.golem, wear } },
  }));
  assert.equal(broken({ torso: 1.5 }), null, "a bar fuller than full");
  assert.equal(broken({ torso: -0.1 }), null, "or emptier than empty");
  assert.equal(broken({ torso: "half" }), null, "or not a number at all");
  assert.deepEqual(broken({ torso: 0 })?.left.golem.wear, { torso: 0 }, "but nothing left is real");
});

test("wave one is the only rung the ladder measured, and the rest is variety", () => {
  // The claim under this is in `wavePolicy`: eight of the ten designed minds sat inside 0.441
  // to 0.516 over 256 bouts each, which is one sigma-band wide, so only `golem-brawler` earns a
  // place in an *order*. If a later measurement separates the cluster, this test is what says
  // out loud that the shape changed.
  for (const seed of [1, 2, 20260918]) {
    assert.equal(waveEnemy(startRun(seed)).policy, "golem-brawler", "wave one is the weak one");
  }
  const run = startRun(20260918);
  const later = [];
  for (let wave = 2; wave <= 30; wave += 1) later.push(waveEnemy({ ...run, wave }).policy);
  assert.ok(!later.includes("golem-brawler"), "and it does not come round again");
  assert.ok(new Set(later).size >= 5, "the cluster is drawn from, not one mind repeated");
  const other = [];
  for (let wave = 2; wave <= 10; wave += 1) other.push(waveEnemy({ ...startRun(4), wave }).policy);
  assert.notDeepEqual(other, later.slice(0, 9), "a different run is a different order");
});

test("a wave matchup says which game it is", () => {
  assert.equal(modeOf(waveMatchup(startRun(5), yours())), "waves");
  assert.equal(modeOf(defaultMatchup()), "arena", "and a matchup that says nothing is the arena");
});
