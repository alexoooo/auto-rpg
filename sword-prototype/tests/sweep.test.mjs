// The sweep runner: the worker arithmetic, the manifest it refuses, the command line it builds,
// and the restart. Session 04 of the learn set.
//
// **What a test of this file can claim, and what it cannot.** It cannot claim the runner is faster
// than running the arms one after another -- that is a throughput measurement on an idle host over
// an hour, and it is in `docs/measurements.md` with the numbers it was taken at. What it can claim
// is that the arithmetic is the arithmetic written down, that the four refusals fire, that the
// command line an arm is launched with is the one the manifest describes in the order the
// precedence rule says, and that an arm which dies comes back from its own checkpoint with a row
// in its log saying so. Those are cheap and they are exactly the parts that are expensive to get
// wrong: a budget that is off by one wastes a night's worth of threads, and a restart that starts
// a fresh run instead of continuing one wastes the night itself.
//
// **The restart is tested against a fake child**, and that is the design rather than a shortcut.
// The alternative is to launch a real trainer and kill it, which makes the test a race against a
// process that needs minutes to reach its first checkpoint and a machine that may be busy; what is
// being tested here is the supervisor's own decision -- relaunch, with `--resume`, up to three
// times, writing a row -- and a child that exits when the test says to is the instrument for that.
// `spawn` and `appendRow` are parameters of `superviseArms` for this reason and no other.
//
// **Eight mutations were watched red on 2026-09-09**, each applied alone and then restored:
//
// | mutation | what went red |
// |---|---|
// | `workerBudget` divides `available` rather than `available - 2` | the budget test |
// | `workerBudget` rounds up instead of down | the budget test |
// | `readManifest` compares only the terminals of two arms' pools and not the draw count | the pool refusal |
// | `readManifest` takes the last arm's pool as the sweep's instead of refusing | the pool refusal |
// | `readManifest` falls back to `train-ppo` for an unknown script | the script refusal |
// | `armArgs` puts the common flags ahead of the arm's own | the precedence test |
// | `armArgs` omits `--evaluate 0` | the precedence test |
// | `superviseArms` relaunches without `--resume` | the restart test |
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  MAX_RESTARTS, RUNNER_FLAGS, SWEEP_SCRIPTS, armArgs, armPaths, flagValue, poolLine, readManifest,
  restartRow, superviseArms, withoutFlags, workerBudget,
} from "../scripts/sweep.mjs";
import { VIABLE_TERMINALS } from "../src/golem/viability.ts";

const SEED = 20260915;

/** The smallest manifest that is a manifest, with whatever this test wants changed on top. */
const manifestOf = (over = {}) => ({
  name: "sweep", script: "train-ppo", seed: SEED,
  pool: { random: 12, terminals: ["maul", "mace"] },
  common: ["--iterations", "20"],
  arms: [{ name: "hot", flags: ["--entropy", "0.003"] }, { name: "cold", flags: ["--entropy", "0.0003"] }],
  ...over,
});

// ------------------------------------------------------------------------------- the arithmetic

/**
 * The budget, against the four arm counts the plan states it at.
 *
 * Two threads come off the top for the host and the rest are split, floored -- so eight arms on
 * this desktop get three collectors each and one thread is left over rather than an arm getting
 * four while another gets two. The four-arm reading is the one with a measurement behind it: seven
 * is what the record's four-at-once sweep ran at, and 155 s an iteration is what it cost.
 */
test("the_worker_budget_is_the_hosts_threads_less_two_split_between_the_arms", () => {
  assert.equal(workerBudget(1, 32), 30, "one arm gets everything but the host's two");
  assert.equal(workerBudget(3, 32), 10);
  assert.equal(workerBudget(4, 32), 7, "the count the record measured 155 s an iteration at");
  assert.equal(workerBudget(8, 32), 3, "the remainder is left over rather than given to one arm");
  // A host that cannot afford the arithmetic still runs the arms: one collector each is the floor,
  // because a budget of zero is a run that collects nothing and says nothing about why.
  assert.equal(workerBudget(8, 4), 1);
  assert.throws(() => workerBudget(0, 32), /not a sweep/);
});

// --------------------------------------------------------------------------------- the manifest

test("a_manifest_round_trips_with_its_arms_its_common_flags_and_one_pool", () => {
  const manifest = readManifest(JSON.stringify(manifestOf()));
  assert.equal(manifest.name, "sweep");
  assert.equal(manifest.script, "train-ppo");
  assert.equal(manifest.seed, SEED);
  assert.equal(manifest.from, null, "a manifest that names no start says so rather than guessing one");
  assert.deepEqual(manifest.arms.map((arm) => arm.name), ["hot", "cold"]);
  assert.deepEqual(manifest.arms[0].flags, ["--entropy", "0.003"]);
  assert.deepEqual(manifest.common, ["--iterations", "20"]);
  assert.deepEqual(manifest.pool, { random: 12, terminals: ["maul", "mace"] });
  // The pool a manifest does not state is the viable set, which is the learn set's first frozen
  // choice: no pool anywhere spends a bout on a layout that cannot kill unless it says `all`.
  const bare = readManifest(JSON.stringify(manifestOf({ pool: undefined })));
  assert.deepEqual(bare.pool.terminals, [...VIABLE_TERMINALS]);
  assert.equal(bare.pool.random, 40);
  // Two arms of the same name is a copy-paste that would have both writing into one log.
  assert.throws(() => readManifest(JSON.stringify(manifestOf({
    arms: [{ name: "hot", flags: [] }, { name: "hot", flags: [] }],
  }))), /two arms are called "hot"/);
  // A flag and its value are two entries; one string is the shape somebody writes first and it
  // reaches the child as a single unparsed argument that the trainer silently ignores.
  assert.throws(() => readManifest(JSON.stringify(manifestOf({ common: ["--iterations 20"] }))),
    /two entries, not one string/);
});

/**
 * The load-bearing refusal: one sweep is one pool.
 *
 * The set's second frozen choice is Cohen's d on the paired bar margin *on the same pool and
 * seed*, and `scripts/rate-snapshots.mjs` writes the pool into every row because two ratings on
 * two pools are two instruments however alike the rows look. An arm may restate the sweep's pool
 * -- that is a manifest being explicit -- and an arm that states a different one is refused before
 * a bout is spent, with both pools in the message, because the reader's next question is which of
 * the two they meant.
 */
test("a_manifest_whose_arms_name_different_pools_is_refused_with_both_of_them", () => {
  const differing = manifestOf({
    arms: [
      { name: "hot", flags: ["--terminals", "maul,mace"] },
      { name: "cold", flags: ["--terminals", "maul"] },
    ],
  });
  assert.throws(() => readManifest(JSON.stringify(differing)), /only comparable to another rating on the same pool/);
  assert.throws(() => readManifest(JSON.stringify(differing)), /armed with maul or mace/);
  // The draw count is half of what a pool is, and an arm that changes it changes which bodies are
  // in the table without changing a class name anywhere.
  assert.throws(() => readManifest(JSON.stringify(manifestOf({
    arms: [{ name: "hot", flags: ["--random", "12"] }, { name: "cold", flags: ["--random", "40"] }],
  }))), /one sweep is one pool/);
  // Restating the sweep's own pool is not a disagreement, and a manifest is allowed to be explicit.
  const explicit = readManifest(JSON.stringify(manifestOf({
    arms: [
      { name: "hot", flags: ["--terminals", "maul,mace", "--random", "12"] },
      { name: "cold", flags: [] },
    ],
  })));
  assert.deepEqual(explicit.pool, { random: 12, terminals: ["maul", "mace"] });
  // And the common flags may move the pool for every arm at once, which is the one place a pool
  // may be written other than the `pool` field.
  const moved = readManifest(JSON.stringify(manifestOf({ common: ["--terminals", "maul"] })));
  assert.deepEqual(moved.pool.terminals, ["maul"]);
  assert.equal(poolLine(moved.pool), "12 drawn, pool builds armed with maul");
});

test("a_manifest_naming_a_script_the_runner_does_not_know_is_refused_by_name", () => {
  assert.throws(() => readManifest(JSON.stringify(manifestOf({ script: "train-neural" }))),
    /does not know how to run a "train-neural" arm; it runs train-ppo and league/);
  assert.throws(() => readManifest(JSON.stringify(manifestOf({ script: undefined }))), /"" arm/);
  // A name that is not a directory name is caught here rather than by whatever the file system
  // says about it three arms into a night.
  assert.throws(() => readManifest(JSON.stringify(manifestOf({ name: "../escape" }))), /is a directory under the run root/);
  assert.throws(() => readManifest(JSON.stringify(manifestOf({ seed: "20260915x" }))), /seed is a whole number/);
});

/**
 * The flags the runner owns are refused rather than overridden, and that distinction is the point.
 *
 * The trainers' own parser takes the *first* occurrence of a flag name, and the runner's flags go
 * first, so a manifest naming `--workers 9` would be quietly outvoted: the file a reader opens
 * would say nine and the arm would run at ten. Refusing costs a second and names the field the
 * value belongs in instead.
 */
test("a_manifest_may_not_name_a_flag_the_runner_sets_for_every_arm", () => {
  for (const flag of RUNNER_FLAGS) {
    assert.throws(() => readManifest(JSON.stringify(manifestOf({ common: [`--${flag}`, "1"] }))),
      new RegExp(`common names --${flag}`), `--${flag} in the common flags was accepted`);
    assert.throws(() => readManifest(JSON.stringify(manifestOf({
      arms: [{ name: "hot", flags: [`--${flag}`, "1"] }],
    }))), new RegExp(`arm "hot" names --${flag}`), `--${flag} in an arm's flags was accepted`);
  }
});

// ----------------------------------------------------------------------------- the command line

/**
 * The precedence, which is an order in one list rather than a merge.
 *
 * The runner's flags, then whatever the person at the terminal passed, then the arm's own, then
 * the shared common ones -- and because the trainers take the first occurrence of a name, that
 * order *is* the precedence. It is also the order somebody would say it in: this sweep, run like
 * this, except this arm, otherwise as usual. Nothing is deleted from the list on the way, so the
 * command line printed at launch is the whole of what the arm was told.
 */
test("an_arms_command_line_is_the_runner_then_the_terminal_then_the_arm_then_the_common", () => {
  const manifest = readManifest(JSON.stringify(manifestOf()));
  const args = armArgs(manifest, manifest.arms[0], {
    workers: 7, root: "/runs", extra: ["--bouts", "8"],
  });
  assert.equal(args[0], SWEEP_SCRIPTS["train-ppo"]);
  assert.equal(flagValue(args, "seed"), String(SEED));
  assert.equal(flagValue(args, "workers"), "7");
  assert.equal(flagValue(args, "evaluate"), "0", "no arm rates while the others are collecting");
  assert.equal(flagValue(args, "label"), "hot", "a fit's own header cannot otherwise say which arm it is");
  assert.equal(flagValue(args, "terminals"), "maul,mace");
  assert.equal(flagValue(args, "random"), "12");
  assert.equal(flagValue(args, "bouts"), "8", "the terminal's flags beat the manifest's");
  assert.equal(flagValue(args, "entropy"), "0.003", "the arm's own flag is what makes it that arm");
  assert.equal(flagValue(args, "iterations"), "20", "and the common flags are the fallback");
  assert.equal(args.indexOf("--bouts") < args.indexOf("--entropy"), true);
  assert.equal(args.indexOf("--entropy") < args.indexOf("--iterations"), true);
  assert.equal(resolve(flagValue(args, "log")), resolve(armPaths(manifest, manifest.arms[0], "/runs").log));
  assert.equal(args.includes("--resume"), false);

  // A restart continues the arm's own run: the same log, and `--resume` pointed at the checkpoint
  // that log wrote. A relaunch that dropped it would silently start the arm over from the shared
  // checkpoint and the night's other three arms would be hours ahead of it.
  const again = armArgs(manifest, manifest.arms[0], { workers: 7, root: "/runs", resume: true });
  assert.equal(flagValue(again, "log"), flagValue(args, "log"));
  assert.match(flagValue(again, "resume"), /hot-checkpoint\.json$/);

  // A league arm is a directory rather than a log, and its resume takes no argument.
  const league = readManifest(JSON.stringify(manifestOf({ script: "league", from: "start.json" })));
  const args2 = armArgs(league, league.arms[0], { workers: 10, root: "/runs" });
  assert.equal(flagValue(args2, "from"), "start.json", "every arm starts from the one checkpoint");
  assert.match(flagValue(args2, "dir"), /hot$/);
  const resumed = armArgs(league, league.arms[0], { workers: 10, root: "/runs", resume: true });
  assert.equal(resumed.includes("--resume"), true);
  assert.equal(flagValue(resumed, "from"), null, "--from starts a new league and --resume continues one");

  // The pool reaches the child once, resolved, rather than twice with the arm's copy underneath.
  const explicit = readManifest(JSON.stringify(manifestOf({
    arms: [{ name: "hot", flags: ["--terminals", "maul,mace", "--clip", "0.1"] }],
  })));
  const args3 = armArgs(explicit, explicit.arms[0], { workers: 7, root: "/runs" });
  assert.equal(args3.filter((a) => a === "--terminals").length, 1);
  assert.equal(flagValue(args3, "clip"), "0.1", "and nothing else of the arm's was taken with it");
  assert.deepEqual(withoutFlags(["--random", "4", "--clip", "0.1"], ["random"]), ["--clip", "0.1"]);
});

// --------------------------------------------------------------------------------- the restart

/** A child that exits with the codes it is handed, one per launch, when the test releases it. */
function fakeChild(code) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => { child.emit("exit", null, "SIGTERM"); };
  child.finish = () => { child.emit("exit", code, null); };
  return child;
}

/**
 * An arm that dies once comes back from its own checkpoint, and says so in its log.
 *
 * The eighth frozen choice is that an overnight run expects to die -- two V8 fatals in the same
 * frame are on the record -- so this is the behaviour the whole session's compute argument rests
 * on: an arm that dies at 3 a.m. and is not restarted is an arm that contributed nothing, and one
 * that is restarted *from noise* is worse, because it looks like an answer.
 *
 * Three things are asserted. The relaunch carries `--resume`; the arm's log gains a `restart` row,
 * because a seam a reader cannot see is a seam they will explain some other way; and an arm that
 * keeps dying is given up on after three rather than relaunched forever.
 */
test("an_arm_that_dies_once_is_relaunched_from_its_checkpoint_with_a_restart_row", async () => {
  const manifest = readManifest(JSON.stringify(manifestOf({ arms: [{ name: "hot", flags: [] }] })));
  const launches = [];
  const rows = [];
  const children = [];
  const spawn = (_exe, args) => {
    launches.push(args);
    const child = fakeChild(launches.length === 1 ? 1 : 0);
    children.push(child);
    // Released on the next turn of the loop, so the supervisor has attached its listeners.
    setImmediate(() => child.finish());
    return child;
  };
  const summary = await superviseArms(manifest, {
    workers: 7, dir: "/runs", spawn, status: 0, print: () => {},
    appendRow: (path, row) => rows.push({ path, row }),
  });
  assert.equal(launches.length, 2, "the arm was launched once and relaunched once");
  assert.equal(launches[0].includes("--resume"), false, "the first launch is not a resume");
  assert.match(flagValue(launches[1], "resume"), /hot-checkpoint\.json$/, "the relaunch continues the run");
  assert.equal(flagValue(launches[1], "log"), flagValue(launches[0], "log"), "and continues its log");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].path, armPaths(manifest, manifest.arms[0], "/runs").log);
  assert.equal(rows[0].row.type, "restart");
  assert.equal(rows[0].row.arm, "hot");
  assert.equal(rows[0].row.attempt, 1);
  assert.equal(rows[0].row.code, 1);
  assert.deepEqual(summary.map((arm) => [arm.name, arm.restarts, arm.code]), [["hot", 1, 0]]);

  // An arm that dies every time is given up on rather than relaunched forever: three restarts, so
  // four launches, and the summary carries the exit code it kept dying with.
  const always = [];
  const dying = await superviseArms(manifest, {
    workers: 7, dir: "/runs", status: 0, print: () => {}, appendRow: () => {},
    spawn: (_exe, args) => {
      always.push(args);
      const child = fakeChild(3);
      setImmediate(() => child.finish());
      return child;
    },
  });
  assert.equal(always.length, MAX_RESTARTS + 1);
  assert.equal(dying[0].restarts, MAX_RESTARTS);
  assert.equal(dying[0].code, 3);
  assert.match(dying[0].line, /gave up after 3 restarts, exit 3/);

  // A row is a row before it is written, and its shape is what Session 02's curve page reads a
  // seam out of, so it is asserted here rather than only through the supervisor.
  const row = restartRow({ name: "hot" }, 2, 1, "SIGSEGV");
  assert.equal(row.signal, "SIGSEGV");
  assert.ok(Date.parse(row.at) > 0, "a restart row carries when it happened");
});

/**
 * The deadline stops the arms and does not restart them, which is what a wall-clock budget means.
 *
 * The throughput this session is measured on is iterations in an hour rather than iterations to a
 * finish, so the runner has to be able to end a run that is not over. A kill is a non-zero exit
 * and the supervisor's ordinary answer to one of those is a relaunch, so the deadline has to be
 * the thing that turns that answer off -- otherwise the hour ends with three arms starting over.
 */
test("the_deadline_stops_every_arm_and_a_stopped_arm_is_not_restarted", async () => {
  const manifest = readManifest(JSON.stringify(manifestOf()));
  const launches = [];
  const summary = await superviseArms(manifest, {
    workers: 10, dir: "/runs", status: 0, print: () => {}, minutes: 0.01,
    appendRow: () => { throw new Error("a stopped arm wrote a restart row"); },
    spawn: (_exe, args) => { launches.push(args); return fakeChild(0); },
  });
  assert.equal(launches.length, 2, "one launch an arm and no relaunch after the deadline");
  for (const arm of summary) {
    assert.equal(arm.restarts, 0);
    assert.match(arm.line, /stopped at the deadline/);
  }
});

// ------------------------------------------------------------------------------ the manifest on disk

/**
 * The committed worked example is a manifest this runner reads, which is worth a test because it
 * is the one in the session's own Verification block and in `docs/measurements.md`.
 */
test("the_committed_example_manifest_is_one_this_runner_can_read", () => {
  const manifest = readManifest(readFileSync("docs/sweeps/example.json", "utf8"));
  assert.equal(manifest.script, "league");
  assert.equal(manifest.arms.length, 3);
  assert.deepEqual(manifest.arms.map((arm) => arm.flags), [[], [], []],
    "the three arms of a throughput measurement differ in nothing, which is the point of it");
  assert.equal(workerBudget(manifest.arms.length, 32), 10, "ten workers an arm on the development host");
  assert.equal(manifest.from, null, "a committed manifest names no file under the gitignored tournaments/");
});
