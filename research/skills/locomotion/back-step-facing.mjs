/**
 * **How a back step leaves the body facing its foe** (`Sway.facing`, `src/evaluation/back-step/read.ts`):
 * from runs of the back step's evaluation that record sways (`drilled-sways`, `spar`, `spar-chosen`,
 * `spar-mirror`), the sways not ended down; of each angle, rad, the median of its size, its 90th
 * percentile and the share past the punch's facing gate (0.4, `strikeWindow`); the foe's part of the
 * line's swing (`swung` less `stepped`); and, of the sways past the gate as they ended, which part
 * was the largest: the legs' turn, the body's own move across, or the foe's.
 *
 *   npm run evaluate -- back-step option --protocol spar-chosen --json <run.json>
 *   node research/skills/locomotion/back-step-facing.mjs <run.json> ...
 */
import { readFileSync } from "node:fs";

const GATE = .4, wrap = (a) => a - 2 * Math.PI * Math.ceil((a - Math.PI) / (2 * Math.PI));
const median = (xs) => xs.length ? xs[Math.floor(xs.length / 2)] : NaN, q90 = (xs) => xs[Math.floor(xs.length * .9)];

for (const path of process.argv.slice(2)) {
  const run = JSON.parse(readFileSync(path, "utf8"));
  const sways = run.cases.flatMap((one) => one.reading?.sways ?? []).filter((sway) => sway.facing && !sway.down);
  const turned = (sway) => Math.abs(sway.facing.turned), stepped = (sway) => Math.abs(sway.facing.stepped), foe = (sway) => Math.abs(wrap(sway.facing.swung - sway.facing.stepped));
  const sizes = (of) => sways.map(of).sort((a, b) => a - b), past = (of) => sways.filter((sway) => of(sway) > GATE).length;
  console.log(`${path}: ${sways.length} sways`);
  for (const [name, of] of [...["start", "end", "later", "turned", "swung", "stepped"].map((key) => [key, (sway) => Math.abs(sway.facing[key])]), ["foe's swing", foe]])
    console.log(`  |${name}| median ${median(sizes(of)).toFixed(3)} rad, q90 ${q90(sizes(of)).toFixed(3)}, past ${GATE} ${past(of)} (${(100 * past(of) / sways.length).toFixed(0)}%)`);
  const ended = sways.filter((sway) => Math.abs(sway.facing.end) > GATE);
  const largest = (of, others) => ended.filter((sway) => others.every((other) => of(sway) > other(sway))).length;
  console.log(`  of ${ended.length} past the gate as they ended, the largest part: the legs' turn ${largest(turned, [stepped, foe])}, the body's move across ${largest(stepped, [turned, foe])}, the foe's ${largest(foe, [turned, stepped])}`);
}
