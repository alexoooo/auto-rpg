/**
 * **A stub objective**: the few terms' worth (`FEW_TERMS`), reading the stub percept and prediction
 * it names in `uses` each time it prices an option. Its memory counts its prices and what each of the
 * two read, so a test can read that the objective a config names, and the parts it names, are those
 * the mind ran.
 */
import { anyBody } from "../../../src/core/parts/parts.ts";
import { FEW_TERMS } from "../../../src/core/option/objective.ts";
import { STUB_PERCEPT } from "./stub-percept.mjs";
import { STUB_PREDICTION } from "./stub-prediction.mjs";

export const STUB_OBJECTIVE = Object.freeze({
  role: "objective", label: "Counted few terms (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "swap:stub-objective" }), keys: Object.freeze({ kind: true }),
  fits: anyBody, faults: () => [],
  uses: () => [STUB_PERCEPT.defaults, STUB_PREDICTION.defaults],
  make() {
    const state = { stub: "swap:stub-objective", steps: 0, percept: { stub: null, steps: 0 }, prediction: { stub: null, steps: 0 } };
    return {
      name: "counted few terms", state,
      worth(terms, now, obedience) {
        state.steps++;
        const sensed = now.perceive(STUB_PERCEPT.defaults), predicted = now.predict(STUB_PREDICTION.defaults);
        if (sensed.time === now.sight.view.senses.time) { state.percept.stub = sensed.stub; state.percept.steps++; }
        if (predicted.focus === (now.focus?.id ?? null)) { state.prediction.stub = predicted.stub; state.prediction.steps++; }
        return FEW_TERMS.worth(terms, now, obedience);
      },
    };
  },
});
