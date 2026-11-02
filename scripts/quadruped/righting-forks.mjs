// The fights a quadruped rights itself in, as starts for `scripts/quadruped/righting.mjs --forks`:
// `node scripts/quadruped/righting-forks.mjs --model rat --gaps 1,1.5,2,3,4 [--out <file>]`. Each
// bout (Node Arena Duel, Rapier, 120 Hz, the game's delay, 40 s) sets the model, bare, against the
// sword Warrior at a gap (`FORK_BOUT`); each time its righting takes the body the bout is saved,
// and a trial loads the save into the same bout with its candidate recipe (`righting-worker.mjs`).
import "../../tests/harness/preload-data.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { serialize } from "node:v8";
import { dirname, resolve } from "node:path";
import { buildBout } from "../../src/evaluation/bout.ts";
import { forkBout } from "./righting-worker.mjs";

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1]; };
const MODEL = arg("model", "rat"), GAPS = arg("gaps", "1,1.5,2,3,4").split(",").map(Number);
const OUT = arg("out", resolve(import.meta.dirname, `../../.tmp/righting/${MODEL}-forks.bin`));

const forks = [];
for (const gap of GAPS) {
  const { duel, world, dispose } = await buildBout(forkBout(MODEL, gap));
  const righting = duel.duelists.left.body.state.mind.host.righting;
  let sequence = righting.sequence;
  while (duel.clock < 40 && !duel.verdict) {
    world.step();
    if (righting.sequence !== sequence) forks.push({ gap, clock: Math.round(duel.clock * 1000) / 1000, retries: righting.retries, save: duel.save() });
    sequence = righting.sequence;
  }
  dispose();
  console.log(`gap ${gap}: ${forks.filter((f) => f.gap === gap).length} forks`);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, serialize(forks));
console.log(`${forks.length} forks in ${OUT}`);
