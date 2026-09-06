// The tuner: its genome, its mutation, one real generation on two workers, and the table it
// writes. Session 07 of the matchup set.
//
// The pure half is the search's arithmetic and costs milliseconds; the real half spawns two
// workers for a census, a generation of one parent and one child against a league of one, and
// a confirmation run, all on three-second bouts over two builds. The claim is that a seed names
// the same child, that every child stays inside its bounds, and that what comes out the far end
// is a table the champion mind loads.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CHAMPION_VERSION, NO_CHAMPIONS, checkChampions, championTactics } from "../src/golem/champion.ts";
import { GOLEM_PLANNER } from "../src/golem/planner.ts";
import { GOLEM_TACTICS_V2 } from "../src/golem/tactics-v2.ts";
import { STROKE_SHAPES } from "../src/golem/tactics.ts";
import { mulberry32 } from "../src/rng.ts";
import { buildPool, scheduleJobs } from "../scripts/tournament.mjs";
import {
  DEFAULT_LEAGUE, GENOME, INERT_ROWS, PLANNER_ROWS, census, defaultVector, diffVectors, mutate, readStart, renderChampionsModule, tune,
} from "../scripts/tune.mjs";

const SEED = 20260907;

test("the_genome_is_every_numeric_row_the_fencer_reads_of_both_tables_with_a_bound_made_from_its_default", () => {
  const numeric = Object.entries(GOLEM_TACTICS_V2).filter(([k, v]) => typeof v === "number" && !INERT_ROWS.has(k)).map(([k]) => k);
  assert.equal(GENOME.length, numeric.length + PLANNER_ROWS.length);
  assert.ok(!GENOME.some((row) => row.name === "explore"), "explore is zero in play and not a row the search moves");
  assert.ok(!GENOME.some((row) => row.name === "stopHit"), "a switch is not a row the search moves");
  // The sword's shape reads the duelist's table live, so its rows in the fencer's copy move nothing.
  for (const key of [...Object.keys(STROKE_SHAPES.sword), "cutRoll", "guardReach"]) {
    assert.ok(!GENOME.some((row) => row.name === key), `${key} is not a row a champion can move`);
    if (typeof GOLEM_TACTICS_V2[key] === "number") assert.ok(INERT_ROWS.has(key), `${key} is numeric and must be listed inert`);
  }
  for (const row of GENOME) {
    assert.ok(row.lo <= row.value && row.value <= row.hi, `${row.name}: ${row.value} is outside [${row.lo}, ${row.hi}]`);
    assert.ok(row.lo < row.hi, `${row.name} has no room to move`);
    if (/Fraction$/.test(row.name) || ["discount", "strafe", "voidStep", "voidStrafe"].includes(row.name)) {
      assert.ok(row.hi <= 1, `${row.name} may exceed one, and the body refuses a strafe over full`);
    }
    if (row.name === "horizon") assert.ok(row.integer && Number.isInteger(row.lo) && row.lo >= 1);
    const source = row.table === "fencer" ? GOLEM_TACTICS_V2 : GOLEM_PLANNER;
    assert.equal(row.value, source[row.name]);
  }
  const negative = GENOME.find((row) => row.name === "shieldReach");
  assert.ok(negative.value < 0 && !negative.multiplicative && negative.lo < negative.value && negative.hi > 0,
    "a negative row moves by a step and its bound straddles zero");
  const vector = defaultVector();
  assert.equal(Object.keys(vector.fencer).length, numeric.length);
  assert.deepEqual(Object.keys(vector.planner), [...PLANNER_ROWS]);
  assert.deepEqual(diffVectors(vector, defaultVector()), []);
});

test("a_child_is_seeded_moves_a_few_rows_inside_the_bounds_and_is_never_its_parent", () => {
  const parent = defaultVector();
  const settings = { sigma: 0.25, rate: 0.15 };
  const first = mutate(parent, mulberry32(11), settings);
  const again = mutate(parent, mulberry32(11), settings);
  assert.deepEqual(again, first, "one seed names one child");
  assert.notDeepEqual(mutate(parent, mulberry32(12), settings), first, "another seed names another");
  assert.deepEqual(parent, defaultVector(), "the parent was not written to");
  let moved = 0;
  const children = 200;
  const random = mulberry32(99);
  for (let i = 0; i < children; i += 1) {
    const child = mutate(parent, random, settings);
    const changes = diffVectors(parent, child);
    assert.ok(changes.length >= 1, "a child that is its parent");
    moved += changes.length;
    for (const row of GENOME) {
      const value = child[row.table][row.name];
      assert.ok(Number.isFinite(value) && value >= row.lo && value <= row.hi, `${row.name} left its bound: ${value}`);
      if (row.integer) assert.ok(Number.isInteger(value), `${row.name} is ${value}`);
    }
  }
  const perChild = moved / children;
  const expected = settings.rate * GENOME.length;
  assert.ok(perChild > expected * 0.7 && perChild < expected * 1.3, `${perChild.toFixed(1)} rows a child against ${expected.toFixed(1)} expected`);
  // A rate of zero still moves one row, so the search never scores a copy of the parent twice.
  const one = mutate(parent, mulberry32(5), { sigma: 0.25, rate: 0 });
  assert.equal(diffVectors(parent, one).length, 1);
});

test("the_champion_tables_are_refused_by_version_and_by_a_row_neither_table_has", () => {
  assert.equal(checkChampions(NO_CHAMPIONS), NO_CHAMPIONS);
  assert.throws(() => checkChampions({ ...NO_CHAMPIONS, version: 99 }), /version 99; this build reads version 1/);
  const entry = { class: "general", builds: 0, generations: 0, bouts: 0, score: 0, baseline: 0, margin: 0, baselineMargin: 0, fencer: {}, planner: {} };
  assert.throws(() => checkChampions({ ...NO_CHAMPIONS, general: { ...entry, fencer: { noSuchRow: 1 } } }), /"noSuchRow", which is not a numeric row/);
  assert.throws(() => checkChampions({ ...NO_CHAMPIONS, general: { ...entry, fencer: { stopHit: 1 } } }), /"stopHit", which is not a numeric row/);
  assert.throws(() => checkChampions({ ...NO_CHAMPIONS, classes: { "sword/long": { ...entry, planner: { explore: 0.5 } } } }), /"explore"/);
  // The entry's rows go over the defaults, and explore stays zero whatever an entry says.
  const tactics = championTactics({ ...entry, fencer: { replanSeconds: 0.25 }, planner: { aggression: 0.7, explore: 0.5 } });
  assert.equal(tactics.fencer.replanSeconds, 0.25);
  assert.equal(tactics.fencer.patience, GOLEM_TACTICS_V2.patience);
  assert.equal(tactics.planner.aggression, 0.7);
  assert.equal(tactics.planner.explore, 0);
  assert.equal(championTactics(null).fencer.replanSeconds, GOLEM_TACTICS_V2.replanSeconds);
});

test("a_schedule_takes_contenders_the_golem_does_not_offer_and_pairs_that_name_who_meets_whom", () => {
  const pool = buildPool({ seed: SEED, random: 2 });
  const contenders = { "child-1": { fencer: {}, planner: {} } };
  assert.throws(() => scheduleJobs({ pool, policies: ["child-1", "golem-duelist"], pairings: 2, seed: SEED, cap: 3 }), /not a policy the golem offers/);
  const jobs = scheduleJobs({
    pool, policies: ["child-1", "golem-duelist", "golem-fencer"], pairings: 4, seed: SEED, cap: 3, mirror: true, contenders,
    pairs: [["child-1", "golem-duelist"], ["child-1", "golem-fencer"]],
  });
  assert.equal(jobs.length, 8);
  for (const job of jobs) {
    assert.ok([job.left.policy, job.right.policy].includes("child-1"), "every bout has the contender in it");
    assert.notEqual(job.left.policy, job.right.policy);
    assert.equal(job.left.build, job.right.build);
  }
  assert.throws(() => scheduleJobs({
    pool, policies: ["child-1", "golem-duelist"], pairings: 2, seed: SEED, cap: 3, contenders, pairs: [["child-1", "golem-planner"]],
  }), /not among the run's policies/);
  // Two contenders scheduled apart under one seed meet the same bodies with the same streams.
  const other = scheduleJobs({
    pool, policies: ["child-2", "golem-duelist", "golem-fencer"], pairings: 4, seed: SEED, cap: 3, mirror: true,
    contenders: { "child-2": contenders["child-1"] }, pairs: [["child-2", "golem-duelist"], ["child-2", "golem-fencer"]],
  });
  assert.deepEqual(other.map((job) => [job.left.build, job.seeds]), jobs.map((job) => [job.left.build, job.seeds]));
});

test("one_seeded_generation_on_two_workers_scores_a_parent_and_a_child_and_writes_a_table_the_mind_loads", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sword-tune-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const pool = buildPool({ seed: SEED, random: 0 }).filter((build) => build.name === "default" || build.name === "fists");
  const classes = await census(pool, { workers: 2, seed: SEED });
  assert.deepEqual(classes, { "sword/long": ["default"], "empty/mid": ["fists"] });
  const lines = [];
  const log = (line) => lines.push(line);
  const { entry, confirmation } = await tune({
    cls: "general", start: defaultVector(), pool, league: ["golem-duelist"], seed: SEED, generations: 1, lambda: 1,
    sigma: 0.25, rate: 0.15, bouts: 2, confirm: 2, workers: 2, cap: 3, log,
  });
  assert.equal(entry.class, "general");
  assert.equal(entry.builds, 2);
  assert.equal(entry.generations, 1);
  assert.equal(entry.bouts, 8, "two bouts a contender in the generation and two in the confirmation");
  assert.ok(entry.score >= 0 && entry.score <= 1 && entry.baseline >= 0 && entry.baseline <= 1);
  assert.equal(confirmation.champion.bouts, 2);
  assert.equal(confirmation.baseline.bouts, 2);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].type, "generation");
  assert.deepEqual(Object.keys(lines[0].scores).sort(), ["child-1", "parent"]);
  assert.deepEqual(Object.keys(lines[0].margins).sort(), ["child-1", "parent"]);
  assert.equal(typeof lines[0].accepted, "boolean");
  assert.equal(lines[1].type, "champion");
  // The champion is the parent or the child, and nothing else.
  const child = mutate(defaultVector(), mulberry32(lines[0].seed), { sigma: 0.25, rate: 0.15 });
  const champion = { fencer: entry.fencer, planner: entry.planner };
  assert.ok(diffVectors(champion, lines[0].accepted ? child : defaultVector()).length === 0);
  // Which the log names as the vector to start the next run from.
  const logPath = join(dir, "tune.jsonl");
  writeFileSync(logPath, lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
  assert.deepEqual(readStart(logPath), champion);
  assert.throws(() => readStart(logPath, "sword/long"), /no generation of class/);
  // And the module it renders is the table the mind refuses or loads by version.
  const tables = { version: CHAMPION_VERSION, seed: SEED, date: "2026-09-06", league: DEFAULT_LEAGUE, general: entry, classes: {} };
  const text = renderChampionsModule(tables);
  assert.match(text, /^\/\/ GENERATED by scripts\/tune.mjs/);
  assert.match(text, /export const GOLEM_CHAMPIONS: ChampionTables = \{/);
  const literal = JSON.parse(text.slice(text.indexOf("= {") + 2, text.lastIndexOf(";")));
  assert.deepEqual(literal, tables);
  assert.equal(checkChampions(literal), literal);
  assert.throws(() => renderChampionsModule({ ...tables, version: 2 }), /version 2/);
  assert.equal(readFileSync(new URL("../src/golem/tactics-champions.ts", import.meta.url), "utf8").includes("GENERATED by scripts/tune.mjs"), true);
});
