/**
 * What a step allocates, and what the collector takes of it, as bodies are added: `--bodies` of one
 * model with the club, 3 m apart on a ground in one core world, each under the command layers with
 * an order to stand (`standBodies`, `tests/harness/garbage.mjs`). A row is one count in a process
 * of its own, so one count's heap is not the next one's: `--steps` steps timed after 3 s, with
 * every collection in them (`PerformanceObserver`), then 240 steps under the sampling heap profiler
 * (`allocatedIn`).
 *
 *   node research/step-garbage.mjs [--model crypt-skeleton] [--bodies 2,8,16,32,48] [--steps 1200]
 *
 * With `--sites` it plays one arena bout instead and prints where its steps allocate: by file, by
 * function (its own body's), and by function with everything it calls.
 *
 *   node research/step-garbage.mjs --sites [--left workshop-fighter] [--right workshop-rogue]
 *
 * The bytes and the counts are the same on any machine. The times are wall time on the machine it
 * runs on: read them on a quiet one, and compare rows of one run.
 */
import { spawnSync } from "node:child_process";
import { PerformanceObserver } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import v8 from "node:v8";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { CORE_ENGINE } from "../tests/harness/core-stand.mjs";
import { allocatedIn, standBodies } from "../tests/harness/garbage.mjs";
import { buildBout } from "./bout.mjs";

const { values } = parseArgs({ options: {
  model: { type: "string", default: "crypt-skeleton" }, bodies: { type: "string", default: "2,8,16,32,48" }, steps: { type: "string", default: "1200" },
  one: { type: "string" }, sites: { type: "boolean", default: false },
  left: { type: "string", default: "workshop-fighter" }, right: { type: "string", default: "workshop-rogue" },
} });
const steps = Number(values.steps), SAMPLED = 240, MIB = 1048576;
// Babylon greets every engine it makes on the console.
Logger.LogLevels = Logger.NoneLogLevel;

/** One count's row: the steps timed with the collections in them, then the steps sampled. */
async function row(count) {
  const { world, bodies } = await standBodies(count, values.model);
  world.step(3 * world.hz);
  const collections = [];
  const observer = new PerformanceObserver((list) => { for (const e of list.getEntries()) collections.push({ at: e.startTime, ms: e.duration, kind: e.detail?.kind }); });
  observer.observe({ entryTypes: ["gc"] });
  const times = [], from = performance.now();
  for (let i = 0; i < steps; i++) { const t = performance.now(); world.step(); times.push(performance.now() - t); }
  const until = performance.now();
  // The observer is told of a collection on a later turn of the loop.
  await new Promise((resolve) => setTimeout(resolve, 100));
  observer.disconnect();
  const mine = collections.filter((c) => c.at >= from && c.at <= until);
  // A scavenge is the young generation's collection (kind 1); every other kind is of the whole heap.
  const scavenges = mine.filter((c) => c.kind === 1), whole = mine.filter((c) => c.kind !== 1);
  const sum = (v) => v.reduce((a, b) => a + b, 0), sorted = [...times].sort((a, b) => a - b);
  const { bytes } = await allocatedIn(() => world.step(SAMPLED));
  const young = v8.getHeapSpaceStatistics().find((space) => space.space_name === "new_space").space_size;
  const step = sum(times) / steps, collector = sum(mine.map((c) => c.ms)) / steps;
  return [
    count, bodies.filter((b) => b.view.down).length, step.toFixed(2), sorted[Math.floor(0.99 * steps)].toFixed(2), sorted.at(-1).toFixed(2),
    (bytes / SAMPLED / MIB).toFixed(2), (bytes / SAMPLED / count / 1024).toFixed(0), (young / MIB).toFixed(0),
    (steps / Math.max(1, scavenges.length)).toFixed(0), scavenges.length ? (sum(scavenges.map((c) => c.ms)) / scavenges.length).toFixed(2) : "-",
    mine.length ? Math.max(...mine.map((c) => c.ms)).toFixed(2) : "-", `${whole.length} (${sum(whole.map((c) => c.ms)).toFixed(0)} ms)`,
    (100 * collector / step).toFixed(1),
  ];
}

/** Where one bout's steps allocate. */
async function sites() {
  const { world, duel, dispose } = await buildBout({ left: values.left, right: values.right, capSeconds: 60 });
  world.step(2 * world.hz);
  let taken = 0;
  const { bytes, self, within, files } = await allocatedIn(() => { while (!duel.verdict) { world.step(); taken++; } });
  dispose();
  const line = ([name, size]) => `| ${(size / taken / 1024).toFixed(1)} | ${(100 * size / bytes).toFixed(1)} | ${name} |`;
  const top = (map, most) => [...map].sort((a, b) => b[1] - a[1]).slice(0, most).map(line).join("\n");
  const head = "| KiB a step | Of all, % | Where |\n|---|---|---|";
  console.log(`Node, an arena bout in the core world, ${CORE_ENGINE}, 120 Hz; ${values.left} against ${values.right}, ${taken} steps to its verdict; ${(bytes / taken / 1024).toFixed(0)} KiB allocated a step\n`);
  console.log(`By file, each function's own body\n\n${head}\n${top(files, 16)}\n`);
  console.log(`By function, its own body\n\n${head}\n${top(self, 30)}\n`);
  console.log(`By function, with everything it calls\n\n${head}\n${top(within, 45)}`);
}

if (values.sites) await sites();
else if (values.one) console.log(`| ${(await row(Number(values.one))).join(" | ")} |`);
else {
  console.log(`Node, the core world, ${CORE_ENGINE}, 120 Hz; ${values.model} with the club, standing under the command layers; ${steps} steps timed after 3 s, then ${SAMPLED} sampled; one count a process\n`);
  console.log("| Bodies | Down | A step, ms | Its 99th per cent, ms | The longest, ms | Allocated a step, MiB | A body, KiB | The young generation, MiB | Steps to a scavenge | A scavenge, ms | The longest pause, ms | Collections of the whole heap | The collector, % of the step |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const count of values.bodies.split(",")) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--one", count, "--model", values.model, "--steps", values.steps], { encoding: "utf8" });
    if (child.status !== 0) throw new Error(child.stderr);
    process.stdout.write(child.stdout);
  }
}
