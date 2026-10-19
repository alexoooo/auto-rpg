import test from "node:test";
import assert from "node:assert/strict";
import { standUpReplay } from "../research/stand-up-replay.mjs";
import { FOURS } from "./fixtures/fours-support.mjs";
import { standUpKinematics, solveStandUpPose, solveStandUpPath } from "../research/stand-up-ik.mjs";

// How well the stand-up planner solves from a body on all fours: a measurement, not a gate
// (`tests/experimental.json`). Its contracts are `research-stand-up-planning.test.mjs`'s.
test("the planner holds a foot where it is, alone, with the other foot, and along a path", async () => {
  const f = await standUpReplay({ place: FOURS });
  try {
    f.step(40);
    const model = standUpKinematics(f), poses = model.poses(model.initial);
    const frozen = model.point(poses, "foot.left", model.sole), rotation = poses.get("foot.left").rotation;
    const stationary = solveStandUpPose(model, { variant: "D", target: frozen, rotation, iterations: 10 });
    assert.equal(stationary.pass, true, JSON.stringify(stationary));
    const right = poses.get("foot.right");
    const paired = solveStandUpPose(model, { target: frozen, rotation, iterations: 10,
      goals: [{ name: "foot.right", at: [0, 0, 0], target: right.position.asArray(), rotation: right.rotation }] });
    assert.equal(paired.pass, true, JSON.stringify(paired));
    assert.ok(paired.goalErrors.every(e => e.position < .005 && e.orientation < .035));
    const path = solveStandUpPath(model, { target: frozen, rotation, lift: 0, steps: 2 });
    assert.equal(path.pass, true, JSON.stringify(path));
  } finally { f.dispose(); }
});
