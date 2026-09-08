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
import { DUEL_OPTIONS, fitDuelModel } from "../src/golem/duel-model.ts";
import { STYLE_OPTIONS, exploringDirector } from "../src/golem/tactics-v3.ts";
import { STYLE_FEATURE_COUNT } from "../src/golem/style-features.ts";
import { DUEL_MODEL_TABLES } from "../src/golem/duel-model-tables.ts";
import { DUEL_NAMING, collectRecords, pruneTransitions, renderTablesModule } from "../scripts/calibrate-duel-model.mjs";
import { STYLE_NAMING } from "../scripts/calibrate-style-model.mjs";
import {
  ELO_START,
  EXCHANGE_FLICKER_SECONDS,
  EXCHANGE_WINDOW_SECONDS,
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
  runJobs,
  runTournament,
  scheduleJobs,
  strokeColumns,
  strokeInstrument,
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
    strokes: 20, blows: 2.5, strokeDamage: 2.5, scoringSpeed: 7, caughtFraction: 0.25, catches: 5,
    committedFraction: 0.5, clinchSeconds: 1.5, idleTravelMetres: 8, tangentialTravelMetres: 20,
    radialClosingMetres: 6, nearRangeStallSeconds: 0.5, retreatOutsideReachSeconds: 2,
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
  assert.equal(a.blocks, 0, "blocks is a mean beside the contacts it is a fraction of");
  assert.equal(a.winnerBar, 0.6);
  assert.equal(a.leadChanged, 1);
  assert.equal(a.seconds, 30);
  assert.equal(a.blows, 2.5, "the stroke columns are means over the sides beside the ratings");
  assert.equal(a.caughtFraction, 0.25);
  assert.equal(a.catches, 5);
  assert.equal(a.idleTravelMetres, 8);
  assert.deepEqual(summary.byClass.map((entry) => entry.name).sort(), ["a @ blade/long", "b @ blade/long"]);
  const text = formatSummary(summary);
  assert.match(text, /=== policies -- 4 bouts, 3 decided ===/);
  assert.match(text, /=== policy against policy/);
  assert.match(text, /a @ blade\/long/);
  assert.match(text, /=== policies, by the stroke/);
  assert.match(text, /=== policy by build class, by the stroke ===/);
  assert.match(text, /dmg\/stroke/);
});

test("a_file_written_before_the_stroke_columns_existed_still_summarises_and_prints_them_as_dashes", () => {
  // The columns went on without a `TOURNAMENT_VERSION` bump, on the `arm` precedent, so
  // `--read` of a tournament from the matchup set has to answer with what that file holds
  // rather than with zeroes nobody measured.
  const strip = (side) => {
    const older = { ...side };
    for (const column of ["strokes", "blows", "strokeDamage", "scoringSpeed", "caughtFraction", "catches",
      "committedFraction", "clinchSeconds", "idleTravelMetres", "tangentialTravelMetres",
      "radialClosingMetres", "nearRangeStallSeconds", "retreatOutsideReachSeconds"]) delete older[column];
    return older;
  };
  const fresh = row(0, "a", "b", "left");
  const older = { ...fresh, left: strip(fresh.left), right: strip(fresh.right) };
  const summary = summarize([older]);
  const a = summary.byPolicy.find((entry) => entry.name === "a");
  assert.equal(a.damage, 50, "the columns the older file does carry are summarised as they were");
  assert.equal(a.blows, undefined, "and one it does not is not invented");
  assert.equal(a.clinchSeconds, undefined);
  const text = formatSummary(summary);
  assert.match(text, /=== policies, by the stroke/);
  assert.match(text, /a {19}\s+--\s+--\s+--/, "an absent column prints as a dash");
});

test("a_burst_on_one_effector_is_one_stroke_and_its_scoring_blow_says_where_the_stroke_landed", () => {
  // The rake this instrument exists to see: one pass of one blade booking three contacts on the
  // per-part cooldown, then the other hand landing one of its own well after the window.
  const instrument = strokeInstrument();
  const blow = (effectorId, at, damage, key, speed) =>
    instrument.event({ effectorId, hand: null, blocked: false, report: { at, damage, key, speed, kind: "clean" } });
  instrument.posture(0.4, 0);
  blow("left.primary", 1.00, 0.3, "x.golem.trunk.core", 6);
  blow("left.primary", 1.09, 0.9, "x.golem.trunk.core", 8);
  blow("left.primary", 1.18, 0.2, "x.golem.trunk.waist", 7);
  instrument.posture(0, 0);
  blow("left.secondary", 1.58, 0.4, "x.golem.secondary.plate", 4);
  const strokes = instrument.close();
  assert.equal(strokes.length, 2, "three contacts inside the window are one stroke, the other hand is another");
  assert.equal(strokes[0].blows, 3);
  assert.ok(Math.abs(strokes[0].damage - 1.4) < 1e-9);
  assert.equal(strokes[0].key, "x.golem.trunk.core", "the scoring blow is the one that did the damage");
  assert.equal(strokes[0].speed, 8);
  assert.equal(strokes[0].caught, false, "a trunk is not a hand slot");
  assert.equal(strokes[0].committed, true, "the body was leaning into it");
  assert.equal(strokes[1].blows, 1);
  assert.equal(strokes[1].caught, true, "a blow on a hand slot is one the other body caught");
  assert.equal(strokes[1].committed, false);
  const columns = strokeColumns(strokes);
  assert.equal(columns.strokes, 2);
  assert.equal(columns.blows, 2);
  assert.ok(Math.abs(columns.strokeDamage - 0.9) < 1e-9);
  assert.equal(columns.scoringSpeed, 6);
  assert.equal(columns.caughtFraction, 0.5);
  assert.equal(columns.committedFraction, 0.5);
  // The window is a gap between contacts, not a length: a burst that keeps landing keeps the
  // stroke open, and the first quiet quarter second ends it.
  const second = strokeInstrument();
  const long = (at) => second.event({ effectorId: "e", hand: null, blocked: false,
    report: { at, damage: 1, key: "x.golem.trunk.core", speed: 5, kind: "clean" } });
  for (const at of [0, 0.2, 0.4, 0.6]) long(at);
  long(1.0);
  assert.deepEqual(second.close().map((stroke) => stroke.blows), [4, 1]);
  assert.deepEqual(strokeColumns([]), { strokes: 0, blows: 0, strokeDamage: 0, scoringSpeed: 0,
    caughtFraction: 0, committedFraction: 0 }, "a side that never swung is zero, not a division by none");
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
      for (const column of ["damage", "contacts", "severs", "vitality", "insideInner", "peakTipDriven",
        "strokes", "blows", "strokeDamage", "scoringSpeed", "caughtFraction", "catches",
        "committedFraction", "clinchSeconds", "idleTravelMetres", "tangentialTravelMetres",
        "radialClosingMetres", "nearRangeStallSeconds", "retreatOutsideReachSeconds"]) {
        assert.equal(typeof side[column], "number", column);
        assert.ok(Number.isFinite(side[column]), column);
      }
      assert.ok(side.vitality >= 0 && side.vitality <= 1);
      assert.ok(side.insideInner >= 0 && side.insideInner <= 1);
      assert.ok(Number.isInteger(side.strokes) && side.strokes >= 0, "strokes is a count");
      assert.ok(side.caughtFraction >= 0 && side.caughtFraction <= 1);
      assert.ok(side.committedFraction >= 0 && side.committedFraction <= 1);
      assert.ok(side.blows === 0 || side.blows >= 1, "a stroke that exists booked at least one blow");
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

/**
 * `body.` is the prefix that reaches the assembly rather than a mind, and the thing worth
 * asserting is that it *arrives*: a golem built under `body.healthScale` half of the shipped one
 * has to take visibly more damage over the same four seconds, on the same seed, against the same
 * opponent, or the flag is decoration.
 *
 * Session 11 of the style set added it because the two rows that decide whether a bout can be
 * won -- `healthScale` and `vitalityTotal` -- were reachable only by editing the file, and a
 * constant that cannot be swept from the harness is a constant chosen by argument. The refusal is
 * asserted beside it for the same reason every other refusal in this file is: a misspelled row
 * that silently does nothing would read exactly like a row that does nothing.
 */
test("the_body_prefix_reaches_the_assembly_and_a_thinner_bar_takes_more_of_it", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sword-tournament-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const run = (name, overrides) => runTournament({
    seed: SEED, bouts: 4, workers: 2, policies: ["golem-fencer"], random: 2, cap: 4,
    out: join(dir, name), overrides, mirror: true,
  });
  const shipped = await run("shipped.jsonl", null);
  const thin = await run("thin.jsonl", { "body.healthScale": 0.05 });
  const bar = (result) => result.rows.reduce((sum, r) => sum + r.left.vitality + r.right.vitality, 0)
    / (2 * result.rows.length);
  assert.ok(bar(thin) < bar(shipped) - 0.02,
    `a fifth of the health should cost visibly more bar: ${bar(thin)} against ${bar(shipped)}`);
  const back = readRows(join(dir, "thin.jsonl"));
  assert.deepEqual(back.header.overrides, { "body.healthScale": 0.05 }, "the header says how the body was built");
  await assert.rejects(run("refused-body.jsonl", { "body.noSuchRow": 1 }), /not a row of GOLEM_ASSEMBLY/);
});

/**
 * `--exchanges` puts the fencer's option windows on every row: per side, the state each window
 * began in, the option, what was dealt and taken while it ran, how long, and the state it
 * ended in, cut at the window cap. The duelist has no options and logs nothing, which the row
 * says with a null rather than an empty list. These rows are what the duel model is fitted from,
 * and the fit is what the calibration script reads out of them.
 */
test("exchanges_puts_the_fencers_option_windows_on_every_row_and_the_model_fits_from_them", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sword-tournament-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = await runTournament({
    seed: SEED, bouts: 4, workers: 2, policies: ["golem-duelist", "golem-fencer"], random: 2, cap: 4,
    out: join(dir, "logged.jsonl"), cross: true, exchanges: true,
  });
  const back = readRows(join(dir, "logged.jsonl"));
  assert.equal(back.header.exchanges, true);
  assert.equal(result.rows.length, 4);
  let windows = 0;
  for (const row of back.rows) {
    for (const side of ["left", "right"]) {
      const log = row.exchanges[side];
      if (row[side].policy === "golem-duelist") { assert.equal(log, null); continue; }
      assert.ok(Array.isArray(log) && log.length > 0, `a fencer row with no windows on the ${side}`);
      for (const w of log) {
        assert.ok(DUEL_OPTIONS.includes(w.option), `${w.option} is not an option`);
        assert.match(w.state, /^(nn|hn|nh|hh)\/(out|theirs|mine|both)\/(idle|chamber|commit|recover)\/(free|exchange|recover)$/);
        assert.match(w.next, /^(nn|hn|nh|hh)\//);
        // The bout's end closes the last window short; every other one is at least a flicker
        // long, and a free option's is at most the cap and a frame (the sample runs at the frame
        // rate, not the step). An exchange runs to its end.
        assert.ok(w.seconds > 0, `a window of ${w.seconds} s`);
        if (["hold", "close", "withdraw", "circle"].includes(w.option)) {
          assert.ok(w.seconds <= EXCHANGE_WINDOW_SECONDS + 1 / 60 + 1e-6, `a ${w.option} window of ${w.seconds} s`);
        }
        if (w !== log[log.length - 1]) assert.ok(w.seconds >= EXCHANGE_FLICKER_SECONDS - 1e-9, `a flicker of ${w.seconds} s was kept`);
        assert.ok(w.dealt >= 0 && w.taken >= 0);
        windows += 1;
      }
    }
  }
  assert.ok(windows >= 4 * 4 / EXCHANGE_WINDOW_SECONDS / 4, `${windows} windows over four 4 s bouts`);
  const { records, bouts, skipped } = collectRecords([join(dir, "logged.jsonl")]);
  assert.equal(records.length, windows);
  assert.equal(bouts, 4);
  assert.equal(skipped, 0);
  const tables = fitDuelModel(records, { seed: SEED, date: "2026-09-06", bouts, windowSeconds: EXCHANGE_WINDOW_SECONDS });
  assert.equal(tables.records, windows);
  tables.transitions = pruneTransitions(tables.transitions, 2);
  for (const row of Object.values(tables.transitions)) for (const n of Object.values(row)) assert.ok(n >= 2);
  const text = renderTablesModule(tables, { sources: ["logged.jsonl"], prune: 2 });
  assert.match(text, /^\/\/ GENERATED by scripts\/calibrate-duel-model\.mjs/);
  assert.match(text, /export const DUEL_MODEL_TABLES: DuelModelTables = \{"version":1,/);
  // A row without a log is counted, not fitted.
  const plain = await runTournament({
    seed: SEED, bouts: 2, workers: 2, policies: ["golem-fencer"], random: 2, cap: 4, out: join(dir, "plain.jsonl"),
  });
  assert.equal(plain.rows[0].exchanges, undefined);
  assert.equal(collectRecords([join(dir, "plain.jsonl")]).skipped, 2);
});

/**
 * The refactor's one load-bearing claim: the shipped v2 tables still render to the byte.
 *
 * Session 09 parametrised `renderTablesModule` and the fit over a `ModelVocabulary` so that one
 * dynamic program serves the duel model's eight options and the style model's fifteen. The
 * frozen choice of the set is that v2 does not move, and the honest test of that is not that the
 * refactored code runs -- it is that the artifact checked in before the refactor is exactly what
 * the refactored renderer produces from it now.
 *
 * Rendering the shipped tables object rather than re-fitting from a log is deliberate: the log
 * lives in `tournaments/`, which is not in the repository, so a test that re-fitted would pass
 * only on the machine that happened to still have it. What this pins is the renderer, the
 * default naming and the field order of the tables type, which is the part a later session can
 * break without noticing.
 */
test("the_shipped_duel_tables_are_what_the_parametrised_renderer_writes", () => {
  const text = renderTablesModule(DUEL_MODEL_TABLES, {
    sources: ["tournaments/calib3-20260907-random.jsonl", "tournaments/calib3-20260907-mirror.jsonl"],
    prune: 10,
  });
  const disk = readFileSync(new URL("../src/golem/duel-model-tables.ts", import.meta.url), "utf8");
  assert.equal(text.length, disk.length, "the rendered module changed length");
  assert.equal(text, disk, "the parametrised renderer no longer reproduces the shipped v2 tables");
  // The naming the default vocabulary carries, so a wrong `naming` cannot pass by luck.
  assert.equal(DUEL_NAMING.constant, "DUEL_MODEL_TABLES");
  assert.equal(STYLE_NAMING.constant, "STYLE_MODEL_TABLES");
  assert.notEqual(DUEL_NAMING.script, STYLE_NAMING.script);
});

/**
 * The decision log, on a real run over two workers. Session 08 of the style set.
 *
 * The claim that matters is the telescoping one: a side's rewards are the damage the two bars
 * took between one ask and the next, and every close reads the same two numbers the next open
 * records, so their sum over a bout is the bar margin the row reports. If that identity ever
 * breaks -- a window opened without being closed, a close reading a stale vitality -- then every
 * value fitted to this log in Sessions 09 and 10 is fitted to a reward that is not the score,
 * which is the one failure that would not show up as anything but a slightly worse mind.
 *
 * The rest is shape: one decision a row across all seven columns, a taken option that was open,
 * exactly one decision marked the side's last, positive durations, an exchange window longer
 * than the cadence because the executor is not interruptible inside one, and the windows tiling
 * the bout from the first ask to the last sample.
 */
test("a_recorded_style_logs_one_decision_an_ask_and_its_rewards_telescope_to_the_bar_margin", { timeout: 300_000 }, async () => {
  const pool = buildPool({ seed: SEED, random: 0 }).filter((build) => build.name === "default" || build.name === "mace");
  assert.equal(pool.length, 2);
  const jobs = scheduleJobs({
    pool, policies: ["golem-brawler", "golem-fencer"], pairings: 2, seed: SEED, cap: 3, mirror: true,
  });
  const rows = await runJobs(jobs, { workers: 2, record: ["golem-brawler"] });
  assert.equal(rows.length, 4);
  let decisions = 0;
  for (const row of rows) {
    for (const [me, them] of [["left", "right"], ["right", "left"]]) {
      const pack = row.samples[me];
      if (row[me].policy !== "golem-brawler") { assert.equal(pack, null, "an unrecorded side wrote a log"); continue; }
      assert.equal(pack.kind, "style");
      const count = pack.y.length;
      assert.ok(count > 8, `${count} decisions in a three-second bout`);
      assert.equal(pack.x.length, count * STYLE_FEATURE_COUNT);
      for (const column of ["open", "dealt", "taken", "seconds", "done"]) {
        assert.equal(pack[column].length, count, `${column} is not one a decision`);
      }
      let sum = 0;
      let ended = 0;
      let elapsed = 0;
      for (let i = 0; i < count; i += 1) {
        const option = STYLE_OPTIONS[pack.y[i]];
        assert.ok(option !== undefined, `decision ${i} took option ${pack.y[i]}`);
        assert.ok((pack.open[i] >> pack.y[i] & 1) === 1, `decision ${i} took ${option}, which was not open`);
        // Never negative, and zero is legal: the clock a view carries advances a rendered frame
        // at a time while the executor is stepped four times a frame, so two asks in one frame --
        // the cadence and then an event on their phase turning -- are zero seconds apart. The cap
        // closes the last decision wherever it stands, so that is the one window that may also be
        // shorter than the cadence.
        const last = pack.done[i] === 1;
        assert.ok(pack.seconds[i] >= 0, `decision ${i} ran ${pack.seconds[i]} s`);
        if (!last && ["strike", "cut", "thrust", "feint", "shove", "ram"].includes(option)) {
          assert.ok(pack.seconds[i] > 0.167, `a ${option} was asked again after ${pack.seconds[i]} s, inside the cadence`);
        }
        sum += pack.dealt[i] - pack.taken[i];
        elapsed += pack.seconds[i];
        ended += pack.done[i];
      }
      assert.equal(ended, 1, `${ended} decisions were marked the side's last`);
      assert.equal(pack.done[count - 1], 1, "the last decision is not the one marked done");
      assert.ok(Math.abs(sum - pack.margin) < 1e-9,
        `the rewards sum to ${sum} and the side's margin is ${pack.margin}`);
      assert.ok(Math.abs(pack.margin - (row[me].vitality - row[them].vitality)) < 1e-9,
        "the pack's margin is not the row's");
      assert.equal(pack.winner, row.winner);
      assert.ok(Math.abs(elapsed - row.seconds) < 0.1,
        `the windows cover ${elapsed} s of a ${row.seconds} s bout`);
      decisions += count;
    }
  }
  assert.ok(decisions > 48, `${decisions} decisions over four three-second bouts`);
  // And a run that records at explore 0 is the run that would have happened with no recorder.
  const plain = await runJobs(jobs, { workers: 2 });
  assert.deepEqual(plain.map((row) => ({ ...row, samples: undefined })),
    rows.map((row) => ({ ...row, samples: undefined })),
    "recording moved a bout");
});

/**
 * The other half of the recording apparatus: the wrapper that makes a director answer at random
 * some of the time, so the log has rows for options the style never names.
 *
 * At zero it is not a wrapper at all -- the director itself comes back, which is what makes "a
 * recorded run at explore 0 is the shipped mind to the byte" a fact about the object graph rather
 * than a hope about a random stream. At one every answer is drawn from what is open, which is the
 * property the log depends on: an exploring ask must still be an ask the body could have played,
 * or the reward attached to it is the reward of something that never happened.
 */
test("exploring_at_zero_is_the_director_itself_and_at_one_never_names_a_closed_option", () => {
  // A director with a will of its own: it always wants the one option that is never open here.
  let asked = 0;
  const stubborn = () => { asked += 1; return "ram"; };
  assert.equal(exploringDirector(stubborn, 0, 7), stubborn, "explore 0 wrapped the director");
  assert.equal(exploringDirector(stubborn, -1, 7), stubborn, "a negative fraction is not an exploration");
  const open = ["hold", "close", "circle", "strike", "shove"];
  const explored = exploringDirector(stubborn, 1, 7);
  const named = new Set();
  for (let i = 0; i < 400; i += 1) {
    const answer = explored(open, null, null);
    assert.ok(open.includes(answer), `${answer} was not open`);
    named.add(answer);
  }
  assert.equal(asked, 400, "the director is asked on an exploring ask too, so its own stream walks the same way");
  assert.deepEqual([...named].sort(), [...open].sort(), "the draw never reached some of the open options");
  // Half the time, at a half: the wrapper's own stream, not the director's.
  let kept = 0;
  const half = exploringDirector(stubborn, 0.5, 11);
  for (let i = 0; i < 400; i += 1) if (half(["ram", "hold", "close"], null, null) === "ram") kept += 1;
  assert.ok(kept > 200 && kept < 320, `${kept} of 400 asks kept the director's answer`);
  // Every option a style may name has a bit in the mask and a column in the features.
  assert.equal(STYLE_OPTIONS.length, 15);
  assert.ok(STYLE_FEATURE_COUNT > STYLE_OPTIONS.length);
});

/**
 * The exchange log over the third executor. Session 08 of the style set.
 *
 * The log was written for the fencer and reads the option in force off `mind.fencer`; a style
 * publishes the same thing under `mind.styled`, because the two executors have different option
 * vocabularies and a log that called both `fencer` would be a log in which `cut` and `strike`
 * were the same column. What this asks is that the windows come out at all, that they are named
 * in the style's own fifteen, and that the four acts Session 08 added to the free set are cut at
 * the cap rather than run on as exchanges.
 */
test("the_exchange_log_reads_a_styled_mind_and_files_the_option_names_that_style_uses", { timeout: 300_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sword-tournament-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = await runTournament({
    seed: SEED, bouts: 4, workers: 2, policies: ["golem-form", "golem-brawler"], random: 2, cap: 4,
    out: join(dir, "styled.jsonl"), cross: true, exchanges: true,
  });
  assert.equal(result.rows.length, 4);
  let windows = 0;
  const named = new Set();
  for (const row of result.rows) {
    for (const side of ["left", "right"]) {
      const log = row.exchanges[side];
      assert.ok(Array.isArray(log) && log.length > 0, `a styled row with no windows on the ${side}`);
      for (const w of log) {
        assert.ok(STYLE_OPTIONS.includes(w.option), `${w.option} is not a style option`);
        // Five segments and not four: a styled side's window is keyed by the style model's
        // state, which carries the reach pair in front of the gap band. Session 09.
        assert.match(w.state, /^(nn|hn|nh|hh)\/(shorter|equal|longer)\/(out|theirs|mine|both)\/(idle|chamber|commit|recover)\/(free|exchange|recover)$/);
        // The bout's end closes the last window where it stands, and the clock a sample carries
        // advances a frame at a time, so a window opened in the frame the cap fell is zero long.
        assert.ok(w === log[log.length - 1] ? w.seconds >= 0 : w.seconds > 0, `a window of ${w.seconds} s`);
        if (["hold", "close", "withdraw", "circle", "void", "retreat", "parry"].includes(w.option)) {
          assert.ok(w.seconds <= EXCHANGE_WINDOW_SECONDS + 1 / 60 + 1e-6, `a ${w.option} window of ${w.seconds} s`);
        }
        named.add(w.option);
        windows += 1;
      }
    }
  }
  assert.ok(windows > 40, `${windows} windows over four four-second bouts`);
  assert.ok(named.size >= 3, `only ${[...named].join(", ")} were ever in force`);
});
