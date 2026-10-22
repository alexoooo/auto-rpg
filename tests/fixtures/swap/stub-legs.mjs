/**
 * **A stub locomotion**: the legs its `walk` slot names, the steps it is asked for counted. Its
 * state names it, so a test can read that the legs a config names are the legs that ran, made
 * through the lookup (`Legs.make`).
 */
import { slotOne, takesCommands } from "../../../src/core/mind/parts.ts";

export const STUB_LEGS = Object.freeze({
  role: "locomotion", label: "Counted walk (stub)", stage: "experimental", fields: [], slots: [slotOne("walk", "Walk", "locomotion")],
  defaults: Object.freeze({ kind: "stub-legs", walk: Object.freeze({ kind: "stance-walk" }) }), keys: Object.freeze({ kind: true, walk: true }),
  fits: takesCommands, faults: () => [],
  make(body, config, legs) {
    const walk = legs.make(body, config.walk), state = { stub: "stub-legs", steps: 0, walk: walk.state };
    return Object.create(walk, {
      state: { value: state, enumerable: true },
      goal: { value: (...asked) => { state.steps++; return walk.goal(...asked); }, enumerable: true },
      ...walk.drive ? { drive: { value: (...asked) => { state.steps++; return walk.drive(...asked); }, enumerable: true } } : {},
    });
  },
});
