/**
 * **A stub chooser**: the options fighter's options by rank, the first on offer the most, built on
 * the shared chooser (`chooser`); it counts how often it priced an option. Its state names it, so a
 * test can read that the chooser a config names is the chooser the mind made through the lookup.
 */
import { anyBody } from "../../../src/core/mind/parts.ts";
import { chooser } from "../../../src/core/mind/options/chooser.ts";

export const STUB_CHOOSER = Object.freeze({
  role: "chooser", label: "Counted chooser (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "stub-chooser" }), keys: Object.freeze({ kind: true }),
  fits: anyBody, faults: () => [],
  make(_config, options) {
    const counts = { stub: "stub-chooser", steps: 0 };
    const inner = chooser(options, (option, i) => { counts.steps++; return { name: option.name, worth: options.length - i, terms: null }; }, { rethink: .2 });
    return { state: { counts, inner: inner.state }, decide: inner.decide, get running() { return inner.running; }, get offers() { return inner.offers; } };
  },
});
