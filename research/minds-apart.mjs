import { isRefused } from "../src/core/refusal.ts";
/**
 * Whether a fight is the same to the bit with its minds apart as with its minds on their bodies:
 * each case played on one thread and then with every mind on `--threads` worker threads
 * (`mindWorkers`, `src/app/node/minds.ts`), the whole physics world's saved bytes hashed each second
 * and at the end, with the blows and how the fight ended. A row is a playing; a case whose playings
 * differ prints the first second they part at, and the script exits 1.
 *
 *   node research/minds-apart.mjs [--cases crowd,sword,hands,crypt-10,crypt-25,bare] [--entrants] [--threads 1,2,3,4] [--seconds 60] [--fork 1]
 *
 * With `--fork`, each duel is saved, its minds on their bodies, at that many seconds and loaded
 * into a fresh bout of the same recipe. Its physics hashes each second, blows and ending must match
 * the original. The crowd and the Crypt do not save, and minds on worker threads keep their memory
 * there, so those are played unforked, and the run names them.
 * `--entrants` adds one compatible recipe for every registered entrant, bare hands first, including
 * hidden presets, to `--cases`; the same panel is in the fingerprint. The whole panel is one call:
 *
 *   node research/minds-apart.mjs --entrants --threads 1,2 --fork 10
 *
 * The cases: the crowd fight (`crowdFight`, seed 0) to its verdict; the reference bouts, Option
 * Mind Warriors at seed 0, sword against club and bare hands, to their verdict or `--seconds`; the
 * Crypt at seeds 10 and 25, the hero exploring alone, `--seconds` of it or to its end. The bouts
 * run on `BOUT_ENGINE`, the Crypt on `rapier`.
 */
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { recipeOf } from "../src/app/node/setup.ts";
import { crowdFight } from "../src/app/node/game.ts";
import { createDungeonRun } from "../src/app/node/game.ts";
import { buildBout, buildTeamBout } from "../src/app/node/evaluation.ts";
import { mindWorkers } from "../src/app/node/minds.ts";
import { freshEngine } from "../tests/harness/core-stand.mjs";
import { BOUT_ENGINE } from "./bout.mjs";
import { seededBareRecipe } from "./bare-recipe.mjs";
import { entrantRecipes } from "./entrant-recipes.mjs";

const { values } = parseArgs({ options: {
  cases: { type: "string", default: "crowd,sword,hands,crypt-10,crypt-25" }, threads: { type: "string", default: "1,2,3,4" }, seconds: { type: "string", default: "60" },
  fork: { type: "string" },
  entrants: { type: "boolean", default: false },
} });
const seconds = Number(values.seconds);
const forkSeconds = values.fork === undefined ? null : Number(values.fork);
if (!(seconds > 0 && Number.isFinite(seconds))) throw new Error("--seconds is a finite number above zero");
if (forkSeconds !== null && !(forkSeconds > 0 && forkSeconds < seconds)) throw new Error("--fork is above zero and below --seconds");

const duel = (loadouts) => ({ ...recipeOf(`?matchup=workshop-fighter,workshop-fighter&control=option,option&${loadouts}`, { left: {}, right: {} }, "open"), capSeconds: seconds });
const entrants = entrantRecipes();
const duels = [["sword", () => duel("left.loadout=empty,sword&right.loadout=empty,club")], ["hands", () => duel("left.loadout=empty,empty&right.loadout=empty,empty")],
  ["bare", () => ({ ...seededBareRecipe(), capSeconds: seconds })], ...entrants.map(({ name, recipe }) => [name, () => ({ ...recipe, capSeconds: seconds })])];
const forkable = new Set(duels.map(([name]) => name));
/** Each case: how to build it with its minds in `place` (or on their bodies), as a world, whether it has ended, its blows and its end. */
const CASES = {
  crowd: async (minds) => {
    const { world, bout, dispose } = await buildTeamBout(crowdFight(0), { engine: BOUT_ENGINE, ...minds });
    return { world, ended: () => bout.verdict !== null, blows: () => bout.blows.length, end: () => bout.verdict, dispose };
  },
  ...Object.fromEntries(duels.map(([name, recipe]) => [name, async (minds) => {
    const { world, duel: fight, dispose } = await buildBout(recipe(), { engine: BOUT_ENGINE, ...minds });
    return { world, ended: () => fight.verdict !== null, blows: () => fight.blows.length, end: () => fight.verdict, save: () => fight.save(), load: (saved) => fight.load(saved), dispose };
  }])),
  ...Object.fromEntries([10, 25].map((seed) => [`crypt-${seed}`, async (minds) => {
    const run = admitted(createDungeonRun({ seed, engine: await freshEngine("rapier"), ...minds }));
    run.commands.setMode({ keyboard: false, facing: true });
    let steps = 0;
    return {
      world: run.world, step: () => { run.step(); steps += 1; }, ended: () => run.status !== "playing" || steps >= seconds * run.world.hz,
      blows: () => run.blows.length, end: () => run.status, dispose() { run.dispose(); },
    };
  }])),
};

/** One playing of `name`, its minds on their bodies (`threads` 0) or apart on that many threads: a hash of the world each second, and its last. */
async function played(name, threads, from = null, forks = false) {
  const place = threads > 0 ? mindWorkers(threads) : null;
  const fight = await CASES[name](place ? { minds: place } : {});
  const step = fight.step ?? (() => fight.world.step()), hz = fight.world.hz, seconds = [];
  const hashed = () => createHash("sha256").update(fight.world.physics.save()).update(`${fight.blows()}`).digest("hex").slice(0, 16);
  const began = performance.now();
  let steps = from?.steps ?? 0, saved = null;
  const forkAt = forkSeconds === null || !forks ? null : Math.round(forkSeconds * hz);
  try {
    if (from) fight.load(from.state);
    const first = hashed();
    while (!fight.ended()) {
      step(); steps += 1;
      if (steps % hz === 0) seconds.push(hashed());
      if (threads === 0 && !from && steps === forkAt) saved = { state: fight.save(), steps, hz, hash: hashed() };
    }
    if (threads === 0 && !from && forkAt !== null && !saved) throw new Error(`${name} ended before its fork at ${forkSeconds} s`);
    return { steps, seconds, first, last: hashed(), blows: fight.blows(), end: JSON.stringify(fight.end()), ms: performance.now() - began, saved };
  } finally { fight.dispose(); place?.dispose(); }
}

let parted = false;
const names = [...values.cases.split(",").filter(Boolean), ...values.entrants ? entrants.map((entry) => entry.name) : []];
for (const name of names) if (!CASES[name]) throw new Error(`no case ${name}: ${Object.keys(CASES).join(", ")}`);
if (forkSeconds !== null) {
  const unforked = names.filter((name) => !forkable.has(name));
  if (unforked.length) console.log(`played unforked, as they do not save: ${unforked.join(", ")}`);
}
for (const name of names) {
  const here = await played(name, 0, null, forkable.has(name));
  console.log(`${name}, on one thread: ${here.steps} steps, ${here.blows} blows, ended ${here.end}, ${(here.ms / 1000).toFixed(1)} s, last ${here.last}`);
  if (here.saved) {
    const fork = await played(name, 0, here.saved), suffix = here.seconds.slice(Math.floor(here.saved.steps / here.saved.hz));
    const at = fork.seconds.findIndex((hash, i) => hash !== suffix[i]);
    const same = fork.first === here.saved.hash && at < 0 && fork.seconds.length === suffix.length && fork.steps === here.steps && fork.last === here.last && fork.blows === here.blows && fork.end === here.end;
    parted ||= !same;
    console.log(`${name}, fresh fork at ${forkSeconds} s: ${same ? "the same" : `PARTS${fork.first !== here.saved.hash ? " at load" : at >= 0 ? ` at second ${Math.floor(here.saved.steps / here.saved.hz) + at + 1}` : ""}`}, ${fork.steps} steps, ${fork.blows} blows, ended ${fork.end}, ${(fork.ms / 1000).toFixed(1)} s`);
  }
  for (const threads of values.threads.split(",").filter(Boolean).map(Number)) {
    const apart = await played(name, threads);
    const at = apart.seconds.findIndex((hash, i) => hash !== here.seconds[i]);
    const same = at < 0 && apart.steps === here.steps && apart.last === here.last && apart.blows === here.blows && apart.end === here.end;
    parted ||= !same;
    console.log(`${name}, ${threads} thread${threads === 1 ? "" : "s"}: ${same ? "the same" : `PARTS${at >= 0 ? ` at second ${at + 1}` : ""}`}, ${apart.steps} steps, ${apart.blows} blows, ended ${apart.end}, ${(apart.ms / 1000).toFixed(1)} s`);
  }
}
process.exitCode = parted ? 1 : 0;

/** A returned admission failure reaches this diagnostic with its original message. */
function admitted(value) { if (isRefused(value)) throw new Error(value.refused); return value; }
