/** An evaluation's results as its file keeps them (`assets/evaluations/<id>.json`, `src/evaluation/results.ts`). */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NO_RESULTS, resultsText } from "../src/evaluation/results.ts";

const pathOf = (id) => fileURLToPath(new URL(`../assets/evaluations/${id}.json`, import.meta.url));

/** Evaluation `id`'s results; none where it keeps no file. */
export const resultsOf = (id) => existsSync(pathOf(id)) ? JSON.parse(readFileSync(pathOf(id), "utf8")) : NO_RESULTS;

/** Keep `results` as evaluation `id`'s. */
export function writeResults(id, results) {
  writeFileSync(pathOf(id), resultsText(results));
}
