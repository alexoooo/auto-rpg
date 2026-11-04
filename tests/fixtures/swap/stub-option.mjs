/**
 * **A stub kind of option**: Option Mind's straight punch as its kind makes it
 * (`STRAIGHT_PUNCH_OPTION`), then a hold of the position (`hold`) that counts the steps it is asked. Its state names it, so a test can read that the
 * options a config names are those the mind decides among.
 */
import { anyBody } from "../../../src/core/parts/parts.ts";
import { hold } from "../../../src/core/option/rest.ts";
import { STRAIGHT_PUNCH_OPTION } from "../../../src/core/option/kinds.ts";

export const STUB_OPTION = Object.freeze({
  role: "option", label: "Counted hold (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "swap:stub-option" }), keys: Object.freeze({ kind: true }),
  fits: anyBody, faults: () => [],
  make(_config, given) {
    const inner = hold(given.walk), counts = { stub: "swap:stub-option", steps: 0 };
    return [...STRAIGHT_PUNCH_OPTION.make(STRAIGHT_PUNCH_OPTION.defaults, given), { ...inner, name: "stub hold", state: { counts, inner: inner.state }, step(now, dt) { counts.steps++; return inner.step(now, dt); } }];
  },
});
