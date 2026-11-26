/**
 * **The measured pressure** (`PressureTable`, `src/minds/option/predictions/exchange/pressure-table.ts`;
 * `assets/minds/pressure-profiles.json`): what a foe's fighting took from a body in bouts, by how
 * far apart the two stood centre to centre, what the foe was doing, and the seconds after.
 *
 *   node research/minds/pressure-profiles.mjs <bouts>... [--write]
 *
 * `--write` puts the tables in the game's asset beside its tables of pairings these bouts do not
 * measure; a table not yet kept is tried so in a worktree.
 *
 * Each of `<bouts>` is a bout record `strike-bouts.mjs --save` wrote, or a directory of them. Each
 * decision of a side (its record's `decisions`) is a moment: the two `range` m apart centre to
 * centre; what the foe was doing as the side's mind read it then (`phase`, its decision row's last
 * field, `Engagement.foe`: the reading the mind prices by, `FoePhase`; a row with none, from before
 * it was written, is no moment); and the life the side lost (its pool's bar, a share of its full
 * life: the drain on a stalled bout is not in it) by each of `HORIZONS` s after, out to as far as
 * the chooser looks (`HORIZON`, `src/minds/option/choosers/parts.ts`), at any range: a foe out of reach
 * comes, and what it takes on arriving is in the later horizons. Past the end of a bout a body's
 * life ended, its last bars hold; a moment whose last horizon is past the end of a bout that
 * ended otherwise is none, as is one within `UNSETTLED` s of either side's fall. Moments are kept summed in bins of `BIN` m by phase. A table is of
 * a striker's body on a struck body, each as numbers (`pressureBody`: each side of a bout the struck, the other the striker); it is
 * measured from the minds that fought them, and read again where those change. Bouts are empty-handed
 * (a record's `held` `empty`), so a table is of bodies holding nothing; others are refused.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { savedBouts } from "../skills/strikes/bout-save.mjs";
import { execSync } from "node:child_process";
import { resolveCharacter } from "../../src/core/bodies/models.ts";
import { pressureBody } from "../../src/minds/option/predictions/exchange/pressure-table.ts";
import { playedOnce } from "../skills/profile-origin.mjs";

const OUT = "assets/minds/pressure-profiles.json", SCRIPT = "research/minds/pressure-profiles.mjs";
/** The seconds after a moment its life lost is read at. */
const HORIZONS = Object.freeze([.2, .5, .9, 1.65, 3, 6, 10, 20]);
/** A bin's width, m, centre to centre. */
const BIN = .02;
/** How long a fall unsettles a fight, s: a moment this soon after either side's is none. */
const UNSETTLED = 3;

const write = process.argv.includes("--write"), paths = process.argv.slice(2).filter((arg) => arg !== "--write");
if (!paths.length) throw new Error("usage: pressure-profiles.mjs <bout record or directory>... [--write]");
const files = paths.flatMap((path) => statSync(path).isDirectory() ? readdirSync(path).filter((name) => name.endsWith(".json")).sort().map((name) => `${path}/${name}`) : [path]);
const round = (x) => Number(x.toFixed(6));
const tables = new Map();
let bouts = 0, moments = 0;
for (const file of files) {
  for (const [header, record] of savedBouts(file)) {
    if (record.held !== "empty") throw new Error(`${file}: a bout with a body holding something (${header}); tables are of empty hands`);
    bouts++;
    for (const i of [0, 1]) {
      const rows = record.decisions[i], foe = record.sides[1 - i], own = record.sides[i];
      const measured = pressureBody(resolveCharacter({ model: foe.model }).spec), target = pressureBody(resolveCharacter({ model: own.model }).spec);
      const key = JSON.stringify([measured, target]);
      const table = tables.get(key) ?? { measured, target, minds: [], bins: new Map() };
      tables.set(key, table);
      table.minds.push(...record.played);
      const falls = [...record.downs[0], ...record.downs[1]];
      /** The side's bar at `t`: its last decision's at or before it; past the bout's end, its last. */
      const barAt = (t) => { if (t >= record.seconds) return record.bars[i]; let bar = rows[0].life; for (const row of rows) { if (row.t > t) break; bar = row.life; } return bar; };
      const ended = record.bars.some((bar) => bar <= 0);
      for (const { t, apart: range, life: bar, foe: phase } of rows) {
        if (!ended && t + HORIZONS.at(-1) > record.seconds || falls.some((at) => t >= at && t - at < UNSETTLED)) continue;
        // The foe's phase as the side sensed it (`Engagement.foe`); a moment that sensed none is not read.
        if (phase === null) continue;
        const at = round(Math.round(range / BIN) * BIN), binKey = `${phase} ${at}`;
        const bin = table.bins.get(binKey) ?? { phase, range: at, n: 0, lost: HORIZONS.map(() => 0) };
        table.bins.set(binKey, bin);
        bin.n++;
        HORIZONS.forEach((h, k) => { bin.lost[k] += Math.max(0, bar - barAt(t + h)); });
        moments++;
      }
    }
  }
}
const commit = execSync("git rev-parse --short HEAD").toString().trim();
const profiles = [...tables.values()].map((table) => ({ measured: table.measured, target: table.target, horizons: HORIZONS, from: { minds: playedOnce(table.minds) },
  bins: [...table.bins.values()].sort((a, b) => a.phase.localeCompare(b.phase) || a.range - b.range).map((bin) => ({ phase: bin.phase, range: bin.range, n: bin.n, lost: bin.lost.map((sum) => round(sum / bin.n)) })) }));
for (const profile of profiles) {
  const by = {};
  for (const bin of profile.bins) { const b = by[bin.phase] ??= { n: 0 }; b.n += bin.n; }
  console.log(`${profile.measured.stature} m, ${profile.measured.mass} kg on ${profile.target.stature} m, ${profile.target.mass} kg: ${Object.entries(by).map(([phase, b]) => `${phase} ${b.n}`).join(", ")} moments in ${profile.bins.length} bins`);
}
console.log(`${moments} moments from ${bouts} bouts in ${files.length} files`);
if (write) {
  // The asset's tables of other pairings are kept, with how they were made (`kept`); a pairing measured again is replaced.
  const asset = JSON.parse(readFileSync(OUT, "utf8")), pairing = (table) => JSON.stringify([table.measured, table.target]), made = new Set(profiles.map(pairing));
  const kept = asset.profiles.filter((table) => !made.has(pairing(table)));
  const source = { script: SCRIPT, commit, bouts: paths, ...kept.length ? { kept: asset.source } : {} };
  writeFileSync(OUT, `${JSON.stringify({ source, profiles: [...kept, ...profiles] }, null, 1)}\n`);
  console.log(`wrote ${OUT}`);
}
