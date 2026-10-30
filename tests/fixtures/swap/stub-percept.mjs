/**
 * **A stub percept**: the senses' time, named, so the objective that reads it (`stub-objective.mjs`)
 * can tell that the percept its `uses` names is the one the situation read through the lookup.
 */
import { anyBody } from "../../../src/core/parts/parts.ts";

export const STUB_PERCEPT = Object.freeze({
  role: "percept", label: "Senses' time (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "swap:stub-percept" }), keys: Object.freeze({ kind: true }),
  fits: anyBody, faults: () => [],
  make: () => ({ read: (seen) => ({ stub: "swap:stub-percept", time: seen.sight.view.senses.time }) }),
});
