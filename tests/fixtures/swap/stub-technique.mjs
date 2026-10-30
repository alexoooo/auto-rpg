/**
 * **A stub technique**: it admits nothing and takes the body nowhere. Its state names it and counts
 * its run as one step, so a test can read that the technique a config lists is the one the
 * stand-up made through the lookup: a technique steps only once its body is down.
 */
import { anyBody } from "../../../src/core/parts/parts.ts";

export const STUB_TECHNIQUE = Object.freeze({
  role: "technique", label: "Admits nothing (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "swap:stub-technique" }), keys: Object.freeze({ kind: true }),
  sides: Object.freeze(["left"]), edges: Object.freeze([]),
  fits: anyBody, faults: () => [],
  make() {
    const state = { stub: "swap:stub-technique", steps: 1 };
    return { state, phase: "idle", yields: true, admits: () => false, reached: () => false, begin() {}, step: () => "failed", end() {} };
  },
});
