/**
 * **Writes the club's best blow** (`research/core-club-unit.json`, `CLUB_BEST` in
 * `src/core/rules/rulebook.ts`) from a `research/core-strike-search.mjs` run's output (its last
 * line): the Warrior's strongest club blow at a head. The blow is read again at each of `--hz`'s
 * rates on eight throws, the first as written and the rest perturbed as the search's replay
 * perturbs them (a push moved within half a 120 Hz step and its level within 2 %, on a 20, 30 or
 * 40 m ground), at a target body of the head hung at its place (`evaluateBlow`,
 * `research/core-blow.mjs`). A throw's reading is the blow that took most from the target
 * (`hardestOn`): its energy, J, the closing speed along its normal, the masses its two sides met,
 * and when it landed, s from the pushes' beginning. Each rate's mean is of the eight energies.
 *
 *   node research/core-club-unit.mjs <search output> [--hz 120,480,960,1920,3840] [--write]
 */
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { STAND } from "../src/core/skills/strike.ts";
import { hardestOn } from "../src/lab/targets.ts";
import { CORE_BLOW_HARNESS, evaluateBlow } from "./core-blow.mjs";

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  hz: { type: "string", default: "120,480,960,1920,3840" }, write: { type: "boolean", default: false },
} });
if (positionals.length !== 1) throw new Error("one search output: node research/core-club-unit.mjs <file>");
const record = JSON.parse((await readFile(positionals[0], "utf8")).trim().split("\n").at(-1));
if (record.held !== "wooden club" || record.band !== "high") throw new Error(`${positionals[0]} is a ${record.held} search at the ${record.band} band, not the club's at a head`);

/** What a mind cannot hold exactly from one blow to the next, as the search's replay draws it. */
const TIMING = 1 / 240, LEVEL = 0.02, GROUNDS = [20, 30, 40];
let state = 1;
const uniform = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const throws = [{ shift: 0, scale: 1 }, ...Array.from({ length: 7 }, () => ({ shift: TIMING * (2 * uniform() - 1), scale: 1 + LEVEL * (2 * uniform() - 1) }))]
  .map((perturbation, k) => ({ perturbation, ground: GROUNDS[k % GROUNDS.length] }));
const round = (x, places) => +x.toFixed(places);
const pushing = STAND + (record.strike.chamber?.seconds ?? 0);

const readings = {};
for (const hz of values.hz.split(",").map(Number)) {
  const read = await Promise.all(throws.map(async ({ perturbation, ground }) => {
    const result = await evaluateBlow({ model: record.model, held: record.held, hand: record.hand, band: record.band, strike: record.strike,
      ahead: record.place.ahead, hz, ground, perturbation });
    const landed = hardestOn(result.blows, "dummy");
    if (!landed) return { energy: 0, landed: null, stood: result.stood };
    const club = landed.sides.find((side) => side.fighter !== "dummy"), head = landed.sides.find((side) => side.fighter === "dummy");
    return { energy: landed.energy, landed: { at: landed.time - pushing, closing: landed.closing, clubKg: club.kg, headKg: head.kg, normal: landed.normal }, stood: result.stood };
  }));
  const first = read[0].landed;
  readings[`at${hz}`] = {
    mean: round(read.reduce((sum, r) => sum + r.energy, 0) / read.length, 2), runs: read.map((r) => round(r.energy, 2)),
    landed: read.filter((r) => r.landed).length, stood: read.filter((r) => r.stood).length,
    ...(first ? { at: round(first.at, 4), closing: round(first.closing, 3), clubKg: round(first.clubKg, 3), headKg: round(first.headKg, 3), normal: first.normal.map((v) => round(v, 3)) } : {}),
  };
  console.log(hz, JSON.stringify(readings[`at${hz}`]));
}

const found = `research/core-strike-search.mjs --model ${record.model} --held "${record.held}" --band ${record.band} --seed ${record.seed} --hz ${record.hz}`
  + ` --generations ${record.generations} --population ${record.population}${record.from ? ` --from ${record.from} --sigma ${record.sigma}` : ""},`
  + ` ${record.trials} trials a candidate and one at nothing; searched mean ${record.searched.mean} HP; read again by research/core-club-unit.mjs`;
const out = { harness: `${CORE_BLOW_HARNESS}; each rate's mean of eight throws' energies, J, the first's landing beside it`,
  model: record.model, hand: record.hand, found, readings, distance: record.place.ahead, strike: record.strike };
if (values.write) await writeFile(new URL("./core-club-unit.json", import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
else console.log(JSON.stringify(out));
process.exit(0);
