/**
 * **A stub kind of option**: Option Mind's strikes as it gives them, then a hold of the position
 * (`hold`) that counts the steps it is asked. Its state names it, so a test can read that the
 * options a config names are those the mind decides among.
 */
import { anyBody } from "../../../src/core/parts/parts.ts";
import { hold } from "../../../src/core/option/rest.ts";

export const STUB_OPTION = Object.freeze({
  role: "option", label: "Counted hold (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "stub-option" }), keys: Object.freeze({ kind: true }),
  fits: anyBody, faults: () => [],
  make(_config, given) {
    const inner = hold(given.walk), counts = { stub: "stub-option", steps: 0 };
    return [...given.strikes, { ...inner, name: "stub hold", state: { counts, inner: inner.state }, step(now, dt) { counts.steps++; return inner.step(now, dt); } }];
  },
});
