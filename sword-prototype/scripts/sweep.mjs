// Several experiments at once: a manifest of arms, one seed, one start, the host's threads split
// between them, and one rating afterwards. Session 04 of the learn set.
//
//   node scripts/sweep.mjs --manifest docs/sweeps/example.json
//        [--workers 32]     -- the host's threads to divide; absent is availableParallelism()
//        [--shards 1]       -- fit threads an arm; comes off the arm's collector budget
//        [--root tournaments/sweeps] [--only arm-1,arm-2] [--from checkpoint.json]
//        [--minutes 0] [--restarts 3]
//        [--rate-bouts N]   -- absent is the manifest's own; 0 rates nothing
//        [--paired a]       -- rate every arm in one call, paired against this arm; no run
//        [--against golem-driver,golem-fencer] -- who the paired rating is played against
//        [--designed golem-driver,golem-fencer] -- designed minds as contenders of their own, so
//                              every arm's row carries vsDriver and vsFencer, the paired margin
//                              against a mind that ships; a one-arm --paired needs one of these
//        [--status 30] [--dry-run]
//        [any other flag]   -- handed to every arm ahead of its own flags
//
// **Why this exists at all.** The open questions this plan set is made of -- entropy against a
// drifting sigma, the rate, the reward table's weights, the opponent schedule -- are sweep
// questions: each is a pair of arms that differ in one flag, and the answer is the paired margin
// between them. And a run needs about one core for eighty per cent of its time, because
// `scripts/train-ppo.mjs` spends four fifths of an iteration in a single-threaded fit. The record
// measured what that is worth: one 30-worker run is about 109 s an iteration, and four 7-worker
// runs at once are about 155 s each -- 2.6 times the answers an hour for the same host. The owner
// called running several at once the highest-value option, and this is it.
//
// **Processes, not threads.** An arm is a child `node scripts/train-ppo.mjs` or
// `node scripts/league.mjs` with its own worker pool, exactly as the record's four-at-once sweep
// and three-at-once league were run by hand. This file adds nothing to the trainers: a manifest is
// a list of command lines with the shared parts factored out, and every flag in it is a flag those
// scripts already parse. That is deliberate rather than lazy. A runner that reached inside the fit
// would be a second trainer with its own numbers, and the set's ninth frozen choice is that
// neither the sweep runner nor the sharded fit may change a number.
//
// **The worker budget is arithmetic and it is printed**: `floor((availableParallelism - 2) / arms)`
// collectors an arm, with the arm's own fit thread beside them and two left for the host. At four
// arms on the 32-thread desktop that is seven, which is the number the record measured 155 s an
// iteration at; at three it is ten, and at one it is thirty, which is how the same manifest runs
// the control the throughput bar is read against.
//
// **`--shards` comes off that budget, and only when it is more than one.** Session 05 of the learn
// set put the fit on K threads, and K threads that are all busy at once are not the single fit
// thread the paragraph above leaves inside the count. So a sharded sweep spends
// `floor((available - 2) / arms) - shards` collectors an arm: one arm at eight shards on this host
// is 22 collectors and 8 shards, which is the shipped configuration that session measured. At one
// shard nothing comes off, which is what makes a `--shards 1` sweep the same arithmetic Session 04
// measured its throughput bar with -- ten collectors for three arms, thirty for one.
//
// **The runner's own default is one, where both trainers default to eight, and it writes the
// resolved number onto every arm's command line.** A trainer's default is the knee of a curve
// measured with the whole host to itself; a sweep is the case where the host is not one run's, so
// inheriting that default would have every arm quietly take eight fit threads out of a budget
// computed for one. Saying the number explicitly is the same discipline `POOL_FLAGS` gets: the
// value the budget was computed from is the value the arm is told, once, and the launch line a
// reader sees is the whole of what the arm was told.
//
// **Nothing is rated during the run.** Every arm is launched with `--evaluate 0`, because a rating
// steals the cores the collection is paying for and a rating taken mid-run on a busy host is a
// rating on a different clock -- which would make the arms' curves incomparable in exactly the
// dimension the sweep is for. Snapshots are rated afterwards, all of them on one pool and one
// seed, through `scripts/rate-snapshots.mjs`.
//
// **An arm whose pool is not the sweep's pool is refused, and that is the load-bearing rule in
// this file.** The set's second frozen choice is that the criterion is Cohen's d on the paired bar
// margin *on the same pool and seed*; `scripts/rate-snapshots.mjs` writes the pool into every row
// for the same reason. Two arms rated on two pools are two instruments, and a table that put them
// in adjacent columns with a `d` between them would be arithmetic on numbers that do not belong to
// each other. So the pool is declared once, an arm may name it again, and an arm that names a
// different one stops the sweep before a single bout is spent.
//
// **A restarted arm is the same run.** The eighth frozen choice is that overnight runs checkpoint
// every iteration and expect to die -- two V8 fatals in the same frame are on the record -- so a
// non-zero exit is relaunched from the arm's own last checkpoint, up to three times, and the
// restart is written into the arm's log as a row rather than hidden. What makes that continuation
// rather than a warm start is Session 04's other half: the checkpoint now carries Adam's moments,
// so the resumed arm continues one optimiser instead of spending an iteration with cold second
// moments taking the largest steps its rate allows.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn as spawnChild } from "node:child_process";
import { availableParallelism } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { VIABLE_TERMINALS } from "../src/golem/viability.ts";
import {
  PPO_LEAGUE, checkpointFor, cohensD, contenderShape, parseTerminals, poolFor, poolSentence,
  ratePolicy,
} from "./train-ppo.mjs";
import { boutsPerOpponent, parsePools, rateSnapshots } from "./rate-snapshots.mjs";
import { contenderFor, loadLeague } from "./league.mjs";
import { columnsOf, meanOf, semOf } from "./train-learner.mjs";
import { evaluate } from "./tune.mjs";
import { headSpecOf } from "../src/golem/policy.ts";
import { PILOT_FEATURE_VERSIONS_READ, pilotFeatureCount } from "../src/golem/pilot.ts";
import { netSize } from "../src/golem/neural-net.ts";

/** This runner's own version, written into the copied manifest so a reader can refuse one. */
export const SWEEP_VERSION = 1;

/** The two scripts an arm may be. A third is a script, a flag set and a checkpoint shape. */
export const SWEEP_SCRIPTS = Object.freeze({
  "train-ppo": "scripts/train-ppo.mjs",
  league: "scripts/league.mjs",
});

/**
 * The flags the runner sets itself, which a manifest may therefore not carry.
 *
 * Not tidiness: the child's own `flag()` takes the *first* occurrence of a name, so a manifest
 * naming one of these would be silently overridden by the runner rather than winning, and the arm
 * would run under numbers nobody could see in the file they read. Refusing by name costs a second
 * and says which field the value belongs in instead.
 */
export const RUNNER_FLAGS = Object.freeze(["seed", "from", "resume", "workers", "evaluate", "log", "dir"]);

/** The two flags that say which bodies a run draws, which is what makes two ratings comparable. */
export const POOL_FLAGS = Object.freeze(["random", "terminals"]);

/**
 * The flag an arm may not differ in, because the runner's own arithmetic is a function of it.
 *
 * `--shards` comes off every arm's collector budget, and the budget is one number for the sweep --
 * the arms run at once on one host, so an arm that took eight fit threads while its neighbours took
 * one would be spending the neighbours' collectors. It belongs in `common` or on the command line,
 * where it is said once for everybody, and an arm that names it is refused by name rather than
 * quietly given a budget computed for a different arm.
 */
export const BUDGET_FLAGS = Object.freeze(["shards"]);

/** How many times a dead arm is put back on its feet before the runner gives up on it. */
export const MAX_RESTARTS = 3;

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The value a flag list gives a name, or null. First wins, as the trainers' own parser does. */
export function flagValue(flags, name) {
  const at = flags.indexOf(`--${name}`);
  return at >= 0 && flags[at + 1] !== undefined ? flags[at + 1] : null;
}

/** The same list with those flags and their values taken out, so a resolved value is said once. */
export function withoutFlags(flags, names) {
  const out = [];
  for (let i = 0; i < flags.length; i += 1) {
    const bare = flags[i].startsWith("--") ? flags[i].slice(2) : null;
    if (bare !== null && names.includes(bare)) { i += 1; continue; }
    out.push(flags[i]);
  }
  return out;
}

/** A flag list off a manifest, checked to be one: separate tokens, as `process.argv` would hold. */
function asFlags(list, where) {
  if (!Array.isArray(list)) throw new Error(`${where} is a list of flags, as ["--iterations", "300"]`);
  return list.map((entry) => {
    if (typeof entry !== "string") throw new Error(`${where} holds ${JSON.stringify(entry)}, which is not a flag`);
    if (entry.startsWith("--") && entry.includes(" ")) {
      throw new Error(`${where} holds "${entry}"; a flag and its value are two entries, not one string`);
    }
    return entry;
  });
}

/** Which pool a flag list asks for, over whatever it was handed as a starting point. */
export function poolOf(flags, fallback) {
  const random = flagValue(flags, "random");
  const terminals = flagValue(flags, "terminals");
  return {
    random: random === null ? fallback.random : Math.max(0, Number(random)),
    terminals: terminals === null ? [...fallback.terminals] : parseTerminals(terminals),
  };
}

/** A pool in one line, which is what a refusal about two of them has to be able to print. */
export const poolLine = (pool) => `${pool.random} drawn, ${poolSentence(pool.terminals)}`;

const samePool = (a, b) => a.random === b.random && a.terminals.join(",") === b.terminals.join(",");

/**
 * A manifest read, checked and filled in: the sweep, its arms, and the one pool they share.
 *
 * `{name, seed, from, pool: {random, terminals}, script, common: [flags], arms: [{name, flags}]}`.
 * `common` is the flags every arm gets and an arm's own `flags` are what makes it that arm -- the
 * set's third frozen choice is that an experiment is a pair of arms differing in one thing, and
 * this shape is that sentence written down: everything shared is written once, so the diff between
 * two arms is the whole of the difference between them.
 *
 * Four things are refused, and each of them is an hour somebody would otherwise spend finding out:
 * a script this runner does not know, named against the two it does; a flag the runner sets itself,
 * which would be silently overridden rather than honoured; a name that cannot be a directory; and
 * two arms whose pools are not the same pool, because their ratings would not compare and the
 * table this file prints would put a `d` between two instruments.
 */
export function readManifest(json) {
  const raw = typeof json === "string" ? JSON.parse(json) : json;
  const name = String(raw.name ?? "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    throw new Error(`a sweep's name is a directory under the run root, so "${name}" will not do; `
      + "letters, digits, dot, dash and underscore, starting with a letter or a digit");
  }
  const script = String(raw.script ?? "");
  if (!Object.hasOwn(SWEEP_SCRIPTS, script)) {
    throw new Error(`this runner does not know how to run a "${script}" arm; `
      + `it runs ${Object.keys(SWEEP_SCRIPTS).join(" and ")}`);
  }
  const seed = Number(raw.seed);
  if (!Number.isInteger(seed) || seed < 0) throw new Error(`a sweep's seed is a whole number, not ${JSON.stringify(raw.seed)}`);
  const from = raw.from === undefined || raw.from === null ? null : String(raw.from);
  const common = asFlags(raw.common ?? [], "common");
  const pool = poolOf([], {
    random: raw.pool?.random === undefined ? 40 : Math.max(0, Number(raw.pool.random)),
    terminals: raw.pool?.terminals === undefined ? [...VIABLE_TERMINALS]
      : Array.isArray(raw.pool.terminals) ? parseTerminals(raw.pool.terminals.join(","))
        : parseTerminals(raw.pool.terminals),
  });
  if (!Array.isArray(raw.arms) || raw.arms.length === 0) throw new Error("a sweep is a list of arms and this one has none");
  const named = new Set();
  const arms = raw.arms.map((entry, i) => {
    const armName = String(entry?.name ?? "");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(armName)) {
      throw new Error(`arm ${i} is named "${armName}", and an arm's name is a file or a directory`);
    }
    if (named.has(armName)) throw new Error(`two arms are called "${armName}"; a sweep's arms are told apart by name`);
    named.add(armName);
    const flags = asFlags(entry.flags ?? [], `arm "${armName}"`);
    for (const flag of BUDGET_FLAGS) {
      if (flagValue(flags, flag) !== null || flags.includes(`--${flag}`)) {
        throw new Error(`arm "${armName}" names --${flag}, which the runner divides the host's `
          + "threads by and must therefore be the same for every arm; it belongs in common, or on "
          + "the command line where it is handed to all of them");
      }
    }
    return { name: armName, flags };
  });
  for (const [where, flags] of [["common", common], ...arms.map((arm) => [`arm "${arm.name}"`, arm.flags])]) {
    for (const flag of RUNNER_FLAGS) {
      if (flagValue(flags, flag) !== null || flags.includes(`--${flag}`)) {
        throw new Error(`${where} names --${flag}, which the runner sets for every arm and would `
          + "therefore override rather than honour; the manifest's seed, from and pool fields are "
          + "where those belong, and the worker budget is arithmetic");
      }
    }
  }
  const shared = poolOf(common, pool);
  const withPools = arms.map((arm) => ({ ...arm, pool: poolOf(arm.flags, shared) }));
  for (const arm of withPools) {
    if (samePool(arm.pool, withPools[0].pool)) continue;
    throw new Error(`arm "${withPools[0].name}" draws ${poolLine(withPools[0].pool)} and arm "${arm.name}" `
      + `draws ${poolLine(arm.pool)}; a rating is only comparable to another rating on the same pool, `
      + "so one sweep is one pool");
  }
  return {
    version: SWEEP_VERSION, name, script, seed, from, pool: withPools[0].pool, common,
    arms: withPools.map(({ name: armName, flags }) => ({ name: armName, flags })),
    rate: { bouts: Math.max(0, Number(raw.rate?.bouts ?? 200)) },
    note: raw.note === undefined ? null : String(raw.note),
  };
}

/**
 * Collectors an arm: `floor((available - 2) / arms)`, less the fit's shards, never fewer than one.
 *
 * The two that come off the top are the host's -- a desktop that cannot repaint is a desktop
 * somebody reboots in the middle of the night -- and the arm's own fit thread is left inside the
 * count on purpose: it is busy for four fifths of an iteration and the collectors are idle for
 * exactly that stretch, so counting it again would leave the machine short by one thread an arm at
 * the only moment they are all working. At 32 threads: one arm 30, three 10, four 7, eight 3.
 *
 * `shards` is Session 05 of the learn set's flag and comes off the top of an arm's share only when
 * it is greater than one, which is not an inconsistency but the same argument twice. A single fit
 * thread is the one this arithmetic has always folded into the collectors; a fit split K ways is K
 * threads pinned at once, and the collectors it displaces are real. Keeping the K = 1 case exactly
 * as it was is also what lets a `--shards 1` sweep be read against Session 04's own numbers.
 */
export function workerBudget(arms, available = availableParallelism(), shards = 1) {
  if (!Number.isInteger(arms) || arms < 1) throw new Error(`a sweep of ${arms} arms is not a sweep`);
  if (!Number.isInteger(shards) || shards < 1) throw new Error(`a fit of ${shards} shards is not a fit`);
  return Math.max(1, Math.floor((available - 2) / arms) - (shards > 1 ? shards : 0));
}

/** Where an arm's run lives: its own directory for a league, one log in the sweep's for a fit. */
export function armPaths(manifest, arm, root) {
  const home = resolve(root, manifest.name);
  return manifest.script === "league"
    ? { home: join(home, arm.name), log: join(home, arm.name, "league.jsonl") }
    : { home, log: join(home, arm.name + ".jsonl") };
}

/**
 * The command line one arm runs, in the order that makes the resolution rule readable.
 *
 * The trainers take the *first* occurrence of a flag, so the order here is the precedence: what
 * the runner owns, then what the person at the terminal passed, then the arm's own difference,
 * then the shared common flags. That is the order somebody would say them in -- "this sweep, run
 * like this, except this arm, otherwise as usual" -- and it means an arm's flag beats the common
 * one without either being deleted from the file a reader looks at.
 *
 * The pool is emitted once, resolved, and taken back out of the arm's and the common flags: they
 * agree by `readManifest`'s refusal, so a second copy could only ever be the same words twice.
 * `--shards` is emitted the same way and for a stronger reason -- the runner's budget arithmetic is
 * a function of it, and a trainer left to its own default would take eight fit threads out of a
 * collector budget computed for one. It is stripped from the command line's own flags too, since
 * that is where a sweep is usually told the number and the resolved value is already here.
 */
export function armArgs(manifest, arm, { workers, shards = 1, root, extra = [], resume = false }) {
  const paths = armPaths(manifest, arm, root);
  const args = [SWEEP_SCRIPTS[manifest.script], "--seed", String(manifest.seed)];
  if (manifest.script === "league") {
    args.push("--dir", paths.home);
    if (resume) args.push("--resume");
    else if (manifest.from !== null) args.push("--from", manifest.from);
  } else {
    args.push("--log", paths.log, "--label", arm.name);
    if (resume) args.push("--resume", checkpointFor(paths.log));
    else if (manifest.from !== null) args.push("--from", manifest.from);
  }
  args.push("--workers", String(workers), "--shards", String(shards), "--evaluate", "0");
  args.push("--random", String(manifest.pool.random), "--terminals", manifest.pool.terminals.join(","));
  const strip = (flags) => withoutFlags(flags, [...POOL_FLAGS, ...BUDGET_FLAGS]);
  return [...args, ...withoutFlags(extra, BUDGET_FLAGS), ...strip(arm.flags), ...strip(manifest.common)];
}

/**
 * One arm launched as its own process, with its own worker pool.
 *
 * `spawn` is a parameter so the supervisor can be tested against a child that exits when the test
 * says to. That is not a convenience: the thing worth testing is the restart, and the way to test
 * a restart with a real trainer is to kill one, which makes the test a race against a process that
 * takes minutes to reach its first checkpoint.
 */
export function spawnArm(arm, {
  manifest, workers, shards = 1, dir, extra = [], resume = false, spawn = spawnChild,
}) {
  const args = armArgs(manifest, arm, { workers, shards, root: dir, extra, resume });
  return { args, child: spawn(process.execPath, args, { cwd: HERE, stdio: ["ignore", "pipe", "pipe"] }) };
}

/** The restart written into the arm's own log, so a curve can see the seam it was read across. */
export function restartRow(arm, attempt, code, signal) {
  return {
    type: "restart", arm: arm.name, attempt, code, signal: signal ?? null,
    at: new Date().toISOString(),
  };
}

/** The last non-empty line of whatever the child has said, which is the arm's one status line. */
function tail(previous, chunk) {
  const lines = String(chunk).split("\n").map((line) => line.trimEnd()).filter((line) => line !== "");
  return lines.length === 0 ? previous : lines[lines.length - 1];
}

/**
 * Every arm run to its end, with the dead put back on their feet from their own last checkpoint.
 *
 * The arms are children and nothing here waits on one before starting the next, which is the whole
 * point: they run at once, each with the budget above, and the supervisor's own work is a few
 * bytes of stdout a second. What it does with a non-zero exit is the eighth frozen choice made
 * mechanical -- relaunch with `--resume`, up to `restarts` times, and write a `restart` row into
 * the arm's log so that a reader of the curve can see the seam rather than wonder about it.
 *
 * `minutes` is a wall-clock budget and exists because the throughput this session measures is
 * iterations in an hour rather than iterations to a finish. At the deadline every child is asked
 * to stop and no exit after it is a restart -- a league saves its state every iteration, so what
 * is lost is the iteration in flight.
 */
export async function superviseArms(manifest, {
  workers, shards = 1, dir, extra = [], spawn = spawnChild, restarts = MAX_RESTARTS, minutes = 0,
  status = 30, print = console.log, appendRow = null,
}) {
  const write = appendRow ?? ((path, row) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(row) + "\n", { flag: "a" });
  });
  const state = manifest.arms.map((arm) => ({ arm, line: "waiting", restarts: 0, code: null, child: null }));
  let stopping = false;
  const started = Date.now();
  const run = (entry, resume) => new Promise((done) => {
    const launch = (attempt) => {
      const { child, args } = spawnArm(entry.arm, {
        manifest, workers, shards, dir, extra, resume: resume || attempt > 0, spawn,
      });
      entry.child = child;
      entry.line = attempt === 0 ? "launched" : `relaunched (${attempt})`;
      if (attempt === 0) print(`  ${entry.arm.name}: node ${args.join(" ")}`);
      child.stdout?.on("data", (chunk) => { entry.line = tail(entry.line, chunk); });
      child.stderr?.on("data", (chunk) => { entry.line = tail(entry.line, chunk); });
      child.on("error", (error) => { entry.line = `could not start: ${error.message}`; });
      child.on("exit", (code, signal) => {
        entry.child = null;
        entry.code = code;
        if (code === 0 || stopping || attempt >= restarts) {
          entry.line = stopping ? `stopped at the deadline (${entry.line})`
            : code === 0 ? `finished (${entry.line})`
              : `gave up after ${attempt} restart${attempt === 1 ? "" : "s"}, exit ${code}`;
          done(entry);
          return;
        }
        entry.restarts = attempt + 1;
        const row = restartRow(entry.arm, entry.restarts, code, signal);
        write(armPaths(manifest, entry.arm, dir).log, row);
        print(`  ${entry.arm.name}: exit ${code}${signal ? ` on ${signal}` : ""}, `
          + `restart ${entry.restarts} of ${restarts} from its last checkpoint`);
        launch(attempt + 1);
      });
    };
    launch(0);
  });

  const repaint = status > 0 ? setInterval(() => {
    const elapsed = ((Date.now() - started) / 60000).toFixed(1);
    print(`  --- ${elapsed} min ---`);
    for (const entry of state) print(`  ${entry.arm.name.padEnd(16)} ${entry.line}`);
  }, status * 1000) : null;
  const deadline = minutes > 0 ? setTimeout(() => {
    stopping = true;
    print(`  the ${minutes} minute budget is up; asking every arm to stop`);
    for (const entry of state) entry.child?.kill();
  }, minutes * 60000) : null;
  try {
    await Promise.all(state.map((entry) => run(entry, false)));
  } finally {
    if (repaint !== null) clearInterval(repaint);
    if (deadline !== null) clearTimeout(deadline);
  }
  return state.map(({ arm, restarts: count, code, line }) => ({ name: arm.name, restarts: count, code, line }));
}

// ------------------------------------------------------------------------------- the rating

/** One arm's row, in the shape `scripts/rate-snapshots.mjs` writes and with the arm on the front. */
function armRow(arm, row) {
  return { arm: arm.name, ...row };
}

/**
 * Every arm's snapshots rated on one pool and one seed, and the paired table printed.
 *
 * One pool, one seed, one process, after every arm has stopped: that is three separate reasons the
 * numbers compare. The pool is the manifest's, which `readManifest` has already refused to let the
 * arms disagree about; the seed is `seed ^ 0xc0f1c0f1`, the derivation `scripts/league.mjs` and
 * `scripts/rate-snapshots.mjs` both use, so a row here sits beside the rows those wrote; and one
 * process means the ratings are not competing with a collection for the host.
 *
 * A league arm is rated through `rateSnapshots`, which reads the numbered pool snapshots it left
 * beside its league state as well as its live main. A `train-ppo` arm has one checkpoint rather
 * than a pool of them, so its row is the same measurement taken on that -- the same `ratePolicy`,
 * the same pool, the same seed.
 */

/**
 * An arm's declared shape, off the first line of the log it wrote; the shipped shape if silent.
 *
 * Session 09 of the learn set made the shape an arm-level flag, and a checkpoint is weights and a
 * normalisation and says nothing about the head that wrote them -- so an arm fitted under
 * `--head mixed` and rated as a Gaussian would be a different mind wearing its weights. The header
 * is the run's own first line and is the only place that fact is written down.
 */
export function shapeOfLog(logPath) {
  if (!existsSync(logPath)) return {};
  const first = readFileSync(logPath, "utf8").split("\n", 1)[0];
  let header = null;
  try { header = JSON.parse(first); } catch { return {}; }
  if (header === null || typeof header !== "object" || header.type !== "header") return {};
  // `features` means two different things in the two headers this function reads, and the
  // difference is not cosmetic. `train-ppo.mjs` writes the run's own `--features`, the version of
  // the observation its weights are shaped by. `league.mjs` writes `PILOT_FEATURES_VERSION`, which
  // is a compatibility stamp saying which feature code the build could load -- 2, for every league
  // ever run here, all of which observe the 71-column version 1. A reader that believed the second
  // spelling built an 80-column mind over 71 columns of weights, and the failure surfaced as
  // "policy weights hold 87308 numbers; the layout wants 89612" thrown inside a tournament worker,
  // after the pool had been drawn and the bouts had started. So where a header records the layout
  // it actually ran -- both of them do -- the layout decides, because that is the number the
  // weights on disk are shaped by and the field name is the thing in dispute.
  const inputs = header.layout?.inputs;
  const stated = header.features ?? undefined;
  const measured = inputs === undefined ? undefined
    : PILOT_FEATURE_VERSIONS_READ.find((version) => pilotFeatureCount(version) === inputs);
  return {
    features: measured ?? stated,
    layout: header.layout ?? undefined,
    spec: header.head === undefined && header.sigma === undefined ? undefined
      : headSpecOf(header.head ?? "gaussian", header.sigma ?? "constant"),
    tactics: header.tactics ?? null,
  };
}

/**
 * The shape a rating is about to build, checked against the weights it is about to build it over.
 *
 * This is the guard the session above wanted and did not have. A contender is a plain object handed
 * across a worker boundary, so a shape that disagrees with its weights is not caught by anything
 * until a net is allocated in another process, and by then the message names two numbers and no
 * arm. Here it names the arm, the file, and both counts, and it costs one multiplication.
 */
export function checkShape(name, contender, weights) {
  const wanted = netSize(contender.layout);
  if (wanted === weights.length) return contender;
  throw new Error(`arm ${name} holds ${weights.length} policy numbers and the shape this rating `
    + `would build over them wants ${wanted} (${JSON.stringify(contender.layout)}, feature version `
    + `${contender.features}); the run's own header is what decides the shape, so this is a `
    + "disagreement between that header and this reader rather than a bad checkpoint");
}
export async function rateArms(manifest, {
  dir, bouts, workers, cap = 60, pools = ["mirror", "random"], onRow = null,
}) {
  const rows = [];
  const keep = (arm, row) => {
    const tagged = armRow(arm, row);
    rows.push(tagged);
    if (onRow !== null) onRow(tagged);
  };
  const eseed = (manifest.seed ^ 0xc0f1c0f1) >>> 0;
  const { random, terminals } = manifest.pool;
  for (const arm of manifest.arms) {
    const paths = armPaths(manifest, arm, dir);
    if (manifest.script === "league") {
      if (!existsSync(join(paths.home, "league.json"))) continue;
      await rateSnapshots({
        dir: paths.home, bouts, workers, cap, random, terminals, pools,
        onRow: (row) => keep(arm, row),
      });
      continue;
    }
    const checkpoint = checkpointFor(paths.log);
    if (!existsSync(checkpoint)) continue;
    const saved = JSON.parse(readFileSync(checkpoint, "utf8"));
    // Class-filtered and not mirrored, so `ratePolicy` can narrow it again at each arrangement's
    // own `mirror`: it can shrink the list it is handed and it cannot grow one, and a random-pairs
    // rating over the thirteen mirrorable builds would be a pool nobody asked for.
    const builds = poolFor({ seed: eseed, random, terminals, mirror: false });
    const rated = await ratePolicy({
      weights: Float64Array.from(saved.weights), logSigma: Float64Array.from(saved.logSigma),
      norm: saved.normalisation, pool: builds,
      seed: eseed, bouts: boutsPerOpponent(bouts), workers, cap, terminals, pools,
      ...shapeOfLog(paths.log),
    });
    for (const which of pools) {
      const on = rated.byPool[which];
      keep(arm, {
        iteration: saved.iteration, bouts: boutsPerOpponent(bouts), per: on.per,
        // The pool travels with the row, as it does in `scripts/rate-snapshots.mjs`, and for that
        // file's reason: two ratings on two pools are two instruments however alike the rows look.
        pool: { builds: on.builds, terminals: [...terminals], mirror: on.mirror },
        mirror: on.mirror,
        uniform: { bar: on.differences.uniform.bar, sem: on.differences.uniform.barSem, d: on.differences.uniform.d },
        driver: { bar: on.differences.driver.bar, sem: on.differences.driver.barSem, d: on.differences.driver.d },
        // Session 02 of the signal set's column, beside the two this row has always carried and on
        // exactly the same bouts. Spread conditionally rather than written unconditionally so that
        // a `rateArms` row and a `rateSnapshots` row agree about what an absent block means.
        ...(on.differences.fencer === undefined ? {} : {
          fencer: {
            bar: on.differences.fencer.bar, sem: on.differences.fencer.barSem,
            d: on.differences.fencer.d,
          },
        }),
        fit: on.results.fit,
      });
    }
  }
  return rows;
}

/**
 * A designed mind named to `--designed`, as the three names one is known by in this file.
 *
 * `policy` is what the golem offers and is what a worker builds. `key` is the contender's name in
 * the evaluation, and it is deliberately **not** the policy name: `PPO_LEAGUE` carries
 * `golem-driver` and `golem-fencer`, and a contender keyed by a policy the league also holds would
 * put the same string on both sides of a row -- where `columnsOf` takes `left` unconditionally and
 * returns a self-play column wearing a paired column's name. Keyed `driver` and `fencer`, as
 * `ratePolicy` keys its own two, the two sides of that row are told apart and the designed mind
 * meets itself in the schedule exactly as the record was built. `column` is what the row carries.
 *
 * **What that self-play block is worth was measured rather than assumed, and it is worth two
 * different things on the two pools.** In the block where a designed mind faces its own policy, its
 * column is a self-play margin. On random viable pairs that is two *different* bodies, so the
 * column carries the body asymmetry the arm's column carries too and differencing removes it. On a
 * mirror both corners hold the same body, the column is zero to within its own noise --
 * `golem-fencer` measured -0.0020 +- 0.0144 over 600 mirrored bouts -- and subtracting it *adds*
 * variance: the paired interval came out 0.77x of the unpaired one, about 30 % wider. A paired
 * column is an instrument on random pairs and an anti-instrument on a mirror. See `measurements.md`
 * under Session 02 of the signal set.
 */
export function designedMind(policy) {
  const bare = String(policy).startsWith("golem-") ? String(policy).slice(6) : String(policy);
  if (!/^[a-z][a-z0-9]*$/.test(bare)) {
    throw new Error(`--designed ${policy}: a designed mind is named golem-<word>, because its `
      + "column is that word and the word has to be a field name");
  }
  return { policy: String(policy), key: bare, column: `vs${bare[0].toUpperCase()}${bare.slice(1)}` };
}

/**
 * Every arm in **one** evaluation call, so that arm minus arm is a paired difference.
 *
 * `rateArms` above rates each arm in a call of its own, which is fine for the question it was
 * written for -- how far is this arm from the two fixed baselines -- and is not fine for the
 * question a ten-arm sweep asks. Two arms rated in two calls met two draws of bodies, so the gap
 * between their means carries the difference between the draws as well as the difference between
 * the minds, and `armSummary`'s note says as much out loud. Putting every arm into one
 * `evaluate` puts all of them in front of the same bodies from the same seeds: column k's row j
 * and column l's row j are the same fight with a different mind in one corner, and the paired
 * column of their differences is what the set's criterion has been written on since Session 03 of
 * the matchup set.
 *
 * **The opponent sequence is checked rather than assumed.** The columns are split by who was in
 * the other corner -- the bar against `golem-driver` is the number the bar is stated on -- and
 * that split is only paired if every arm's block met the opponents in the same order. It does,
 * because `evaluate` schedules each contender from the same seed; a build or a league that made
 * it not do so would silently difference a bout against the driver from a bout against the
 * fencer, so it is refused by name instead.
 *
 * **Two arrangements are two instruments and both are returned.** `mirror: false` with `viable`
 * up is random viable pairs, which is the pool the set's fourth frozen choice calls the one that
 * matters; `mirror: true` is one build in both corners, which is the pool every arm's rollouts
 * were collected on and the one an arm can win by learning the pool rather than the fight. An arm
 * that wins the mirror and loses the random pool is a specialist and has to be named as one.
 *
 * ## `designed`, and the single-arm refusal beside it
 *
 * Session 02 of the signal set. `--designed golem-driver,golem-fencer` puts the hand-coded minds
 * into the same call as contenders of their own, **excluded from the control check and from the
 * arm loop**, and every arm's row then gains `vsDriver` and `vsFencer`: the difference
 * `bar[arm][i] - bar[designed][i]` over the same bouts, which is the quantity the learn set's
 * second frozen choice declared and no column in this tree could produce. It is a different
 * question from `delta`, which is the arm against the sweep's own control and asks whether a change
 * helped; this asks whether the mind beats the mind that ships.
 *
 * **A call with one arm and no designed mind is refused by name.** Session 11 of the learn set made
 * exactly that call: one arm means `bar[control]` *is* `bar[arm]`, so every `delta` is identically
 * zero, every `d` is zero, and the paired column -- the only instrument the set's criterion is
 * stated on -- is disabled by construction. Nothing in the row it printed said so. With a designed
 * mind named there is a paired column again and one arm is a legitimate call, which is what makes
 * the refusal a statement about the column rather than about the arm count.
 */
export async function ratePaired(manifest, {
  dir, bouts, workers, cap = 60, control, league = PPO_LEAGUE, mirror = false, onProgress = null,
  seed = null, designed = [],
}) {
  // The evaluation seed is the sweep's own unless a caller names one. A named one is how a bar
  // stated in a plan at a fixed seed is taken *at that seed* rather than at whatever the arms
  // happened to be run under: the criterion is a property of the fight, and a table measured on a
  // pool the plan did not name is a table answering a question nobody asked. It is printed with
  // the row, so the two can never be confused in the record.
  const eseed = seed === null ? (manifest.seed ^ 0xc0f1c0f1) >>> 0 : seed >>> 0;
  const { random, terminals } = manifest.pool;
  const pool = poolFor({ seed: eseed, random, terminals, mirror });
  const contenders = {};
  const at = {};
  for (const arm of manifest.arms) {
    const paths = armPaths(manifest, arm, dir);
    // A league arm's mind is the live main in `league.json` and not a trainer checkpoint, which it
    // never writes. Without this branch every league sweep fell out of the loop here and the mode
    // refused with "no arm of this sweep has left a checkpoint to rate" -- which is how Session 10
    // of the learn set found that the paired table, the only instrument the set's criterion is
    // stated on, could not be pointed at the script the set's arms are run with.
    if (manifest.script === "league") {
      if (!existsSync(join(paths.home, "league.json"))) continue;
      const state = loadLeague(paths.home);
      const shape = shapeOfLog(paths.log);
      contenders[arm.name] = checkShape(arm.name, {
        ...contenderFor(state.main, false, shape.tactics ?? null),
        ...contenderShape({ features: shape.features, spec: shape.spec, tactics: shape.tactics }),
        pi: Array.from(state.main.weights), logSigma: Array.from(state.main.logSigma),
        normalisation: state.main.norm, sample: false,
      }, state.main.weights);
      at[arm.name] = state.iteration;
      continue;
    }
    const checkpoint = checkpointFor(paths.log);
    if (!existsSync(checkpoint)) continue;
    const saved = JSON.parse(readFileSync(checkpoint, "utf8"));
    const shape = shapeOfLog(paths.log);
    contenders[arm.name] = checkShape(arm.name, {
      ...contenderShape({ features: shape.features, spec: shape.spec, tactics: shape.tactics }),
      pi: saved.weights, logSigma: saved.logSigma, normalisation: saved.normalisation,
      // The greedy read, because what would ship is the mode and not a draw from around it.
      sample: false,
    }, saved.weights);
    at[arm.name] = saved.iteration;
  }
  const names = Object.keys(contenders);
  if (names.length === 0) throw new Error("no arm of this sweep has left a checkpoint to rate");
  if (!names.includes(control)) {
    throw new Error(`the control is "${control}", which is not among the rated arms `
      + `(${names.join(", ")}); every number in this table is a difference against it`);
  }
  const minds = designed.map(designedMind);
  if (names.length < 2 && minds.length === 0) {
    throw new Error(`this call rates one arm ("${names[0]}") and names no designed mind, so the `
      + "control is the arm and every paired column in the table would be identically zero -- "
      + "which is the confound Session 11 of the learn set shipped its headline table under. "
      + "Rate two arms against each other, or pass --designed golem-driver,golem-fencer");
  }
  for (const mind of minds) {
    if (Object.hasOwn(contenders, mind.key)) {
      throw new Error(`--designed ${mind.policy} wants the contender name "${mind.key}", and an arm `
        + "of this sweep is already called that; rename the arm");
    }
    contenders[mind.key] = { policy: mind.policy };
  }
  // Arms first and designed minds after, which is the order `evaluate` schedules its blocks in and
  // therefore the order `columnsOf` reads them back in. `names` stays the arms alone, so the
  // control check above, the printed table and `rated.names` are what they were.
  const columns = Object.keys(contenders);
  const per = boutsPerOpponent(bouts, league);
  const { rows, results } = await evaluate({
    contenders, league, pool, seed: eseed, bouts: per, workers, cap, mirror, viable: !mirror,
    onProgress,
  });
  const block = rows.length / columns.length;
  if (!Number.isInteger(block)) {
    throw new Error(`${rows.length} rows do not divide among ${columns.length} contenders`);
  }
  const facedBy = (k) => Array.from({ length: block }, (_, i) => {
    const row = rows[k * block + i];
    const me = row.left.policy === columns[k] ? "left" : "right";
    return row[me === "left" ? "right" : "left"].policy;
  });
  const order = facedBy(0);
  for (let k = 1; k < columns.length; k += 1) {
    const theirs = facedBy(k);
    for (let i = 0; i < block; i += 1) {
      if (theirs[i] === order[i]) continue;
      throw new Error(`bout ${i}: ${columns[0]} met ${order[i]} and ${columns[k]} met ${theirs[i]}, `
        + "so the two columns are not the same fight and their difference is not paired");
    }
  }
  const { points, bar } = columnsOf(rows, columns);
  const against = {};
  const designedAgainst = {};
  for (const opponent of [...league, "all"]) {
    const keep = [];
    for (let i = 0; i < block; i += 1) if (opponent === "all" || order[i] === opponent) keep.push(i);
    const control_ = keep.map((i) => bar[control][i]);
    const table = {};
    // What the designed minds themselves did over exactly these bouts, so a paired difference can
    // be read back as two bars rather than only as a gap.
    designedAgainst[opponent] = Object.fromEntries(minds.map((mind) => {
      const b = keep.map((i) => bar[mind.key][i]);
      return [mind.key, {
        policy: mind.policy, column: mind.column, bouts: keep.length,
        bar: meanOf(b), barSem: semOf(b), barD: cohensD(b),
        points: meanOf(keep.map((i) => points[mind.key][i])),
      }];
    }));
    for (const name of names) {
      const b = keep.map((i) => bar[name][i]);
      const p = keep.map((i) => points[name][i]);
      const diff = b.map((x, i) => x - control_[i]);
      // The paired column the set's criterion names: this arm minus a designed mind, bout by bout,
      // over the same bodies from the same seeds. `sem` here is the spread of the *difference* and
      // `barSem` above it is the spread of the arm's own margin; the two are the whole of what
      // pairing buys and printing them in one line is how a reader can see it.
      const paired = Object.fromEntries(minds.map((mind) => {
        const theirs = keep.map((i) => bar[mind.key][i]);
        const gap = b.map((x, i) => x - theirs[i]);
        return [mind.column, { bar: meanOf(gap), sem: semOf(gap), d: cohensD(gap) }];
      }));
      table[name] = {
        arm: name, iteration: at[name], bouts: keep.length,
        bar: meanOf(b), barSem: semOf(b), points: meanOf(p),
        ...paired,
        // The ordered list of them, so a formatter prints the columns this row actually has in the
        // order they were asked for rather than guessing from field names.
        pairedColumns: minds.map((mind) => mind.column),
        // The effect size of the arm's *own* bar margin against whoever was in the other corner,
        // standardised by that margin's per-bout spread. It is kept, it keeps its label, and
        // **no bar in the signal set or after it quotes it**: Session 02 of that set ruled that a
        // bar is stated on a paired column or it is not stated, because this number's denominator
        // is a spread of 0.605 of a bar over fifty-two heterogeneous builds -- the body's variation
        // and not the mind's. `d` beside it is arm minus control and asks whether a change helped;
        // the `vs` columns above are arm minus a designed mind and are what the criterion names.
        barD: cohensD(b),
        delta: meanOf(diff), deltaSem: semOf(diff), d: cohensD(diff),
      };
    }
    against[opponent] = table;
  }
  return {
    seed: eseed, mirror, control, names, league: [...league], bouts: per, block,
    // Said out loud beside the seed, because a table taken at a seed the sweep was not run under
    // is a different pool and a reader six months later has no other way to know which it holds.
    rateSeed: seed === null ? null : seed >>> 0,
    pool: { builds: pool.length, terminals: [...terminals], random },
    designed: minds, designedAgainst,
    at, against, results,
  };
}

/**
 * One arm's line of a paired table: its own bar against this opponent, its effect size against
 * that opponent, and its difference from the control.
 *
 * The three quantities are three different criteria and the line says which is which. `own d` is
 * the arm's own bar margin against whoever was in the other corner, standardised by that margin's
 * own per-bout spread -- the number this set's first ruling says no bar may be stated on.
 * `vs control` is the arm against the sweep's own control arm, which is what a sweep asks of a
 * change. `vsFencer` and its siblings are the arm against a designed mind bout by bout, which is
 * what the criterion names. A line that printed any of them unlabelled would be read as one of the
 * others by whoever came next.
 *
 * **The control's own row says `(control; no paired column)` and not a row of zeroes.** Session 02
 * of the signal set. The control differenced against itself is identically zero at every bout, so
 * `vs control +0.0000 d 0.000` is not a measurement of anything -- and at one arm, which is how
 * Session 11 of the learn set ran it, *every* row of the table read that way and nothing said so.
 */
export function formatPairedRow(row, control) {
  const own = `bar ${signed(row.bar, 4)} +-${(1.96 * row.barSem).toFixed(4)}`
    + `${row.barD === undefined ? "" : ` own d ${signed(row.barD, 3)}`}`;
  const paired = (row.pairedColumns ?? [])
    .filter((column) => row[column] !== undefined)
    .map((column) => `  ${column} ${signed(row[column].bar, 4)} `
      + `+-${(1.96 * row[column].sem).toFixed(4)} d ${signed(row[column].d, 3)}`)
    .join("");
  if (row.arm === control) {
    return `  ${row.arm.padEnd(4)} ${String(row.iteration).padStart(4)}  ${own}  `
      + `(control; no paired column)${paired}`;
  }
  return `  ${row.arm.padEnd(4)} ${String(row.iteration).padStart(4)}  ${own}  `
    + `vs control ${signed(row.delta, 4)} +-${(1.96 * row.deltaSem).toFixed(4)}  d ${signed(row.d, 3)}`
    + paired;
}

const signed = (x, places) => `${x >= 0 ? "+" : "-"}${Math.abs(x).toFixed(places)}`;

/** One rated snapshot as a row of the paired table: the arm, the snapshot, and the two margins. */
export function formatRatingRow(row) {
  const u = row.uniform;
  const d = row.driver;
  const f = row.fencer ?? null;
  const on = (row.pool?.mirror ?? row.mirror) === false ? "rand" : "mirr";
  return `  ${row.arm.padEnd(16)} ${String(row.iteration).padStart(6)} ${on}  `
    + `uniform ${signed(u.bar, 4)} +-${(1.96 * u.sem).toFixed(4)} d ${signed(u.d, 3)}  |  `
    + `driver ${signed(d.bar, 4)} +-${(1.96 * d.sem).toFixed(4)} d ${signed(d.d, 3)}`
    + (f === null ? ""
      : `  |  fencer ${signed(f.bar, 4)} +-${(1.96 * f.sem).toFixed(4)} d ${signed(f.d, 3)}`);
}

/**
 * Each arm's last rated row, which is where the sweep's own question is read.
 *
 * The caller prints the differences between these rows, and prints them *as differences* rather
 * than as a criterion: two arms rated in separate calls do not give this file their per-build
 * columns, so a `d` between them would not be the set's paired one. Each arm's own `d` against the
 * baselines goes beside the gap, which is what a reader needs to decide whether a pair is worth
 * re-rating together at a larger bout count. Saying that out loud is cheaper than a table that
 * looks like a criterion and is not one.
 */
export function armSummary(rows) {
  const last = new Map();
  // Keyed on the arm *and* the arrangement since Session 10 of the learn set, because an arm now
  // writes a row a pool and keying on the name alone would silently drop one of the two -- and the
  // one it dropped would be whichever the loop happened to reach first.
  for (const row of rows) last.set(`${row.arm}::${(row.pool?.mirror ?? row.mirror) === false ? "random" : "mirror"}`, row);
  return [...last.values()];
}

// ------------------------------------------------------------------------------------- main

const isMain = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const argv = process.argv.slice(2);
  // Everything the runner does not recognise is handed to every arm, ahead of its own flags, so
  // the smoke run in this session's Verification block -- `--iterations 1 --bouts 8` -- is the
  // committed manifest with two numbers turned down rather than a second manifest to keep in step.
  const OWN = Object.freeze([
    "manifest", "workers", "root", "only", "from", "minutes", "restarts", "rate-bouts", "rate-cap",
    "status", "paired", "against", "designed", "rate-seed", "rate-pools",
  ]);
  const own = new Map();
  const extra = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const bare = token.startsWith("--") ? token.slice(2) : null;
    if (bare === "dry-run") { own.set("dry-run", "yes"); continue; }
    if (bare !== null && OWN.includes(bare)) { own.set(bare, argv[i + 1]); i += 1; continue; }
    extra.push(token);
  }
  const manifestPath = own.get("manifest");
  if (manifestPath === undefined) throw new Error("--manifest names the sweep to run");
  const manifest = readManifest(readFileSync(resolve(manifestPath), "utf8"));
  // The one runner flag that is also a manifest field. A committed manifest names no checkpoint,
  // because `tournaments/` is gitignored and a worked example that cannot run on a fresh clone is
  // not one; the start every arm shares is therefore either the seed alone or this.
  if (own.has("from")) manifest.from = own.get("from");
  const only = own.get("only");
  if (only !== undefined) {
    const wanted = only.split(",").map((s) => s.trim()).filter(Boolean);
    const missing = wanted.filter((n) => !manifest.arms.some((arm) => arm.name === n));
    if (missing.length > 0) {
      throw new Error(`--only names ${missing.join(", ")}, which this sweep does not have; `
        + `its arms are ${manifest.arms.map((arm) => arm.name).join(", ")}`);
    }
    manifest.arms = manifest.arms.filter((arm) => wanted.includes(arm.name));
  }
  const available = Number(own.get("workers") ?? availableParallelism());
  // A pass-through flag the runner also has to read, because the collector budget is a function of
  // it. The command line wins over the manifest's `common`, which is `armArgs`'s own precedence.
  const shards = Math.max(1, Number(flagValue(extra, "shards") ?? flagValue(manifest.common, "shards") ?? 1));
  const workers = workerBudget(manifest.arms.length, available, shards);
  const root = resolve(own.get("root") ?? "tournaments/sweeps");
  const minutes = Math.max(0, Number(own.get("minutes") ?? 0));
  const restarts = Math.max(0, Number(own.get("restarts") ?? MAX_RESTARTS));
  const status = Math.max(0, Number(own.get("status") ?? 30));
  const cap = Number(own.get("rate-cap") ?? 60);
  const rateBouts = Math.max(0, Number(own.get("rate-bouts") ?? manifest.rate.bouts));
  // A bar stated in a plan names its own seed, and it is taken at that seed or it is not that bar.
  const rateSeed = own.has("rate-seed") ? Number(own.get("rate-seed")) >>> 0 : null;
  const ratePools = parsePools(own.get("rate-pools") ?? null);
  const home = resolve(root, manifest.name);
  const started = new Date().toISOString();

  console.log(`sweep ${manifest.name}: ${manifest.arms.length} ${manifest.script} arms, seed ${manifest.seed}, `
    + `${workers} workers${shards > 1 ? ` and ${shards} fit shards` : ""} each of ${available} available, `
    + `${poolLine(manifest.pool)}`);
  if (manifest.from !== null) console.log(`  every arm starts from ${manifest.from}`);
  if (minutes > 0) console.log(`  stopping every arm after ${minutes} minutes`);

  if (own.has("paired")) {
    // **A mode and not a step of the run.** The arms have to have stopped before this is a
    // measurement at all -- a rating taken while ten trainers are collecting is a rating on a
    // different clock -- and after a six-hour night the person asking for the table is not the
    // process that launched the arms. So it reads what is on disk, starts nothing, and refuses a
    // control that is not one of the arms it found.
    const control = own.get("paired");
    const against = (own.get("against") ?? PPO_LEAGUE.join(",")).split(",")
      .map((name) => name.trim()).filter(Boolean);
    // Off unless asked for, because turning it on costs a contender's whole schedule and every
    // table already written down was taken without it.
    const designed = (own.get("designed") ?? "").split(",").map((name) => name.trim()).filter(Boolean);
    const rateWorkers = Math.max(1, available - 2);
    const out = [];
    for (const which of ratePools) {
      const mirror = which === "mirror";
      const point = mirror ? "mirrored" : "random viable pairs";
      console.log("");
      console.log(`${manifest.name} on ${point}: every arm in one call against ${against.join(" and ")}, `
        + `${boutsPerOpponent(rateBouts, against)} bouts an opponent, seed `
        + `${rateSeed === null ? (manifest.seed ^ 0xc0f1c0f1) >>> 0 : rateSeed}`
        + `${rateSeed === null ? "" : " (named on the command line, not the sweep's own)"}`
        + `${designed.length === 0 ? "" : `, paired against ${designed.join(" and ")}`}`);
      const rated = await ratePaired(manifest, {
        dir: root, bouts: rateBouts, workers: rateWorkers, cap, control, league: against, mirror,
        seed: rateSeed, designed,
      });
      out.push(rated);
      console.log(`  pool: ${rated.pool.builds} builds, ${rated.block} bouts a contender`);
      for (const opponent of [...against, "all"]) {
        console.log(`  against ${opponent}:`);
        for (const name of rated.names) console.log(formatPairedRow(rated.against[opponent][name], control));
        // The designed minds' own bars over the same bouts, so the gap above can be read back as
        // two margins rather than only as a difference.
        for (const mind of rated.designed) {
          const row = rated.designedAgainst[opponent][mind.key];
          console.log(`  ${mind.key.padEnd(4)} ${"--".padStart(4)}  bar ${signed(row.bar, 4)} `
            + `+-${(1.96 * row.barSem).toFixed(4)} own d ${signed(row.barD, 3)}  (designed)`);
        }
      }
    }
    writeFileSync(join(home, "paired.json"), JSON.stringify(out, null, 2) + "\n");
    console.log("");
    console.log(`  written to ${relative(HERE, join(home, "paired.json")).replaceAll("\\", "/")}`);
  } else if (own.has("dry-run")) {
    for (const arm of manifest.arms) {
      console.log(`  ${arm.name}: node ${armArgs(manifest, arm, { workers, shards, root, extra }).join(" ")}`);
    }
  } else {
    for (const arm of manifest.arms) {
      const paths = armPaths(manifest, arm, root);
      const held = manifest.script === "league" ? join(paths.home, "league.json") : paths.log;
      if (existsSync(held)) {
        throw new Error(`${held} exists; an arm does not start on top of another arm's run. `
          + "Move the sweep's directory aside, or give the sweep a new name");
      }
    }
    mkdirSync(home, { recursive: true });
    // The copied manifest is the sweep's own record and is what Session 02's `readSweep` reads:
    // the arms as they were resolved, the budget the arithmetic gave them, and when they started.
    writeFileSync(join(home, "manifest.json"), JSON.stringify({
      ...manifest, started, available, workers, shards, minutes, extra,
      arms: manifest.arms.map((arm) => ({
        ...arm, log: relative(HERE, armPaths(manifest, arm, root).log).replaceAll("\\", "/"),
      })),
    }, null, 2) + "\n");

    const summary = await superviseArms(manifest, {
      workers, shards, dir: root, extra, minutes, restarts, status,
    });
    console.log("");
    for (const arm of summary) {
      console.log(`  ${arm.name.padEnd(16)} exit ${arm.code}, ${arm.restarts} restart${arm.restarts === 1 ? "" : "s"}`);
    }

    if (rateBouts > 0) {
      const per = boutsPerOpponent(rateBouts);
      console.log("");
      console.log(`rating every arm on one pool: ${per} bouts an opponent, `
        + `${per * PPO_LEAGUE.length} a contender, seed ${(manifest.seed ^ 0xc0f1c0f1) >>> 0}`);
      const rows = await rateArms(manifest, {
        dir: root, bouts: rateBouts, workers: Math.max(1, available - 2), cap, pools: ratePools,
        onRow: (row) => console.log(formatRatingRow(row)),
      });
      writeFileSync(join(home, "rating.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
      console.log("");
      console.log("  the arms at their last rated snapshot:");
      const last = armSummary(rows);
      for (const row of last) console.log(formatRatingRow(row));
      // The pairwise differences, said as differences rather than as a criterion, for the reason
      // `armSummary` gives: these arms were rated in separate calls and the set's criterion is a
      // paired d over one set of bodies.
      for (let i = 0; i < last.length; i += 1) {
        for (let j = i + 1; j < last.length; j += 1) {
          // Only within one arrangement: a mirrored row minus a random-pairs row is two
          // instruments subtracted, which is the mistake this whole session is about.
          const mine = (last[i].pool?.mirror ?? last[i].mirror);
          if (mine !== (last[j].pool?.mirror ?? last[j].mirror)) continue;
          const gap = last[i].uniform.bar - last[j].uniform.bar;
          console.log(`  ${last[i].arm} - ${last[j].arm}: ${signed(gap, 4)} of bar over uniform, `
            + `their own d ${signed(last[i].uniform.d, 3)} and ${signed(last[j].uniform.d, 3)}`);
        }
      }
      console.log(`rating: ${join(home, "rating.jsonl")}`);
    }
  }
  console.log(`manifest: ${join(home, "manifest.json")}`);
}
