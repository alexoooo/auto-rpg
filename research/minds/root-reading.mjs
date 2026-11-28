/**
 * **A search's root as the fight record keeps it** (`record.mjs`'s `reading`): the state as the
 * fitted leaf reads it (`readingAt`), each Option on offer as its model prices one try
 * (`OFFERED`). Read where `move-prior-hook.mjs` hands a tree search's root to `__searchLines`, by
 * the record's worker and by a fork that watches (`rollout`'s `watch`). It imports the Mind's code,
 * so it is loaded after the hooks are registered.
 */
import { graceAt } from "../../src/minds/option/situation/reach-memory.ts";
import { offeredOf, readingAt } from "../../src/minds/option/predictions/value/fitted-value.ts";

/** An Option on offer as a reading's `offered` keeps it (`OFFERED`). */
const offeredLine = ({ kind, open, duration, dealt, taken }) => [kind, open ? 1 : 0, duration, dealt, taken];

/** The root `root` of a search over the states `at` as the record keeps it; null where it has no focus or no reading. */
export function rootReading(root, at) {
  if (!root.focus) return null;
  const offered = [];
  for (const pair of at.pairsAt(root)) { const terms = at.modelAt(pair, root); if (terms) offered.push(offeredOf(pair.option.kind, pair.option.open === true, terms)); }
  const reading = readingAt(root, graceAt(root), offered);
  return reading && { ...reading, offered: reading.offered.map(offeredLine) };
}

/** The side whose search `root` is: the other of its focus's. */
export const sideOf = (root) => root.focus.side === "left" ? "right" : "left";
