// Tune the fencer's and the planner's numbers by a (1+λ) evolution strategy on the tournament
// harness, and write the champions out as `src/golem/tactics-champions.ts`. Session 07 of the
// matchup set.
//
//   node scripts/tune.mjs --seed 20260907 --generations 30 --lambda 4 --bouts 64 --workers 16
//                         [--classes general|auto|general,sword/long,...] [--min-builds 3]
//                         [--sigma 0.25] [--rate 0.15] [--margin 0] [--random 40] [--cap 60] [--confirm 128]
//                         [--league golem-duelist,golem-fencer,golem-planner]
//                         [--start tournaments/earlier.jsonl] --out tournaments/tune.jsonl
//                         [--write src/golem/tactics-champions.ts]
//
// **What is tuned.** Every numeric row of `GOLEM_TACTICS_V2` the fencer reads from its own
// table and the four rows of `GOLEM_PLANNER` the planner plays with (`explore` stays zero):
// sixty-two numbers, `GENOME` below. Nine numeric rows are left out because a champion cannot
// move them: the eight of the sword's stroke shape, which `STROKE_SHAPES.sword` reads live from
// the duelist's `GOLEM_TACTICS` and never from the fencer's table, and `guardReach`, behind the
// `guardByTheirs` switch that is on. The first long run's genome had all seventy-one, and a
// census under common random numbers -- one bout per row with the row moved, on nine builds --
// found those nine identical to the byte on every build; each row has a bound made from its
// default -- a quarter to four times a positive row,
// two scales either side of a zero or negative one, a `Fraction`, the discount and a row the
// fencer writes into the intent as a fraction of full capped at one, the horizon an integer.
// The switches stay where Session 05 measured them.
//
// **What a fitness is.** The bar margin -- a contender's own vitality less its opponent's at
// the end of the bout, averaged -- against a frozen league of the shipped minds, on the
// mirrored pool where one body fights itself and the mind is the whole difference; the points
// per bout (a win one, a draw a half) are scored beside it and are what the table reports. Not
// the Elo the plan named: in a run where the league's ratings float with every contender's
// results, Elo is not a frozen scale, and the same league at a fixed denominator orders the
// contenders the same way. The margin rather than the points because it is the reading the
// cap decides on and it tells a bout won by a bar from one won by a hair, which a hill-climb
// wants; it buys no quiet, though -- measured over 192 bouts a contender the per-bout spread
// is 0.44 for both readings (`docs/measurements.md`, Session 07), so the search resolves
// differences of a few hundredths and nothing finer. The parent and its λ children are scored
// in one run on one seed, so each meets the same bodies with the same streams; a change that
// moves no decision leaves the rows identical to the byte, and one that moves any leaves a
// fresh draw, because a bout is chaotic past the first decision that differs. A child replaces
// the parent when it beats it by `--margin` on that shared seed, and the seed changes every
// generation so the search is not fitted to one draw of bodies. Nothing in a contender's row
// is a mind that another contender could learn from; the league is fixed for the run, which
// is what stops the search cycling.
//
// **Per arm class, after a general vector.** A census of the pool -- one short idle bout per
// build -- reads each build's arm class as the champion mind will read it off its own view
// (`src/golem/champion.ts`); every class with `--min-builds` builds is then tuned on its own
// pool, starting from the general champion. The general vector is what a class without a row
// plays.
//
// **What is written.** A generation log as JSON lines under `tournaments/` (gitignored), and
// the champion module, each entry with the confirmation score of the vector and of the defaults
// on a seed the search never saw, so a table's number is not a winner's-curse number. A vector
// that confirms below the defaults is logged and left out of the table: the first long run's
// `sword/long` accepted four children and confirmed at 0.514 against 0.532, which is what a
// hill-climb on a noisy reading does, and a row that lost on the held-out seed is not a
// champion however it scored on the seeds it was chosen on.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { CHAMPION_VERSION, checkChampions } from "../src/golem/champion.ts";
import { GOLEM_PLANNER } from "../src/golem/planner.ts";
import { GOLEM_TACTICS_V2 } from "../src/golem/tactics-v2.ts";
import { mulberry32 } from "../src/rng.ts";
import { buildPool, runJobs, scheduleJobs, summarize } from "./tournament.mjs";

/** The planner's rows the tuner moves. */
export const PLANNER_ROWS = Object.freeze(["horizon", "discount", "aggression", "caution"]);

/** The league a run scores against when `--league` names none. */
export const DEFAULT_LEAGUE = Object.freeze(["golem-duelist", "golem-fencer", "golem-planner"]);

/** Rows written into the intent as a fraction of full: bounded at one, since the body refuses more. */
const INTENT_ROWS = new Set(["strafe", "voidStep", "voidStrafe"]);

/**
 * Numeric rows of the fencer's table that a champion cannot move: the sword's stroke shape reads
 * the duelist's `GOLEM_TACTICS` live (`STROKE_SHAPES.sword`) and not the fencer's copy, and
 * `guardReach` is only read with `guardByTheirs` off. Moving one of these in an override moves
 * no decision, which the dead-row census of Session 07 measured to the byte.
 */
export const INERT_ROWS = Object.freeze(new Set([
  "chamberSwing", "chamberLift", "chamberReach", "followSwing", "followLift", "strokeSeconds",
  "chamberSeconds", "cutRoll", "guardReach",
]));

const genomeRow = (table, name, value) => {
  const fraction = /Fraction$/.test(name) || name === "discount" || INTENT_ROWS.has(name);
  const integer = name === "horizon";
  const scale = Math.max(Math.abs(value), 0.1);
  let lo, hi;
  if (value > 0) { lo = value * 0.25; hi = value * 4; } else { lo = value - 2 * scale; hi = value + 2 * scale; }
  if (fraction) { lo = Math.max(0, lo); hi = Math.min(1, hi); }
  if (integer) { lo = Math.max(1, Math.round(lo)); hi = Math.round(hi); }
  return Object.freeze({ table, name, value, lo, hi, multiplicative: value > 0, integer, scale });
};

/** Every row the search moves, with its default and its bound. */
export const GENOME = Object.freeze([
  ...Object.entries(GOLEM_TACTICS_V2)
    .filter(([k, v]) => typeof v === "number" && !INERT_ROWS.has(k))
    .map(([k, v]) => genomeRow("fencer", k, v)),
  ...PLANNER_ROWS.map((k) => genomeRow("planner", k, GOLEM_PLANNER[k])),
]);

/** The defaults as a vector: what the shipped fencer and planner play. */
export function defaultVector() {
  const out = { fencer: {}, planner: {} };
  for (const row of GENOME) out[row.table][row.name] = row.value;
  return out;
}

const gauss = (random) => {
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round4 = (x) => Math.round(x * 1e4) / 1e4;

/**
 * One child: every row moves with probability `rate`, a positive row by a log-normal factor of
 * width `sigma` and a zero or negative one by a normal step of `sigma` scales, clamped to its
 * bound; a child that would have moved nothing moves one row, so no child is its parent.
 */
export function mutate(vector, random, { sigma, rate }, rows = GENOME) {
  const out = { fencer: { ...vector.fencer }, planner: { ...vector.planner } };
  const step = (row) => {
    const current = out[row.table][row.name];
    let next = row.multiplicative ? current * Math.exp(sigma * gauss(random)) : current + sigma * row.scale * gauss(random);
    next = clamp(next, row.lo, row.hi);
    if (row.integer) next = Math.round(next);
    next = round4(next);
    if (next === current) return false;
    out[row.table][row.name] = next;
    return true;
  };
  let moved = 0;
  for (const row of rows) if (random() < rate && step(row)) moved += 1;
  for (let tries = 0; moved === 0 && tries < 32; tries += 1) {
    if (step(rows[Math.floor(random() * rows.length)])) moved += 1;
  }
  return out;
}

/** The rows on which two vectors differ, for a log line. */
export function diffVectors(a, b) {
  const out = [];
  for (const row of GENOME) {
    const x = a[row.table][row.name];
    const y = b[row.table][row.name];
    if (x !== y) out.push({ table: row.table, name: row.name, from: x, to: y });
  }
  return out;
}

/**
 * The arm class of every build in the pool, read off a real body: one bout per build, both
 * sides idle, a tenth of a second, and the class the worker read at the first sample.
 */
export async function census(pool, { workers, seed }) {
  const jobs = pool.map((build, index) => {
    const side = { build: build.name, setup: build.setup, policy: "idle", seed };
    return { index, pairing: index, swapped: false, cap: 0.1, left: side, right: side, seeds: [seed, seed] };
  });
  const rows = await runJobs(jobs, { workers });
  const classes = {};
  for (const row of rows) {
    const cls = row.left.arm;
    (classes[cls] ??= []).push(row.left.build);
  }
  return classes;
}

/**
 * Score every contender against the league on one seed: each contender's schedule is drawn
 * from the seed alone, so all of them meet the same bodies with the same streams, `bouts`
 * bouts against each league policy, mirrored. Returns the summary rows keyed by contender,
 * with `score` the points per bout.
 *
 * **Session 08 of the style set makes four of the run's choices arguments.** `mirror` was the
 * hard-coded `true` above and stays the default, because a search wants the pool where the mind
 * is the whole difference; a *confirmation* wants random pairs as well, since that is the pool
 * the picker's default is read off, and it wants them under the same common random numbers. The
 * other three -- `record`, `explore` and `behaviour` -- ride through to the workers so that a
 * confirmation can take its decision log and its behaviour records in the same bouts it is
 * scored on, rather than in a second run whose draw is a different draw.
 *
 * **`viable` is the pairing predicate and only bites when `mirror` is off.** A mirrored pool has
 * already been narrowed to builds that can finish themselves, so there is nothing left for a pair
 * rule to say; over random pairs there is, and the learn set's fourth frozen choice is that the
 * pool that matters is random *viable* pairs. Off by default, because every caller written before
 * Session 09 of the learn set was rating on a mirror and would be measuring a different pool if
 * this quietly turned on.
 */
export async function evaluate({
  contenders, league, pool, seed, bouts, workers, cap, onProgress = null,
  mirror = true, record = null, explore = 0, behaviour = false, viable = false,
}) {
  const names = Object.keys(contenders);
  const jobs = [];
  for (const name of names) {
    const scheduled = scheduleJobs({
      pool, policies: [name, ...league], pairings: Math.ceil(bouts / 2) * league.length, seed, cap,
      mirror, viable, contenders, pairs: league.map((policy) => [name, policy]),
    });
    for (const job of scheduled) jobs.push({ ...job, index: jobs.length });
  }
  const rows = await runJobs(jobs, { workers, contenders, record, explore, behaviour, onProgress });
  const summary = summarize(rows);
  const margins = {};
  for (const row of rows) {
    for (const [me, them] of [["left", "right"], ["right", "left"]]) {
      if (!names.includes(row[me].policy)) continue;
      (margins[row[me].policy] ??= []).push(row[me].vitality - row[them].vitality);
    }
  }
  const results = {};
  for (const entry of summary.byPolicy) {
    if (!names.includes(entry.name)) continue;
    const m = margins[entry.name] ?? [];
    results[entry.name] = {
      ...entry,
      score: entry.bouts === 0 ? 0 : (entry.wins + entry.draws / 2) / entry.bouts,
      margin: m.length === 0 ? 0 : m.reduce((a, b) => a + b, 0) / m.length,
    };
  }
  return { rows, results, summary };
}

/** A generation: the parent and λ children scored together; the best child replaces the parent when it beats it by the margin. */
export async function generation({
  parent, lambda, sigma, rate, league, pool, seed, bouts, workers, cap, margin = 0, onProgress = null,
}) {
  const random = mulberry32(seed);
  const contenders = { parent };
  for (let i = 1; i <= lambda; i += 1) contenders[`child-${i}`] = mutate(parent, random, { sigma, rate });
  const { results } = await evaluate({ contenders, league, pool, seed, bouts, workers, cap, onProgress });
  const children = Object.keys(contenders).filter((name) => name !== "parent")
    .sort((a, b) => results[b].margin - results[a].margin || a.localeCompare(b));
  const best = children[0];
  const accepted = results[best].margin > results.parent.margin + margin;
  return {
    results, best, accepted,
    next: accepted ? contenders[best] : parent,
    changes: accepted ? diffVectors(parent, contenders[best]) : [],
    bouts: Object.values(results).reduce((sum, r) => sum + r.bouts, 0),
  };
}

/** The whole search for one class: generations from `start`, then the confirmation run. */
export async function tune({
  cls, start, pool, league, seed, generations, lambda, sigma, rate, bouts, confirm, workers, cap, margin = 0, log = null,
  onProgress = null,
}) {
  let parent = start;
  let spent = 0;
  for (let g = 1; g <= generations; g += 1) {
    const gseed = (seed ^ Math.imul(g, 0x9e3779b9) ^ hashClass(cls)) >>> 0;
    const started = Date.now();
    const result = await generation({ parent, lambda, sigma, rate, league, pool, seed: gseed, bouts, workers, cap, margin, onProgress });
    spent += result.bouts;
    const line = {
      type: "generation", class: cls, generation: g, seed: gseed, seconds: (Date.now() - started) / 1000,
      bouts: result.bouts, accepted: result.accepted, best: result.best, changes: result.changes,
      scores: Object.fromEntries(Object.entries(result.results).map(([k, r]) => [k, round4(r.score)])),
      margins: Object.fromEntries(Object.entries(result.results).map(([k, r]) => [k, round4(r.margin)])),
      parent: result.next,
    };
    log?.(line);
    parent = result.next;
  }
  const cseed = (seed ^ 0xc0f1c0f1 ^ hashClass(cls)) >>> 0;
  const { results } = await evaluate({
    contenders: { champion: parent, baseline: defaultVector() }, league, pool, seed: cseed, bouts: confirm, workers, cap, onProgress,
  });
  spent += results.champion.bouts + results.baseline.bouts;
  const entry = {
    class: cls, builds: pool.length, generations, bouts: spent,
    score: round4(results.champion.score), baseline: round4(results.baseline.score),
    margin: round4(results.champion.margin), baselineMargin: round4(results.baseline.margin),
    fencer: parent.fencer, planner: parent.planner,
  };
  log?.({ type: "champion", class: cls, seed: cseed, entry, confirmation: results });
  return { entry, confirmation: results };
}

const hashClass = (cls) => {
  let h = 0x811c9dc5;
  for (const ch of cls) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h;
};

/** The module text: a header that says where the numbers came from, then the literal. */
export function renderChampionsModule(tables) {
  checkChampions(tables);
  const entries = [tables.general, ...Object.values(tables.classes)].filter((e) => e !== null);
  const summary = entries.map((e) =>
    `//   ${e.class.padEnd(18)} ${String(e.builds).padStart(3)} builds, ${e.generations} generations, ${e.bouts} bouts, ` +
    `scored ${e.score.toFixed(3)} against ${e.baseline.toFixed(3)} for the defaults`);
  return [
    "// GENERATED by scripts/tune.mjs -- do not edit; regenerate.",
    "//",
    `// Champion tables, version ${tables.version}, tuned ${tables.date || "never"} from seed ${tables.seed}` +
    (tables.league.length ? ` against ${tables.league.join(", ")}:` : ":"),
    ...(summary.length ? summary : ["//   the table of no champions; every class falls through to the defaults"]),
    "//",
    "// What the rows are, and how a mind picks its own, is in src/golem/champion.ts; a build that",
    "// reads another version refuses this file by name rather than reinterpreting it.",
    "import type { ChampionTables } from \"./champion.ts\";",
    "",
    `export const GOLEM_CHAMPIONS: ChampionTables = ${JSON.stringify(tables)};`,
    "",
  ].join("\n");
}

/** The last accepted vector of a class in an earlier log, to start from. */
export function readStart(path, cls = "general") {
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  let vector = null;
  for (const line of lines) {
    if (line.type === "generation" && line.class === cls) vector = line.parent;
    if (line.type === "champion" && line.class === cls) vector = { fencer: line.entry.fencer, planner: line.entry.planner };
  }
  if (vector === null) throw new Error(`${path} has no generation of class "${cls}"`);
  return vector;
}

/** The confirmed entry of a class in an earlier log, or null: a class run carries the general entry forward. */
export function readChampion(path, cls = "general") {
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  let entry = null;
  for (const line of lines) if (line.type === "champion" && line.class === cls) entry = line.entry;
  return entry;
}

const isMain = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
  };
  const seed = Number(flag("seed", 20260907)) >>> 0;
  const generations = Math.max(0, Number(flag("generations", 10)));
  const lambda = Math.max(1, Number(flag("lambda", 4)));
  const bouts = Math.max(2, Number(flag("bouts", 32)));
  const confirm = Math.max(2, Number(flag("confirm", bouts * 2)));
  const workers = Math.max(1, Number(flag("workers", Math.max(1, Math.floor(availableParallelism() / 2)))));
  const random = Math.max(0, Number(flag("random", 40)));
  const cap = Number(flag("cap", 60));
  const sigma = Number(flag("sigma", 0.25));
  const rate = Number(flag("rate", 0.15));
  const margin = Number(flag("margin", 0));
  const minBuilds = Math.max(1, Number(flag("min-builds", 3)));
  const league = flag("league", DEFAULT_LEAGUE.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const wanted = flag("classes", "general,auto").split(",").map((s) => s.trim()).filter(Boolean);
  const startFrom = flag("start", null);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
  const out = resolve(flag("out", "tournaments/tune-" + stamp + "-" + seed + ".jsonl"));
  const write = flag("write", null);
  if (existsSync(out)) throw new Error(`${out} exists; name another with --out`);
  mkdirSync(dirname(out), { recursive: true });
  const lines = [];
  const log = (line) => {
    lines.push(JSON.stringify(line));
    writeFileSync(out, lines.join("\n") + "\n");
  };
  const pool = buildPool({ seed, random });
  log({
    type: "header", version: CHAMPION_VERSION, seed, date: new Date().toISOString(), generations, lambda, bouts, confirm,
    workers, random, cap, sigma, rate, margin, minBuilds, league, classes: wanted, start: startFrom, genome: GENOME,
    pool: pool.map(({ name, setup, caption }) => ({ name, setup, caption })),
  });
  console.log(`seed ${seed}, ${generations} generations of 1+${lambda}, ${bouts} bouts a contender a league policy, ` +
    `${workers} workers, league ${league.join(", ")}, pool ${pool.length}, sigma ${sigma}, rate ${rate}`);
  const classes = await census(pool, { workers, seed });
  log({ type: "census", classes });
  console.log(`census: ${Object.entries(classes).map(([cls, builds]) => `${cls} ${builds.length}`).join(", ")}`);
  const order = [];
  for (const name of wanted) {
    if (name === "auto") {
      for (const [cls, builds] of Object.entries(classes).sort()) if (builds.length >= minBuilds && !order.includes(cls)) order.push(cls);
    } else if (name === "general" || name in classes) {
      if (!order.includes(name)) order.push(name);
    } else {
      throw new Error(`--classes ${name}: the census found no build of that class (${Object.keys(classes).join(", ")})`);
    }
  }
  let general = startFrom !== null ? readStart(startFrom) : defaultVector();
  const tables = {
    version: CHAMPION_VERSION, seed, date: new Date().toISOString().slice(0, 10), league,
    general: startFrom !== null ? readChampion(startFrom) : null, classes: {},
  };
  if (tables.general !== null) console.log(`starting from the general champion of ${startFrom}, scored ${tables.general.score.toFixed(3)}`);
  let lastReport = 0;
  const onProgress = ({ done, total, seconds }) => {
    if (done !== total && seconds - lastReport < 30) return;
    lastReport = seconds;
    process.stdout.write(`  ${done}/${total} bouts, ${seconds.toFixed(0)} s, ${(done / Math.max(seconds, 1e-9)).toFixed(2)} bouts/s\r`);
  };
  for (const cls of order) {
    const classPool = cls === "general" ? pool : pool.filter((build) => classes[cls].includes(build.name));
    console.log(`\n== ${cls}: ${classPool.length} builds ==`);
    const { entry } = await tune({
      cls, start: general, pool: classPool, league, seed, generations, lambda, sigma, rate, bouts, confirm, workers, cap, margin, onProgress,
      log: (line) => {
        log(line);
        if (line.type === "generation") {
          const scores = Object.entries(line.margins).map(([k, v]) => `${k === line.best ? "*" : ""}${k} ${v >= 0 ? "+" : ""}${v.toFixed(3)}/${line.scores[k].toFixed(3)}`).join("  ");
          const moved = line.changes.map((c) => `${c.name} ${c.from}->${c.to}`).join(", ");
          console.log(`  g${line.generation}: ${scores}${line.accepted ? `  accepted ${line.best}: ${moved}` : "  kept"}  (${line.bouts} bouts, ${line.seconds.toFixed(0)} s)`);
        }
      },
    });
    console.log(`  ${cls}: champion ${entry.score.toFixed(3)} (margin ${entry.margin.toFixed(3)}) against the defaults' ${entry.baseline.toFixed(3)} (${entry.baselineMargin.toFixed(3)}) on the confirmation seed`);
    if (entry.score < entry.baseline) {
      console.log(`  ${cls}: confirmed below the defaults; left out of the table`);
      log({ type: "dropped", class: cls, entry });
    } else if (cls === "general") {
      tables.general = entry;
      general = { fencer: entry.fencer, planner: entry.planner };
    } else {
      tables.classes[cls] = entry;
    }
    log({ type: "tables", tables });
    if (write !== null) writeFileSync(resolve(write), renderChampionsModule(tables));
  }
  console.log(`\n${out}${write !== null ? ` and ${write}` : ""}`);
}
