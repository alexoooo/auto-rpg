import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { trainPpo } from "./train-ppo.mjs";
import { runResearchPreflight } from "./research-preflight.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function measurePpoWorkers(argv = process.argv.slice(2), output = process.stdout) {
  runResearchPreflight([], { write() {} });
  const at = argv.indexOf("--solver-steps"); const solverSteps = Number(at < 0 ? 64 : argv[at + 1]);
  if (!Number.isSafeInteger(solverSteps) || solverSteps < 32 || solverSteps % 4) {
    throw new Error("PPO worker measurement --solver-steps must be an integer of at least 32 divisible by four");
  }
  const rows = []; let reference = null;
  for (const workers of [1, 2, 4]) {
    const started = performance.now(); const result = await trainPpo({ seed: 310013, solverSteps, workers });
    const seconds = (performance.now() - started) / 1000;
    const digests = Object.fromEntries(["artifact", "report", "resume"].map((name) => [name, digest(result[name])]));
    reference ??= digests;
    if (JSON.stringify(digests) !== JSON.stringify(reference)) throw new Error(`PPO ${workers}-worker outputs differ from one worker`);
    const report = JSON.parse(new TextDecoder().decode(result.report));
    const consumed = report.rows.reduce((sum, row) => sum + row.solverSteps, 0);
    rows.push({ workers, seconds, solverSteps: consumed, stepsPerSecond: consumed / seconds, digests });
  }
  output.write(`${JSON.stringify({ harness: "bench/trainPpo-worker-threads", seed: 310013,
    requestedSolverStepsPerArm: solverSteps, rows }, null, 2)}\n`);
  return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await measurePpoWorkers();
