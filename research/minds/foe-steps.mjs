/**
 * **The foe's steps as bouts measured them** (`FoeSteps`, `src/minds/option/percepts.ts`): from the
 * records `strike-bouts.mjs --save` wrote, each decision with both bodies' centres a moment; how far
 * the foe's centre came toward the body along the line between them over each horizon after, by
 * the range centre to centre in bands and what the body chose then (`Doing`: the back step; a walk,
 * to a strike's window or a reach's edge; a strike; a hold; else). The foe is read where the side's
 * later decisions saw it; a moment whose horizon runs past its bout's end is not read.
 *
 *   node research/minds/foe-steps.mjs <bouts.json> ... --out <table.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const HORIZONS = [.25, .5, 1, 2], BAND = .25, FARTHEST = 3;
const { values, positionals } = parseArgs({ options: { out: { type: "string" } }, allowPositionals: true });
if (!positionals.length) throw new Error("name the bouts strike-bouts.mjs saved: foe-steps.mjs <bouts.json> ... [--out <table.json>]");

/** What a body chose, as the table tells it apart, by the offer's name. */
const doingOf = (chosen) => /back step/.test(chosen) ? "back step" : / to /.test(chosen) ? "walk"
  : /^[a-z-]+ (hand|foot)\./.test(chosen) ? "strike" : /^hold/.test(chosen) ? "hold" : "other";

const cells = new Map();
let moments = 0;
for (const path of positionals) for (const [, bout] of JSON.parse(readFileSync(path, "utf8"))) for (const rows of bout.decisions) {
  if (!rows.length || rows[0].length < 13) throw new Error(`${path}: decisions saved without the bodies' centres; play them again`);
  for (const [i, row] of rows.entries()) {
    const [t, apart, chosen] = row, own = row[11], foe = row[12];
    if (t + HORIZONS.at(-1) > bout.seconds || !(apart > 0) || apart >= FARTHEST) continue;
    const ux = (own[0] - foe[0]) / apart, uz = (own[1] - foe[1]) / apart, doing = doingOf(String(chosen));
    const range = Math.floor(apart / BAND) * BAND, key = `${doing}|${range}`;
    const cell = cells.get(key) ?? { doing, range: Number(range.toFixed(2)), n: 0, toward: HORIZONS.map(() => 0) };
    cells.set(key, cell);
    cell.n++; moments++;
    let k = i;
    HORIZONS.forEach((h, j) => {
      while (k + 1 < rows.length && rows[k + 1][0] <= t + h) k++;
      const later = rows[k][12];
      cell.toward[j] += (later[0] - foe[0]) * ux + (later[1] - foe[1]) * uz;
    });
  }
}
const table = { horizons: HORIZONS, band: BAND, cells: [...cells.values()].sort((a, b) => a.doing.localeCompare(b.doing) || a.range - b.range)
  .map((cell) => ({ ...cell, toward: cell.toward.map((x) => Number((x / cell.n).toFixed(4))) })) };
console.log(`${moments} moments, ${table.cells.length} cells`);
for (const cell of table.cells) if (cell.n >= 30) console.log(`  ${cell.doing} ${cell.range.toFixed(2)} m: ${cell.toward.join(" / ")} (${cell.n})`);
if (values.out) writeFileSync(values.out, `${JSON.stringify({ source: { script: "research/minds/foe-steps.mjs", bouts: positionals }, ...table })}\n`);
