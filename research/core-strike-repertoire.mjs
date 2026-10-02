/**
 * **Writes the strike skill's repertoire** (`assets/core/strikes.json`, read by
 * `src/core/skills/strikes.ts`) from the strike searches' outputs: each file's last line is a
 * `research/core-strike-search.mjs` run's best strike, where it was found and what it read on
 * replay. A cell is a body, what its hand holds and a height band; of a cell's searches the one
 * that netted most on replay at the game's rate is its recipe.
 *
 *   node research/core-strike-repertoire.mjs [--write] [--keep <model>/<held>/<band> ...] [--from-at <commit>]
 *     [--spare <file>] <file> ...
 *
 * **A recipe that does not beat the placed blow is not kept** (`keeps`): each cell's placed blow
 * is thrown at the same target body by the same evaluator (`evaluateBlow`, `core-blow.mjs`, with
 * no strike), standing where the skill stands for it, the mean over three grounds; a cell none
 * of whose searches nets more than that is left out, and thrown at by placement. `--keep`
 * carries a recipe of the asset as it is, its window with it, for a cell no file is given for.
 * `--from-at` is the commit whose asset held the recipes the searches went on from
 * (`--from <model>:<band>`): each recipe's `found` names it, since this asset replaces them.
 *
 * Each recipe is the right hand's, the left's mirrored from it by the skill. Without `--write`
 * it prints the asset. It writes no window for a recipe it makes:
 * `research/core-strike-window.mjs --write` measures them, and is run after it. `--spare`
 * writes each cell's other searches that beat the placed blow, in the order of what they net,
 * to a file of its own: the window's script takes a cell's next where the feet cannot be set to
 * its recipe.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/** Whether a cell's recipe is kept: it nets more at its place than the placed blow does at the same target. */
export const keeps = (net, placed) => net > placed;

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { CORE_BLOW_HARNESS, evaluateBlow } = await import("./core-blow.mjs");
  const ASSET = new URL("../assets/core/strikes.json", import.meta.url);
  /** The game's rate, which a recipe's `net` is read at, and the grounds a placed blow is read on, m. */
  const GAME = "at120", GROUNDS = [20, 30, 40];
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { write: { type: "boolean", default: false }, keep: { type: "string", multiple: true, default: [] }, "from-at": { type: "string" }, spare: { type: "string" } } });
  /** Where a search went on from, as `found` names it: a recipe of the asset at `--from-at`, or a file. */
  const fromOf = (from) => /^[\w-]+:\w+$/.test(from) && values["from-at"] ? `${from} of assets/core/strikes.json@${values["from-at"]}` : from;
  const cell = (recipe) => `${recipe.model}/${recipe.held}/${recipe.band}`;
  const before = JSON.parse(await readFile(ASSET, "utf8"));
  const cells = new Map();
  for (const name of values.keep) {
    const recipe = before.recipes.find((r) => cell(r) === name);
    if (!recipe) throw new Error(`--keep ${name} names no recipe: one of ${before.recipes.map(cell).join(", ")}`);
    cells.set(name, { kept: recipe });
  }
  for (const file of positionals) {
    const record = JSON.parse((await readFile(file, "utf8")).trim().split("\n").at(-1));
    if (record.hand !== "right") throw new Error(`${file}: a recipe is the right hand's, not the ${record.hand}'s`);
    const readings = Object.fromEntries(Object.entries(record).filter(([k]) => /^at\d+$/.test(k)));
    if (!readings[GAME]) throw new Error(`${file}: no replay at the game's rate`);
    const found = `research/core-strike-search.mjs --model ${record.model} --held "${record.held}" --band ${record.band}${record.guard ? " --guard" : ""} --seed ${record.seed} `
      + `--hz ${record.hz}${record.from ? ` --from ${fromOf(record.from)} --sigma ${record.sigma}` : ""}, ${record.generations} generations of ${record.population}, `
      + `${record.trials} trials a candidate and one at nothing; searched mean ${record.searched.mean} HP (${record.harness})`;
    const recipe = { model: record.model, held: record.held, band: record.band, strike: record.strike, place: record.place, found, readings, net: readings[GAME].net };
    const name = cell(recipe), held = cells.get(name) ?? { searched: [] };
    if (held.kept) throw new Error(`${file}: ${name} is kept from the asset (--keep)`);
    held.searched.push({ recipe, from: `seed ${record.seed}` });
    cells.set(name, held);
  }
  /** The asset's recipes; the cells left to placement; which search each recipe is; and the cells' other searches, in the order a cell takes them. */
  const recipes = [], left = [], first = {}, spare = [];
  for (const [name, { kept, searched }] of cells) {
    if (kept) { recipes.push(kept); continue; }
    // The most a search nets first; of two that net the same, the one given first.
    searched.sort((a, b) => b.recipe.net - a.recipe.net);
    const { recipe: best } = searched[0], runs = [];
    for (const ground of GROUNDS) runs.push(await evaluateBlow({ model: best.model, held: best.held, hand: best.strike.hand, band: best.band, strike: null, ground }));
    const placed = { net: +(runs.reduce((sum, r) => sum + r.done - r.cost, 0) / runs.length).toFixed(4), runs: runs.map((r) => +(r.done - r.cost).toFixed(3)) };
    const beat = searched.filter(({ recipe }) => keeps(recipe.net, placed.net));
    if (!beat.length) { left.push(`${name}: its best search (${searched[0].from}) nets ${best.net} HP, the placed blow ${placed.net}`); continue; }
    recipes.push({ ...beat[0].recipe, placed });
    first[name] = beat[0].from;
    for (const { recipe, from } of beat.slice(1)) spare.push({ from, recipe: { ...recipe, placed } });
  }
  const asset = {
    harness: `${CORE_BLOW_HARNESS}; each recipe's net the mean of eight at 120 Hz`,
    written: "research/core-strike-repertoire.mjs",
    recipes,
    placed: left,
    ...(before.windows ? { windows: before.windows } : {}),
  };
  const text = `${JSON.stringify(asset, null, 2)}\n`;
  if (values.write) await writeFile(ASSET, text);
  else process.stdout.write(text);
  if (values.spare) await writeFile(values.spare, `${JSON.stringify({ from: first, spare }, null, 2)}\n`);
  for (const line of left) process.stderr.write(`not kept, and thrown at by placement: ${line}\n`);
}
