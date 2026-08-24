import test from "node:test";
import assert from "node:assert/strict";

import { splitMind } from "../src/mind.ts";

const intent = (base, driving = "primary") => ({
  forward: base + 1,
  strafe: base + 2,
  turn: base + 3,
  driving,
  posture: { trunkLean: base + 4, trunkTwist: base + 5, crouch: base + 6 },
  primary: {
    pointerX: base + 7, pointerY: base + 8, roll: base + 9, wristBend: base + 10,
    thrust: base === 0, guard: base !== 0,
  },
  secondary: {
    pointerX: base + 11, pointerY: base + 12, roll: base + 13, wristBend: base + 14,
    thrust: base !== 0, guard: base === 0,
  },
});

const mind = (name, answer) => ({ name, decide: () => answer });

test("human_play_owns_posture_and_every_channel_of_the_driven_hand_when_enabled", () => {
  const human = intent(0);
  const policy = intent(100);
  const out = splitMind(
    mind("human", human), mind("policy", policy), { posture: true, drivenWrist: true },
  ).decide({}, 1 / 240);
  assert.deepEqual(out.posture, human.posture);
  assert.deepEqual(out.primary, human.primary);
  assert.deepEqual(out.secondary, policy.secondary);
});

test("ai_assist_remains_the_owner_when_direct_body_control_is_disabled", () => {
  const human = intent(0);
  const policy = intent(100);
  const out = splitMind(
    mind("human", human), mind("policy", policy), { posture: false, drivenWrist: false },
  ).decide({}, 1 / 240);
  assert.deepEqual(out.posture, policy.posture);
  assert.equal(out.primary.pointerX, human.primary.pointerX);
  assert.equal(out.primary.pointerY, human.primary.pointerY);
  assert.equal(out.primary.roll, policy.primary.roll);
  assert.equal(out.primary.wristBend, policy.primary.wristBend);
  assert.deepEqual(out.secondary, policy.secondary);
});

test("swapping_hands_changes_only_which_wrist_the_controls_address", () => {
  const human = intent(0, "secondary");
  const policy = intent(100);
  const out = splitMind(
    mind("human", human), mind("policy", policy), { posture: true, drivenWrist: true },
  ).decide({}, 1 / 240);
  assert.deepEqual(out.primary, policy.primary);
  assert.deepEqual(out.secondary, human.secondary);
});
