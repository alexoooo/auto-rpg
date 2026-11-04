/**
 * **A stub gait**: the stance walk's legs, the steps it is asked for counted. It gives only what
 * every legs give (`Locomotion`): its heading, stopping, lag and what it did not carry out are the
 * stance walk's, and what a stance walk says besides it does not say. Its state names it, so a test
 * can read that the legs a config names are the legs that ran, made through the lookup as Move makes its gaits (`Legs.make`).
 */
import { anyBody } from "../../../src/core/parts/parts.ts";
import { STANCE_WALK_PART } from "../../../src/core/skills/locomotion/stance-walk-part.ts";

export const STUB_LEGS = Object.freeze({
  role: "gait", label: "Counted walk (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "swap:stub-legs" }), keys: Object.freeze({ kind: true }),
  fits: anyBody, faults: () => [],
  make(body) {
    const walk = STANCE_WALK_PART.make(body, STANCE_WALK_PART.defaults), state = { stub: "swap:stub-legs", steps: 0, walk: walk.state };
    return {
      state,
      get heading() { return walk.heading; },
      get stopping() { return walk.stopping; },
      get lag() { return walk.lag; },
      get unmet() { return walk.unmet; },
      resume: (view) => walk.resume(view),
      goal: (...asked) => { state.steps++; return walk.goal(...asked); },
    };
  },
});
