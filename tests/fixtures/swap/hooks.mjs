/**
 * **Registers the swap fixture's entrant** as one more line of the kinds list, from outside `src/`:
 * once this has run, `src/core/mind/kinds.ts` resolves to `kinds.mjs`, which lists the game's
 * kinds and the fixture's. It runs before any module of `src/` loads.
 */
import { registerHooks } from "node:module";

const KINDS = new URL("../../../src/core/mind/kinds.ts", import.meta.url).href, FIXTURE = new URL("./kinds.mjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    const resolved = next(specifier, context);
    return resolved.url === KINDS ? { ...resolved, url: FIXTURE } : resolved;
  },
});
