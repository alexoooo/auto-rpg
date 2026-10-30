/**
 * **A stub chooser**: the valued chooser (`VALUED_CHOOSER`) at depth 1 by the objective its slot
 * names, counting how often it decided. Its state names it, so a test can read that the chooser a
 * config names is the chooser the mind made through the lookup.
 */
import { anyBody, slotOne } from "../../../src/core/parts/parts.ts";
import { VALUED_CHOOSER } from "../../../src/core/option/chooser.ts";
import { FEW_TERMS_PART } from "../../../src/core/option/objective.ts";

export const STUB_CHOOSER = Object.freeze({
  role: "chooser", label: "Counted chooser (stub)", stage: "experimental", fields: [], slots: [slotOne("objective", "Objective", "objective", true, FEW_TERMS_PART.defaults)],
  defaults: Object.freeze({ kind: "swap:stub-chooser" }), keys: Object.freeze({ kind: true, objective: true }),
  fits: anyBody, faults: () => [],
  make(config, options, seed, parts) {
    const counts = { stub: "swap:stub-chooser", steps: 0 };
    const inner = VALUED_CHOOSER.make({ kind: "valued", depth: 1, objective: config.objective ?? null }, options, seed, parts);
    return { state: { counts, inner: inner.state }, decide(now, others) { counts.steps++; return inner.decide(now, others); }, get running() { return inner.running; }, get offers() { return inner.offers; } };
  },
});
