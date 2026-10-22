/**
 * **A stub locomotion**: the legs its `walk` slot names, the steps it is asked for counted. It
 * gives only what every legs give (`Locomotion`): its heading and stopping are its walk's, and what
 * a stance walk says besides it does not say. Its state names it, so a test can read that the legs
 * a config names are the legs that ran, made through the lookup (`Legs.make`).
 */
import { slotOne, anyBody } from "../../../src/core/mind/parts.ts";

export const STUB_LEGS = Object.freeze({
  role: "locomotion", label: "Counted walk (stub)", stage: "experimental", fields: [], slots: [slotOne("walk", "Walk", "locomotion")],
  defaults: Object.freeze({ kind: "stub-legs", walk: Object.freeze({ kind: "stance-walk" }) }), keys: Object.freeze({ kind: true, walk: true }),
  fits: anyBody, faults: () => [],
  make(body, config, legs) {
    const walk = legs.make(body, config.walk), state = { stub: "stub-legs", steps: 0, walk: walk.state };
    return {
      state,
      get heading() { return walk.heading; },
      get stopping() { return walk.stopping; },
      resume: (view) => walk.resume(view),
      goal: (...asked) => { state.steps++; return walk.goal(...asked); },
      ...walk.drive ? { drive: (...asked) => { state.steps++; return walk.drive(...asked); } } : {},
    };
  },
});
