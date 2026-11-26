/**
 * **The bouts `strike-bouts.mjs --save` keeps**: a list of `[key, bout]`, each bout recording the
 * shape it was saved in (`schema`), which changes with that shape. Every reader reads the one shape
 * and refuses a file of another, to be played again.
 */
import { readFileSync } from "node:fs";

/** The shape of a saved bout (`strike-bouts.mjs`' result): a new number with each change to it. */
export const BOUT_SCHEMA = 9;

/** **The bouts saved at `path`**, as `[key, bout]`; an error where any was saved in another shape. */
export function savedBouts(path) {
  const bouts = JSON.parse(readFileSync(path, "utf8"));
  const other = bouts.find(([, bout]) => bout?.schema !== BOUT_SCHEMA);
  if (other) throw new Error(`${path}: ${other[0]} was saved in schema ${other[1]?.schema ?? "none"}, not ${BOUT_SCHEMA}; play it again`);
  return bouts;
}
