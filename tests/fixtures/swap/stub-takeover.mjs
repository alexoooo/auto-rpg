/**
 * **A stub sub-mind that takes the body over for a window of its host's steps** and hands it back,
 * commanding nothing while it has it. Its state counts the steps it was asked (`steps`) and drove
 * (`held`), so a bout can be saved and loaded in the middle of a takeover and across its handback.
 */
import { anyBody } from "../../../src/core/mind/parts.ts";

/** The asks, counted from 1, between which it wants the body: from `FROM` up to but not including `UNTIL`. */
export const TAKEOVER = Object.freeze({ FROM: 100, UNTIL: 140 });

export const STUB_TAKEOVER = Object.freeze({
  role: "sub-mind", label: "Takes a window (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "stub-takeover" }), keys: Object.freeze({ kind: true }),
  fits: anyBody, faults: () => [],
  make() {
    const state = { stub: "stub-takeover", steps: 0, held: 0 };
    return {
      name: "Window (stub)", state,
      wants() { state.steps++; return state.steps >= TAKEOVER.FROM && state.steps < TAKEOVER.UNTIL; },
      begin() {}, end() {}, step() { state.held++; },
    };
  },
});
