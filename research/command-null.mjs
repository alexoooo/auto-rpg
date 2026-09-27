// The command surface's null control (skill ceiling session 06, the command-surface half;
// `docs/analysis/2026-09-26-command-surface.md`).
//
//   node research/command-null.mjs --tag base  [--lanes 6] [--flags stance,step]
//   node research/command-null.mjs --compare research/runs/command-null-base research/runs/command-null-after
//
// With every new channel off and every mind going through the adapter from `Intent`, a bout must be
// bit-identical to the tree before the command surface. The fixture is the orders half's, widened:
// the seven benchmark minds on five bodies against the duelist on the stone default, a mirror of each
// on the default, and the reference expert (which is command-native after the change) against the
// duelist on the stone default and the skeleton, with a 20 s cap because an expert bout is slow.
// Each row carries the bout's trajectory hash (`trajectoryTracer`), a digest of both behaviour
// records, the verdict, the clock and both bars, and an expert row its decision labels.
//
// `--flags` turns channels on for the whole run. Nothing in the fixture writes a stance or a step,
// so a run with a flag on must compare identical with one without it: that is the restricted side
// of a with/without experiment, which holds the channel at neutral.
//
// Harness: the Node bout runner through `runJobs` in `research/runner.mjs` and
// `research/command-null-worker.mjs`, the research `PROTOCOL` (150 s cap, supported locomotion).
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { runJobs, readResults } from "./runner.mjs";
import { PROTOCOL, seed } from "./schedule.mjs";
import { parseChannelFlags } from "../src/body-command.ts";

export const HARNESS = "Node bout runner, research runner (research/command-null-worker.mjs), supported locomotion, research PROTOCOL";

export const NULL_MINDS = Object.freeze(["golem-duelist", "golem-walker"]);
export const NULL_BUILDS = Object.freeze(["default", "human-warrior", "wheel", "skeleton-warrior", "multileg"]);

export function nullJobs() {
  const jobs = [];
  const add = (id, left, right, leftBuild, rightBuild, extra = {}) => jobs.push({ id, round: 0, block: id,
    left, right, leftBuild, rightBuild, seeds: [seed("command-null-v1", id, "a"), seed("command-null-v1", id, "b")], ...extra });
  for (const mind of NULL_MINDS) {
    for (const build of NULL_BUILDS) add(`${mind}@${build}|duelist`, mind, "golem-duelist", build, "default");
    add(`${mind}|mirror`, mind, mind, "default", "default");
  }
  add("expert@default|duelist", "expert@c8,h1", "golem-duelist", "default", "default", { maxSeconds: 20 });
  add("expert@skeleton-warrior|duelist", "expert@c8,h1", "golem-duelist", "skeleton-warrior", "default", { maxSeconds: 20 });
  add("duelist|expert-persist@default", "golem-duelist", "expert-persist@c8,h1", "default", "default", { maxSeconds: 20 });
  return jobs;
}

const identity = (row) => JSON.stringify([row.status, row.trajectory, row.behaviour, row.winner, row.ending, row.seconds,
  row.vitality, row.experts ?? null]);

function compare(a, b) {
  const rowsA = new Map(readResults(a).map((row) => [row.id, row]));
  const rowsB = new Map(readResults(b).map((row) => [row.id, row]));
  let same = 0;
  const differ = [];
  for (const [id, row] of rowsA) {
    const other = rowsB.get(id);
    if (!other) { differ.push(`${id}: missing in ${b}`); continue; }
    if (identity(row) === identity(other)) same += 1;
    else differ.push(`${id}: ${identity(row)} vs ${identity(other)}`);
  }
  for (const id of rowsB.keys()) if (!rowsA.has(id)) differ.push(`${id}: missing in ${a}`);
  console.log(`${HARNESS}\n${same} identical of ${rowsA.size}; ${differ.length} differ`);
  for (const line of differ) console.log(`  ${line}`);
  return differ.length === 0;
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { tag: { type: "string" }, lanes: { type: "string", default: "6" },
    compare: { type: "string", multiple: true }, flags: { type: "string" } } });
  if (values.compare) {
    // `--compare A B` as the header spells it, or `--compare A --compare B`.
    const dirs = [...values.compare, ...positionals];
    if (dirs.length !== 2) throw new Error("--compare takes two run directories");
    process.exitCode = compare(resolve(dirs[0]), resolve(dirs[1])) ? 0 : 1;
    return;
  }
  const dir = resolve(join("research", "runs", `command-null-${values.tag ?? "run"}`));
  const jobs = nullJobs();
  const manifest = { protocol: { maxSeconds: PROTOCOL.maxSeconds, settleSeconds: PROTOCOL.settleSeconds,
    locomotionMode: PROTOCOL.locomotionMode }, experiment: "command-null-v1", harness: HARNESS,
    flags: parseChannelFlags(values.flags) };
  console.log(`${jobs.length} bouts into ${dir}`);
  const rows = await runJobs(dir, manifest, jobs, { workers: Number(values.lanes), jobLimitMs: 60 * 60000,
    workerUrl: new URL("./command-null-worker.mjs", import.meta.url),
    onProgress: (p) => console.log(`${p.done}/${p.total} in ${p.elapsedSeconds.toFixed(0)} s, ${p.failures} failed`) });
  console.log(`${rows.filter((row) => row.status === "ok").length} ok of ${rows.length}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href) {
  await main();
}
