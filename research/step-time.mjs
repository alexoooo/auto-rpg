/**
 * Where a bout's step goes, and whether a slow step is the work or the machine: one arena bout
 * played `--runs` times over in one process, a world each, every step timed with the solver's part
 * of it. A bout plays the same to the bit each time, so step k is the same work in every playing:
 * the least of its times over the playings is what that work takes, and what a playing took beyond
 * it was the machine's or the collector's. The first playing warms the compiler and is not read.
 *
 * It prints each playing's steps, the least over the playings split into the solver and the rest
 * (control, senses, blows), the dearest steps, every kind of collection in the playings read, and
 * how many steps over `--over` ms had a collection inside; and what each side's hands' solves took
 * (`ReachMeter`, `src/control/motor.ts`): how many, their passes, and how many ran to the cap.
 *
 *   node research/step-time.mjs [--left man] [--right woman] [--runs 4] [--over 3]
 *   node research/step-time.mjs --link "?matchup=...&control=option,option&left.loadout=empty,sword" [--cap 60]
 *   node research/step-time.mjs --crowd [--seed 0] [--cap 120]
 *   ... --minds 3                      every mind apart, on that many worker threads (`mindWorkers`, `src/app/node/minds.ts`)
 *
 * `--link` plays the bout an Arena link names (`recipeOf`); `--crowd` the crowd fight
 * (`crowdFight`, `src/game/arena/team-bout.ts`), ten bodies. It also prints the dearest step past
 * the first `--skip` s (2), what the bout's start and the compiler's first passes leave out, and
 * each playing's worst lag behind real time from then (`lagOf`, `research/lag.mjs`), its steps as
 * a page would have had them, collections and all: the step it peaks at, the run of steps that
 * built it and the collections inside that run; the figure is the least of the playings' worst.
 *
 * With `--profile` it plays the bout once more under V8's CPU profiler and prints the share of
 * each file and of each function with everything it calls.
 *
 * Wall time on the machine it runs on: read it on a quiet one.
 */
import { Session } from "node:inspector/promises";
import { PerformanceObserver } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { SIDES } from "../src/game/arena/duel.ts";
import { buildBout, buildTeamBout } from "../src/app/node/evaluation.ts";
import { recipeOf } from "../src/app/node/setup.ts";
import { crowdFight } from "../src/app/node/game.ts";
import { BOUT_ENGINE } from "./bout.mjs";
import { lagOf } from "./lag.mjs";
import { mindWorkers } from "../src/app/node/minds.ts";

const { values } = parseArgs({ options: {
  left: { type: "string", default: "man" }, right: { type: "string", default: "woman" },
  runs: { type: "string", default: "4" }, over: { type: "string", default: "3" }, profile: { type: "boolean", default: false },
  link: { type: "string" }, crowd: { type: "boolean", default: false }, seed: { type: "string", default: "0" },
  cap: { type: "string" }, skip: { type: "string", default: "2" }, minds: { type: "string" },
} });
const cap = values.cap === undefined ? undefined : Number(values.cap), over = Number(values.over), skip = Number(values.skip);
const recipe = values.link ? { ...recipeOf(values.link, { left: {}, right: {} }, "open"), capSeconds: cap ?? 60 } : { left: values.left, right: values.right, capSeconds: cap ?? 60 };
const crowd = values.crowd ? { ...crowdFight(Number(values.seed)), ...(cap === undefined ? {} : { capSeconds: cap }) } : null;
const named = crowd ? `the crowd fight, seed ${values.seed}` : values.link ? `the bout of ${values.link}` : `${values.left} against ${values.right}`;
/** The bout to play, built: its world, whether it has ended, and its sides' reach meters where it is a duel and its minds are here. */
const build = async () => {
  const place = values.minds ? mindWorkers(Number(values.minds)) : null, minds = place ? { minds: place } : {};
  const stop = (dispose) => () => { dispose(); place?.dispose(); };
  if (crowd) { const { world, bout, dispose } = await buildTeamBout(crowd, { engine: BOUT_ENGINE, ...minds }); return { world, over: () => bout.verdict !== null, reach: () => [], dispose: stop(dispose) }; }
  const { world, duel, dispose } = await buildBout(recipe, { engine: BOUT_ENGINE, ...minds });
  return { world, over: () => duel.verdict !== null, reach: () => place ? [] : SIDES.map((side) => ({ side, ...duel.duelists[side].body.state.mind.host.motor.reach })), dispose: stop(dispose) };
};

const collections = [];
const observer = new PerformanceObserver((list) => { for (const e of list.getEntries()) collections.push({ at: e.startTime, ms: e.duration, kind: e.detail?.kind }); });
observer.observe({ entryTypes: ["gc"] });

/** One playing: each step's start, its time, and the solver's part of it; and, as `reach`, each side's hands' solves counted. */
async function play() {
  const { world, over: ended, reach, dispose } = await build();
  const solve = world.physics.step.bind(world.physics);
  let solver = 0;
  world.physics.step = (dt) => { const t = performance.now(); solve(dt); solver = performance.now() - t; };
  const rows = [];
  while (!ended()) { const t = performance.now(); world.step(); const all = performance.now() - t; rows.push({ t, all, solver, rest: all - solver }); }
  rows.reach = reach();
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
console.log(`Node, an arena bout in the core world, ${BOUT_ENGINE}, 120 Hz; ${named}, ${n} steps to its verdict, played ${values.runs} times and read on the last ${read.length}; ms\n`);
read.forEach((rows, k) => console.log(`playing ${k + 2}, a step: ${stats(rows.map((r) => r.all))}`));
console.log(`\nthe least of each step over the playings: ${stats(all)}`);
console.log(`  the solver: ${stats(solver)}`);
console.log(`  the rest: ${stats(rest)}`);
const past = Math.round(skip * 120), after = all.slice(past);
console.log(`  past the first ${skip} s: the dearest step ${Math.max(...after).toFixed(2)}, ${after.filter((v) => v > 1000 / 120).length} of ${after.length} over 8.33`);
const dearest = all.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 8);
console.log(`  the eight dearest steps: ${dearest.map(([v, i]) => `step ${i} ${v.toFixed(2)} (solver ${solver[i].toFixed(2)}, rest ${rest[i].toFixed(2)})`).join("; ")}\n`);
const mine = collections.filter((c) => read.some((rows) => c.at >= rows[0].t && c.at <= rows.at(-1).t + rows.at(-1).all));
const steps = read.length * n, byKind = new Map();
for (const c of mine) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c.ms]);
for (const [kind, v] of byKind) console.log(`the collector, ${KINDS[kind] ?? `kind ${kind}`}: ${v.length} in ${steps} steps, one every ${(steps / v.length).toFixed(0)}; mean ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}, longest ${Math.max(...v).toFixed(2)}`);
const slow = read.flatMap((rows) => rows.filter((r) => r.all > over));
console.log(`steps over ${over} ms: ${slow.length} of ${steps}; with a collection inside: ${slow.filter((r) => mine.some((c) => c.at >= r.t && c.at <= r.t + r.all)).length}`);
/** `list`'s collections by kind: how many, and the longest, ms. */
const collected = (list) => [...Map.groupBy(list, (c) => KINDS[c.kind] ?? `kind ${c.kind}`)].map(([kind, of]) => `${of.length} ${kind}, the longest ${Math.max(...of.map((c) => c.ms)).toFixed(1)}`).join("; ") || "none";
const lags = read.map((rows) => {
  const lag = lagOf(rows.map((r) => r.all), 1000 / 120, past), from = rows[lag.began], to = rows[lag.at];
  return { ...lag, collections: mine.filter((c) => c.at >= from.t && c.at <= to.t + to.all) };
});
lags.forEach((lag, k) => console.log(`playing ${k + 2}, the worst lag past ${skip} s: ${lag.lag.toFixed(2)} ms at step ${lag.at}, built over steps ${lag.began} to ${lag.at} (${lag.over} over 8.33; collections ${collected(lag.collections)})`));
console.log(`the worst lag, the least of the playings': ${Math.min(...lags.map((lag) => lag.lag)).toFixed(2)} ms, a step being 8.33`);
console.log(`the hands' solves in a playing: ${read[0].reach.map(({ side, solves, passes, capped }) => `${side} ${solves} solves, ${passes} passes, ${capped} at the cap`).join("; ")}`);
observer.disconnect();

if (values.profile) {
  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: 100 });
  const { world, over: ended, dispose } = await build();
  await session.post("Profiler.start");
  while (!ended()) world.step();
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
