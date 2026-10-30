/**
 * **A stub prediction**: the focus's id, named, so the objective that reads it (`stub-objective.mjs`)
 * can tell that the prediction its `uses` names is the one the situation read through the lookup.
 */
import { anyBody } from "../../../src/core/parts/parts.ts";

export const STUB_PREDICTION = Object.freeze({
  role: "prediction", label: "Focus (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "swap:stub-prediction" }), keys: Object.freeze({ kind: true }),
  fits: anyBody, faults: () => [],
  make: () => ({ read: (seen) => ({ stub: "swap:stub-prediction", focus: seen.focus?.id ?? null }) }),
});
