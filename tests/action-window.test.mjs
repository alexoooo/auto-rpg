import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { withinActionWindow, approachActionWindow } from "../src/core/mind/action-window.ts";
import { createNavigator } from "../src/core/mind/navigation.ts";

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

test("navigation retains an action window's approach response before admission", () => {
  const body = { ...view(), time: 0 };
  const entry = { ...window, at: [0, 1, 1], along: [.5, .5], across: [0, 0] };
  const approach = approachActionWindow(body, entry, 0, 1, .2);
  assert.deepEqual(approach, { move: [.5, 0], face: 0,
    movement: { kind: "place", points: [{ x: 0, z: .5 }], near: .04 }, pace: .5 });
  const navigation = createNavigator({ segments: [] });
  const followed = navigation.step({ view: body, report: { heading: 0 } }, approach.movement, approach.pace, 1 / 120);
  assert.deepEqual(followed.move, approach.move, "the navigator preserves the action's slower approach pace");
  assert.equal(navigation.report.status, "moving");
});
