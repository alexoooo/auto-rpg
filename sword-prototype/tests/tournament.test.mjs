// The tournament harness: its pool, its schedule, its ratings, and one real run on two workers.
//
// The pure half costs milliseconds and is where the rules live: what a build class is, that a
// mirror bout rates nothing, that the schedule is a function of its seed. The real half spawns
// two worker threads, each loading Babylon and Havok, and runs four short bouts twice under one
// seed, which is the claim the whole harness stands on -- that the file a seed names is the
// same file whoever ran it and in whatever order the workers finished.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { golemSetupRefusal } from "../src/golem/build.ts";
import {
  ELO_START,
  REACH_BANDS,
  REFERENCE_BUILDS,
  TOURNAMENT_VERSION,
  armedTerminal,
  buildClass,
  buildPool,
  elo,
  formatSummary,
  parseOverrides,
  policyPairs,
  readRows,
  reachBand,
  runTournament,
  scheduleJobs,
  summarize,
} from "../scripts/tournament.mjs";

const SEED = 20260906;

test("the_reference_pool_is_a_dozen_named_builds_the_registry_accepts", () => {
  assert.equal(REFERENCE_BUILDS.length, 12);
  const names = REFERENCE_BUILDS.map((build) => build.name);
  assert.equal(new Set(names).size, names.length, "names are unique");
  for (const build of REFERENCE_BUILDS) {
    assert.equal(golemSetupRefusal(build.setup), null, build.name);
  }
  // The four weapons of the matchup set and the one-slot moves are all in it.
  for (const name of ["default", "mace", "maul", "whip", "fists", "ram-capped", "wheel", "multileg", "plated"]) {
    assert.ok(names.includes(name), name);
  }
});

test("the_pool_is_the_reference_builds_plus_seeded_draws_and_repeats_under_its_seed", () => {
  const pool = buildPool({ seed: SEED, random: 6 });
  assert.equal(pool.length, REFERENCE_BUILDS.length + 6);
  assert.deepEqual(pool.slice(0, REFERENCE_BUILDS.length).map((build) => build.name), REFERENCE_BUILDS.map((build) => build.name));
  for (const build of pool) {
    assert.equal(golemSetupRefusal(build.setup), null, build.name);
    assert.equal(typeof build.caption, "string");
  }
  assert.deepEqual(buildPool({ seed: SEED, random: 6 }), pool);
  assert.notDeepEqual(buildPool({ seed: SEED + 1, random: 6 }).slice(-6), pool.slice(-6));
});

test("the_schedule_runs_every_pairing_side_swapped_with_the_seeds_swapped_and_cycles_the_policy_pairs", () => {
  const pool = buildPool({ seed: SEED, random: 4 });
  const jobs = scheduleJobs({ pool, policies: ["golem-duelist", "idle"], pairings: 6, seed: SEED, cap: 30 });
  assert.equal(jobs.length, 12);
  assert.deepEqual(policyPairs(["golem-duelist", "idle"]),
    [["golem-duelist", "golem-duelist"], ["golem-duelist", "idle"], ["idle", "golem-duelist"], ["idle", "idle"]]);
  for (let i = 0; i < jobs.length; i += 2) {
    const [a, b] = [jobs[i], jobs[i + 1]];
    assert.equal(a.index, i);
    assert.equal(b.index, i + 1);
    assert.equal(a.pairing, b.pairing);
    assert.equal(a.swapped, false);
    assert.equal(b.swapped, true);
    assert.deepEqual(b.left, a.right);
    assert.deepEqual(b.right, a.left);
    assert.deepEqual(b.seeds, [a.seeds[1], a.seeds[0]]);
    assert.notEqual(a.seeds[0], a.seeds[1], "two sides never share a stream");
    assert.equal(a.cap, 30);
  }
  // Pairing p wears policy pair p mod 4.
  assert.deepEqual([jobs[0].left.policy, jobs[0].right.policy], ["golem-duelist", "golem-duelist"]);
  assert.deepEqual([jobs[2].left.policy, jobs[2].right.policy], ["golem-duelist", "idle"]);
  assert.deepEqual([jobs[4].left.policy, jobs[4].right.policy], ["idle", "golem-duelist"]);
  assert.deepEqual([jobs[6].left.policy, jobs[6].right.policy], ["idle", "idle"]);
  assert.deepEqual([jobs[8].left.policy, jobs[8].right.policy], ["golem-duelist", "golem-duelist"]);
  // Every build named is one the pool has, and the same seed schedules the same jobs.
  for (const job of jobs) {
    for (const side of [job.left, job.right]) assert.ok(pool.some((build) => build.name === side.build), side.build);
  }
  assert.deepEqual(scheduleJobs({ pool, policies: ["golem-duelist", "idle"], pairings: 6, seed: SEED, cap: 30 }), jobs);
  assert.throws(() => scheduleJobs({ pool, policies: ["duelist"], pairings: 1, seed: SEED, cap: 30 }),
    /not a policy the golem offers/);
});

test("a_build_class_is_the_armed_terminal_crossed_with_the_reach_band_the_hand_was_published_at", () => {
  assert.deepEqual(REACH_BANDS.map((band) => band.name), ["short", "mid", "long"]);
  assert.equal(reachBand(0.24), "short");
  assert.equal(reachBand(0.999), "short");
  assert.equal(reachBand(1.0), "mid");
  assert.equal(reachBand(1.16), "mid");
  assert.equal(reachBand(1.78), "long");
  assert.equal(reachBand(2.07), "long");
  const blade = REFERENCE_BUILDS.find((build) => build.name === "default").setup;
  assert.equal(armedTerminal(blade), "blade");
  assert.equal(buildClass({ setup: blade, reach: 1.78 }), "blade/long");
  // A capped primary fights with its secondary, and is classed by it.
  const capped = { ...blade, primary: { chain: "none", terminal: "none" }, secondary: { chain: "wrist", terminal: "whip" } };
  assert.equal(armedTerminal(capped), "whip");
  assert.equal(buildClass({ setup: capped, reach: 2.07 }), "whip/long");
  const none = REFERENCE_BUILDS.find((build) => build.name === "ram-capped").setup;
  assert.equal(buildClass({ setup: none, reach: 0.24 }), "none/short");
});

/** A synthetic row: two policies on the default build, decided as `winner`. */
const row = (index, leftPolicy, rightPolicy, winner, over = {}) => {
  const blade = REFERENCE_BUILDS[0].setup;
  const side = (policy) => ({
    policy, build: "default", setup: blade, seed: 1, damage: 50, contacts: 100, severs: 0, blocks: 0,
    vitality: winner === null ? 0.5 : 0.6, reach: 1.78, bodyReach: 1.78, insideInner: 0, peakTipDriven: 20,
  });
  return { index, pairing: Math.floor(index / 2), swapped: index % 2 === 1, winner, ending: winner === null ? "time" : "exhausted",
    seconds: 30, leadChanges: 1, firstLeader: "left", left: side(leftPolicy), right: side(rightPolicy), ...over };
};

test("elo_moves_on_a_decided_bout_between_two_entities_and_not_at_all_on_a_mirror", () => {
  const rows = [
    row(0, "a", "b", "left"),
    row(1, "b", "a", "right"),
    row(2, "a", "a", "left"),
    row(3, "b", "b", null),
  ];
  const table = elo(rows, (side) => side.policy);
  const a = table.find((entry) => entry.name === "a");
  const b = table.find((entry) => entry.name === "b");
  assert.ok(a.rating > ELO_START && b.rating < ELO_START, `a ${a.rating}, b ${b.rating}`);
  assert.equal(a.rating - ELO_START, ELO_START - b.rating, "zero-sum");
  assert.deepEqual([a.bouts, a.wins, a.draws, a.losses], [4, 3, 0, 1], "a mirror bout counts for both of its sides");
  assert.deepEqual([b.bouts, b.wins, b.draws, b.losses], [4, 0, 2, 2]);
  // The same rows with the mirrors alone rate nothing.
  const still = elo(rows.filter((r) => r.left.policy === r.right.policy), (side) => side.policy);
  for (const entry of still) assert.equal(entry.rating, ELO_START);
  // Order of arrival does not matter: the walk is by index.
  assert.deepEqual(elo([...rows].reverse(), (side) => side.policy), table);
});

test("the_summary_carries_a_policy_matrix_and_the_structural_columns_beside_every_rating", () => {
  const rows = [row(0, "a", "b", "left"), row(1, "b", "a", null), row(2, "a", "a", "right"), row(3, "a", "a", "left")];
  const summary = summarize(rows);
  assert.equal(summary.bouts, 4);
  assert.equal(summary.decided, 3);
  assert.deepEqual(summary.policies, ["a", "b"]);
  // a beat b once and drew once: 1.5 of 2 for the row a, 0.5 of 2 for the row b.
  assert.deepEqual(summary.matrix[0][1], { wins: 1.5, bouts: 2 });
  assert.deepEqual(summary.matrix[1][0], { wins: 0.5, bouts: 2 });
  assert.deepEqual(summary.matrix[0][0], { wins: 2, bouts: 4 }, "a mirror is two sides, one of which won");
  const a = summary.byPolicy.find((entry) => entry.name === "a");
  assert.equal(a.bouts, 6);
  assert.equal(a.damage, 50);
  assert.equal(a.contacts, 100);
  assert.equal(a.winnerBar, 0.6);
  assert.equal(a.leadChanged, 1);
  assert.equal(a.seconds, 30);
  assert.deepEqual(summary.byClass.map((entry) => entry.name).sort(), ["a @ blade/long", "b @ blade/long"]);
  const text = formatSummary(summary);
  assert.match(text, /=== policies -- 4 bouts, 3 decided ===/);
  assert.match(text, /=== policy against policy/);
  assert.match(text, /a @ blade\/long/);
});

test("two_workers_over_four_short_bouts_twice_write_the_same_rows_under_one_seed", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sword-tournament-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const run = (name) => runTournament({
    seed: SEED, bouts: 4, workers: 2, policies: ["golem-duelist"], random: 2, cap: 6, out: join(dir, name),
  });
  const first = await run("first.jsonl");
  const second = await run("second.jsonl");
  assert.equal(first.rows.length, 4);
  for (const [index, r] of first.rows.entries()) {
    assert.equal(r.index, index, "rows come back in index order whatever order the workers finished in");
    assert.ok(["left", "right", null].includes(r.winner));
    assert.ok(r.seconds > 0 && r.seconds <= 7, `seconds ${r.seconds}`);
    for (const side of [r.left, r.right]) {
      assert.equal(side.policy, "golem-duelist");
      assert.ok(side.reach > 0 && side.bodyReach > 0, "the armed hand's reach was read off the view");
      for (const column of ["damage", "contacts", "severs", "vitality", "insideInner", "peakTipDriven"]) {
        assert.equal(typeof side[column], "number", column);
        assert.ok(Number.isFinite(side[column]), column);
      }
      assert.ok(side.vitality >= 0 && side.vitality <= 1);
      assert.ok(side.insideInner >= 0 && side.insideInner <= 1);
    }
    assert.ok(Number.isInteger(r.leadChanges) && r.leadChanges >= 0);
  }
  assert.deepEqual(second.rows, first.rows, "the same seed gives the same rows to the byte");
  // The file is the header and then the rows, in order, and reads back under its version.
  const back = readRows(join(dir, "first.jsonl"));
  assert.equal(back.header.version, TOURNAMENT_VERSION);
  assert.equal(back.header.seed, SEED);
  assert.equal(back.header.pool.length, REFERENCE_BUILDS.length + 2);
  assert.deepEqual(back.rows, first.rows);
  const firstText = readFileSync(join(dir, "first.jsonl"), "utf8").split("\n").slice(1);
  const secondText = readFileSync(join(dir, "second.jsonl"), "utf8").split("\n").slice(1);
  assert.deepEqual(secondText, firstText, "the two files differ in their header's date and nowhere else");
  // And a rating row per policy and per class stands at the end of it.
  assert.equal(first.summary.byPolicy.length, 1);
  assert.equal(first.summary.byPolicy[0].name, "golem-duelist");
  assert.equal(first.summary.byPolicy[0].bouts, 8);
  assert.ok(first.summary.byClass.length >= 1);
  for (const entry of first.summary.byClass) assert.match(entry.name, /^golem-duelist @ \w+\/(short|mid|long)$/);
});

test("cross_drops_the_mirror_pairs_and_mirror_puts_one_build_on_both_sides", () => {
  const pool = buildPool({ seed: SEED, random: 3 });
  const policies = ["golem-duelist", "golem-fencer"];
  const plain = scheduleJobs({ pool, policies, pairings: 8, seed: SEED, cap: 30 });
  const cross = scheduleJobs({ pool, policies, pairings: 8, seed: SEED, cap: 30, cross: true });
  assert.ok(plain.some((job) => job.left.policy === job.right.policy), "a plain schedule has mirror-policy bouts");
  assert.ok(cross.every((job) => job.left.policy !== job.right.policy), "a cross schedule has none");
  assert.equal(cross.length, 16, "cross spends the same budget");
  assert.throws(() => scheduleJobs({ pool, policies: ["golem-duelist"], pairings: 2, seed: SEED, cap: 30, cross: true }), /at least two/);
  const mirror = scheduleJobs({ pool, policies, pairings: 8, seed: SEED, cap: 30, cross: true, mirror: true });
  assert.ok(mirror.every((job) => job.left.build === job.right.build), "one build on both sides of every bout");
  assert.ok(plain.some((job) => job.left.build !== job.right.build), "which a plain schedule does not do");
  // The mirror run draws the same first build per pairing the plain run did: the second draw
  // is made and discarded, so one seed names one walk through the pool whichever flags are on.
  // (The odd jobs are the side-swapped halves, whose left is the other draw.)
  const firsts = (jobs) => jobs.filter((_, index) => index % 2 === 0).map((job) => job.left.build);
  assert.deepEqual(firsts(mirror), firsts(cross));
  assert.ok(new Set(mirror.map((job) => job.left.build)).size > 1, "and the builds still vary bout to bout");
});

test("overrides_are_name_value_pairs_the_worker_applies_to_the_fencer_and_refuses_when_unknown", async (t) => {
  assert.equal(parseOverrides(""), null);
  assert.deepEqual(parseOverrides("comboFraction=0, stopHit=false,readSeconds=0.1,voidDuringCommit=true"), {
    comboFraction: 0, stopHit: false, readSeconds: 0.1, voidDuringCommit: true,
  });
  assert.throws(() => parseOverrides("comboFraction"), /name=value/);
  assert.throws(() => parseOverrides("comboFraction=lots"), /neither a number/);
  const dir = mkdtempSync(join(tmpdir(), "sword-tournament-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const run = (name, overrides) => runTournament({
    seed: SEED, bouts: 4, workers: 2, policies: ["golem-duelist", "golem-fencer"], random: 2, cap: 4,
    out: join(dir, name), overrides, cross: true, mirror: true,
  });
  const result = await run("overridden.jsonl", { comboFraction: 0 });
  assert.equal(result.rows.length, 4);
  for (const r of result.rows) {
    assert.notEqual(r.left.policy, r.right.policy);
    assert.equal(r.left.build, r.right.build);
  }
  const back = readRows(join(dir, "overridden.jsonl"));
  assert.deepEqual(back.header.overrides, { comboFraction: 0 }, "the header says how the fencer was overridden");
  assert.equal(back.header.cross, true);
  assert.equal(back.header.mirror, true);
  await assert.rejects(run("refused.jsonl", { noSuchRow: 1 }), /not a row of GOLEM_TACTICS_V2/);
});
