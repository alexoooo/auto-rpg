/** Register the calibrated fixture entrant before the game catalog loads. */
import { registerHooks } from "node:module";

const source = new URL("../../../../src/app/entrants.ts", import.meta.url).href;
const fixture = new URL("./kinds.mjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    const resolved = next(specifier, context);
    return resolved.url === source ? { ...resolved, url: fixture } : resolved;
  },
});
