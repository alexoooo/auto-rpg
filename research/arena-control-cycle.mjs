import { isMainThread, parentPort, Worker } from "node:worker_threads";
import { writeFileSync } from "node:fs";
import { recoveryCycle, strikeCycle } from "./arena-control-trials.mjs";

if (!isMainThread) {
  parentPort.on("message", async ({ id, task, config }) => {
    try { parentPort.postMessage({ id, result: await (task === "recovery" ? recoveryCycle(config) : strikeCycle(config)) }); }
    catch (error) { parentPort.postMessage({ id, error: error.stack }); }
  });
} else {
  const jobs = [
    ...["empty", "club"].flatMap((held) => [0, 1, 2, 3].map((direction) => ({ task: "recovery", config: { held, direction } }))),
    ...["empty", "club"].map((held) => ({ task: "recovery", config: { held, direction: 0, repeat: 2, attack: true, seconds: 180 } })),
    ...["hit", "miss"].flatMap((mode) => ["left", "right", "alternate"].map((hand) => ({ task: "strike", config: { held: "empty", hand, mode } }))),
    ...["hit", "miss"].map((mode) => ({ task: "strike", config: { held: "club", hand: "right", mode } })),
    { task: "strike", config: { held: "empty", hand: "right", mode: "miss", cancel: true } },
  ];
  const results = new Array(jobs.length), workers = Array.from({ length: 2 }, () => new Worker(new URL(import.meta.url)));
  let next = 0;
  try {
    await Promise.all(workers.map((worker) => new Promise((resolve, reject) => {
      worker.on("error", reject);
      const feed = () => {
        if (next === jobs.length) { resolve(); return; }
        const id = next++;
        worker.once("message", (message) => {
          if (message.error) { reject(new Error(message.error)); return; }
          results[id] = { task: jobs[id].task, ...message.result };
          console.log(JSON.stringify({ id, task: jobs[id].task, config: jobs[id].config,
            success: message.result.success, returned: message.result.returned, fell: message.result.fell }));
          feed();
        });
        worker.postMessage({ id, ...jobs[id] });
      }; feed();
    })));
    const output = process.argv[2] ?? "research/runs/arena-control-cycle.json";
    writeFileSync(output, JSON.stringify({ protocol: 1, split: "development", results }, null, 2) + "\n");
    console.log(output);
  } finally { await Promise.all(workers.map((worker) => worker.terminate())); }
}
