/**
 * The fall loop: how often bodies fall, how long they stay down, and how often a body that has just
 * stood falls again -- with what fed the ledger on the boundary it fell (2026-09-25,
 * `docs/analysis/2026-09-25-falls-and-rise.md`).
 *
 *     node research/fall-loop.mjs --groups stone --blocks 32 --dir research/runs/falls-loop/base
 *     node research/fall-loop.mjs --summarize research/runs/falls-loop/base
 *
 * Each group is a matchup played in side-swap blocks (`sweepJobs`), through `runJobs` and
 * `research/fall-loop-worker.mjs`. **Every bout of one mind pairing plays the same opening whatever
 * its seeds** (`2026-09-25-rate-control-clock.md`), so every interval here is clustered by pairing.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { sweepJobs, HARNESS } from "./stat-sweep.mjs";
import { PROTOCOL } from "./schedule.mjs";

const PROBE = ["golem-champion", "golem-miser", "golem-brawler", "golem-duelist"];

export const LOOP_GROUPS = Object.freeze({
  stone: { build: "default", minds: PROBE },
  skeleton: { build: "skeleton-warrior", minds: ["skeleton-duelist"] },
  human: { build: "human-warrior", minds: ["humanoid-duelist"] },
  multileg: { build: "multileg", minds: ["golem-brawler", "golem-duelist"] },
  wheel: { build: "wheel", minds: ["golem-brawler", "golem-duelist"] },
});

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const quantile = (xs, q) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
/** Student t, two-sided 95 %, by degrees of freedom; enough rows for the clusters here. */
const T95 = [NaN, 12.71, 4.30, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.20, 2.18, 2.16, 2.14, 2.13, 2.12];
/** Mean of cluster means and its 95 % half-width, clusters as units. */
export function clustered(values) {
  const m = mean(values);
  if (values.length < 2) return { mean: m, half: null, n: values.length };
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / (values.length - 1));
  const t = T95[values.length - 1] ?? 1.96;
  return { mean: m, half: t * sd / Math.sqrt(values.length), n: values.length };
}

const pairingOf = (row) => [...row.minds].sort().join("~");

/**
 * The loop's numbers over a set of bout-sides. `sides` is a list of `{ row, side, s }`.
 */
export function loopStats(sides) {
  const seconds = sides.reduce((a, { row }) => a + row.seconds, 0);
  const falls = sides.flatMap(({ s }) => s.falls);
  const rises = sides.flatMap(({ s }) => s.rises);
  const stood = rises.filter((r) => r.outcome === "stood");
  const windows = sides.flatMap(({ s }) => s.windows);
  const within = (x) => falls.filter((f) => f.from !== "rising" && f.sinceStood !== null && f.sinceStood <= x).length;
  const fromStanding = falls.filter((f) => f.from !== "rising");
  const duringRise = falls.filter((f) => f.from === "rising");
  const byAbort = {};
  for (const f of duringRise) {
    const key = f.riseAbort === "refused" && f.gateReason ? `refused: ${f.gateReason}` : f.riseAbort ?? "?";
    byAbort[key] = (byAbort[key] ?? 0) + 1;
  }
  return {
    sides: sides.length, minutes: seconds / 60,
    fallsPerMin: falls.length / Math.max(1e-9, seconds / 60),
    standingFallsPerMin: fromStanding.length / Math.max(1e-9, seconds / 60),
    downShare: sides.reduce((a, { s }) => a + s.downSeconds, 0) / Math.max(1e-9, seconds),
    falls: falls.length, fromStanding: fromStanding.length, duringRise: duringRise.length, byAbort,
    rises: rises.length, stood: stood.length,
    refall1: within(1) / Math.max(1, stood.length), refall2: within(2) / Math.max(1, stood.length),
    refall3: within(3) / Math.max(1, stood.length),
    riseSeconds: { p50: quantile(stood.map((r) => r.end - r.start), 0.5), p90: quantile(stood.map((r) => r.end - r.start), 0.9) },
    laySeconds: { p50: quantile(rises.filter((r) => r.lay !== null).map((r) => r.lay), 0.5) },
    windows: {
      n: windows.length,
      marginAtStandP50: quantile(windows.map((w) => w.marginAtStand).filter((x) => x !== null), 0.5),
      marginAtStandNeg: windows.filter((w) => w.marginAtStand !== null && w.marginAtStand < 0).length,
      minMarginP10: quantile(windows.map((w) => w.minMargin).filter(Number.isFinite), 0.1),
      outsideShare: windows.reduce((a, w) => a + w.outsideS, 0) / Math.max(1e-9, windows.reduce((a, w) => a + w.lastedS, 0)),
      withBlow: windows.filter((w) => w.blows > 0).length,
      otherDownAtStand: windows.filter((w) => w.otherState === "fallen" || w.otherState === "rising").length,
      closeAtStand: windows.filter((w) => w.gapAtStand < 0.3).length,
    },
  };
}

/** Why a fall happened, from the fall log's ledger inputs, one label per fall. */
export function trigger(f) {
  if (f.reason !== "stability threshold was exceeded") return `release:${f.reason}`;
  const outside = f.margin !== null && f.margin < 0;
  const blow = f.blowMps > 0;
  const held = f.heldMps > 0;
  const where = outside ? "outside" : "inside";
  if (blow && !held) return `blow/${where}`;
  if (held && !blow) return `${f.pairRecent ? (f.pairDriving ? "pushing" : "pushed") : "pressed"}/${where}`;
  if (blow && held) return `blow+held/${where}`;
  return `lean-only/${where}`;
}

export function refallTable(sides, x = 2) {
  const falls = sides.flatMap(({ s }) => s.falls);
  const re = falls.filter((f) => f.from !== "rising" && f.sinceStood !== null && f.sinceStood <= x);
  const count = (list, key) => list.reduce((acc, f) => { const k = key(f); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
  return {
    n: re.length,
    triggers: count(re, trigger),
    otherState: count(re, (f) => f.otherState),
    pairRecent: re.filter((f) => f.pairRecent).length,
    recentBlows: re.filter((f) => f.recentBlows > 0).length,
    closeGap: re.filter((f) => f.gap < 0.3).length,
    blowOverLine: re.filter((f) => f.blowMps >= f.line).length,
    sinceStoodP50: quantile(re.map((f) => f.sinceStood), 0.5),
    allTriggers: count(falls.filter((f) => f.from !== "rising"), trigger),
  };
}

export function summarize(rows, groupOf = () => "all") {
  const ok = rows.filter((row) => row.status === "ok");
  const out = {};
  for (const row of ok) {
    const g = groupOf(row);
    out[g] ??= { sides: [], byMind: {}, byPairing: {} };
    for (const side of ["left", "right"]) {
      const entry = { row, side, s: row.sides[side] };
      out[g].sides.push(entry);
      (out[g].byMind[row.sides[side].mind] ??= []).push(entry);
      (out[g].byPairing[pairingOf(row)] ??= []).push(entry);
    }
  }
  const result = {};
  for (const [g, { sides, byMind, byPairing }] of Object.entries(out)) {
    const pairingStats = Object.fromEntries(Object.entries(byPairing).map(([k, v]) => [k, loopStats(v)]));
    result[g] = {
      all: loopStats(sides), refall: refallTable(sides),
      byMind: Object.fromEntries(Object.entries(byMind).map(([k, v]) => [k, loopStats(v)])),
      byPairing: pairingStats,
      clustered: {
        fallsPerMin: clustered(Object.values(pairingStats).map((p) => p.fallsPerMin)),
        downShare: clustered(Object.values(pairingStats).map((p) => p.downShare)),
        refall2: clustered(Object.values(pairingStats).map((p) => p.refall2)),
      },
    };
  }
  return result;
}

const readRows = (dir) => {
  const rows = [];
  for (const sub of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, sub.name, "results.jsonl");
    if (!sub.isDirectory() || !existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) if (line.trim()) rows.push({ ...JSON.parse(line), group: sub.name });
  }
  return rows;
};

export function loopMarkdown(summary, header) {
  const f = (x, d = 2) => (x === null || x === undefined || Number.isNaN(x) ? "--" : x.toFixed(d));
  const pct = (x) => (x === null || x === undefined ? "--" : (100 * x).toFixed(1));
  const ci = (c, d = 2, scale = 1) => (c.half === null ? f(c.mean * scale, d) : `${f(c.mean * scale, d)} ± ${f(c.half * scale, d)}`);
  const lines = [`# Fall loop`, "", `${HARNESS}; ${header}`, "",
    "| Group | Sides | Falls/min | Standing falls/min | Down % | Re-fall ≤1 s | ≤2 s | ≤3 s | Falls in a rise | Rise p50 s | Lie p50 s |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"];
  for (const [g, s] of Object.entries(summary)) {
    const a = s.all;
    lines.push(`| ${g} | ${a.sides} | ${f(a.fallsPerMin)} | ${f(a.standingFallsPerMin)} | ${pct(a.downShare)} | ${pct(a.refall1)} | ${pct(a.refall2)} | ${pct(a.refall3)} | ${a.duringRise} of ${a.rises} (${Object.entries(a.byAbort).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}) | ${f(a.riseSeconds.p50)} | ${f(a.laySeconds.p50)} |`);
  }
  lines.push("", "Clustered by mind pairing (pairings as units, 95 %):", "",
    "| Group | Pairings | Falls/min | Down % | Re-fall ≤2 s % |", "| --- | ---: | ---: | ---: | ---: |");
  for (const [g, s] of Object.entries(summary)) {
    lines.push(`| ${g} | ${s.clustered.fallsPerMin.n} | ${ci(s.clustered.fallsPerMin)} | ${ci(s.clustered.downShare, 1, 100)} | ${ci(s.clustered.refall2, 1, 100)} |`);
  }
  lines.push("", "By mind, charged to the side that fell:", "",
    "| Group | Mind | Falls/min | Down % | Re-fall ≤2 s % | Falls in a rise |", "| --- | --- | ---: | ---: | ---: | ---: |");
  for (const [g, s] of Object.entries(summary)) {
    for (const [m, a] of Object.entries(s.byMind)) {
      lines.push(`| ${g} | ${m} | ${f(a.fallsPerMin)} | ${pct(a.downShare)} | ${pct(a.refall2)} | ${a.duringRise} of ${a.rises} |`);
    }
  }
  lines.push("", "By pairing:", "", "| Group | Pairing | Falls/min | Down % | Re-fall ≤2 s % | Falls in a rise |", "| --- | --- | ---: | ---: | ---: | ---: |");
  for (const [g, s] of Object.entries(summary)) {
    for (const [m, a] of Object.entries(s.byPairing)) {
      lines.push(`| ${g} | ${m} | ${f(a.fallsPerMin)} | ${pct(a.downShare)} | ${pct(a.refall2)} | ${a.duringRise} of ${a.rises} |`);
    }
  }
  lines.push("", "The first 3 s after each rise:", "",
    "| Group | Windows | Margin at stand p50 mm | Stood outside the base | Min margin p10 mm | Time outside % | With a blow | Other down at stand | Within 0.3 m at stand |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const [g, s] of Object.entries(summary)) {
    const w = s.all.windows;
    lines.push(`| ${g} | ${w.n} | ${f((w.marginAtStandP50 ?? NaN) * 1000, 0)} | ${w.marginAtStandNeg} | ${f((w.minMarginP10 ?? NaN) * 1000, 0)} | ${pct(w.outsideShare)} | ${w.withBlow} | ${w.otherDownAtStand} | ${w.closeAtStand} |`);
  }
  lines.push("", "Re-falls within 2 s of standing, by what fed the ledger on the boundary it fell (all standing falls in brackets):", "");
  for (const [g, s] of Object.entries(summary)) {
    const r = s.refall;
    lines.push(`- **${g}** (${r.n} re-falls; p50 ${f(r.sinceStoodP50)} s after standing): ${Object.entries(r.triggers).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}; other body ${Object.entries(r.otherState).map(([k, n]) => `${k} ${n}`).join(", ")}; pair push in the last 0.25 s ${r.pairRecent}; a blow in the last 0.5 s ${r.recentBlows}; within 0.3 m ${r.closeGap}; the boundary's blow alone past the line ${r.blowOverLine}. [${Object.entries(r.allTriggers).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")}]`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const { values } = parseArgs({ options: {
    groups: { type: "string", default: "stone" }, blocks: { type: "string", default: "32" },
    workers: { type: "string", default: "12" }, seed: { type: "string", default: "20260925" },
    dir: { type: "string", default: "research/runs/falls-loop/base" },
    summarize: { type: "string" }, maxSeconds: { type: "string" },
  } });
  if (values.summarize) {
    const dir = resolve(values.summarize);
    const summary = summarize(readRows(dir), (row) => row.group);
    const md = loopMarkdown(summary, `summarized from ${values.summarize}.`);
    writeFileSync(join(dir, "loop.md"), md);
    writeFileSync(join(dir, "loop.json"), `${JSON.stringify(summary, (k, v) => (k === "sides" && Array.isArray(v) ? v.length : v), 2)}\n`);
    console.log(md);
    return;
  }
  const [{ PLAYABLE_BUILDS }, { runJobs }] = await Promise.all([import("../src/golem/roster.ts"), import("./runner.mjs")]);
  const named = (name) => {
    const found = PLAYABLE_BUILDS.find((build) => build.name === name);
    if (!found) throw new Error(`there is no named build "${name}"`);
    return found.setup;
  };
  const protocol = values.maxSeconds ? { ...PROTOCOL, maxSeconds: Number(values.maxSeconds) } : PROTOCOL;
  for (const name of values.groups.split(",")) {
    const group = LOOP_GROUPS[name];
    if (!group) throw new Error(`there is no group "${name}"`);
    const setup = named(group.build);
    const level = { key: name, value: null, control: false, setup };
    const jobs = sweepJobs({ levels: [level], blocks: Number(values.blocks), minds: group.minds, runSeed: Number(values.seed) });
    const manifest = { version: 1, kind: "fall-loop", protocol, group: name, seed: Number(values.seed),
      builds: [{ name: "base", setup }, { name, setup }], candidates: [] };
    const directory = resolve(values.dir, name);
    const started = Date.now();
    console.log(`${name}: ${jobs.length} bouts into ${directory}`);
    await runJobs(directory, manifest, jobs, { workers: Number(values.workers),
      workerUrl: new URL("./fall-loop-worker.mjs", import.meta.url),
      onProgress: ({ done, total, failures }) => console.log(`  ${name} ${done}/${total}, ${failures} failed, ${((Date.now() - started) / 1000).toFixed(0)} s`) });
  }
  const dir = resolve(values.dir);
  const summary = summarize(readRows(dir), (row) => row.group);
  const md = loopMarkdown(summary, `cap ${protocol.maxSeconds} s; seed ${values.seed}; ${values.blocks} side-swap blocks a group.`);
  writeFileSync(join(dir, "loop.md"), md);
  console.log(md);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
