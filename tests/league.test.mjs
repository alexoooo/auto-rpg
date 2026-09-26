// The league protocol and the drill runner's schedule (skill ceiling session 03), without a bout:
// pairs, jobs and the arithmetic that reads their rows.
//
// What is held here:
// - **Every league pair is asymmetric by one body module and carries one weapon class.**
// - **Each mind keeps its own seed and its own body on either side**, and a cluster is two body
//   assignments by two sides.
// - **The figures read what they say.** A mind that wins everything scores 1 on both sides; a mirror
//   whose left corner always wins fails the side gate and one that alternates passes; a bout that
//   ran to the cap is not decided; the lead counter ignores a scratch inside its band.
// - **The drill runner's jobs carry the schedule's identity keys**, and a drill's seed does not
//   depend on which other drills are in the run.
import test from "node:test";
import assert from "node:assert/strict";

import { BODY_VARIANTS, WEAPON_CLASSES, aScore, leagueFigures, leagueJobs, leaguePairs, leagueSummary } from "../research/league.mjs";
import { LEAD_BAND, leadCounter } from "../research/league-worker.mjs";
import { drillJobs } from "../research/drills.mjs";

const MODULES = ["locomotion", "torso", "head"];

test("every_league_pair_differs_by_one_body_module_and_shares_its_weapon", () => {
  const { pairs, omitted } = leaguePairs();
  assert.ok(pairs.length >= Object.keys(WEAPON_CLASSES).length * (Object.keys(BODY_VARIANTS).length - 1));
  for (const pair of pairs) {
    const changed = MODULES.filter((m) => pair.base.setup[m] !== pair.other.setup[m]);
    assert.equal(changed.length, 1, `${pair.other.name} changes ${changed.join(", ")}`);
    assert.deepEqual(pair.base.setup.primary, pair.other.setup.primary, `${pair.other.name} keeps the weapon`);
    assert.deepEqual(pair.base.setup.secondary, pair.other.setup.secondary);
  }
  assert.deepEqual(omitted.map((o) => `${o.weaponClass}+${o.variant}`), ["ram+ram"], "the ram build already has a ram head");
});

test("each_mind_keeps_its_seed_and_its_body_on_either_side", () => {
  const { pairs } = leaguePairs(["mace"], ["plated"]);
  const jobs = leagueJobs({ a: "golem-duelist", b: "golem-walker", pairs, clusters: 2 });
  assert.equal(jobs.length, 2 * 2 * 2, "two clusters of two assignments by two sides");
  const seedOf = (job, mind) => (job.left === mind ? job.seeds[0] : job.seeds[1]);
  const buildOf = (job, mind) => (job.left === mind ? job.leftBuild : job.rightBuild);
  for (const block of new Set(jobs.map((job) => job.block))) {
    const cluster = jobs.filter((job) => job.block === block);
    assert.equal(new Set(cluster.map((job) => seedOf(job, "golem-duelist"))).size, 1, "A's seed is one seed");
    assert.equal(new Set(cluster.map((job) => seedOf(job, "golem-walker"))).size, 1, "and B's another");
    assert.notEqual(seedOf(cluster[0], "golem-duelist"), seedOf(cluster[0], "golem-walker"));
    for (const pairKey of new Set(cluster.map((job) => job.pair))) {
      const [one, two] = cluster.filter((job) => job.pair === pairKey);
      assert.notEqual(one.aSide, two.aSide, "a pair is one bout with A on each side");
      assert.equal(buildOf(one, "golem-duelist"), buildOf(two, "golem-duelist"), "and A's body goes with it");
    }
    assert.equal(new Set(cluster.map((job) => buildOf(job, "golem-duelist"))).size, 2, "both body assignments");
  }
  assert.equal(new Set(jobs.map((job) => job.id)).size, jobs.length);
});

/** A league row, as the worker writes one. */
const row = ({ pair, block = pair, aSide, winner, vitality = [0.5, 0.5], ending = winner ? "exhausted" : "time",
  leadChanges = 0, falls = [0, 0], seconds = 30 }) => ({
  status: "ok", pair, block, weaponClass: "mace", aSide, winner, ending, seconds, vitality, leadChanges,
  sides: {
    left: { falls: falls[0], nearRangeStallSeconds: 1, retreatOutsideReachSeconds: 2 },
    right: { falls: falls[1], nearRangeStallSeconds: 3, retreatOutsideReachSeconds: 4 },
  },
});

test("a_mind_that_wins_everything_scores_one_on_either_side", () => {
  const rows = [];
  for (let k = 0; k < 6; k += 1) {
    rows.push(row({ pair: `p${k}`, aSide: "left", winner: "left", vitality: [0.8, 0] }));
    rows.push(row({ pair: `p${k}`, aSide: "right", winner: "right", vitality: [0, 0.6] }));
  }
  const f = leagueFigures(rows);
  assert.equal(f.score.mean, 1);
  assert.deepEqual(f.bySide, { aLeft: 1, aRight: 1 });
  assert.ok(Math.abs(f.margin.mean - 0.7) < 1e-12, "A's margin is its bar minus B's, whichever side");
  assert.equal(f.guard.decidedBeforeCap, 1);
  assert.ok(Math.abs(f.guard.winnersBar - 0.7) < 1e-12);
  // The guard columns follow the mind, not the side: A stood left in half the bouts.
  assert.equal(f.guard.nearRangeStallSeconds.a, 2);
  assert.equal(f.guard.nearRangeStallSeconds.b, 2);
  assert.equal(f.mirror.left.mean, 0.5, "and a left corner that won half its bouts is level");
});

test("a_mirror_whose_left_corner_always_wins_fails_the_side_gate", () => {
  const biased = [];
  const level = [];
  // Every bout ends at its own second, so each is a distinct bout and the band is the band of 64.
  for (let k = 0; k < 32; k += 1) {
    biased.push(row({ pair: `p${k}`, aSide: "left", winner: "left", seconds: 30 + k }),
      row({ pair: `p${k}`, aSide: "right", winner: "left", seconds: 70 + k }));
    level.push(row({ pair: `p${k}`, aSide: "left", winner: k % 2 ? "left" : "right", seconds: 30 + k }),
      row({ pair: `p${k}`, aSide: "right", winner: k % 2 ? "right" : "left", seconds: 70 + k }));
  }
  assert.equal(leagueFigures(biased).mirror.distinct, 64);
  assert.equal(leagueFigures(biased).mirror.inside, false);
  assert.equal(leagueFigures(biased).mirror.left.mean, 1);
  assert.equal(leagueFigures(level).mirror.inside, true);
  assert.equal(aScore(biased[1]), 0, "A on the right lost to the left corner");
});

test("a_mirror_s_band_counts_each_distinct_bout_once", () => {
  // Eight distinct bouts, each played eight times; six of the eight go to the left corner (75 %).
  // Counted as 64 bouts that is 25 points against a band of 12.3 and fails; the gate counts 8, whose
  // band is 34.6, and it cannot tell that from a fair coin. `sideVerdict` in `research/side-mirror.mjs`.
  const rows = [];
  for (let k = 0; k < 32; k += 1) {
    for (const aSide of ["left", "right"]) {
      const bout = (2 * k + (aSide === "left" ? 0 : 1)) % 8;
      rows.push(row({ pair: `p${k}`, aSide, winner: bout < 6 ? "left" : "right", seconds: 30 + bout }));
    }
  }
  const { mirror } = leagueFigures(rows);
  assert.equal(mirror.distinct, 8);
  assert.equal(mirror.distinctLeft, 0.75);
  assert.equal(mirror.inside, true);
  // And one decisive bout played 64 times is decided by the side, whatever a band would say.
  const one = Array.from({ length: 32 }, (_, k) => ["left", "right"].map((aSide) =>
    row({ pair: `p${k}`, aSide, winner: "right" }))).flat();
  assert.equal(leagueFigures(one).mirror.distinct, 1);
  assert.equal(leagueFigures(one).mirror.inside, false);
});

test("a_bout_that_ran_to_the_cap_is_not_decided_and_falls_count_both_bodies", () => {
  const rows = [
    row({ pair: "p", aSide: "left", winner: null, falls: [1, 2] }),
    row({ pair: "p", aSide: "right", winner: "left", falls: [0, 1] }),
  ];
  const f = leagueFigures(rows);
  assert.equal(f.guard.decidedBeforeCap, 0.5);
  assert.equal(f.guard.falls, 2);
  assert.equal(f.score.mean, 0.25, "a draw is a half and a loss is nothing");
  assert.throws(() => leagueFigures([rows[0]]), /incomplete corner-swapped pair/);
  assert.deepEqual(Object.keys(leagueSummary(rows).byClass), ["mace"], "reported by weapon class");
});

test("the_lead_counter_ignores_a_scratch_inside_its_band", () => {
  const lead = leadCounter();
  lead.feed(1, 1);
  lead.feed(0.9, 1); // right leads
  lead.feed(0.9, 0.9 + LEAD_BAND / 2); // inside the band: still right
  lead.feed(0.9, 0.9 - LEAD_BAND / 2); // inside the band the other way: still right
  assert.equal(lead.changes, 0);
  assert.equal(lead.leader, "right");
  lead.feed(0.9, 0.8); // left leads
  lead.feed(0.5, 0.8); // right again
  assert.equal(lead.changes, 2);
});

test("a_drill_job_carries_the_schedule_keys_and_a_seed_of_its_own", () => {
  const all = drillJobs({ runs: 3, build: "default", obuild: "mace" });
  const one = drillJobs({ drills: ["finish"], runs: 3, build: "default", obuild: "mace" });
  for (const job of all) {
    for (const key of ["left", "right", "leftBuild", "rightBuild", "round", "block", "seeds"]) {
      assert.ok(job[key] !== undefined, `${job.id} lacks ${key}`);
    }
  }
  const finish = all.filter((job) => job.drill === "finish");
  assert.deepEqual(finish.map((job) => job.seeds), one.map((job) => job.seeds), "a drill's seeds are its own");
  assert.equal(new Set(all.map((job) => job.seeds[0])).size, all.length);
  assert.equal(new Set(all.map((job) => job.id)).size, all.length);
});
