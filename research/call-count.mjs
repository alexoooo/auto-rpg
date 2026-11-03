/**
 * How many times a step the step's heavy work runs: the functions `research/call-count-hook.mjs`
 * counts (`worldShapes`, `menuOf`, the opening searches, the router's searches, the engine's `contactsOf`) and the calls
 * into Rapier's WebAssembly, over one bout to its verdict or `--cap` s. Counts are the same on every
 * machine: a change that holds work shows here before and after.
 *
 *   node research/call-count.mjs --link "?matchup=...&control=option,option&left.loadout=empty,sword" [--cap 60]
 *   node research/call-count.mjs --crowd [--seed 0] [--cap 60]
 */
import { register } from "node:module";
import { parseArgs } from "node:util";

register("./call-count-hook.mjs", import.meta.url);
globalThis.__calls = {};
globalThis.__countWasm = (exports) => Object.fromEntries(Object.entries(exports).map(([name, value]) => [name, typeof value !== "function" ? value
  : (...args) => { globalThis.__calls.wasm = (globalThis.__calls.wasm ?? 0) + 1; return value(...args); }]));

const { values } = parseArgs({ options: { link: { type: "string" }, crowd: { type: "boolean", default: false }, seed: { type: "string", default: "0" }, cap: { type: "string", default: "60" } } });
await import("../tests/harness/preload-data.mjs");
const { recipeOf } = await import("../src/arena/matchup.ts");
const { crowdFight } = await import("../src/arena/team-bout.ts");
const { buildBout, buildTeamBout } = await import("../src/evaluation/bout.ts");
const { BOUT_ENGINE } = await import("./bout.mjs");
if (!values.crowd && !values.link) throw new Error("name a bout: --link or --crowd");

const cap = Number(values.cap);
const built = values.crowd
  ? await buildTeamBout({ ...crowdFight(Number(values.seed)), capSeconds: cap }, { engine: BOUT_ENGINE }).then(({ world, bout, dispose }) => ({ world, over: () => bout.verdict !== null, dispose }))
  : await buildBout({ ...recipeOf(values.link, { left: {}, right: {} }, "open"), capSeconds: cap }, { engine: BOUT_ENGINE }).then(({ world, duel, dispose }) => ({ world, over: () => duel.verdict !== null, dispose }));
for (const key of Object.keys(globalThis.__calls)) delete globalThis.__calls[key];
let steps = 0;
while (!built.over()) { built.world.step(); steps++; }
built.dispose();
console.log(`Node, core world, ${BOUT_ENGINE}, 120 Hz; ${values.crowd ? `the crowd fight, seed ${values.seed}` : `the bout of ${values.link}`}; ${steps} steps\n`);
console.log("| Counted | Calls a step |\n|---|---|");
for (const [name, count] of Object.entries(globalThis.__calls).sort()) console.log(`| ${name} | ${(count / steps).toFixed(1)} |`);
