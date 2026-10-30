/**
 * **A stub behaviour**: it fills nothing, and counts its turns. Its state names it, so a test can
 * read that the behaviour a config lists is the one its tactics asked.
 */
import { anyBody } from "../../../src/core/parts/parts.ts";

export const STUB_BEHAVIOUR = Object.freeze({
  role: "behaviour", label: "Counted turns (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "stub-behaviour" }), keys: Object.freeze({ kind: true }),
  fits: anyBody, faults: () => [],
  make() {
    const state = { stub: "stub-behaviour", steps: 0 };
    return { state, decide() { state.steps++; } };
  },
});
