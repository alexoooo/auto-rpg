// Print generated levels as text, to check the generator does what it says.
//   node scripts/dungeon/print-level.mjs            seeds 1 to 4
//   node scripts/dungeon/print-level.mjs 7 42 99    those seeds
//   ... --all                                       every candidate's metrics above the chosen map
import { generateLevel, levelCandidates, levelRows } from "../../src/dungeon/level.ts";

const all = process.argv.includes("--all");
const seeds = process.argv.slice(2).filter((a) => a !== "--all").map(Number);
for (const seed of seeds.length > 0 ? seeds : [1, 2, 3, 4]) {
  const started = performance.now();
  const { map, metrics } = generateLevel(seed);
  const ms = performance.now() - started;
  console.log(`\nseed ${seed}  ${Object.entries(metrics).map(([k, v]) => `${k} ${Math.round(v * 10) / 10}`).join("  ")}  (${ms.toFixed(0)} ms)`);
  if (all) for (const c of levelCandidates(seed)) console.log(`  candidate  ${Object.entries(c.metrics).map(([k, v]) => `${k} ${Math.round(v * 10) / 10}`).join("  ")}`);
  for (const row of levelRows(map)) console.log(row.trimEnd());
}
