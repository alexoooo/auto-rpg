/**
 * The posture audit's runs (`core-posture.mjs`, `man-postures.mjs`): its jobs on workers
 * (`core-posture-worker.mjs`), the best of a row's records, and a record drawn.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { pointOfToRef } from "../src/core/control/support.ts";
import { posed } from "./core-posture-trials.mjs";

/**
 * Every job on `lanes` workers, each worker one posture at a time, each job a trial's
 * (`TRIALS`, `audit` unless it names one) with `defaults` under it; the records in the jobs' order.
 * A job that fails is written to `out` as `failed.json`, with its programme where one failed.
 */
export async function runJobs(jobs, { lanes, out, defaults = {} }) {
  const records = new Array(jobs.length);
  const pool = Array.from({ length: Math.min(lanes, jobs.length) }, () => new Worker(new URL("./core-posture-worker.mjs", import.meta.url)));
  let next = 0;
  await Promise.all(pool.map((worker) => new Promise((resolve, reject) => {
    const feed = () => {
      if (next >= jobs.length) { worker.terminate(); resolve(); return; }
      const id = next++;
      worker.once("message", ({ result, error, programme }) => {
        if (error) {
          // The job that failed and, where a programme failed, the programme: kept to be read again.
          mkdirSync(out, { recursive: true });
          writeFileSync(new URL("failed.json", out), JSON.stringify({ job: jobs[id], error, programme }));
          reject(new Error(error));
          return;
        }
        records[id] = result;
        feed();
      });
      worker.postMessage({ trial: "audit", ...defaults, ...jobs[id], id });
    };
    feed();
  })));
  return records;
}

/** The best of `records` by held, then balanced, then share, then miss; and how many agree with it. */
export function bestOf(records) {
  const rank = (r) => (r.held ? 0 : r.found && r.balanced ? 1 : r.found ? 2 : 3);
  const sorted = [...records].sort((a, b) => rank(a) - rank(b) || (a.share ?? Infinity) - (b.share ?? Infinity) || a.miss - b.miss || a.off - b.off);
  const best = sorted[0];
  const agree = records.filter((r) => rank(r) === rank(best) && (best.share === null || Math.abs((r.share ?? Infinity) - best.share) <= 0.02)).length;
  return { ...best, seeds: { of: records.length, agree } };
}

/**
 * `record`'s posture drawn from the side (z across, y up) and from the front (x across), each
 * segment as the outline of its shape's lowest points (`lowsOf`): a capsule a thick line, a box
 * or a hull its points' outline, a toe with its foot.
 */
export function pictureOf(body, record) {
  posed(body, record.posture);
  const at = new Vector3(), scale = 300, width = 900, height = 520, ground = 470;
  const views = [{ across: (p) => p.z, left: 230 }, { across: (p) => p.x, left: 680 }];
  const parts = [];
  for (const view of views) {
    parts.push(`<line x1="${view.left - 210}" y1="${ground}" x2="${view.left + 210}" y2="${ground}" stroke="#888"/>`);
    for (const segment of body.segments) {
      const points = body.lows.filter((low) => low.segment === segment).map((low) => {
        pointOfToRef(segment, low.at, at);
        return [view.left + scale * view.across(at), ground - scale * at.y, low.radius * scale];
      });
      const r = points[0][2];
      if (r > 0) parts.push(`<polyline points="${points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}" stroke="#4a6fa5" stroke-opacity="0.6" stroke-width="${(2 * r).toFixed(1)}" stroke-linecap="round" fill="none"/>`);
      else parts.push(`<polygon points="${hull2(points).map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}" fill="#4a6fa5" fill-opacity="0.45" stroke="#4a6fa5"/>`);
    }
  }
  const title = `${record.row}, ${record.variant}: ${record.held ? "held" : "not held"}, share ${record.share ?? "-"}, centre ${record.height} m`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/>` +
    `<text x="10" y="20" font-family="sans-serif" font-size="14">${title}</text><text x="20" y="40" font-family="sans-serif" font-size="12">side (facing right)</text><text x="480" y="40" font-family="sans-serif" font-size="12">front</text>${parts.join("")}</svg>`;
}

/** The convex hull of 2-D points, by the monotone chain. */
function hull2(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = (from) => { const out = []; for (const q of from) { while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop(); out.push(q); } return out.slice(0, -1); };
  return [...chain(sorted), ...chain([...sorted].reverse())];
}
