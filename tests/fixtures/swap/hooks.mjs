/**
 * **Registers the swap fixture's entrant** as one more line of each list, from outside `src/`:
 * once this has run, `src/entrants/index.ts` resolves to `kinds.mjs`, which lists the game's
 * entrants and the fixture's, `src/core/command/commanders.ts` to `commanders.mjs`, which lists the
 * game's Commanders and the stub, and so the end rules (`ends.mjs`) and the evaluations
 * (`evaluations.mjs`). It runs before any module of `src/` loads.
 */
import { registerHooks } from "node:module";

/** Each list the fixture adds to, by the list's URL: the fixture's list in its place. */
const LISTS = new Map([
  [new URL("../../../src/entrants/index.ts", import.meta.url).href, new URL("./kinds.mjs", import.meta.url).href],
  [new URL("../../../src/core/command/commanders.ts", import.meta.url).href, new URL("./commanders.mjs", import.meta.url).href],
  [new URL("../../../src/arena/ends.ts", import.meta.url).href, new URL("./ends.mjs", import.meta.url).href],
  [new URL("../../../src/evaluation/evaluations.ts", import.meta.url).href, new URL("./evaluations.mjs", import.meta.url).href],
]);

registerHooks({
  resolve(specifier, context, next) {
    const resolved = next(specifier, context);
    return LISTS.has(resolved.url) ? { ...resolved, url: LISTS.get(resolved.url) } : resolved;
  },
});
