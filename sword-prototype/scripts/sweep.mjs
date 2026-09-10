// Several experiments at once: a manifest of arms, one seed, one start, the host's threads split
// between them, and one rating afterwards. Session 04 of the learn set.
//
//   node scripts/sweep.mjs --manifest docs/sweeps/example.json
//        [--workers 32]     -- the host's threads to divide; absent is availableParallelism()
//        [--root tournaments/sweeps] [--only arm-1,arm-2] [--from checkpoint.json]
//        [--minutes 0] [--restarts 3]
//        [--rate-bouts N]   -- absent is the manifest's own; 0 rates nothing
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
  PPO_LEAGUE, checkpointFor, parseTerminals, poolFor, poolSentence, ratePolicy,
} from "./train-ppo.mjs";
import { boutsPerOpponent, rateSnapshots } from "./rate-snapshots.mjs";

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
    return { name: armName, flags: asFlags(entry.flags ?? [], `arm "${armName}"`) };
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
 * Collectors an arm: `floor((available - 2) / arms)`, and never fewer than one.
 *
 * The two that come off the top are the host's -- a desktop that cannot repaint is a desktop
 * somebody reboots in the middle of the night -- and the arm's own fit thread is left inside the
 * count on purpose: it is busy for four fifths of an iteration and the collectors are idle for
 * exactly that stretch, so counting it again would leave the machine short by one thread an arm at
 * the only moment they are all working. At 32 threads: one arm 30, three 10, four 7, eight 3.
 */
export function workerBudget(arms, available = availableParallelism()) {
  if (!Number.isInteger(arms) || arms < 1) throw new Error(`a sweep of ${arms} arms is not a sweep`);
  return Math.max(1, Math.floor((available - 2) / arms));
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
 */
export function armArgs(manifest, arm, { workers, root, extra = [], resume = false }) {
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
  args.push("--workers", String(workers), "--evaluate", "0");
  args.push("--random", String(manifest.pool.random), "--terminals", manifest.pool.terminals.join(","));
  const strip = (flags) => withoutFlags(flags, POOL_FLAGS);
  return [...args, ...extra, ...strip(arm.flags), ...strip(manifest.common)];
}

/**
 * One arm launched as its own process, with its own worker pool.
 *
 * `spawn` is a parameter so the supervisor can be tested against a child that exits when the test
 * says to. That is not a convenience: the thing worth testing is the restart, and the way to test
 * a restart with a real trainer is to kill one, which makes the test a race against a process that
 * takes minutes to reach its first checkpoint.
 */
export function spawnArm(arm, { manifest, workers, dir, extra = [], resume = false, spawn = spawnChild }) {
  const args = armArgs(manifest, arm, { workers, root: dir, extra, resume });
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
  workers, dir, extra = [], spawn = spawnChild, restarts = MAX_RESTARTS, minutes = 0,
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
        manifest, workers, dir, extra, resume: resume || attempt > 0, spawn,
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
export async function rateArms(manifest, { dir, bouts, workers, cap = 60, onRow = null }) {
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
        dir: paths.home, bouts, workers, cap, random, terminals,
        onRow: (row) => keep(arm, row),
      });
      continue;
    }
    const checkpoint = checkpointFor(paths.log);
    if (!existsSync(checkpoint)) continue;
    const saved = JSON.parse(readFileSync(checkpoint, "utf8"));
    const builds = poolFor({ seed: eseed, random, terminals, mirror: true });
    const rated = await ratePolicy({
      weights: Float64Array.from(saved.weights), logSigma: Float64Array.from(saved.logSigma),
      norm: saved.normalisation, pool: builds,
      seed: eseed, bouts: boutsPerOpponent(bouts), workers, cap, mirror: true, terminals,
    });
    keep(arm, {
      iteration: saved.iteration, bouts: boutsPerOpponent(bouts), per: rated.per,
      // The pool travels with the row, as it does in `scripts/rate-snapshots.mjs`, and for that
      // file's reason: two ratings on two pools are two instruments however alike the rows look.
      pool: { builds: builds.length, terminals: [...terminals] },
      uniform: { bar: rated.differences.uniform.bar, sem: rated.differences.uniform.barSem, d: rated.differences.uniform.d },
      driver: { bar: rated.differences.driver.bar, sem: rated.differences.driver.barSem, d: rated.differences.driver.d },
      fit: rated.results.fit,
    });
  }
  return rows;
}

const signed = (x, places) => `${x >= 0 ? "+" : "-"}${Math.abs(x).toFixed(places)}`;

/** One rated snapshot as a row of the paired table: the arm, the snapshot, and the two margins. */
export function formatRatingRow(row) {
  const u = row.uniform;
  const d = row.driver;
  return `  ${row.arm.padEnd(16)} ${String(row.iteration).padStart(6)}  `
    + `uniform ${signed(u.bar, 4)} +-${(1.96 * u.sem).toFixed(4)} d ${signed(u.d, 3)}  |  `
    + `driver ${signed(d.bar, 4)} +-${(1.96 * d.sem).toFixed(4)} d ${signed(d.d, 3)}`;
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
  for (const row of rows) last.set(row.arm, row);
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
    "status",
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
  const workers = workerBudget(manifest.arms.length, available);
  const root = resolve(own.get("root") ?? "tournaments/sweeps");
  const minutes = Math.max(0, Number(own.get("minutes") ?? 0));
  const restarts = Math.max(0, Number(own.get("restarts") ?? MAX_RESTARTS));
  const status = Math.max(0, Number(own.get("status") ?? 30));
  const cap = Number(own.get("rate-cap") ?? 60);
  const rateBouts = Math.max(0, Number(own.get("rate-bouts") ?? manifest.rate.bouts));
  const home = resolve(root, manifest.name);
  const started = new Date().toISOString();

  console.log(`sweep ${manifest.name}: ${manifest.arms.length} ${manifest.script} arms, seed ${manifest.seed}, `
    + `${workers} workers each of ${available} available, ${poolLine(manifest.pool)}`);
  if (manifest.from !== null) console.log(`  every arm starts from ${manifest.from}`);
  if (minutes > 0) console.log(`  stopping every arm after ${minutes} minutes`);

  if (own.has("dry-run")) {
    for (const arm of manifest.arms) {
      console.log(`  ${arm.name}: node ${armArgs(manifest, arm, { workers, root, extra }).join(" ")}`);
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
      ...manifest, started, available, workers, minutes, extra,
      arms: manifest.arms.map((arm) => ({
        ...arm, log: relative(HERE, armPaths(manifest, arm, root).log).replaceAll("\\", "/"),
      })),
    }, null, 2) + "\n");

    const summary = await superviseArms(manifest, { workers, dir: root, extra, minutes, restarts, status });
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
        dir: root, bouts: rateBouts, workers: Math.max(1, available - 2), cap,
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
