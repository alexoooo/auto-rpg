import { parentPort } from "node:worker_threads";
import "../../tests/harness/preload-data.mjs";
import { staticBody, search, recordOf, rowNamed } from "../../research/core-posture-trials.mjs";
import { variantSpec, cappedSpec } from "./bodies.mjs";
import { marginSearch } from "./margin-search.mjs";
const bodies = new Map();
parentPort.on("message", async (job) => {
  const key = `${job.model}|${job.variant}`;
  if (!bodies.has(key)) bodies.set(key, await staticBody(cappedSpec(variantSpec(job.model, job.variant))));
  const body = bodies.get(key), row = rowNamed(job.row);
  if (job.start) job.start = { ...job.start, angles: job.start.angles.map((a, i) => i < body.freedoms.length ? Math.min(body.freedoms[i].hi, Math.max(body.freedoms[i].lo, a)) : a) };
  try {
  const r = job.objective === "margin" ? marginSearch(body, row, { seed: job.seed, evals: job.evals, height: job.height, start: job.start, cap: job.cap }) : search(body, row, { seed: job.seed, evals: job.evals, height: job.height, start: job.start });
  const rec = recordOf(body, row, r, { height: job.height, seed: job.seed });
  parentPort.postMessage({ ...job, start: undefined, rec });
  } catch (error) { parentPort.postMessage({ ...job, start: undefined, rec: { row: job.height === undefined ? job.row : `${job.row} @ ${job.height.toFixed(2)} m`, found: false, balanced: false, held: false, margin: -9, error: String(error.message) } }); }
});
