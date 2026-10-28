/**
 * **A stub low support**: it never lowers, and lets the legs walk. Its state names it and counts the
 * steps it was asked, so a test can read that the part a config names is the part that ran.
 */
import { anyBody } from "../../../src/core/mind/parts.ts";

export const STUB_SUPPORT = Object.freeze({
  role: "support", label: "Never low (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "stub-support" }), keys: Object.freeze({ kind: true }),
  fits: anyBody, faults: () => [],
  make() {
    const state = { stub: "stub-support", steps: 0, stage: "stand", ready: false, posture: {} };
    return {
      state, report: state, walks: () => true,
      resume() { state.stage = "stand"; state.ready = false; },
      tick() { state.steps++; },
      lay: (_view, goal) => goal,
    };
  },
});
