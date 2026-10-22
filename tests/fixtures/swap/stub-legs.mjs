/**
 * **A stub locomotion**: the stance walk, its goals counted. Its state names it, so a test can read
 * that the legs a config names are the legs that ran, made through the lookup (`Legs.make`).
 */
import { anyBody } from "../../../src/core/mind/parts.ts";

export const STUB_LEGS = Object.freeze({
  role: "locomotion", label: "Counted walk (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "stub-legs" }), keys: Object.freeze({ kind: true }),
  fits: anyBody, faults: () => [],
  make(body, _config, legs) {
    const walk = legs.make(body, { kind: "stance-walk" }), state = { stub: "stub-legs", steps: 0, walk: walk.state };
    return Object.create(walk, {
      state: { value: state, enumerable: true },
      goal: { value: (...asked) => { state.steps++; return walk.goal(...asked); }, enumerable: true },
    });
  },
});
