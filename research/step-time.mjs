/**
 * Where a bout's step goes, and whether a slow step is the work or the machine: one arena bout
 * played `--runs` times over in one process, a world each, every step timed with the solver's part
 * of it. A bout plays the same to the bit each time, so step k is the same work in every playing:
 * the least of its times over the playings is what that work takes, and what a playing took beyond
 * it was the machine's or the collector's. The first playing warms the compiler and is not read.
 *
 * It prints each playing's steps, the least over the playings split into the solver and the rest
 * (control, senses, blows), the dearest steps, every kind of collection in the playings read, and
 * how many steps over `--over` ms had a collection inside.
 *
 *   node research/step-time.mjs [--left workshop-fighter] [--right workshop-rogue] [--runs 4] [--over 3]
 *
 * With `--profile` it plays the bout once more under V8's CPU profiler and prints the share of
 * each file and of each function with everything it calls.
 *
 * Wall time on the machine it runs on: read it on a quiet one.
 */
import { Session } from "node:inspector/promises";
import { PerformanceObserver } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { CORE_ENGINE } from "../tests/harness/core-stand.mjs";
import { buildBout } from "./bout.mjs";

const { values } = parseArgs({ options: {
  left: { type: "string", default: "workshop-fighter" }, right: { type: "string", default: "workshop-rogue" },
  runs: { type: "string", default: "4" }, over: { type: "string", default: "3" }, profile: { type: "boolean", default: false },
} });
const recipe = { left: values.left, right: values.right, capSeconds: 60 }, over = Number(values.over);
// Babylon greets every engine it makes on the console.
Logger.LogLevels = Logger.NoneLogLevel;

const collections = [];
const observer = new PerformanceObserver((list) => { for (const e of list.getEntries()) collections.push({ at: e.startTime, ms: e.duration, kind: e.detail?.kind }); });
observer.observe({ entryTypes: ["gc"] });

/** One playing: each step's start, its time, and the solver's part of it. */
async function play() {
  const { world, duel, dispose } = await buildBout(recipe);
  const solve = world.physics.step.bind(world.physics);
  let solver = 0;
  world.physics.step = (dt) => { const t = performance.now(); solve(dt); solver = performance.now() - t; };
  const rows = [];
  while (!duel.verdict) { const t = performance.now(); world.step(); const all = performance.now() - t; rows.push({ t, all, solver, rest: all - solver }); }
  dispose();
  return rows;
}

const stats = (v) => {
  const s = [...v].sort((a, b) => a - b), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return `mean ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3)}, median ${q(0.5).toFixed(3)}, 99th per cent ${q(0.99).toFixed(3)}, 99.9th ${q(0.999).toFixed(3)}, longest ${s.at(-1).toFixed(3)}`;
};
const KINDS = { 1: "scavenge", 4: "mark-compact", 8: "incremental marking", 16: "weak callbacks" };

const played = [];
for (let i = 0; i < Number(values.runs); i++) played.push(await play());
await new Promise((resolve) => setTimeout(resolve, 100));
const read = played.slice(1), n = read[0].length;
const least = (of) => Array.from({ length: n }, (_, i) => Math.min(...read.map((rows) => rows[i][of])));
const all = least("all"), solver = least("solver"), rest = least("rest");
console.log(`Node, an arena bout in the core world, ${CORE_ENGINE}, 120 Hz; ${values.left} against ${values.right}, ${n} steps to its verdict, played ${values.runs} times and read on the last ${read.length}; ms\n`);
read.forEach((rows, k) => console.log(`playing ${k + 2}, a step: ${stats(rows.map((r) => r.all))}`));
console.log(`\nthe least of each step over the playings: ${stats(all)}`);
console.log(`  the solver: ${stats(solver)}`);
console.log(`  the rest: ${stats(rest)}`);
const dearest = all.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 8);
console.log(`  the eight dearest steps: ${dearest.map(([v, i]) => `step ${i} ${v.toFixed(2)} (solver ${solver[i].toFixed(2)}, rest ${rest[i].toFixed(2)})`).join("; ")}\n`);
const mine = collections.filter((c) => read.some((rows) => c.at >= rows[0].t && c.at <= rows.at(-1).t + rows.at(-1).all));
const steps = read.length * n, byKind = new Map();
for (const c of mine) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c.ms]);
for (const [kind, v] of byKind) console.log(`the collector, ${KINDS[kind] ?? `kind ${kind}`}: ${v.length} in ${steps} steps, one every ${(steps / v.length).toFixed(0)}; mean ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}, longest ${Math.max(...v).toFixed(2)}`);
const slow = read.flatMap((rows) => rows.filter((r) => r.all > over));
console.log(`steps over ${over} ms: ${slow.length} of ${steps}; with a collection inside: ${slow.filter((r) => mine.some((c) => c.at >= r.t && c.at <= r.t + r.all)).length}`);
observer.disconnect();

if (values.profile) {
  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: 100 });
  const { world, duel, dispose } = await buildBout(recipe);
  await session.post("Profiler.start");
  while (!duel.verdict) world.step();
  const { profile } = await session.post("Profiler.stop");
  dispose();
  session.disconnect();
  const short = (url) => url.replace(/^file:\/\/\/.*?\/(src|tests|research|scripts)\//, "$1/").replace(/^.*node_modules\//, "node_modules/") || "(native)";
  const byId = new Map(profile.nodes.map((node) => [node.id, node])), parent = new Map(), self = new Map(profile.nodes.map((node) => [node.id, 0]));
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  profile.samples.forEach((id, i) => self.set(id, self.get(id) + profile.timeDeltas[i]));
  const files = new Map(), within = new Map();
  let total = 0;
  for (const node of profile.nodes) {
    const t = self.get(node.id), file = short(node.callFrame.url);
    total += t;
    files.set(file, (files.get(file) ?? 0) + t);
    // A function's share with what it calls: its own time to each distinct name above it, once a stack.
    const seen = new Set();
    for (let id = node.id; id !== undefined; id = parent.get(id)) {
      const at = byId.get(id), key = `${at.callFrame.functionName || "(anonymous)"} ${short(at.callFrame.url)}`;
      if (!seen.has(key)) { seen.add(key); within.set(key, (within.get(key) ?? 0) + t); }
    }
  }
  const top = (map, most) => [...map].sort((a, b) => b[1] - a[1]).slice(0, most).map(([name, t]) => `| ${(100 * t / total).toFixed(1)} | ${name} |`).join("\n");
  const head = "| Of the bout, % | Where |\n|---|---|";
  console.log(`\nThe bout under the CPU profiler, ${(total / 1000).toFixed(0)} ms\n\nBy file, each function's own body\n\n${head}\n${top(files, 20)}\n`);
  console.log(`By function, with everything it calls\n\n${head}\n${top(within, 50)}`);
}
