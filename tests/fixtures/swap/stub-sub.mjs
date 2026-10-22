/**
 * **A stub sub-mind**: it never wants the body, and counts how often it was asked. Priced as a down
 * option (`SubMindPart.down`), so a planner that prices its down options may hold it. Its state
 * names it, so a test can read that the sub-mind a config lists is the one its mind made.
 */
import { anyBody } from "../../../src/core/mind/parts.ts";

export const STUB_SUB = Object.freeze({
  role: "sub-mind", label: "Counted sub-mind (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "stub-sub" }), keys: Object.freeze({ kind: true }),
  down: Object.freeze({ name: "never", seconds: 1, stands: 0, shelter: 0 }),
  fits: anyBody, faults: () => [],
  make() {
    const state = { stub: "stub-sub", steps: 0 };
    return { name: "Never (stub)", state, wants() { state.steps++; return false; }, begin() {}, end() {}, step() {} };
  },
});
