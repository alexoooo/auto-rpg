// Print generated levels as text, to judge layouts before they are played.
//   node scripts/dungeon/print-level.mjs            seeds 1 to 4
//   node scripts/dungeon/print-level.mjs 7 42 99    those seeds
import { generateLevel, levelRows } from "../../src/dungeon/level.ts";

const seeds = process.argv.slice(2).map(Number);
for (const seed of seeds.length > 0 ? seeds : [1, 2, 3, 4]) {
  const started = performance.now();
  const { map, metrics } = generateLevel(seed);
  const ms = performance.now() - started;
  console.log(`\nseed ${seed}  ${Object.entries(metrics).map(([k, v]) => `${k} ${Math.round(v)}`).join("  ")}  (${ms.toFixed(0)} ms)`);
  for (const row of levelRows(map)) console.log(row.trimEnd());
}
