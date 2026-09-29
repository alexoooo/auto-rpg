/**
 * **The scaling run**: N simplified humans (`humanModel()`, all 16 segments, the shared controller,
 * the whole state read back every step), spaced apart standing or dropped in a pile, 120 Hz, per
 * engine at the settings given. Each (layout, N) is run `repeats` times on a fresh world; a step is
 * timed as solver (prepare + step), read and control (`scaling` in `src/physics-bench/cases.ts`).
 * Allocation is the heap's growth over the timed steps with no collection in between (run with
 * --expose-gc and a young generation big enough that none happens), and collections are counted
 * by a `gc` performance observer. Node harness.
 *
 *     node --expose-gc --max-semi-space-size=64 research/physics-bakeoff/perf.mjs <engine> '<settings json>' \
 *       [--cond '{"foot.left":100,"foot.right":100}'] [--n 1,2,4,8,16,32] [--layouts spaced,pile] \
 *       [--repeats 3] [--tag name]
 *
 * Writes research/physics-bakeoff/results/perf-<tag>.json.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { PerformanceObserver } from "node:perf_hooks";
import { load } from "./engines.mjs";
import { scaling } from "../../src/physics-bench/cases.ts";

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const engine = argv[0];
const settings = { hz: 120, ...JSON.parse(argv[1] ?? "{}") };
settings.substeps ??= 1;
const conditioning = opt("cond") ? JSON.parse(opt("cond")) : undefined;
const ns = opt("n", "1,2,4,8,16,32").split(",").map(Number);
const layouts = opt("layouts", "spaced,pile").split(",");
const repeats = Number(opt("repeats", "3"));
const tag = opt("tag", engine);
if (typeof globalThis.gc !== "function") throw new Error("run with --expose-gc");

const e = await load(engine);
let gcCount = 0, gcMs = 0, counting = false;
new PerformanceObserver((list) => {
  if (!counting) return;
  for (const entry of list.getEntries()) { gcCount++; gcMs += entry.duration; }
}).observe({ entryTypes: ["gc"] });

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const fmt = (x) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(3));

function once(kind, humans) {
  let heap0 = 0, heap1 = 0;
  gcCount = 0; gcMs = 0;
  const r = scaling(e.factory, settings, kind, humans, {
    conditioning,
    mark: (phase) => {
      if (phase === "start") { globalThis.gc(); heap0 = process.memoryUsage().heapUsed; gcCount = 0; gcMs = 0; counting = true; }
      else { heap1 = process.memoryUsage().heapUsed; counting = false; }
    },
  });
  return { ...r, gcCount, gcMs, allocPerStep: gcCount === 0 ? (heap1 - heap0) / r.steps : NaN };
}

// A throwaway run to warm the JIT.
once("spaced", 2);
const rows = [];
/** The whole machine's busy share over the run (every process, this one included), to say what the timings shared. */
const cpuTimes = () => cpus().reduce((a, c) => ({ idle: a.idle + c.times.idle, total: a.total + Object.values(c.times).reduce((x, y) => x + y, 0) }), { idle: 0, total: 0 });
const cpu0 = cpuTimes();
console.log(`${e.module ? "" : ""}${tag}: ${JSON.stringify(settings)}${conditioning ? ` cond=${JSON.stringify(conditioning)}` : ""}, init ${fmt(e.initMs)} ms`);
console.log("layout N | total med p95 | solver med p95 | read med | control med | alloc B/step gc | upright maxSpeed");
for (const kind of layouts) for (const humans of ns) {
  const runs = [];
  for (let k = 0; k < repeats; k++) runs.push(once(kind, humans));
  const pick = (f) => median(runs.map(f));
  const row = {
    engine, tag, settings, conditioning, kind, humans, repeats, label: runs[0].label,
    total: { median: pick((r) => r.total.median), p95: pick((r) => r.total.p95), mean: pick((r) => r.total.mean) },
    solver: { median: pick((r) => r.solver.median), p95: pick((r) => r.solver.p95) },
    read: { median: pick((r) => r.read.median), p95: pick((r) => r.read.p95) },
    control: { median: pick((r) => r.control.median), p95: pick((r) => r.control.p95) },
    allocPerStep: pick((r) => r.allocPerStep), gcCount: runs.map((r) => r.gcCount), gcMs: pick((r) => r.gcMs),
    upright: runs.map((r) => r.upright), maxSpeed: pick((r) => r.maxSpeed),
    spread: runs.map((r) => r.total.median),
  };
  rows.push(row);
  console.log(`${kind} ${humans} | ${fmt(row.total.median)} ${fmt(row.total.p95)} | ${fmt(row.solver.median)} ${fmt(row.solver.p95)} | ${fmt(row.read.median)} | ${fmt(row.control.median)} | ${Number.isNaN(row.allocPerStep) ? "n/a" : row.allocPerStep.toFixed(0)} ${row.gcCount.join("/")} | ${row.upright.join("/")} ${fmt(row.maxSpeed)}`);
}
const out = new URL("./results/", import.meta.url);
await mkdir(out, { recursive: true });
const cpu1 = cpuTimes();
const machineBusy = 1 - (cpu1.idle - cpu0.idle) / (cpu1.total - cpu0.total);
console.log(`machine busy over the run: ${(100 * machineBusy).toFixed(0)} % of ${cpus().length} logical CPUs`);
await writeFile(new URL(`perf-${tag}.json`, out), JSON.stringify({ engine, tag, settings, conditioning, initMs: e.initMs, node: process.version, machineBusy, rows }, null, 1));
// The threaded MuJoCo build keeps its worker threads alive.
process.exit(0);
