import { isMainThread, parentPort, Worker } from "node:worker_threads";
import { writeFileSync } from "node:fs";
import { engagementTrial } from "./arena-engagement.mjs";

if (!isMainThread) {
  parentPort.on("message", async ({ id, config }) => {
    try { parentPort.postMessage({ id, result: await engagementTrial(config) }); }
    catch (error) { parentPort.postMessage({ id, error: error.stack }); }
  });
} else {
  const engagement = process.argv[2] ?? "reference", output = process.argv[3] ?? `research/runs/arena-${engagement}.json`;
  const heldOut = process.argv.includes("--held-out");
  const jobs = ["stationary", "lateral", "advance", "retreat"].flatMap(motion =>
    [{ held: "empty", hand: "left" }, { held: "empty", hand: "right" }, { held: "empty", hand: "alternate" }, { held: "club", hand: "right" }].flatMap(loadout =>
      [1.2, 2.4].map(gap => ({ ...loadout, motion, gap, mirror: heldOut, engagement }))));
  const results = new Array(jobs.length), workers = Array.from({ length: 2 }, () => new Worker(new URL(import.meta.url)));
  let next = 0;
  try {
    await Promise.all(workers.map(worker => new Promise((resolve, reject) => {
      worker.on("error", reject);
      const feed = () => {
        if (next === jobs.length) { resolve(); return; }
        const id = next++;
        worker.once("message", message => {
          if (message.error) { reject(new Error(message.error)); return; }
          results[id] = message.result;
          console.log(JSON.stringify({ id, ...jobs[id], useful: message.result.usefulReturns, falls: message.result.falls, timeouts: message.result.timeouts })); feed();
        });
        worker.postMessage({ id, config: jobs[id] });
      }; feed();
    })));
    writeFileSync(output, JSON.stringify({ protocol: 1, split: heldOut ? "held-out" : "development", results }, null, 2) + "\n");
  } finally { await Promise.all(workers.map(worker => worker.terminate())); }
}
