/**
 * **A stub reflex**: it is never set off, and counts how often it was asked. Its state names it, so
 * a test can read that the reflex a config lists is the reflex its layer made through the lookup.
 */
import { anyBody } from "../../../src/core/mind/parts.ts";

export const STUB_REFLEX = Object.freeze({
  role: "reflex", label: "Counted reflex (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "stub-reflex" }), keys: Object.freeze({ kind: true }),
  fits: anyBody, faults: () => [],
  make() {
    const state = { stub: "stub-reflex", steps: 0 };
    return { name: "stub", limbs: [], seizes: false, longest: 1, state, trigger() { state.steps++; return null; } };
  },
});
