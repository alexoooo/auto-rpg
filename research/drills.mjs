// Skill ceiling session 03: the drill suite, run at scale
// (`docs/plans/2026-09-25-skill-ceiling-03-drills-and-league.md`, "Measure").
//
//   node research/drills.mjs [--runs 1000] [--lanes 6] [--drills survive-cut,...] [--build default]
//                            [--obuild default] [--out research/runs/drills-default]
//   node research/drills.mjs --summary [--out research/runs/drills-default]
//
// `--experts` adds rungs played by session 04's reference expert, `;`-separated names such as
// `expert@c8,h1;expert-blind@c8,h1` (`expertConfig` in `tests/harness/expert.mjs`), after the
// ladder and the guardless duelist, so every expert rung is paired with them start by start.
// `--lanes` is at most 20 (start at 8 while other runs share the machine), and `--job-minutes` is
// one run's wall limit, five by default; a run with expert rungs needs longer.
//
// One job is one run of one drill: a start built once and every rung played from an exact fork of
// it (`tests/harness/drills.mjs`), so every rung pair is compared start by start. The rungs are the
// naive ladder and the guardless duelist beside it, for the plan's mutation check. The subject's
// side is drawn per run, so the runs of a drill split between the corners.
//
// Harness: the Node bout runner and the fork harness, through `runJobs` in `research/runner.mjs`:
// isolated worker lanes, one run per lane at a time, resumable from `results.jsonl`.
import { join, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { runJobs, readResults } from "./runner.mjs";
import { seed } from "./schedule.mjs";
import { DRILL_NAMES, GUARDLESS, LADDER, OPPONENT_MIND, summarizeDrill } from "../tests/harness/drills.mjs";
import { expertConfig } from "../tests/harness/expert.mjs";
import { namedBuild } from "../src/golem/roster.ts";

export const HARNESS = "Node bout runner and fork harness, research runner, supported locomotion";
export const RUNGS = Object.freeze([...LADDER, GUARDLESS]);

/** One job per drill and run; the seed depends on the drill, the pair and the run and nothing else. */
export function drillJobs({ drills = DRILL_NAMES, runs, build, obuild }) {
  const jobs = [];
  for (const drill of drills) {
    for (let i = 0; i < runs; i += 1) {
      const id = `${drill}:${build}:${obuild}:${i}`;
      jobs.push({ id, drill, left: drill, right: OPPONENT_MIND, leftBuild: build, rightBuild: obuild,
        round: 0, block: id, seeds: [seed("drills", drill, build, obuild, i)] });
    }
  }
  return jobs;
}

/** Every drill's summary, from the rows of a run directory. */
export function summarize(rows, rungs = RUNGS) {
  // A run that failed is counted and its first error kept, never dropped: a drill whose every run
  // failed to build (get-inside, when the size ceiling moved under it on 2026-09-25) otherwise
  // vanished from the table without a line saying so.
  const byDrill = new Map();
  const failed = new Map();
  for (const row of rows) {
    if (row.status !== "ok") {
      const f = failed.get(row.drill) ?? { count: 0, error: String(row.error ?? row.status).split("\n")[0] };
      f.count += 1;
      failed.set(row.drill, f);
      continue;
    }
    if (!byDrill.has(row.drill)) byDrill.set(row.drill, []);
    byDrill.get(row.drill).push(row.run);
  }
  const out = {};
  for (const drill of new Set([...byDrill.keys(), ...failed.keys()])) {
    const summary = byDrill.has(drill) ? summarizeDrill(byDrill.get(drill), rungs)
      : { runs: 0, scored: 0, void: 0, skipped: 0, refused: 0, rungs: {}, pairs: {} };
    out[drill] = { ...summary, failed: failed.get(drill)?.count ?? 0, firstError: failed.get(drill)?.error ?? null };
  }
  return out;
}

const pct = (p) => (Number.isFinite(p) ? (100 * p).toFixed(1) : "-");

/** A plain-text table of a summary: one line per drill and rung, then the paired ladder steps. */
export function table(summary) {
  const lines = [];
  for (const [drill, s] of Object.entries(summary)) {
    lines.push(`${drill}: ${s.runs} runs, ${s.scored} scored, ${s.void} void, ${s.skipped} skipped, ${s.refused} refused, ${s.failed ?? 0} failed`);
    if (s.failed) lines.push(`  FAILED ${s.failed}: ${s.firstError}`);
    for (const [rung, r] of Object.entries(s.rungs)) {
      lines.push(`  ${rung.padEnd(24)} pass ${pct(r.pass).padStart(5)} %  var ${r.variance.toFixed(3)}  runs for +/-2 ${String(r.runsFor2).padStart(5)}  margin ${r.margin.toFixed(3)} (sd ${r.marginSd.toFixed(3)})`);
    }
    for (const [pair, d] of Object.entries(s.pairs)) {
      lines.push(`  ${pair.padEnd(44)} ${(100 * d.difference).toFixed(1).padStart(6)} +/- ${(196 * d.se).toFixed(1)} points (paired by start, n ${d.n})`);
    }
    for (const [stratum, t] of Object.entries(s.strata ?? {})) {
      lines.push(`  [${stratum}] ${t.scored} scored, ${t.void} void: ${Object.entries(t.rungs).map(([rung, r]) => `${rung.replace("golem-", "")} ${pct(r.pass)}`).join(", ")}`);
    }
  }
  return lines.join("\n");
}

async function main() {
  const { values } = parseArgs({ options: {
    runs: { type: "string", default: "1000" }, lanes: { type: "string", default: "6" },
    drills: { type: "string", default: DRILL_NAMES.join(",") }, build: { type: "string", default: "default" },
    obuild: { type: "string" }, out: { type: "string" }, summary: { type: "boolean", default: false },
    experts: { type: "string", default: "" }, "job-minutes": { type: "string", default: "5" },
  } });
  const experts = values.experts.split(";").filter(Boolean);
  for (const name of experts) if (!expertConfig(name)) throw new Error(`not an expert: "${name}"`);
  const rungs = [...RUNGS, ...experts];
  const build = values.build;
  const obuild = values.obuild ?? build;
  const dir = resolve(values.out ?? join("research", "runs", `drills-${build}-${obuild}`));
  if (values.summary) {
    const rows = readResults(dir);
    const summary = summarize(rows, JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).rungs);
    writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`${HARNESS}\n${table(summary)}`);
    return;
  }
  const lanes = Number(values.lanes);
  if (lanes > 20) throw new Error("at most 20 lanes: other runs share this machine");
  for (const name of [build, obuild]) if (!namedBuild(name)) throw new Error(`no named build "${name}"`);
  const jobs = drillJobs({ drills: values.drills.split(","), runs: Number(values.runs), build, obuild });
  const manifest = { protocol: "drills-v1", harness: HARNESS, rungs,
    builds: [...new Set([build, obuild])].map((name) => ({ name, setup: namedBuild(name).setup })) };
  const rows = await runJobs(dir, manifest, jobs, { workers: lanes, jobLimitMs: Number(values["job-minutes"]) * 60000,
    workerUrl: new URL("./drills-worker.mjs", import.meta.url),
    onProgress: (p) => console.log(`${p.done}/${p.total} in ${p.elapsedSeconds.toFixed(0)} s, ${p.failures} failed`) });
  const summary = summarize(rows, rungs);
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`${HARNESS}\n${table(summary)}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href) {
  await main();
}
