import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { withinActionWindow, approachActionWindow } from "../src/core/mind/action-window.ts";

const view = () => ({ stance: { centre: new Vector3(), velocity: new Vector3() }, senses: { solids: [] } });
const window = { at: [0, 1, 0.8], along: [0.7, 0.9], across: [-0.1, 0.1], facing: 0.2, speed: 0.3 };

test("entry checks speed, facing and both coordinates from the stance centre", () => {
  const body = view();
  assert.equal(withinActionWindow(body, window, 0), true);
  assert.equal(withinActionWindow(body, window, 0.3), false);
  body.stance.velocity.x = 0.4;
  assert.equal(withinActionWindow(body, window, 0), false);
  body.stance.velocity.x = 0; body.stance.centre.z = -0.3;
  assert.equal(withinActionWindow(body, window, 0), false);
  body.stance.centre.z = 0; body.stance.centre.x = 0.2;
  assert.equal(withinActionWindow(body, window, 0), false);
});

test("approach moves into each window and brakes at its centre", () => {
  const body = view();
  assert.deepEqual(approachActionWindow(body, window, 0, 1, 0.2), { move: null, face: 0 });
  assert.ok(approachActionWindow(body, { ...window, at: [0, 1, 2] }, 0, 1, 0.2).move[0] > 0);
  assert.ok(approachActionWindow(body, { ...window, at: [0, 1, 0.3] }, 0, 1, 0.2).move[0] < 0);
  body.stance.velocity.z = 0.5;
  assert.deepEqual(approachActionWindow(body, window, 0, 1, 0.2), { move: null, face: 0 });
});
