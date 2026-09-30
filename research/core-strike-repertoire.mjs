/**
 * **Writes the strike skill's repertoire** (`assets/core/strikes.json`, read by
 * `src/core/skills/strikes.ts`) from the strike searches' outputs: for each recipe, the last line
 * of a `research/core-strike-search.mjs` run (its best strike, where it was found and what it read
 * on replay), or a record in that form (`research/core-club-unit.json`, the damage unit's blow).
 *
 *   node research/core-strike-repertoire.mjs [--write] <held>=<file> ...
 *
 * `held` is what the hand holds: `fist`, or an item's name (`wooden club`). Each file's model and
 * hand are its own; a recipe is the right hand's, the left's mirrored from it by the skill. Without
 * `--write` it prints the asset.
 *
 * The repertoire of 2026-09-30 (the searches' outputs are kept outside the repository, in the
 * owner's `.review/rapier/`; each entry's `found` says how it was searched):
 *
 *   node research/core-strike-repertoire.mjs --write \
 *     fist=../auto-rpg/.review/rapier/fist-rapier-workshop-fighter-guard-s2.txt \
 *     fist=../auto-rpg/.review/rapier/fist-rapier-workshop-rogue-guard-s1.txt \
 *     "wooden club=research/core-club-unit.json"
 *
 * Of three seeds each from the guard (plan: "the fist acceptance searches taken again on Rapier"),
 * the Warrior's best is seed 2's (9.50 m/s at 960 Hz) and the Rogue's seed 1's (8.08).
 */
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { write: { type: "boolean", default: false } } });
const recipes = [];
for (const given of positionals) {
  const at = given.indexOf("=");
  if (at < 0) throw new Error(`${given}: expected <held>=<file>`);
  const held = given.slice(0, at), file = given.slice(at + 1);
  const text = (await readFile(file, "utf8")).trim();
  const record = JSON.parse(file.endsWith(".json") ? text : text.split("\n").at(-1));
  if (record.hand !== "right") throw new Error(`${file}: a recipe is the right hand's, not the ${record.hand}'s`);
  const readings = record.readings ?? Object.fromEntries(Object.entries(record).filter(([k]) => /^at\d+$/.test(k)).map(([k, v]) => [k, v]));
  const found = record.found ?? `research/core-strike-search.mjs --model ${record.model}${record.guard ? " --guard" : ""} --seed ${record.seed} `
    + `--hz ${record.hz}, ${record.trials} trials a candidate; searched mean ${record.searched.mean} (${record.harness})`;
  recipes.push({ model: record.model, held, strike: record.strike, distance: record.distance, found, readings });
}
const asset = {
  harness: "Node core stand, Rapier, standing on its feet as built, ground on; each blow thrown from standing in the guard at its searched rate",
  written: "research/core-strike-repertoire.mjs",
  recipes,
};
const text = `${JSON.stringify(asset, null, 2)}\n`;
if (values.write) await writeFile(new URL("../assets/core/strikes.json", import.meta.url), text);
else process.stdout.write(text);
