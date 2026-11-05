// The fights a quadruped rights itself in, as starts for `scripts/skills/recovery/righting/righting.mjs --forks`:
// `node scripts/skills/recovery/righting/righting-forks.mjs --model rat --gaps 1,1.5,2,3,4 [--out <file>]`. Each
// bout (Node Arena Duel, Rapier, 120 Hz, the game's delay, 40 s) sets the model, bare, against the
// sword Warrior at a gap (`forkBout`); each time its righting by recipe takes the body the bout is saved,
// and a trial loads the save into the same bout with its candidate recipe (`righting-worker.mjs`).
import "../../../../tests/harness/preload-data.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { serialize } from "node:v8";
import { dirname, resolve } from "node:path";
import { buildBout } from "../../../../src/app/node/evaluation.ts";
import { forkBout, rightingOf } from "./righting-worker.mjs";

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1]; };
const MODEL = arg("model", "rat"), GAPS = arg("gaps", "1,1.5,2,3,4").split(",").map(Number);
const OUT = arg("out", resolve(import.meta.dirname, `../../../../.tmp/righting/${MODEL}-forks.bin`));

const forks = [];
for (const gap of GAPS) {
  const { duel, world, dispose } = await buildBout(forkBout(MODEL, gap));
  const righting = rightingOf(duel.duelists.left.minded.state);
  let was = righting.phase;
  while (duel.clock < 40 && !duel.verdict) {
    world.step();
    if (was === "idle" && righting.phase !== "idle") forks.push({ gap, clock: Math.round(duel.clock * 1000) / 1000, save: duel.save() });
    was = righting.phase;
  }
  dispose();
  console.log(`gap ${gap}: ${forks.filter((f) => f.gap === gap).length} forks`);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, serialize(forks));
console.log(`${forks.length} forks in ${OUT}`);
