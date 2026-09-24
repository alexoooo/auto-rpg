/**
 * Bodies that stay down, and bodies nobody finishes: a census over real bouts.
 *
 *     node research/downed-census.mjs --blocks 96 --dir research/runs/pc01/census
 *     node research/downed-census.mjs --groups stone,skeleton --blocks 96 --dir ...
 *
 * `docs/plans/2026-09-23-physical-contact-01-measure.md` sections 2 and 3. Each group is a matchup
 * played in side-swap blocks (`sweepJobs` in `research/stat-sweep.mjs`: a mind pair and a seed pair,
 * played once each way round), through `runJobs` and `research/census-worker.mjs`.
 *
 * **Stuck down.** Every fallen episode per side -- from the frame the body leaves its feet to the
 * frame it is supported again -- with the time spent under each cause the rise gate gave
 * (`gateCause` in the worker). An episode longer than 5 s is classed by the cause it spent longest
 * under, not counting a rise under way.
 *
 * **Stun-lock**, reported and never gated (the owner's call, 2026-09-23): knockdowns that begin
 * within 2 s of the same body's last rise, the longest chain of episodes without 2 s standing between
 * them, and how often the first body down loses.
 *
 * **Finishing.** The one-second windows of one body being down, and the share of them in which the
 * standing side landed any damage; that side's damage per downed second against per standing second
 * (both bodies up); and the distance from its primary socket to the downed body's core.
 */
import { join, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { ATTRIBUTE_PRESETS, sweepJobs, HARNESS } from "./stat-sweep.mjs";
import { PROTOCOL } from "./schedule.mjs";

const PROBE = ["golem-champion", "golem-miser", "golem-brawler", "golem-duelist"];

/**
 * The matchups, each a modified corner and a base corner. `modified` and `base` are named builds,
 * optionally with an attribute preset on the modified corner.
 */
export const CENSUS_GROUPS = Object.freeze({
  stone: { build: "default", modified: "default", minds: PROBE },
  skeleton: { build: "skeleton-warrior", modified: "skeleton-warrior", minds: ["skeleton-duelist"] },
  giant: { build: "default", modified: "default", preset: "max", minds: PROBE },
  human: { build: "human-warrior", modified: "human-warrior", minds: ["humanoid-duelist"] },
});

const LONG = 5;
const STUN = 2;
const RISE_CAUSES = new Set(["rising", "rose"]);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const quantile = (xs, q) => {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

/** The cause an episode spent longest under, a rise under way excluded. */
export function dominantCause(episode) {
  let best = null, time = -1;
  for (const [cause, seconds] of Object.entries(episode.causes)) {
    if (RISE_CAUSES.has(cause)) continue;
    if (seconds > time) { best = cause; time = seconds; }
  }
  return best ?? "rising";
}

/** Chains of episodes with less than `STUN` seconds standing between them, per side of one bout. */
export function chains(episodes) {
  const lengths = [];
  let run = 0, lastEnd = -Infinity;
  for (const episode of episodes) {
    run = episode.start - lastEnd < STUN ? run + 1 : 1;
    lengths.push(run);
    lastEnd = episode.start + episode.seconds;
  }
  return { longest: lengths.length ? Math.max(...lengths) : 0, repeats: lengths.filter((n) => n > 1).length };
}

export function summarizeCensus(rows) {
  const bouts = rows.filter((row) => row.status === "ok");
  const episodes = bouts.flatMap((row) => ["left", "right"].flatMap((side) => row.sides[side].episodes));
  const long = episodes.filter((e) => e.seconds > LONG);
  const byCause = {};
  for (const e of long) { const c = dominantCause(e); byCause[c] = (byCause[c] ?? 0) + 1; }
  const boutSeconds = bouts.reduce((a, row) => a + row.seconds, 0);
  const sideStats = bouts.flatMap((row) => ["left", "right"].map((side) => ({ row, side, s: row.sides[side] })));
  const chainStats = sideStats.map(({ s }) => chains(s.episodes));
  let firstDown = 0, firstDownLost = 0;
  for (const row of bouts) {
    const firsts = ["left", "right"].map((side) => [side, row.sides[side].episodes[0]?.start ?? Infinity]);
    firsts.sort((a, b) => a[1] - b[1]);
    if (!Number.isFinite(firsts[0][1]) || row.winner === null) continue;
    firstDown += 1;
    if (row.winner !== firsts[0][0]) firstDownLost += 1;
  }
  const sum = (key) => sideStats.reduce((a, { s }) => a + s[key], 0);
  const reachP50 = sideStats.map(({ s }) => s.reachToDownedCore?.p50).filter((x) => x !== undefined && x !== null);
  return {
    bouts: bouts.length, boutSeconds: mean(bouts.map((row) => row.seconds)),
    knockdownsPerBody: sum("knockdowns") / Math.max(1, 2 * bouts.length),
    episodes: episodes.length,
    episodeSeconds: { p50: quantile(episodes.map((e) => e.seconds), 0.5),
      p90: quantile(episodes.map((e) => e.seconds), 0.9), max: quantile(episodes.map((e) => e.seconds), 1) },
    longEpisodes: long.length, longByCause: byCause,
    longEndings: long.reduce((acc, e) => ({ ...acc, [e.end]: (acc[e.end] ?? 0) + 1 }), {}),
    // Per body: seconds a body spent inside episodes longer than 5 s, over the seconds bodies existed.
    longShareOfBodyTime: long.reduce((a, e) => a + e.seconds, 0) / Math.max(1e-9, 2 * boutSeconds),
    downShareOfBodyTime: episodes.reduce((a, e) => a + e.seconds, 0) / Math.max(1e-9, 2 * boutSeconds),
    stunLock: {
      repeatKnockdowns: chainStats.reduce((a, c) => a + c.repeats, 0),
      repeatShare: chainStats.reduce((a, c) => a + c.repeats, 0) / Math.max(1, episodes.length),
      longestChain: Math.max(0, ...chainStats.map((c) => c.longest)),
      firstDownLoses: firstDown ? firstDownLost / firstDown : null, decidedWithKnockdown: firstDown,
    },
    finishing: {
      downWindows: sum("downWindows"), scoredShare: sum("downWindowsScored") / Math.max(1, sum("downWindows")),
      damagePerDownedSecond: sum("dealtDowned") / Math.max(1e-9, sum("otherDownSeconds")),
      damagePerStandingSecond: sum("dealtStanding") / Math.max(1e-9, sum("standingSeconds")),
      downedShareOfDamage: sum("dealtDowned") / Math.max(1e-9, sum("dealtDowned") + sum("dealtStanding")),
      socketToCoreP50: reachP50.length ? quantile(reachP50, 0.5) : null,
    },
  };
}

export function censusMarkdown(summaries, header) {
  const f = (x, d = 2) => (x === null || x === undefined ? "--" : x.toFixed(d));
  const pct = (x) => (x === null || x === undefined ? "--" : `${(100 * x).toFixed(1)}`);
  const lines = [`# Downed census`, "",
    `${HARNESS}; cap ${header.protocol.maxSeconds} s; ${header.blocks} side-swap blocks a group; seed ${header.seed}; fingerprint ${header.fingerprint}.`, "",
    "| Group | Bouts | Knockdowns / body / bout | Episodes | p50 / p90 / max s | > 5 s | > 5 s time % | Down time % |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"];
  for (const [name, s] of summaries) {
    lines.push(`| ${name} | ${s.bouts} | ${f(s.knockdownsPerBody)} | ${s.episodes} | ${f(s.episodeSeconds.p50)} / ${f(s.episodeSeconds.p90)} / ${f(s.episodeSeconds.max)} | ${s.longEpisodes} | ${pct(s.longShareOfBodyTime)} | ${pct(s.downShareOfBodyTime)} |`);
  }
  lines.push("", "Episodes longer than 5 s by the cause they spent longest under, and how they ended:", "");
  for (const [name, s] of summaries) {
    lines.push(`- **${name}**: ${Object.entries(s.longByCause).map(([c, n]) => `${c} ${n}`).join(", ") || "none"}; ended ${Object.entries(s.longEndings).map(([c, n]) => `${c} ${n}`).join(", ") || "--"}`);
  }
  lines.push("", "Stun-lock (reported, not gated): knockdowns within 2 s of the same body's rise, the longest chain, and how often the first body down loses a decided bout:", "",
    "| Group | Repeat knockdowns | Share of episodes | Longest chain | First down loses % |", "| --- | ---: | ---: | ---: | ---: |");
  for (const [name, s] of summaries) {
    lines.push(`| ${name} | ${s.stunLock.repeatKnockdowns} | ${pct(s.stunLock.repeatShare)} | ${s.stunLock.longestChain} | ${pct(s.stunLock.firstDownLoses)} (${s.stunLock.decidedWithKnockdown}) |`);
  }
  lines.push("", "Finishing: one-second windows of the other body down, the share in which the standing side landed damage, and its damage rate:", "",
    "| Group | Down windows | Scored % | Damage / downed s | Damage / standing s | Share of damage on downed % | Socket to core p50 m |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const [name, s] of summaries) {
    const g = s.finishing;
    lines.push(`| ${name} | ${g.downWindows} | ${pct(g.scoredShare)} | ${f(g.damagePerDownedSecond, 4)} | ${f(g.damagePerStandingSecond, 4)} | ${pct(g.downedShareOfDamage)} | ${f(g.socketToCoreP50)} |`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const { values } = parseArgs({ options: {
    groups: { type: "string", default: "stone,skeleton,giant" }, blocks: { type: "string", default: "96" },
    workers: { type: "string", default: "24" }, seed: { type: "string", default: "20260923" },
    dir: { type: "string", default: "research/runs/downed-census" },
  } });
  const [{ PLAYABLE_BUILDS }, { runJobs }, { fingerprint }] = await Promise.all([
    import("../src/golem/roster.ts"), import("./runner.mjs"), import("./fingerprint.mjs")]);
  const named = (name) => {
    const found = PLAYABLE_BUILDS.find((build) => build.name === name);
    if (!found) throw new Error(`there is no named build "${name}"`);
    return found.setup;
  };
  const groups = values.groups.split(",");
  const blocks = Number(values.blocks), runSeed = Number(values.seed);
  const hash = fingerprint().hash;
  const summaries = [];
  for (const name of groups) {
    const group = CENSUS_GROUPS[name];
    if (!group) throw new Error(`there is no census group "${name}"; they are ${Object.keys(CENSUS_GROUPS).join(", ")}`);
    const modified = { ...named(group.modified), ...(group.preset ? { attributes: ATTRIBUTE_PRESETS[group.preset]() } : {}) };
    const level = { key: name, value: null, control: false, setup: modified };
    const jobs = sweepJobs({ levels: [level], blocks, minds: group.minds, runSeed });
    const manifest = { version: 1, kind: "downed-census", fingerprint: hash, protocol: PROTOCOL, group: name,
      blocks, seed: runSeed, builds: [{ name: "base", setup: named(group.build) }, { name, setup: modified }], candidates: [] };
    const directory = resolve(values.dir, name);
    console.log(`${name}: ${jobs.length} bouts into ${directory}`);
    const started = Date.now();
    const rows = await runJobs(directory, manifest, jobs, { workers: Number(values.workers),
      workerUrl: new URL("./census-worker.mjs", import.meta.url),
      onProgress: ({ done, total, failures }) => console.log(`  ${name} ${done}/${total}, ${failures} failed, ${((Date.now() - started) / 1000).toFixed(0)} s`) });
    const failed = rows.filter((row) => row.status !== "ok");
    if (failed.length) throw new Error(`${failed.length} bouts failed; first: ${failed[0].error}`);
    summaries.push([name, summarizeCensus(rows)]);
  }
  const markdown = censusMarkdown(summaries, { protocol: PROTOCOL, blocks, seed: runSeed, fingerprint: hash.slice(0, 12) });
  writeFileSync(join(resolve(values.dir), `census-${groups.join("+")}.json`), `${JSON.stringify(Object.fromEntries(summaries), null, 2)}\n`);
  writeFileSync(join(resolve(values.dir), `census-${groups.join("+")}.md`), markdown);
  console.log(markdown);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
