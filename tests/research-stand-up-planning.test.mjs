import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deserialize } from "node:v8";
import { standUpReplay } from "../research/stand-up-replay.mjs";
import { IK_SETTINGS, standUpKinematics, solveStandUpPose, solveStandUpPath } from "../research/stand-up-ik.mjs";

test("a real fall has immutable pose planning and complete exact checkpoints in a fresh world", async () => {
  const f = await standUpReplay();
  let fresh;
  try {
    f.step(240);
    f.stand.world.physics.load(new Uint8Array(readFileSync(new URL("fixtures/actual-fours-world.bin", import.meta.url))));
    const checkpoint = f.save(), model = standUpKinematics(f);
    assert.ok(model.fkError.position < IK_SETTINGS.fkPositionTolerance, JSON.stringify(model.fkError));
    assert.ok(model.fkError.orientation < IK_SETTINGS.fkAngularTolerance, JSON.stringify(model.fkError));
    assert.ok(model.derivatives().maxError < .00002);
    const unchanged = () => {
      const now = f.save();
      assert.equal(now.id, checkpoint.id);
      assert.deepEqual(deserialize(now.bytes), deserialize(checkpoint.bytes), "planning cannot move the physical world");
    };
    unchanged();
    const frozen = model.point(model.poses(model.initial), "foot.left", model.sole);
    const floor = model.contacts(model.poses(model.initial));
    assert.ok(floor.filter(c => c.pair[1] === "floor").every(c => c.distance > -.01));
    const currentFootRotation = model.poses(model.initial).get("foot.left").rotation;
    const stationary = solveStandUpPose(model, { variant: "D", target: frozen, rotation: currentFootRotation, iterations: 10 });
    assert.equal(stationary.pass, true, JSON.stringify(stationary));
    assert.ok(Number.isFinite(stationary.supportError));
    const right = model.poses(model.initial).get("foot.right");
    const paired = solveStandUpPose(model, { target: frozen, rotation: currentFootRotation, iterations: 10,
      goals: [{ name: "foot.right", at: [0, 0, 0], target: right.position.asArray(), rotation: right.rotation }] });
    assert.equal(paired.pass, true, JSON.stringify(paired));
    assert.ok(paired.goalErrors.every(e => e.position < .005 && e.orientation < .035));
    assert.throws(() => solveStandUpPose(model, { variant: "unrecognized" }), /unknown IK variant/);
    for (const selfClearance of [-.006, NaN, Infinity])
      assert.throws(() => solveStandUpPose(model, { selfClearance }), /cannot weaken/);
    const x = [...model.initial]; x[0] = .3; x[3] = .7;
    const held = solveStandUpPose(model, { variant: "A", seed: x, iterations: 1 });
    assert.deepEqual(held.x.slice(0, 6), model.initial.slice(0, 6), "limb-only seeds cannot silently move a held pelvis");
    const stationaryPath = solveStandUpPath(model, { target: frozen, rotation: currentFootRotation, lift: 0, steps: 2 });
    assert.equal(stationaryPath.pass, true, JSON.stringify(stationaryPath));
    assert.throws(() => solveStandUpPath(model, { steps: 0 }), /positive integral steps/);
    const obstructed = solveStandUpPose(model, { variant: "A" });
    assert.equal(obstructed.pass, false);
    assert.ok(obstructed.violations.some(c => c.pair.includes("thigh.left") && c.pair.some(name => /Trunk/.test(name))),
      "endpoint residuals cannot hide the obstructing actual thigh and trunk shapes");
    const stricter = solveStandUpPose(model, { variant: "A", seed: obstructed.x, iterations: 0, selfClearance: 0 });
    assert.equal(stricter.pass, false);
    assert.deepEqual(stricter.violations, obstructed.violations, "a search margin cannot change the geometric verdict");
    unchanged();
    const samples = [];
    for (let k = 0; k < 60; k++) { f.step(); samples.push(f.sample()); }
    assert.deepEqual(model.point(model.poses(model.initial), "foot.left", model.sole), frozen,
      "the planned pelvis cannot drift with live physics");
    fresh = await standUpReplay(); fresh.restore(checkpoint);
    const restored = [];
    for (let k = 0; k < 60; k++) { fresh.step(); restored.push(fresh.sample()); }
    assert.deepEqual(restored, samples);
    assert.deepEqual(deserialize(fresh.save().bytes).saved.state, deserialize(f.save().bytes).saved.state);
    // Rapier can serialize different internal storage after restoration while its complete continuation agrees.
    const restoredCheckpoint = fresh.save();
    f.restore(restoredCheckpoint);
    for (let k = 0; k < 60; k++) {
      f.step(); fresh.step();
      assert.deepEqual(f.sample(), fresh.sample());
    }
    assert.deepEqual(deserialize(fresh.save().bytes).saved.state, deserialize(f.save().bytes).saved.state);
    const altered = { ...checkpoint, bytes: Buffer.from(checkpoint.bytes) }; altered.bytes[altered.bytes.length - 1] ^= 1;
    assert.throws(() => fresh.restore(altered), /checkpoint identity/);
    assert.deepEqual(samples.map(s => s.assist), samples.map(() => ({ force: 0, moment: 0 })));
  } finally { fresh?.dispose(); f.dispose(); }
});
