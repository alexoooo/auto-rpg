/**
 * **A stub guard**: the arms held lower than the game's guard, covering nothing. Its state names
 * it and counts the steps it was asked, so a test can read that the part a config names is the part
 * that ran; its posture is where the body is built and where a blow returns.
 */
import { GUARD } from "../../../src/core/skills/guard.ts";
import { anyBody } from "../../../src/core/mind/parts.ts";

/** Its arms' rest: the game's guard with the elbows opened, rad. */
export const STUB_POSTURE = Object.freeze({ ...GUARD, "elbow.right flexion": 1.1, "elbow.left flexion": 1.1 });

const NO_HANDS = Object.freeze({ left: null, right: null });

export const STUB_GUARD = Object.freeze({
  role: "guard", label: "Low arms (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "stub-guard" }), keys: Object.freeze({ kind: true }),
  fits: anyBody, faults: () => [],
  posture: () => STUB_POSTURE,
  make() {
    const state = { stub: "stub-guard", steps: 0 };
    return { state, posture: STUB_POSTURE, hold: null, resume() {}, command() { state.steps++; return NO_HANDS; } };
  },
});
