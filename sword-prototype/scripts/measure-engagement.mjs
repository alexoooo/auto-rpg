import { pathToFileURL } from "node:url";

import { canonicalJson } from "../src/learning/artifact.ts";
import { engagementGates, engagementMetrics, formatEngagementGateTable } from "../src/learning/gates.ts";
import { researchMatrix } from "../src/learning/research-matrix.ts";
import { policyMind } from "../src/mind.ts";
import { ENGAGEMENT_INSTRUMENT_VERSION } from "../src/recorder.ts";
import { runResearchBout } from "./research-havok.mjs";
import { specialistPolicyName } from "./tournament-executor.mjs";

const cellName = (job) => `${job.unit}/${job.loadout}`;

export function parseEngagementArgs(argv) {
  const value = (name, fallback = null) => { const at = argv.indexOf(`--${name}`);
    if (at < 0) return fallback;
    const found = argv[at + 1];
    if (!found || found.startsWith("--")) throw new Error(`--${name} requires a value`);
    return found;
  };
  const cells = String(value("cells", "")).split(",").map((cell) => cell.trim()).filter(Boolean);
  if (!cells.length) throw new Error("measure-engagement requires --cells unit/loadout[,unit/loadout]");
  if (new Set(cells).size !== cells.length) throw new Error("measure-engagement cells must be unique");
  const split = String(value("split", "validation"));
  if (split !== "train" && split !== "validation") {
    throw new Error("measure-engagement --split must be train or validation; the held-out test split stays closed");
  }
  const mirror = String(value("mirror", "both"));
  if (!["both", "left", "right"].includes(mirror)) throw new Error("measure-engagement --mirror must be both, left, or right");
  const seed = Number(value("seed", "310013"));
  if (!Number.isSafeInteger(seed)) throw new Error("measure-engagement --seed must be a safe integer");
  return Object.freeze({ cells: Object.freeze(cells), split, mirror, seed });
}

export function engagementJobs({ cells, split, mirror, seed }) {
  const wanted = new Set(cells);
  const specialist = researchMatrix(split, seed).filter((job) => job.opponent === "specialist");
  const known = new Set(specialist.map(cellName));
  const missing = cells.filter((cell) => !known.has(cell));
  if (missing.length) throw new Error(`measure-engagement has no research cell ${missing.map((cell) => `"${cell}"`).join(", ")}`);
  return Object.freeze(specialist.filter((job) => wanted.has(cellName(job)) &&
    (mirror === "both" || job.actorSide === mirror)));
}

export async function measureEngagement(config, run = runResearchBout) {
  const jobs = engagementJobs(config); const rows = [];
  for (const [index, job] of jobs.entries()) {
    const policy = specialistPolicyName(job);
    const result = await run({ ...job, index }, () => policyMind(policy, job.actorSeed),
      Math.round(job.boutCapSeconds * 240));
    rows.push(Object.freeze({ index, cell: cellName(job), actorSide: job.actorSide, policy,
      seconds: result.result.seconds, engagement: Object.freeze({ ...result.engagement }) }));
  }
  const totals = engagementMetrics(rows.map((row) => row.engagement), rows.map((row) => row.seconds));
  const gates = engagementGates(totals);
  return Object.freeze({ harness: "bench/runResearchBout", instrument: "engagement-gates",
    engagementInstrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION,
    provenance: Object.freeze({ harness: "bench/runResearchBout", instrument: "engagement-gates",
      engagementInstrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION,
      controller: "specialist", split: config.split, seed: config.seed }),
    controller: "specialist", split: config.split,
    seed: config.seed, cells: config.cells, rows: Object.freeze(rows), engagement: Object.freeze(totals),
    gates, gateTable: formatEngagementGateTable(gates) });
}

export async function runMeasureEngagementCli(argv = process.argv.slice(2), stream = process.stdout,
  run = runResearchBout) {
  const report = await measureEngagement(parseEngagementArgs(argv), run);
  stream.write(`${canonicalJson(report)}\n`); return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runMeasureEngagementCli();
