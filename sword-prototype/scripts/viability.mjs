// The two tables that choose the viability predicate, and the constant to paste beside them.
// Session 01 of the learn set.
//
//   node scripts/viability.mjs [--bouts 8] [--seed 20260906] [--random 40] [--workers N]
//                              [--cap 60] [--mind golem-driver] [--out tables.json]
//
// `src/golem/viability.ts` ships two frozen constants -- the classes a pool draws from, and the
// class pairs that can finish each other -- and a constant with no table beside it is an opinion.
// This is the table. It regenerates both halves from one seed and prints the literal, so a session
// that wants to move the predicate moves it by re-running this and pasting, and a reader six
// months later can ask where a number came from and get an answer that is a command.
//
// **Two measurements, because a class can fail one and pass the other.** The idle probe is the
// floor: `scripts/idle-probe.mjs` puts every build in the pool against a motionless copy of itself,
// so a class that cannot kill a dummy cannot decide anything at all. The random-pairs table is the
// question the screen actually asks: two *different* bodies, the same reference mind on both, and
// the decided fraction per unordered class pair. A plate fails the first outright and clears the
// second against a maul, which is exactly the case the second rule exists for.
//
// **The reference mind is hand-coded on purpose.** `--mind` defaults to `golem-driver`, which is
// third of fourteen on random pairs and is not a learned mind. A viability set fitted around
// whatever the current fit happens to be good at would move every time the fit moved, and the pool
// a mind is trained on would then be a function of that mind -- which is the shape of circularity
// the set's frozen choices refuse everywhere else.
//
// Neither table is cheap. At the defaults it is 52 x 8 idle bouts and about 52 x 51 / 2 x 8
// random-pair ones, which was 35 minutes on the 32-thread dev host at 30 workers. Raw rows are not
// written unless `--out` names a file; what is meant to survive is the summary, in
// `docs/measurements.md`, and the constant, in `src/golem/viability.ts`.
import { writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { armedTerminal, pairKey } from "../src/golem/viability.ts";
import { buildPool, runJobs, scheduleJobs } from "./tournament.mjs";
import { idleProbe, rollupByTerminal } from "./idle-probe.mjs";

/** At least half, which is the whole of the rule both tables are read against. */
export const VIABLE_FLOOR = 0.5;

/**
 * The random-pairs half: one reference mind on both sides of two different bodies.
 *
 * `scheduleJobs` and not a second scheduler. Its draw is uniform over the pool and a function of
 * the seed alone, every pairing is run twice with the sides and the seeds swapped, and `mirror` is
 * left false -- which is the load-bearing flag here, because a mirrored bout is one body against
 * itself and this table is about two. `cross` drops the mirror *policy* pairs and there is one
 * policy in this run, so the cycle `policyPairs` hands back is the single self-pair and there is
 * nothing for `cross` to drop; naming it would be a flag with no reader.
 *
 * `bouts` is per unordered build pair on average rather than per pairing: the pool is n builds, so
 * n(n-1)/2 pairs, and a run that asked for eight bouts a pair over a fifty-two build pool and got
 * eight bouts total would be an hour of nothing. The draws are random rather than exhaustive, so
 * that is a mean and not a guarantee, and a class pair the pool holds two builds of gets fewer
 * rows than one it holds forty of -- which is why the table prints its own bout count per row and
 * a reader can see which of its numbers is worth anything.
 */
export async function pairSweep({
  pool, mind = "golem-driver", bouts = 8, workers = 8, cap = 60, seed = 20260906, onProgress = null,
}) {
  if (pool.length < 2) throw new Error("a pair sweep needs two builds to draw between");
  const pairings = Math.max(1, Math.ceil((pool.length * (pool.length - 1) / 2) * bouts / 2));
  const jobs = scheduleJobs({ pool, policies: [mind], pairings, seed, cap, mirror: false });
  const rows = await runJobs(jobs, { workers, onProgress });
  return { rows: rows.filter((row) => row !== null), pairings, jobs: jobs.length };
}

/**
 * The decided fraction per unordered class pair, and per build.
 *
 * A bout is decided when it has a winner; a bout that reaches the cap with both bars up is not,
 * and that is the whole quantity. The per-build column is here so that the builds no class can
 * decide against get named -- the record has said "thirteen of the fifty-two reference builds
 * decide nothing at any vitality total" since the matchup set and has never listed them.
 */
export function rollupByPair(rows) {
  const pairs = new Map();
  const builds = new Map();
  for (const row of rows) {
    const left = armedTerminal(row.left.setup);
    const right = armedTerminal(row.right.setup);
    const key = pairKey(left, right);
    if (!pairs.has(key)) pairs.set(key, { key, a: left < right ? left : right, b: left < right ? right : left, bouts: 0, decided: 0 });
    const p = pairs.get(key);
    p.bouts += 1;
    if (row.winner !== null) p.decided += 1;
    for (const side of ["left", "right"]) {
      const name = row[side].build;
      if (!builds.has(name)) builds.set(name, { name, terminal: armedTerminal(row[side].setup), bouts: 0, decided: 0, won: 0 });
      const b = builds.get(name);
      b.bouts += 1;
      if (row.winner !== null) b.decided += 1;
      if (row.winner === side) b.won += 1;
    }
  }
  const rate = (t) => (t.bouts === 0 ? 0 : t.decided / t.bouts);
  return {
    pairs: [...pairs.values()].map((p) => ({ ...p, rate: rate(p) })).sort((x, y) => y.rate - x.rate || x.key.localeCompare(y.key)),
    builds: [...builds.values()].map((b) => ({ ...b, rate: rate(b) })).sort((x, y) => x.rate - y.rate || x.name.localeCompare(y.name)),
  };
}

/**
 * The predicate, read off the two tables.
 *
 * A class is seeded into the set by the idle floor -- half its own bouts against a dummy -- and
 * then the pair rule is run to a fixed point: any class that decides at least half against a class
 * already in the set joins it, which may admit a third class that only clears the bar against the
 * second. Written as a loop rather than as one pass because the order of the classes is not a
 * thing the answer is allowed to depend on, and a single pass over an arbitrarily ordered list is
 * exactly that dependency.
 *
 * `VIABLE_PAIRS` is then the unordered pairs *among the admitted classes* that clear the same
 * floor, which is a narrower set than "every pair the sweep liked": a class admitted only by its
 * matchup against a maul contributes that pair and not its own mirror.
 */
export function choose(byTerminal, byPair, floor = VIABLE_FLOOR) {
  const rateOf = (key) => byPair.find((p) => p.key === key)?.rate ?? 0;
  const viable = new Set(byTerminal.filter((g) => g.killRate >= floor).map((g) => g.terminal));
  const classes = byTerminal.map((g) => g.terminal);
  for (;;) {
    const added = classes.filter((c) => !viable.has(c)
      && [...viable].some((v) => rateOf(pairKey(c, v)) >= floor));
    if (added.length === 0) break;
    for (const c of added) viable.add(c);
  }
  // Ordered by the idle rate, so the constant reads down from the class that decides most.
  const terminals = byTerminal.filter((g) => viable.has(g.terminal)).map((g) => g.terminal);
  const pairs = byPair
    .filter((p) => viable.has(p.a) && viable.has(p.b) && p.rate >= floor)
    .map((p) => p.key)
    .sort();
  return { terminals, pairs };
}

// -------------------------------------------------------------------------------- the printing

const percent = (x) => `${(x * 100).toFixed(0)} %`;

/** The idle table, as `src/golem/viability.ts` carries it. */
export function formatIdleTable(byTerminal) {
  const lines = [
    "| armed terminal | builds | kill rate | dummy bar left |",
    "| --- | ---: | ---: | ---: |",
  ];
  for (const g of byTerminal) {
    lines.push(`| ${g.terminal} | ${g.builds} | ${percent(g.killRate)} | ${g.theirBar.toFixed(3)} |`);
  }
  return lines.join("\n");
}

/** The pair table, as a matrix would not fit: one row an unordered class pair. */
export function formatPairTable(byPair) {
  const lines = [
    "| class pair | bouts | decided |",
    "| --- | ---: | ---: |",
  ];
  for (const p of byPair) lines.push(`| ${p.a} vs ${p.b} | ${p.bouts} | ${percent(p.rate)} |`);
  return lines.join("\n");
}

/**
 * The literal to paste. Printed rather than written, because the module it goes into carries the
 * two tables and a page of prose around it, and a generator that rewrote that file would have to
 * own the prose too.
 */
export function formatConstants({ terminals, pairs }) {
  const list = terminals.map((t) => JSON.stringify(t)).join(", ");
  const rows = [];
  for (let i = 0; i < pairs.length; i += 3) {
    rows.push("  " + pairs.slice(i, i + 3).map((p) => JSON.stringify(p)).join(", "));
  }
  // An empty set is printed as an empty set rather than as a hole with a comma in it. It is a
  // real outcome of a short run -- nothing clears half at a twenty second cap -- and a generator
  // whose degenerate output does not parse is a generator that lies about what it measured.
  const set = pairs.length === 0
    ? "export const VIABLE_PAIRS: ReadonlySet<string> = new Set([]);"
    : ["export const VIABLE_PAIRS: ReadonlySet<string> = new Set([", rows.join(",\n") + ",", "]);"].join("\n");
  return [
    `export const VIABLE_TERMINALS: readonly string[] = Object.freeze([${list}]);`,
    "/** Class pairs, unordered, that decide at least half their bouts on random pairs. */",
    set,
  ].join("\n");
}

// ------------------------------------------------------------------------------------- main

const isMain = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
  };
  const seed = Number(flag("seed", 20260906)) >>> 0;
  const bouts = Math.max(2, Number(flag("bouts", 8)));
  const random = Math.max(0, Number(flag("random", 40)));
  const cap = Number(flag("cap", 60));
  const workers = Math.max(1, Number(flag("workers", Math.max(1, availableParallelism() - 2))));
  const mind = flag("mind", "golem-driver");
  const out = flag("out", null);
  // The whole pool, always: this is the script that decides what the viable subset is, so drawing
  // it through the predicate it is about would be the circularity the module's doc comment refuses.
  const pool = buildPool({ seed, random });
  const started = Date.now();
  const since = () => `${((Date.now() - started) / 1000).toFixed(0)} s`;
  console.log(`viability: ${mind} over ${pool.length} builds, seed ${seed}, ${bouts} bouts a pair, `
    + `${workers} workers, cap ${cap} s`);

  console.log("");
  console.log(`-- the idle floor: every build against a motionless copy of itself (${since()})`);
  const probe = await idleProbe({
    pool, name: mind, bouts, workers, cap, seed,
    onProgress: ({ done, total }) => {
      if (done % 128 === 0 || done === total) console.log(`  idle ${done}/${total} bouts, ${since()}`);
    },
  });
  const byTerminal = rollupByTerminal(probe.builds);
  console.log("");
  console.log(formatIdleTable(byTerminal));

  console.log("");
  console.log(`-- the random pairs: two different bodies, ${mind} on both sides (${since()})`);
  const swept = await pairSweep({
    pool, mind, bouts, workers, cap, seed,
    onProgress: ({ done, total }) => {
      if (done % 512 === 0 || done === total) console.log(`  pairs ${done}/${total} bouts, ${since()}`);
    },
  });
  const { pairs: byPair, builds } = rollupByPair(swept.rows);
  console.log("");
  console.log(formatPairTable(byPair));
  const decided = swept.rows.filter((row) => row.winner !== null).length;
  console.log("");
  console.log(`${swept.rows.length} random-pair bouts over ${swept.pairings} pairings, `
    + `${decided} decided = ${percent(swept.rows.length === 0 ? 0 : decided / swept.rows.length)}`);

  // The builds nothing could finish, by name. The record has counted them since the matchup set
  // and has never listed them, which is the difference between a number and a thing to act on.
  const dead = builds.filter((b) => b.decided === 0);
  console.log("");
  if (dead.length === 0) {
    console.log(`every one of the ${builds.length} builds decided at least one of its bouts`);
  } else {
    console.log(`${dead.length} of ${builds.length} builds decided none of their bouts either way:`);
    for (const b of dead) console.log(`  ${b.name} (${b.terminal}), ${b.bouts} bouts`);
  }

  const chosen = choose(byTerminal, byPair);
  console.log("");
  console.log("-- paste into src/golem/viability.ts --");
  console.log(formatConstants(chosen));
  console.log(`-- ${since()} --`);

  if (out !== null) {
    writeFileSync(resolve(out), JSON.stringify({
      seed, bouts, random, cap, mind, date: new Date().toISOString(),
      idle: byTerminal, pairs: byPair, builds, chosen,
    }, null, 2) + "\n");
    console.log(`tables in ${out}`);
  }
}
