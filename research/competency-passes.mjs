/**
 * Which competencies pass at every rate of `RATES`: the competency figures of runs of
 * `control-foundation.mjs --suite competency`, one a rate, read from each run's directory or from a
 * record of rows by rate (`docs/reference/competencies-baseline.json.gz`), and `competencyPasses`
 * over them.
 *
 *   node research/competency-passes.mjs <run directory | record.json.gz> ...
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { summarizeCompetencies } from "./control-foundation.mjs";
import { competencyPasses } from "./competencies.mjs";

const rows = [];
for (const path of process.argv.slice(2)) {
  if (path.endsWith(".json.gz")) for (const run of Object.values(JSON.parse(gunzipSync(await readFile(path))))) rows.push(...run.rows);
  else rows.push(...(await readFile(resolve(path, "rows.jsonl"), "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line)));
}
const figures = summarizeCompetencies(rows.filter((row) => row.job.competency));
console.log(JSON.stringify({ figures, passes: competencyPasses(figures) }, null, 2));
