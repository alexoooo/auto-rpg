/**
 * **The gaits' profiles**: from the Gait drill's records, each body's profile of each gait, in the
 * profiles' one type (`src/core/skills/framework/profile.ts`, `assets/core/gait-profiles.json`): one cell, no
 * foe, its trials those asked at least as fast as the gait went (the fastest it came to at the stop,
 * less `TOP`): the share whose strike was admitted, the mean seconds from the stop until it was
 * (`GaitReading.braced`), and the share that fell. Each names what it was measured on: the body as
 * the drill's recipe resolves it, the gait's legs (its mind's Move's, `gaitsOfMove`) and the strike it stopped to throw
 * (`gaitDigest`), the harness's rate, and no reaction time. Option Mind prices where a gait leaves the
 * body by them (`src/core/option/tactics.ts`).
 *
 *   node research/gait-profiles.mjs [<record.jsonl> ...] [--write]
 *
 * With none named, the records the asset names.
 */
import "../tests/harness/preload-data.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { resolveCharacter } from "../src/core/models.ts";
import { partIn, partLookup } from "../src/entrants/game.ts";
import { armedActions } from "../src/core/tactics/action-config.ts";
import { gaitDigest, measuredOn, skillDigest } from "../src/core/skills/framework/profile.ts";
import { gaitNamed, STOCK_GAITS } from "../src/core/skills/locomotion/gaits.ts";
import { gaitsOfMove } from "../src/core/skills/locomotion/move-part.ts";

const OUT = "assets/core/gait-profiles.json", SCRIPT = "research/gait-profiles.mjs";
/** How far under the fastest a gait came to at the stop a trial may have gone and still be read as at its top, m/s. */
const TOP = .05;
const write = process.argv.includes("--write");
const named = process.argv.slice(2).filter((arg) => arg !== "--write");
const paths = named.length ? named : JSON.parse(readFileSync(OUT, "utf8")).source.records;
if (paths.length === 0) throw new Error("name the Gait drill's records to read");
const read = (path) => readFileSync(path, "utf8").split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
const round = (x) => Number(x.toFixed(3));

/** The left side's body's spec, by its recipe's model and attributes, as the bout resolves it. */
const specOf = (recipe) => resolveCharacter({ model: recipe.left, attributes: recipe.attributes?.left ?? {} }).spec;

const profiles = new Map();
for (const path of paths) {
  const [header, ...rows] = read(path);
  if (header.evaluation !== "gait") throw new Error(`${path} is no record of the Gait drill`);
  const hz = Number(/(\d+) Hz/.exec(header.harness)?.[1]);
  if (!Number.isFinite(hz)) throw new Error(`${path}: no rate in its harness, ${header.harness}`);
  for (const row of rows) {
    const recipe = row.world?.recipe, mind = recipe?.minds?.left, led = recipe?.commanders?.left;
    // The drill Commander's config, or, in a record from before it, the drill's tactics in the mind.
    const drill = led?.kind === "drill" && led.gait ? { kind: "drill-gait", action: led.action, gait: led.gait } : partIn(mind, "drill-gait");
    if (row.fault || !row.reading || drill?.kind !== "drill-gait") continue;
    const spec = specOf(recipe), action = armedActions(partLookup, spec, mind.executors, mind.actions).find((one) => one.name === drill.action);
    if (!action) throw new Error(`${path}: ${drill.action} is not an action its body throws`);
    const gait = gaitNamed(mind.locomotion?.kind === "move" ? gaitsOfMove(mind.locomotion) : STOCK_GAITS, drill.gait);
    if (!gait) throw new Error(`${path}: no gait ${drill.gait} in its mind's legs`);
    const measured = measuredOn(spec, gaitDigest(gait.legs, skillDigest(partLookup, spec, mind.executors, action)), hz, null), key = JSON.stringify(measured);
    const profile = profiles.get(key) ?? { measured, label: `${spec.model} ${drill.gait}`, rows: [] };
    profiles.set(key, profile);
    profile.rows.push(row.reading);
  }
}

const out = { source: { script: SCRIPT, records: paths }, profiles: [...profiles.values()].map((profile) => {
  const top = Math.max(...profile.rows.map((r) => r.moving ?? 0)), at = profile.rows.filter((r) => r.moving !== null && r.moving >= top - TOP || r.down);
  const done = at.filter((r) => r.braced !== null);
  profile.top = top;
  return { measured: profile.measured, target: null, cells: [{ range: 0, phase: "clear", trials: at.length, done: round(done.length / at.length), dealt: 0, taken: 0,
    seconds: round(done.length ? done.reduce((sum, r) => sum + r.braced, 0) / done.length : 0), down: round(at.filter((r) => r.down).length / at.length), ends: [] }] };
}) };
for (const [i, profile] of [...profiles.values()].entries()) {
  const c = out.profiles[i].cells[0];
  console.log(`${profile.label} (${profile.measured.body}, skill ${profile.measured.skill}, ${profile.measured.hz} Hz): at its top, ${round(profile.top)} m/s, ${c.trials} trials, admitted ${c.done}, ${c.seconds} s unbraced, down ${c.down}`);
}
if (write) writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
