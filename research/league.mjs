// The league protocol (skill ceiling session 03, `docs/plans/2026-09-25-skill-ceiling-03-drills-and-league.md`):
// the one way a full-bout comparison between two minds is run from here on.
//
//   node research/league.mjs --a golem-duelist --b golem-walker [--clusters 4] [--lanes 6]
//                            [--classes blade,mace,...] [--variants plated,multileg,...] [--out DIR]
//   node research/league.mjs --mirror golem-walker [--clusters 8] [--classes blade] [--out DIR]
//   node research/league.mjs --summary --out DIR
//
// **Asymmetric pairs.** On identical bodies four of seven weapon classes decided nothing, so every
// pair here is a weapon class's build against the same build with one body module changed -- a
// plated torso, three legs, a wheel, a ram head -- and a variant the registry refuses, or one that
// changes nothing, is left out and said so. Both corners carry the class's weapon, which is what
// lets a report be read by weapon class.
//
// **The unit is the corner-swapped pair.** Mind A on one body against mind B on the other, played
// twice with the same seeds: A on the left, then A on the right, each mind keeping its own seed
// (the seed pair is reversed with the sides, as `comparisonJobs` in `research/search.mjs` does). A
// **cluster** is one seed pair on one class and variant, and holds two corner-swapped pairs: A on
// the class build and B on the variant, and the bodies the other way round. The paired criterion is
// Cohen's d of A's bar margin over corner-swapped pairs; every interval is a bootstrap over whole
// clusters, because the two pairs of a cluster share their seeds.
//
// **Guard columns**, never optimised and always printed: near-range stall seconds and
// retreat-outside-reach seconds a bout per mind (`src/engagement.ts`), changes of lead a bout
// (`LEAD_BAND` in `research/league-worker.mjs`), the winner's remaining bar, the share decided
// before the cap, and falls a bout. Scores are split by side. Reports are by weapon class, then
// pooled, because a pooled total is mostly the maul's.
//
// **A mirror** is A = B: the same code with one mind in both corners, read by its side split. A
// side more than the 95 % band from 50 % fails. The verdict is `sideVerdict` in
// `research/side-mirror.mjs`, session 01's gate, so that there is one: its share and band are taken
// over distinct bouts (here distinct outcomes, since this worker hashes no trajectory), because a
// pairing whose seeds reach nothing plays one bout however many clusters it is given.
//
// Harness: the Node bout runner through `runJobs` in `research/runner.mjs`, the research `PROTOCOL`
// cap (`research/schedule.mjs`), supported locomotion. Not comparable with page readings.
import { join, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { runJobs, readResults } from "./runner.mjs";
import { PROTOCOL, seed, stable } from "./schedule.mjs";
import { cohensD, interval } from "./stat-sweep.mjs";
import { refuseSideDecided, sideVerdict } from "./side-mirror.mjs";
import { namedBuild } from "../src/golem/roster.ts";
import { golemSetupRefusal } from "../src/golem/build.ts";

export const HARNESS = "Node bout runner, research runner, supported locomotion, research PROTOCOL cap";

/** Each weapon class and the named build that carries it. */
export const WEAPON_CLASSES = Object.freeze({
  blade: "default", "two-blades": "two-blades", mace: "mace", maul: "maul", whip: "whip", fist: "fists",
  ram: "ram-capped",
});

/** The body modules a variant changes, one at a time. */
export const BODY_VARIANTS = Object.freeze({
  plated: { torso: "torso.plated" },
  multileg: { locomotion: "locomotion.multileg" },
  wheel: { locomotion: "locomotion.wheel" },
  ram: { head: "head.ram" },
});

/**
 * The asymmetric pairs: every class build against each of its variants, with the variants left
 * out that the registry refuses or that change nothing (a ram head on a build that has one).
 */
export function leaguePairs(classes = Object.keys(WEAPON_CLASSES), variants = Object.keys(BODY_VARIANTS)) {
  const pairs = [];
  const omitted = [];
  for (const weaponClass of classes) {
    const baseName = WEAPON_CLASSES[weaponClass];
    if (!baseName) throw new Error(`no weapon class "${weaponClass}"`);
    const base = namedBuild(baseName).setup;
    for (const variant of variants) {
      const change = BODY_VARIANTS[variant];
      if (!change) throw new Error(`no body variant "${variant}"`);
      const setup = { ...base, ...change };
      if (stable(setup) === stable(base)) { omitted.push({ weaponClass, variant, reason: "changes nothing" }); continue; }
      const refusal = golemSetupRefusal(setup);
      if (refusal !== null) { omitted.push({ weaponClass, variant, reason: refusal }); continue; }
      pairs.push({ weaponClass, variant, base: { name: baseName, setup: base },
        other: { name: `${baseName}+${variant}`, setup } });
    }
  }
  return { pairs, omitted };
}

/**
 * The jobs: per pair and cluster, two body assignments by two sides. `a` carries `seeds[0]` and
 * `b` `seeds[1]` in every bout of a cluster, whichever side each stands on.
 */
export function leagueJobs({ a, b, pairs, clusters, tag = "league-v1" }) {
  const jobs = [];
  for (const pair of pairs) {
    for (let k = 0; k < clusters; k += 1) {
      const block = `${pair.weaponClass}/${pair.variant}/${k}`;
      const seeds = [seed(tag, a, b, block, "a"), seed(tag, a, b, block, "b")];
      for (const assign of [0, 1]) {
        const aBuild = assign === 0 ? pair.base.name : pair.other.name;
        const bBuild = assign === 0 ? pair.other.name : pair.base.name;
        for (const aSide of ["left", "right"]) {
          const aLeft = aSide === "left";
          jobs.push({ id: `${a}|${b}|${block}/${assign}/${aSide}`, round: 0, block, pair: `${block}/${assign}`,
            weaponClass: pair.weaponClass, variant: pair.variant, a, b, aSide, assign,
            left: aLeft ? a : b, right: aLeft ? b : a, leftBuild: aLeft ? aBuild : bBuild, rightBuild: aLeft ? bBuild : aBuild,
            seeds: aLeft ? seeds : [...seeds].reverse() });
        }
      }
    }
  }
  return jobs;
}

const other = (side) => (side === "left" ? "right" : "left");
const mean = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : NaN);
const sideIndex = (side) => (side === "left" ? 0 : 1);
/** A's score in one bout: 1 a win, 0.5 a draw, 0 a loss. */
export const aScore = (row) => (row.winner === null ? 0.5 : row.winner === row.aSide ? 1 : 0);
/** A's bar margin in one bout: its remaining bar minus B's. */
export const aMargin = (row) => row.vitality[sideIndex(row.aSide)] - row.vitality[sideIndex(other(row.aSide))];

/** Rows gathered into corner-swapped pairs, each with both halves, and pairs into clusters. */
export function pairsOf(rows) {
  const pairs = new Map();
  for (const row of rows) {
    if (row.status !== "ok") continue;
    const pair = pairs.get(row.pair) ?? { block: row.block, weaponClass: row.weaponClass, rows: {} };
    if (pair.rows[row.aSide]) throw new Error(`pair ${row.pair} has two ${row.aSide} halves`);
    pair.rows[row.aSide] = row;
    pairs.set(row.pair, pair);
  }
  for (const [key, pair] of pairs) {
    if (!pair.rows.left || !pair.rows.right) throw new Error(`incomplete corner-swapped pair ${key}`);
  }
  return [...pairs.values()];
}

/** Figures for a set of rows: the paired criterion, the side split and the guard columns. */
export function leagueFigures(rows) {
  const pairs = pairsOf(rows);
  const bouts = pairs.flatMap((pair) => [pair.rows.left, pair.rows.right]);
  const pairMargin = pairs.map((pair) => (aMargin(pair.rows.left) + aMargin(pair.rows.right)) / 2);
  const clusters = new Map();
  pairs.forEach((pair, i) => {
    const cluster = clusters.get(pair.block) ?? { margins: [], scores: [], left: [] };
    cluster.margins.push(pairMargin[i]);
    cluster.scores.push((aScore(pair.rows.left) + aScore(pair.rows.right)) / 2);
    // The left corner's score, whoever stands there: the mirror gate's reading.
    for (const row of [pair.rows.left, pair.rows.right]) {
      cluster.left.push(row.winner === null ? 0.5 : row.winner === "left" ? 1 : 0);
    }
    clusters.set(pair.block, cluster);
  });
  const per = (key) => [...clusters.values()].map((cluster) => mean(cluster[key]));
  const decided = bouts.filter((row) => row.winner !== null);
  const perMind = (field) => ({
    a: mean(bouts.map((row) => row.sides[row.aSide][field])),
    b: mean(bouts.map((row) => row.sides[other(row.aSide)][field])),
  });
  const leftScore = clusters.size > 1 ? interval(per("left")) : { mean: mean(per("left")), low: NaN, high: NaN };
  // The gate: the left corner's share over distinct bouts, against a fair coin's band at that count.
  const side = bouts.length ? sideVerdict(bouts) : null;
  return {
    bouts: bouts.length, pairs: pairs.length, clusters: clusters.size,
    score: clusters.size > 1 ? interval(per("scores")) : { mean: mean(per("scores")), low: NaN, high: NaN },
    margin: { ...(clusters.size > 1 ? interval(per("margins")) : { mean: mean(pairMargin), low: NaN, high: NaN }),
      d: cohensD(pairMargin) },
    bySide: { aLeft: mean(bouts.filter((row) => row.aSide === "left").map(aScore)),
      aRight: mean(bouts.filter((row) => row.aSide === "right").map(aScore)) },
    mirror: { left: leftScore, distinct: side?.distinct ?? 0, distinctLeft: side?.share ?? NaN,
      band: side?.band ?? NaN, inside: side?.verdict === "pass" },
    guard: {
      nearRangeStallSeconds: perMind("nearRangeStallSeconds"),
      retreatOutsideReachSeconds: perMind("retreatOutsideReachSeconds"),
      leadChanges: mean(bouts.map((row) => row.leadChanges)),
      winnersBar: mean(decided.map((row) => row.vitality[sideIndex(row.winner)])),
      decidedBeforeCap: bouts.filter((row) => row.winner !== null && row.ending !== "time").length / Math.max(bouts.length, 1),
      falls: mean(bouts.map((row) => row.sides.left.falls + row.sides.right.falls)),
    },
    seconds: mean(bouts.map((row) => row.seconds)),
  };
}

/** Figures by weapon class, then pooled. */
export function leagueSummary(rows) {
  const ok = rows.filter((row) => row.status === "ok");
  const classes = [...new Set(ok.map((row) => row.weaponClass))];
  const byClass = Object.fromEntries(classes.map((c) => [c, leagueFigures(ok.filter((row) => row.weaponClass === c))]));
  return { failed: rows.length - ok.length, byClass, pooled: leagueFigures(ok) };
}

const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "-");
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : "-");
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) : "-");

export function table(summary, { a, b }) {
  const mirror = a === b;
  const lines = [mirror ? `mirror: ${a}` : `A ${a} against B ${b}`];
  const row = (label, s) => {
    const g = s.guard;
    lines.push(`${label.padEnd(11)} bouts ${String(s.bouts).padStart(4)}  ` + (mirror
      ? `left ${pct(s.mirror.left.mean)} % [${pct(s.mirror.left.low)}, ${pct(s.mirror.left.high)}]; over ${s.mirror.distinct} distinct ${pct(s.mirror.distinctLeft)} % band +/-${pct(s.mirror.band)} ${s.mirror.inside ? "inside" : "OUTSIDE"}`
      : `A score ${pct(s.score.mean)} % [${pct(s.score.low)}, ${pct(s.score.high)}] (A left ${pct(s.bySide.aLeft)}, A right ${pct(s.bySide.aRight)})  margin ${f3(s.margin.mean)} [${f3(s.margin.low)}, ${f3(s.margin.high)}] d ${f2(s.margin.d)}`));
    lines.push(`${"".padEnd(11)} stall s A ${f2(g.nearRangeStallSeconds.a)} B ${f2(g.nearRangeStallSeconds.b)}  retreat s A ${f2(g.retreatOutsideReachSeconds.a)} B ${f2(g.retreatOutsideReachSeconds.b)}  lead changes ${f2(g.leadChanges)}  winner's bar ${f3(g.winnersBar)}  decided ${pct(g.decidedBeforeCap)} %  falls ${f2(g.falls)}  ${f2(s.seconds)} s`);
  };
  for (const [c, s] of Object.entries(summary.byClass)) row(c, s);
  row("pooled", summary.pooled);
  if (summary.failed) lines.push(`${summary.failed} bouts failed`);
  return lines.join("\n");
}

async function main() {
  const { values } = parseArgs({ options: {
    a: { type: "string" }, b: { type: "string" }, mirror: { type: "string" },
    clusters: { type: "string", default: "4" }, lanes: { type: "string", default: "6" },
    classes: { type: "string", default: Object.keys(WEAPON_CLASSES).join(",") },
    variants: { type: "string", default: Object.keys(BODY_VARIANTS).join(",") },
    out: { type: "string" }, summary: { type: "boolean", default: false },
  } });
  const a = values.mirror ?? values.a;
  const b = values.mirror ?? values.b;
  if (!values.summary && (!a || !b)) throw new Error("name --a and --b, or --mirror");
  // A mind's own mirror is how it is checked; any other comparison with it is measuring its side.
  if (!values.summary && a !== b) refuseSideDecided([a, b], "a league comparison");
  const dir = resolve(values.out ?? join("research", "runs", `league-${a}-${b}`));
  if (values.summary) {
    const rows = readResults(dir);
    const summary = leagueSummary(rows);
    writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`${HARNESS}\n${table(summary, { a: rows[0]?.a, b: rows[0]?.b })}`);
    return;
  }
  const lanes = Number(values.lanes);
  if (lanes > 6) throw new Error("at most 6 lanes: other runs share this machine");
  const { pairs, omitted } = leaguePairs(values.classes.split(","), values.variants.split(","));
  for (const o of omitted) console.log(`omitted ${o.weaponClass} + ${o.variant}: ${o.reason}`);
  const jobs = leagueJobs({ a, b, pairs, clusters: Number(values.clusters) });
  const builds = new Map();
  for (const pair of pairs) for (const build of [pair.base, pair.other]) builds.set(build.name, build);
  const manifest = { protocol: { maxSeconds: PROTOCOL.maxSeconds, settleSeconds: PROTOCOL.settleSeconds,
    locomotionMode: PROTOCOL.locomotionMode }, league: "league-v1", harness: HARNESS, builds: [...builds.values()] };
  const rows = await runJobs(dir, manifest, jobs, { workers: lanes,
    workerUrl: new URL("./league-worker.mjs", import.meta.url),
    onProgress: (p) => console.log(`${p.done}/${p.total} in ${p.elapsedSeconds.toFixed(0)} s, ${p.failures} failed`) });
  const summary = leagueSummary(rows);
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`${HARNESS}\n${table(summary, { a, b })}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href) {
  await main();
}
