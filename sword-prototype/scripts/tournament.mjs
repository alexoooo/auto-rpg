// The tournament: seeded golem-versus-golem bouts across every hardware thread, over random and
// reference builds, rated per policy and per policy-by-build-class.
//
//     npm run tournament                                   -- 64 bouts of the duelist against itself
//     npm run tournament -- --bouts 512 --workers 8        -- more, on fewer threads
//     npm run tournament -- --policies golem-duelist,golem-fencer
//     npm run tournament -- --seed 777001 --random 40      -- another corpus, a bigger random pool
//     npm run tournament -- --read tournaments/x.jsonl     -- the tables again, from the log
//
// Every bout is `scripts/bout-runner.mjs`'s, run in `scripts/tournament-worker.mjs` on a fresh
// Havok module, so a row here is the same bout the measure runs and the page runs. Results go
// to a JSON-lines file under `tournaments/`, which is gitignored: what is committed is the
// summary in `docs/measurements.md`, with the seed that regenerates the file.
//
// **A job is plain data and a run is a function of its seed.** The pool of builds, the pairings,
// the policy assignment and every bout's seeds come from `--seed` alone through `mulberry32`
// and `seedFor`, and each job is run side-swapped as the next job. Workers pull jobs in index
// order and rows are written in index order whatever order they finish in, so the file two runs
// produce under one seed is the same file to the byte -- `tests/tournament.test.mjs` asserts it
// over two workers. **Ratings are Elo**, walked over the rows in index order with one K, per
// policy from the bouts whose policies differ and per policy-by-build-class from the bouts
// whose classes differ; a mirror bout of one policy on one class rates nothing and is kept for
// its structural columns. Pool and pairings, never best-of-N: the dev host runs 32 bouts at
// once and a bracket is a queue.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker, isMainThread } from "node:worker_threads";

import { defaultGolemSetup, describeGolemSetup, golemSetupRefusal, randomGolemSetup } from "../src/golem/build.ts";
import { mulberry32 } from "../src/rng.ts";
import { unitDefinition } from "../src/units.ts";

/** Bumped when a row's shape changes; `--read` refuses a file written under another. */
export const TOURNAMENT_VERSION = 1;

/** Elo's K. Twenty-four: fast enough for a few hundred bouts to separate, slow enough not to chase noise. */
export const ELO_K = 24;
export const ELO_START = 1000;

/**
 * The edges of the reach bands a build class is made of, metres of `BodyView.reach` as the body
 * publishes it at the first sample. Short is a capped socket or a fist; mid is a mace, a plate or
 * a whip; long is a blade or a maul at full extension. A build's class is its armed terminal
 * crossed with its band, so a rating can say "blades at long reach" without naming a chain.
 */
export const REACH_BANDS = Object.freeze([
  { name: "short", below: 1.0 },
  { name: "mid", below: 1.5 },
  { name: "long", below: Infinity },
]);

const setup = (over) => ({ ...defaultGolemSetup(), ...over });
const both = (chain, terminal) => ({ primary: { chain, terminal }, secondary: { chain, terminal } });

/**
 * The reference pool: a dozen named builds a rating has a stable floor to stand on.
 *
 * The random draw over 2376 assemblies gives a rating breadth; these give it a place to come
 * back to, so a policy rated on Monday and a policy rated on Friday were rated on at least
 * twelve of the same bodies. One slot moved at a time from the default where that is the point
 * (the wheel, the multileg, the plated trunk, the ram head), and the four weapons of the matchup
 * set each in the default's hands. Every one is checked by `golemSetupRefusal` at load, so a
 * pair the registry stops offering fails the run at the top rather than in a worker.
 */
export const REFERENCE_BUILDS = Object.freeze([
  { name: "default", setup: setup({}) },
  { name: "two-blades", setup: setup(both("wrist", "blade")) },
  { name: "mace", setup: setup({ primary: { chain: "wrist", terminal: "mace" } }) },
  { name: "maul", setup: setup(both("wrist", "maul")) },
  { name: "whip", setup: setup({ primary: { chain: "wrist", terminal: "whip" } }) },
  { name: "fists", setup: setup(both("wrist", "fist")) },
  { name: "ram-capped", setup: setup({ head: "head.ram", ...both("none", "none") }) },
  { name: "ram-blade", setup: setup({ head: "head.ram" }) },
  { name: "wheel", setup: setup({ locomotion: "locomotion.wheel" }) },
  { name: "multileg", setup: setup({ locomotion: "locomotion.multileg" }) },
  { name: "plated", setup: setup({ torso: "torso.plated" }) },
  { name: "pitch-blade", setup: setup({ primary: { chain: "pitch", terminal: "blade" }, secondary: { chain: "pitch", terminal: "plate" } }) },
].map((build) => Object.freeze({ ...build, setup: Object.freeze(build.setup) })));

for (const build of REFERENCE_BUILDS) {
  const refusal = golemSetupRefusal(build.setup);
  if (refusal !== null) throw new Error(`reference build "${build.name}" is refused: ${refusal}`);
}

/**
 * A seed per side per pairing, from the run's seed and the pairing number. The measure's
 * `seedFor` restated here rather than imported, because this file must load without Havok: the
 * pool and the schedule are tested and read back without a worker in sight.
 */
export function seedFor(runSeed, pairing, slot) {
  let x = (runSeed ^ Math.imul(pairing + 1, 0x9e3779b9) ^ Math.imul(slot + 1, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/** The reference pool plus `random` seeded draws, each named by its place and captioned. */
export function buildPool({ seed, random }) {
  const rng = mulberry32(seed ^ 0x5eed);
  const drawn = Array.from({ length: random }, (_, i) => ({
    name: `draw-${i + 1}`,
    setup: randomGolemSetup(rng),
  }));
  return [...REFERENCE_BUILDS, ...drawn].map((build) => ({
    ...build, caption: describeGolemSetup(build.setup),
  }));
}

/** The ordered policy pairs a run cycles through: every policy against every policy, itself included. */
export function policyPairs(policies) {
  const pairs = [];
  for (const a of policies) for (const b of policies) pairs.push([a, b]);
  return pairs;
}

/**
 * The job list: `pairings` draws of two builds from the pool, each run twice with the sides
 * swapped and the seeds swapped with them, policies cycling over the ordered pairs.
 */
export function scheduleJobs({ pool, policies, pairings, seed, cap }) {
  const golem = unitDefinition("golem");
  for (const policy of policies) {
    if (!golem.driverOptions.some((option) => option.name === policy)) {
      throw new Error(`"${policy}" is not a policy the golem offers`);
    }
  }
  if (pool.length === 0) throw new Error("a tournament needs a build to run");
  const rng = mulberry32(seed ^ 0x0b0e);
  const pairs = policyPairs(policies);
  const jobs = [];
  for (let pairing = 0; pairing < pairings; pairing += 1) {
    const a = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    const b = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    const [policyA, policyB] = pairs[pairing % pairs.length];
    const sideA = { build: a.name, setup: a.setup, policy: policyA, seed: seedFor(seed, pairing, 0) };
    const sideB = { build: b.name, setup: b.setup, policy: policyB, seed: seedFor(seed, pairing, 1) };
    jobs.push({ index: jobs.length, pairing, swapped: false, cap, left: sideA, right: sideB, seeds: [sideA.seed, sideB.seed] });
    jobs.push({ index: jobs.length, pairing, swapped: true, cap, left: sideB, right: sideA, seeds: [sideB.seed, sideA.seed] });
  }
  return jobs;
}

/** The hand a build fights with: its primary, or its secondary when the primary is capped. */
export function armedHand(build) {
  return build.primary.terminal !== "none" ? "primary" : "secondary";
}

/** The terminal in that hand. */
export function armedTerminal(build) {
  return build[armedHand(build)].terminal;
}

export function reachBand(reach) {
  return REACH_BANDS.find((band) => reach < band.below).name;
}

/**
 * `blade/long`, `mace/mid`, `none/short`: the class a rating row is keyed by. The reach is the
 * armed hand's own, as the worker read it off the published view, and not the body's:
 * `BodyView.reach` is the primary socket's, and a build with a capped primary and a whip on the
 * secondary publishes the cap's 0.24 m there while lashing at two.
 */
export function buildClass(side) {
  return `${armedTerminal(side.setup)}/${reachBand(side.reach)}`;
}

const expected = (mine, theirs) => 1 / (1 + 10 ** ((theirs - mine) / 400));

/**
 * Elo over the rows in index order, for one keying of the two sides.
 *
 * `key(side)` names the entity a side plays as; when both sides of a row are the same entity
 * the row is counted but moves nothing. A draw is half a win each way.
 */
export function elo(rows, key, k = ELO_K) {
  const table = new Map();
  const entry = (name) => {
    if (!table.has(name)) table.set(name, { name, rating: ELO_START, bouts: 0, wins: 0, draws: 0, losses: 0 });
    return table.get(name);
  };
  for (const row of [...rows].sort((a, b) => a.index - b.index)) {
    const left = entry(key(row.left));
    const right = entry(key(row.right));
    const scoreLeft = row.winner === "left" ? 1 : row.winner === "right" ? 0 : 0.5;
    for (const [side, score] of [[left, scoreLeft], [right, 1 - scoreLeft]]) {
      side.bouts += 1;
      if (score === 1) side.wins += 1; else if (score === 0) side.losses += 1; else side.draws += 1;
    }
    if (left === right) continue;
    const gainLeft = k * (scoreLeft - expected(left.rating, right.rating));
    left.rating += gainLeft;
    right.rating -= gainLeft;
  }
  return [...table.values()].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const quantile = (xs, q) => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

/** The structural columns for the sides `pick` selects, so a rating is never read alone. */
function structural(rows, pick) {
  const sides = [];
  const winners = [];
  const seconds = [];
  const changed = [];
  for (const row of rows) {
    for (const name of ["left", "right"]) {
      if (!pick(row[name])) continue;
      sides.push(row[name]);
      seconds.push(row.seconds);
      changed.push(row.leadChanges > 0 ? 1 : 0);
      if (row.winner === name) winners.push(row[name].vitality);
    }
  }
  return {
    bouts: sides.length,
    damage: mean(sides.map((side) => side.damage)),
    contacts: mean(sides.map((side) => side.contacts)),
    severs: sides.reduce((sum, side) => sum + side.severs, 0),
    winnerBar: mean(winners),
    insideInner: mean(sides.map((side) => side.insideInner)),
    leadChanged: mean(changed),
    seconds: quantile(seconds, 0.5),
  };
}

/** Ratings and structural columns per policy and per policy-by-class, plus a policy matrix. */
export function summarize(rows) {
  const byPolicy = elo(rows, (side) => side.policy).map((entry) => ({
    ...entry, ...structural(rows, (side) => side.policy === entry.name),
  }));
  const classKey = (side) => `${side.policy} @ ${buildClass(side)}`;
  const byClass = elo(rows, classKey).map((entry) => ({
    ...entry, ...structural(rows, (side) => classKey(side) === entry.name),
  }));
  const policies = byPolicy.map((entry) => entry.name);
  const matrix = policies.map((a) => policies.map((b) => {
    let wins = 0, bouts = 0;
    for (const row of rows) {
      for (const [me, them] of [["left", "right"], ["right", "left"]]) {
        if (row[me].policy !== a || row[them].policy !== b) continue;
        bouts += 1;
        if (row.winner === me) wins += 1; else if (row.winner === null) wins += 0.5;
      }
    }
    return { wins, bouts };
  }));
  const decided = rows.filter((row) => row.winner !== null).length;
  return { bouts: rows.length, decided, byPolicy, byClass, policies, matrix };
}

const pad = (value, width) => String(value).padStart(width);
const fixed = (value, digits, width) => pad(value.toFixed(digits), width);

export function formatSummary(summary) {
  const lines = [];
  const columns = "   elo  bouts  w/d/l          damage/bout  contacts  severs  winner bar  inside inner  lead changed  p50 s";
  const row = (entry) =>
    `${fixed(entry.rating, 0, 6)}  ${pad(entry.bouts, 5)}  ${pad(`${entry.wins}/${entry.draws}/${entry.losses}`, 12)}  ` +
    `${fixed(entry.damage, 1, 11)}  ${fixed(entry.contacts, 1, 8)}  ${pad(entry.severs, 6)}  ` +
    `${fixed(entry.winnerBar, 3, 10)}  ${fixed(entry.insideInner * 100, 1, 11)}%  ${fixed(entry.leadChanged * 100, 1, 11)}%  ` +
    `${fixed(entry.seconds, 1, 5)}`;
  lines.push(`=== policies -- ${summary.bouts} bouts, ${summary.decided} decided ===`);
  lines.push(`  ${"policy".padEnd(20)}${columns}`);
  for (const entry of summary.byPolicy) lines.push(`  ${entry.name.padEnd(20)}${row(entry)}`);
  if (summary.policies.length > 1) {
    lines.push("");
    lines.push("=== policy against policy -- wins for the row, draws as a half ===");
    lines.push(`  ${"".padEnd(20)}${summary.policies.map((name) => pad(name, 20)).join("")}`);
    summary.policies.forEach((name, i) => {
      lines.push(`  ${name.padEnd(20)}${summary.matrix[i].map((cell) =>
        pad(cell.bouts === 0 ? "-" : `${cell.wins}/${cell.bouts}`, 20)).join("")}`);
    });
  }
  lines.push("");
  lines.push("=== policy by build class -- the armed terminal, and the reach band it was published at ===");
  lines.push(`  ${"policy @ class".padEnd(36)}${columns}`);
  for (const entry of summary.byClass) lines.push(`  ${entry.name.padEnd(36)}${row(entry)}`);
  return lines.join("\n");
}

/** The rows of a JSON-lines file, refused by version; the header is returned beside them. */
export function readRows(path) {
  const lines = readFileSync(path, "utf8").split("\n").filter((line) => line.length > 0);
  if (lines.length === 0) throw new Error(`${path} is empty`);
  const header = JSON.parse(lines[0]);
  if (header.version !== TOURNAMENT_VERSION) {
    throw new Error(`${path} was written under tournament version ${header.version}; this is ${TOURNAMENT_VERSION}`);
  }
  return { header, rows: lines.slice(1).map((line) => JSON.parse(line)) };
}

const workerUrl = new URL("./tournament-worker.mjs", import.meta.url);

/**
 * Run the jobs over `workers` threads and return the rows in index order.
 *
 * Each worker takes one job at a time and asks for the next by returning a row; the rows are
 * collected by index and handed to `onRow` as the contiguous prefix grows, which is how the
 * file is written in order while the run is still going. A worker that throws fails the run,
 * by design: a tournament with a hole in it is not the tournament its seed names.
 */
export function runJobs(jobs, { workers, onRow = null, onProgress = null }) {
  return new Promise((resolvePromise, reject) => {
    const rows = new Array(jobs.length).fill(null);
    let next = 0;
    let done = 0;
    let flushed = 0;
    const pool = [];
    const started = Date.now();
    const finish = () => {
      for (const worker of pool) worker.postMessage({ type: "stop" });
      resolvePromise(rows);
    };
    const fail = (error) => {
      for (const worker of pool) worker.terminate();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const feed = (worker) => {
      if (next >= jobs.length) return;
      worker.postMessage({ type: "job", job: jobs[next] });
      next += 1;
    };
    if (jobs.length === 0) { resolvePromise(rows); return; }
    const count = Math.max(1, Math.min(workers, jobs.length));
    for (let i = 0; i < count; i += 1) {
      const worker = new Worker(workerUrl);
      pool.push(worker);
      worker.on("message", (message) => {
        if (message.type === "ready") { feed(worker); return; }
        if (message.type === "error") { fail(new Error(`job ${message.index} failed in a worker: ${message.message}`)); return; }
        rows[message.row.index] = message.row;
        done += 1;
        while (flushed < rows.length && rows[flushed] !== null) {
          onRow?.(rows[flushed]);
          flushed += 1;
        }
        onProgress?.({ done, total: jobs.length, seconds: (Date.now() - started) / 1000 });
        if (done === jobs.length) finish(); else feed(worker);
      });
      worker.on("error", fail);
      worker.on("exit", (code) => { if (code !== 0 && done < jobs.length) fail(new Error(`a worker exited with ${code}`)); });
    }
  });
}

/**
 * A whole run: pool, schedule, workers, file, summary. Returns the rows and the summary.
 *
 * `out` is written as it goes: the header line first, then a row per finished job in index
 * order. Nothing about the date goes into a row, so two files from one seed differ in the
 * header's `date` field and nowhere else.
 */
export async function runTournament({
  seed, bouts, workers, policies, random, cap, out, onProgress = null,
}) {
  const pool = buildPool({ seed, random });
  const jobs = scheduleJobs({ pool, policies, pairings: Math.ceil(bouts / 2), seed, cap });
  mkdirSync(dirname(out), { recursive: true });
  const header = {
    version: TOURNAMENT_VERSION, seed, date: new Date().toISOString(), policies, bouts: jobs.length, cap, random,
    pool: pool.map(({ name, setup, caption }) => ({ name, setup, caption })),
  };
  const lines = [JSON.stringify(header)];
  writeFileSync(out, `${lines[0]}\n`);
  const rows = await runJobs(jobs, {
    workers,
    onRow(row) {
      const line = JSON.stringify(row);
      lines.push(line);
      writeFileSync(out, lines.join("\n") + "\n");
    },
    onProgress,
  });
  return { header, pool, jobs, rows, summary: summarize(rows), out };
}

// `isMainThread` because a worker inherits the main script's `argv`, and a worker that imports
// this module for `armedHand` must not start a second tournament from inside the first.
const isMain = isMainThread && process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
  };
  const read = flag("read", null);
  if (read !== null) {
    const { header, rows } = readRows(read);
    console.log(`${read}: seed ${header.seed}, ${rows.length} of ${header.bouts} bouts, policies ${header.policies.join(", ")}, ${header.date}`);
    console.log(formatSummary(summarize(rows)));
  } else {
    const seed = Number(flag("seed", 20260906)) >>> 0;
    const bouts = Math.max(2, Number(flag("bouts", 64)));
    // Half the hardware threads, not all of them. Measured on the 16-core, 32-thread dev host
    // over the same 256 bouts: 8 workers 4.2 bouts a second, 16 workers 5.5, 32 workers 5.1. A
    // golem bout is an iterative solver over two dozen constraints and the second thread on a
    // core buys nothing; past the core count the workers take turns. `docs/measurements.md`,
    // Session 04 of the matchup set, has the table.
    const workers = Math.max(1, Number(flag("workers", Math.max(1, Math.floor(availableParallelism() / 2)))));
    const policies = flag("policies", "golem-duelist").split(",").map((name) => name.trim()).filter(Boolean);
    const random = Math.max(0, Number(flag("random", 20)));
    const cap = Number(flag("cap", 60));
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
    // Concatenated rather than a template, because the docs gate reads a backticked span that ends
    // in a file extension as a path reference, and this one is a name the run makes up.
    const out = resolve(flag("out", "tournaments/" + stamp + "-" + seed + "-" + policies.join("+") + ".jsonl"));
    if (existsSync(out)) throw new Error(`${out} exists; name another with --out`);
    console.log(`seed ${seed}, ${bouts} bouts, ${workers} workers, cap ${cap} s, policies ${policies.join(", ")}, ` +
      `${REFERENCE_BUILDS.length} reference builds + ${random} drawn`);
    let lastReport = 0;
    const { rows, summary } = await runTournament({
      seed, bouts, workers, policies, random, cap, out,
      onProgress({ done, total, seconds }) {
        if (done === total || seconds - lastReport >= 10) {
          lastReport = seconds;
          console.error(`  ${done}/${total} bouts, ${(done / seconds).toFixed(1)} a second`);
        }
      },
    });
    console.log(formatSummary(summary));
    console.log(`\n${rows.length} rows in ${out}`);
  }
}
