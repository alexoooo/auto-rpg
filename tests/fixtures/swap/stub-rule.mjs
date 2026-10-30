/**
 * **A stub Move rule**: it never matches, and counts how often Move asked it. Its state names it,
 * so a test can read that the rule a config lists is the rule Move made through the lookup.
 */
import { anyBody } from "../../../src/core/parts/parts.ts";

export const STUB_RULE = Object.freeze({
  role: "move-rule", label: "Counted rule (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "swap:stub-rule", gait: "braced" }), keys: Object.freeze({ kind: true, gait: true }),
  fits: anyBody, faults: () => [],
  make(_config, gait) {
    const state = { stub: "swap:stub-rule", steps: 0 };
    return { gait, state, matches() { state.steps++; return false; } };
  },
});
