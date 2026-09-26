// The headroom audit's full bouts (skill ceiling session 05,
// `docs/plans/2026-09-25-skill-ceiling-05-headroom-audit.md`; the write-up is
// `docs/analysis/2026-09-26-headroom.md`).
//
//   node research/headroom.mjs --exp headroom   [--bodies a,b,...] [--minds m1;m2] [--pairs 8] [--lanes 8]
//   node research/headroom.mjs --exp orderings  [--pairs 16] [--lanes 8]
//   node research/headroom.mjs --exp idle       [--attackers a,b,...] [--pairs 1] [--lanes 8]
//   node research/headroom.mjs --exp attributes [--attributes id,...] [--minds m1;m2] [--pairs 8] [--lanes 8]
//   node research/headroom.mjs --exp footwork   [--pairs 16] [--lanes 8]
//   node research/headroom.mjs --exp <name> --summary [--out DIR]
//
// Every experiment is a list of **cells**, each one mind A on one body against mind B on another,
// played in **corner-swapped pairs**: one seed pair, A on the left and then A on the right, each
// mind keeping its own seed (the pair is reversed with the sides, as the league does). A pairing
// replays one opening whatever its seeds on some minds (`docs/analysis/2026-09-25-side-mirror.md`),
// so a cell is only ever read over whole pairs, and every interval is a bootstrap over seed pairs.
//
// **Common random numbers across minds.** In the headroom experiment the seeds of pair k on a body
// depend on the body and k and not on the subject's mind, so the walker, the duelist and each
// expert meet the same opponent with the same dice, and a headroom is a paired difference per seed
// pair. The attribute sweep does the same across levels.
//
// Harness: the Node bout runner through `runJobs` in `research/runner.mjs` and
// `research/headroom-worker.mjs`, the research `PROTOCOL` (150 s cap, supported locomotion). An
// `expert...` corner is session 04's reference expert (`tests/harness/expert.mjs`). Readings are
// comparable with the league and the other research-runner readings, and with nothing on the page.
import { join, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { runJobs, readResults } from "./runner.mjs";
import { PROTOCOL, seed } from "./schedule.mjs";
import { cohensD, interval } from "./stat-sweep.mjs";
import { AUDIT_BUILDS, auditBuild, familyDuelist, giantSetup, withAttribute } from "./headroom-builds.mjs";
import { ATTRIBUTE_IDS, ATTRIBUTES } from "../src/golem/attributes.ts";
import { CONFIG } from "../src/config.ts";

export const HARNESS = "Node bout runner, research runner (research/headroom-worker.mjs), supported locomotion, research PROTOCOL";

/** The ruler (the owner's defaults, 2026-09-25) and its two instruments, and the curve's lower point. */
export const RULER = "expert@c8,h1";
export const PERSIST = "expert-persist@c8,h1";
export const CURVE = "expert@c4,h1";
/** The reference opponent every headroom cell meets: the duelist on the stone default. */
export const REFERENCE = Object.freeze({ mind: "golem-duelist", build: "default" });

const buildOf = (name) => {
  if (name === "giant") return { name, setup: giantSetup() };
  const at = /^(.+)@([a-zA-Z]+)=([0-9.]+)$/.exec(name);
  if (at) {
    const base = buildOf(at[1]);
    return { name, setup: withAttribute(base.setup, at[2], Number(at[3])) };
  }
  const build = auditBuild(name);
  if (!build) throw new Error(`no audit build "${name}"`);
  return { name, setup: build.setup };
};

/**
 * One corner-swapped pair: A on `aBuild` against B on `bBuild`, A left then A right. `seedKey`
 * decides the seeds, so two cells that share it play with the same dice.
 */
function swappedPair({ exp, cell, a, b, aBuild, bBuild, seedKey, k, maxSeconds, extra = {} }) {
  const seeds = [seed("headroom-v1", exp, seedKey, k, "a"), seed("headroom-v1", exp, seedKey, k, "b")];
  const pair = `${cell}#${k}`;
  return ["left", "right"].map((aSide) => {
    const aLeft = aSide === "left";
    return { id: `${pair}/${aSide}`, round: 0, block: pair, pair, cell, k, a, b, aSide, aBuild, bBuild,
      left: aLeft ? a : b, right: aLeft ? b : a, leftBuild: aLeft ? aBuild : bBuild, rightBuild: aLeft ? bBuild : aBuild,
      seeds: aLeft ? seeds : [...seeds].reverse(), ...(maxSeconds ? { maxSeconds } : {}), ...extra };
  });
}

const list = (text) => text.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
const minds = (text) => text.split(";").map((s) => s.trim()).filter(Boolean);

/** Each experiment: its jobs from the parsed options, in the order they should run. */
export const EXPERIMENTS = {
  /**
   * Headroom: each body played by each subject mind against the reference opponent. The pairs are
   * interleaved across bodies (pair 0 of every body first), so a run cut short still covers every
   * body.
   */
  headroom(o) {
    const bodies = o.bodies ? list(o.bodies) : AUDIT_BUILDS.map((b) => b.name);
    const cellMinds = (body) => (o.minds ? minds(o.minds) : ["golem-walker", familyDuelist(buildOf(body).setup), RULER, PERSIST, CURVE])
      .filter((m, i, all) => all.indexOf(m) === i);
    const pairsOf = (mind) => (mind.startsWith("expert") ? (mind === CURVE ? o.curvePairs : o.pairs) : o.ladderPairs);
    const jobs = [];
    const most = Math.max(o.pairs, o.curvePairs, o.ladderPairs);
    for (let k = 0; k < most; k += 1) for (const body of bodies) for (const mind of cellMinds(body)) {
      if (k >= pairsOf(mind)) continue;
      jobs.push(...swappedPair({ exp: "headroom", cell: `${body}|${mind}`, a: mind, b: REFERENCE.mind, aBuild: body,
        bBuild: REFERENCE.build, seedKey: body, k, extra: { body } }));
    }
    return jobs;
  },
  /**
   * The three orderings on stone: equal minds x1 against x1.1, the expert against the duelist on
   * equal bodies, and the expert at x1 against the duelist at x1.1. A is always the side the
   * ordering says should win: the bigger body, or the better mind.
   */
  orderings(o) {
    const big = `default@size=${ATTRIBUTES.size.max}`;
    const cells = [
      ...["golem-walker", "golem-duelist"].map((m) => ({ cell: `size|${m}`, a: m, b: m, aBuild: big, bBuild: "default", n: o.ladderPairs })),
      { cell: `size|${RULER}`, a: RULER, b: RULER, aBuild: big, bBuild: "default", n: o.pairs },
      { cell: `size|${PERSIST}`, a: PERSIST, b: PERSIST, aBuild: big, bBuild: "default", n: o.pairs },
      { cell: `mind|${RULER}`, a: RULER, b: "golem-duelist", aBuild: "default", bBuild: "default", n: o.pairs },
      { cell: `mind|${PERSIST}`, a: PERSIST, b: "golem-duelist", aBuild: "default", bBuild: "default", n: o.pairs },
      { cell: `mind|golem-walker`, a: "golem-walker", b: "golem-duelist", aBuild: "default", bBuild: "default", n: o.ladderPairs },
      { cell: `skill-vs-size|${RULER}`, a: RULER, b: "golem-duelist", aBuild: "default", bBuild: big, n: o.pairs },
      { cell: `skill-vs-size|${PERSIST}`, a: PERSIST, b: "golem-duelist", aBuild: "default", bBuild: big, n: o.pairs },
    ];
    const jobs = [];
    const most = Math.max(...cells.map((c) => c.n));
    for (let k = 0; k < most; k += 1) for (const c of cells) {
      if (k < c.n) jobs.push(...swappedPair({ exp: "orderings", ...c, seedKey: "stone", k }));
    }
    return jobs;
  },
  /**
   * The idle-dummy gate with the expert: every body, played by the ruler, against an idle dummy of
   * every family and the giant. The bout stops at the overtime mark, because past it the clock
   * drains both bars and a win is the drain's (`research/idle-dummy.mjs`). Against idle, full
   * knowledge and the persistence model are one instrument: idle's last command is what it does.
   */
  idle(o) {
    const attackers = o.attackers ? list(o.attackers) : [...AUDIT_BUILDS.map((b) => b.name), "giant"];
    const dummies = { stone: "default", skeleton: "skeleton-warrior", human: "human-warrior", giant: "giant" };
    const jobs = [];
    for (let k = 0; k < o.pairs; k += 1) for (const attacker of attackers) for (const [family, dummy] of Object.entries(dummies)) {
      jobs.push(...swappedPair({ exp: "idle", cell: `${attacker}>${family}`, a: o.mind ?? RULER, b: "idle", aBuild: attacker,
        bBuild: dummy, seedKey: `${attacker}>${family}`, k, maxSeconds: CONFIG.bout.overtimeSeconds, extra: { attacker, dummy: family } }));
    }
    return jobs;
  },
  /**
   * The attribute audit: a body (`--build`, the stone default unless named) with one attribute moved
   * (A) against the same body unmoved (B), both played by one mind. `--levels` picks the levels: `ends` (min and max), or a list. The x1
   * control is the mind's own mirror at x1 against x1.
   */
  attributes(o) {
    const ids = o.attributes ? list(o.attributes) : [...ATTRIBUTE_IDS];
    const levelsOf = (id) => {
      const row = ATTRIBUTES[id];
      if (o.levels === "ends") return [row.min, row.max];
      return list(o.levels).map(Number).filter((v) => v >= row.min && v <= row.max && v !== 1);
    };
    const cells = [];
    const base = o.build ?? "default";
    for (const mind of minds(o.minds ?? RULER)) {
      cells.push({ cell: `control|${mind}`, a: mind, b: mind, aBuild: base, bBuild: base, attribute: "control", level: 1 });
      for (const id of ids) for (const level of levelsOf(id)) {
        cells.push({ cell: `${id}=${level}|${mind}`, a: mind, b: mind, aBuild: `${base}@${id}=${level}`, bBuild: base, attribute: id, level });
      }
    }
    const jobs = [];
    for (let k = 0; k < o.pairs; k += 1) for (const c of cells) {
      jobs.push(...swappedPair({ exp: "attributes", cell: c.cell, a: c.a, b: c.b, aBuild: c.aBuild, bBuild: c.bBuild,
        seedKey: `attributes-${base}`, k, extra: { attribute: c.attribute, level: c.level } }));
    }
    return jobs;
  },
  /**
   * Footwork: the ruler restricted to forward and back (`-fb`) against the duelist, beside the
   * ruler against the duelist on the same seeds, and the two experts against each other.
   */
  footwork(o) {
    const fb = "expert-fb@c8,h1";
    const cells = [
      { cell: `vs-duelist|${RULER}`, a: RULER, b: "golem-duelist" },
      { cell: `vs-duelist|${fb}`, a: fb, b: "golem-duelist" },
      { cell: `head-to-head`, a: RULER, b: fb },
    ];
    const jobs = [];
    for (let k = 0; k < o.pairs; k += 1) for (const c of cells) {
      jobs.push(...swappedPair({ exp: "footwork", ...c, aBuild: "default", bBuild: "default", seedKey: "footwork", k }));
    }
    return jobs;
  },
};

// ---------------------------------------------------------------------------------------------
// Reading a run
// ---------------------------------------------------------------------------------------------

const otherSide = (side) => (side === "left" ? "right" : "left");
const sideIndex = (side) => (side === "left" ? 0 : 1);
const mean = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : NaN);
export const aScore = (row) => (row.winner === null ? 0.5 : row.winner === row.aSide ? 1 : 0);
export const aMargin = (row) => row.vitality[sideIndex(row.aSide)] - row.vitality[sideIndex(otherSide(row.aSide))];

/** Rows of one cell gathered into whole corner-swapped pairs, keyed by k. A half pair is dropped and counted. */
export function pairsByK(rows) {
  const byK = new Map();
  for (const row of rows) {
    if (row.status !== "ok") continue;
    const p = byK.get(row.k) ?? {};
    p[row.aSide] = row;
    byK.set(row.k, p);
  }
  const whole = new Map();
  let half = 0;
  for (const [k, p] of byK) { if (p.left && p.right) whole.set(k, p); else half += 1; }
  return { whole, half };
}

const both = (p, f) => (f(p.left) + f(p.right)) / 2;
const ci = (values) => (values.length > 1 ? interval(values) : { mean: mean(values), low: NaN, high: NaN });

/** A side's reading, averaged over the bouts of a set of pairs: `who` is "a" or "b". */
function sideMean(pairs, who, key) {
  const values = [];
  for (const p of pairs) for (const row of [p.left, p.right]) {
    const side = who === "a" ? row.aSide : otherSide(row.aSide);
    const v = row.sides[side][key];
    if (Number.isFinite(v)) values.push(v);
  }
  return mean(values);
}

/** A cell's figures: A's score and bar margin over seed pairs, its side split and what each side did. */
export function cellFigures(rows) {
  const { whole, half } = pairsByK(rows);
  const pairs = [...whole.values()];
  const scores = pairs.map((p) => both(p, aScore));
  const margins = pairs.map((p) => both(p, aMargin));
  const bouts = pairs.flatMap((p) => [p.left, p.right]);
  const behaviour = {};
  for (const key of ["gapM", "fraction", "inReachShare", "forward", "backShare", "pressShare", "strafe", "turn",
    "committedShare", "strokesPerMinute", "downShare", "damage", "falls", "nearRangeStallSeconds", "retreatOutsideReachSeconds"]) {
    behaviour[key] = { a: sideMean(pairs, "a", key), b: sideMean(pairs, "b", key) };
  }
  const expert = {};
  for (const row of bouts) {
    const s = row.experts?.[row.aSide];
    if (!s) continue;
    expert.decisions = (expert.decisions ?? 0) + s.decisions;
    expert.ms = (expert.ms ?? 0) + s.msTotal;
    for (const [label, n] of Object.entries(s.labels ?? {})) {
      expert.labels ??= {};
      expert.labels[label] = (expert.labels[label] ?? 0) + n;
    }
  }
  return {
    pairs: pairs.length, halfPairs: half, bouts: bouts.length, byK: Object.fromEntries([...whole.keys()].map((k, i) => [k, { score: scores[i], margin: margins[i] }])),
    score: ci(scores), margin: { ...ci(margins), d: cohensD(margins) },
    aLeft: mean(pairs.map((p) => aScore(p.left))), aRight: mean(pairs.map((p) => aScore(p.right))),
    seconds: mean(bouts.map((row) => row.seconds)), wallSeconds: mean(bouts.map((row) => row.wallSeconds ?? NaN)),
    decided: bouts.filter((row) => row.winner !== null && row.ending !== "time").length / Math.max(bouts.length, 1),
    endings: bouts.reduce((acc, row) => ({ ...acc, [row.ending]: (acc[row.ending] ?? 0) + 1 }), {}),
    winnersBar: mean(bouts.filter((row) => row.winner !== null).map((row) => row.vitality[sideIndex(row.winner)])),
    leadChanges: mean(bouts.map((row) => row.leadChanges)),
    behaviour, expert,
  };
}

/** The paired difference of two cells' per-pair readings over the seed pairs both have. */
export function pairedDifference(fa, fb, key) {
  const d = [];
  for (const [k, va] of Object.entries(fa.byK)) if (fb.byK[k]) d.push(va[key] - fb.byK[k][key]);
  const m = mean(d);
  const sd = d.length > 1 ? Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (d.length - 1)) : NaN;
  return { n: d.length, mean: m, se: sd / Math.sqrt(d.length), ...(d.length > 1 ? { ci: interval(d) } : {}) };
}

/** Every cell of a run, by cell name. */
export function summarize(rows) {
  const cells = new Map();
  for (const row of rows) {
    if (!cells.has(row.cell)) cells.set(row.cell, []);
    cells.get(row.cell).push(row);
  }
  const out = { failed: rows.filter((row) => row.status !== "ok").length, cells: {} };
  for (const [cell, r] of cells) out.cells[cell] = { ...cellFigures(r), meta: { a: r[0].a, b: r[0].b, aBuild: r[0].aBuild, bBuild: r[0].bBuild,
    body: r[0].body, attribute: r[0].attribute, level: r[0].level, attacker: r[0].attacker, dummy: r[0].dummy } };
  return out;
}

/** The idle gate: outright wins (before the overtime mark) per cell, and the median time of one. */
export function idleFigures(rows) {
  const cells = {};
  for (const row of rows) {
    if (row.status !== "ok") continue;
    const c = cells[row.cell] ??= { attacker: row.attacker, dummy: row.dummy, bouts: 0, outright: 0, times: [], damage: [], falls: [] };
    c.bouts += 1;
    const won = row.winner === row.aSide && row.ending !== "time" && row.seconds < CONFIG.bout.overtimeSeconds;
    if (won) { c.outright += 1; c.times.push(row.seconds); }
    c.damage.push(row.sides[row.aSide].damage);
    c.falls.push(row.sides[row.aSide].falls);
  }
  for (const c of Object.values(cells)) {
    c.times.sort((x, y) => x - y);
    c.median = c.times.length ? c.times[Math.floor(c.times.length / 2)] : null;
    c.damage = mean(c.damage);
    c.falls = mean(c.falls);
  }
  return cells;
}

const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) : "-");
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : "-");

export function table(summary) {
  const lines = [];
  for (const [cell, f] of Object.entries(summary.cells)) {
    lines.push(`${cell.padEnd(52)} n ${String(f.bouts).padStart(3)}  A ${pct(f.score.mean).padStart(5)} % [${pct(f.score.low)}, ${pct(f.score.high)}]  margin ${f3(f.margin.mean)} [${f3(f.margin.low)}, ${f3(f.margin.high)}]  ${f.seconds.toFixed(1)} s  wall ${Number.isFinite(f.wallSeconds) ? f.wallSeconds.toFixed(0) : "-"} s`);
  }
  if (summary.failed) lines.push(`${summary.failed} bouts failed`);
  return lines.join("\n");
}

async function main() {
  const { values } = parseArgs({ options: {
    exp: { type: "string" }, out: { type: "string" }, summary: { type: "boolean", default: false },
    lanes: { type: "string", default: "8" }, "job-minutes": { type: "string", default: "120" }, until: { type: "string" },
    pairs: { type: "string", default: "8" }, "curve-pairs": { type: "string" }, "ladder-pairs": { type: "string" },
    bodies: { type: "string" }, minds: { type: "string" }, attackers: { type: "string" }, mind: { type: "string" },
    attributes: { type: "string" }, build: { type: "string" }, levels: { type: "string", default: "ends" }, tag: { type: "string" },
  } });
  const exp = values.exp;
  if (!EXPERIMENTS[exp]) throw new Error(`--exp is one of ${Object.keys(EXPERIMENTS).join(", ")}`);
  const dir = resolve(values.out ?? join("research", "runs", `headroom-${exp}${values.tag ? `-${values.tag}` : ""}`));
  if (values.summary) {
    const rows = readResults(dir);
    const summary = exp === "idle" ? { failed: rows.filter((r) => r.status !== "ok").length, idle: idleFigures(rows) } : summarize(rows);
    writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(exp === "idle" ? JSON.stringify(summary.idle, null, 1) : `${HARNESS}\n${table(summary)}`);
    return;
  }
  const pairs = Number(values.pairs);
  const o = { ...values, pairs, curvePairs: Number(values["curve-pairs"] ?? Math.max(1, Math.floor(pairs / 2))),
    ladderPairs: Number(values["ladder-pairs"] ?? pairs * 2) };
  const jobs = EXPERIMENTS[exp](o);
  const lanes = Number(values.lanes);
  if (lanes > 20) throw new Error("at most 20 lanes: other runs share this machine");
  const names = new Set(jobs.flatMap((job) => [job.leftBuild, job.rightBuild]));
  const manifest = { protocol: { maxSeconds: PROTOCOL.maxSeconds, settleSeconds: PROTOCOL.settleSeconds,
    locomotionMode: PROTOCOL.locomotionMode }, experiment: `headroom-v1/${exp}`, harness: HARNESS,
    builds: [...names].sort().map(buildOf) };
  console.log(`${jobs.length} bouts into ${dir}`);
  const rows = await runJobs(dir, manifest, jobs, { workers: lanes, jobLimitMs: Number(values["job-minutes"]) * 60000,
    // --until: a wall-clock time (anything Date.parse reads) after which no job starts and an unfinished one
    // is left pending for a resume; the runs are ordered by seed pair, so a cut run is a balanced one.
    deadline: values.until ? Date.parse(values.until) : Infinity,
    workerUrl: new URL("./headroom-worker.mjs", import.meta.url),
    onProgress: (p) => console.log(`${p.done}/${p.total} in ${p.elapsedSeconds.toFixed(0)} s, ${p.failures} failed`) });
  const summary = exp === "idle" ? { failed: rows.filter((r) => r.status !== "ok").length, idle: idleFigures(rows) } : summarize(rows);
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(exp === "idle" ? `${HARNESS}\n${JSON.stringify(summary.idle, null, 1)}` : `${HARNESS}\n${table(summary)}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href) {
  await main();
}
