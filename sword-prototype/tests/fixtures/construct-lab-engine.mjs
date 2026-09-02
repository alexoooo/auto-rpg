import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const metrics = (job, side) => Object.freeze({
  damage: job.index * 3 + (side === "left" ? 7 : 4),
  severs: (job.index + (side === "left" ? 1 : 0)) % 3 === 0 ? 1 : 0,
  requests: 4 + job.index,
  admissions: 3 + job.index,
  completions: 2 + job.index,
  refusals: side === "right" ? 1 : 0,
  cancellations: side === "left" ? 1 : 0,
  idleSteps: job.index + (side === "left" ? 2 : 3),
  stuckSteps: 0,
  energyJ: 20 + job.index * 2 + (side === "left" ? 1 : 2),
  peakHeatJ: 30 + job.index * 3 + (side === "left" ? 1 : 2),
  capabilityLosses: side === "right" && job.index % 2 === 0 ? 1 : 0,
});

/** Deterministic fake solver used to mutation-test scheduling, persistence and aggregation only. */
export async function runConstructBoutJob(job, options = {}) {
  if (options.failIndices?.includes(job.index)) {
    throw new Error(`fixture failure for job ${job.index}`);
  }
  if (options.markerDirectory) {
    await mkdir(options.markerDirectory, { recursive: true });
    const flag = options.rejectRepeatIndices?.includes(job.index) ? "wx" : "w";
    await writeFile(path.join(options.markerDirectory, String(job.index)), "executed\n", { flag });
  }
  await delay(Number(options.delays?.[job.index] ?? 0));
  if (options.completionMarkerDirectory) {
    await mkdir(options.completionMarkerDirectory, { recursive: true });
    await writeFile(path.join(options.completionMarkerDirectory, String(job.index)), "completed\n", { flag: "wx" });
  }
  const winner = job.matchup.seed % 3 === 0 ? "draw" : job.matchup.mirrored ? "right" : "left";
  const capabilityLosses = job.index % 2 === 0
    ? Object.freeze([{ id: "dorsal-mount", reason: "bearing-dorsal-pitch severed" }])
    : Object.freeze([]);
  return Object.freeze({
    version: 3,
    job: job.index,
    matchupDigest: job.matchupDigest,
    seed: job.matchup.seed,
    mirrored: job.matchup.mirrored,
    winner,
    ending: "death",
    steps: 120 + job.index,
    seconds: 2 + job.index / 60,
    range: Object.freeze({ minM: 1 + job.index / 10, meanM: 2 + job.index / 10, finalM: 1.5 + job.index / 10 }),
    left: metrics(job, "left"),
    right: metrics(job, "right"),
    actionTrace: Object.freeze(["close-distance", job.matchup.mirrored ? "cover" : "fire"]),
    refusals: Object.freeze([{ id: "cover", reason: "shield group is occupied" }]),
    capabilityLosses,
    progress: Object.freeze([]),
    stuck: Object.freeze([]),
    limitation: null,
  });
}
