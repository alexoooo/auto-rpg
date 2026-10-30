/**
 * **A stub executor**: a blow never ready, that aims at nothing (its actions name no regions or aim). Its state names it, counts the steps it was updated and
 * keeps the guard it was made with (`ExecutorMaking.guard`), so a test can read that the part a
 * config names is the part that ran and that its blows return to the mind's guard.
 */
import { anyBody } from "../../../src/core/parts/parts.ts";

export const STUB_BLOW = Object.freeze({
  role: "executor", label: "Never ready (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "stub-blow", name: "stub" }), keys: Object.freeze({ kind: true, name: true }),
  fits: anyBody, faults: () => [], effectors: Object.freeze(["hand.left", "hand.right"]), aims: false, actionKeys: Object.freeze([]), actionFaults: () => [],
  make({ guard }) {
    const state = { stub: "stub-blow", steps: 0, guard: { ...guard } };
    return {
      state, resume() {},
      needs: (_action, effector) => [effector],
      readiness: () => ({ kind: "blocked", reason: "a stub" }),
      update() { state.steps++; return []; },
      start() { throw new Error("a stub blow is never ready"); },
      command: () => ({}),
    };
  },
});
