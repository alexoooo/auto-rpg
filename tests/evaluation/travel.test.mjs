import "../harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { coreStand } from "../harness/core-stand.mjs";
import { modelSpec } from "../../src/core/bodies/models.ts";
import { passiveToeBody } from "../../research/skills/locomotion/passive-toe-body.mjs";
import { guardPosture } from "../../src/skills/guard/guard.ts";
import { readTravel } from "../../src/evaluation/travel/read.ts";
import { TRAVEL, travelScript } from "../../src/evaluation/travel/protocol.ts";

test("travel reads attached toe support for entry, stepping and quiet standing", async () => {
  const spec = passiveToeBody(modelSpec("man"));
  const stand = await coreStand(spec, { gravity: false, ground: false, posture: guardPosture(spec), engine: "rapier-coordinate" });
  try {
    const condition = { model: "man", mode: "forward", way: 0, sense: 1, pace: 4,
      heading: 0, loadout: { left: "empty", right: "empty" }, seed: 1, gusts: false };
    const protocol = travelScript(condition), left = stand.built.segments.get("toe.left"), right = stand.built.segments.get("toe.right");
    assert.ok(left && right, "the body must supply the observed separate toe segments");
    let tick = 0;
    // Replay contact inputs to the reader: both toes support rest, then the left lifts while the right stays loaded.
    const ground = [{ other: null, fixed: 1, point: [0, 0, 0], normal: [0, -1, 0], impulse: 1, pairs: [] }];
    const physics = { ...stand.built.physics, contactsOf(body) {
      return body === right.body || body === left.body && tick / stand.world.hz <= TRAVEL.start + .2 ? ground : [];
    } };
    const built = Object.create(stand.built, { physics: { value: physics } });
    const read = () => {
      const reader = readTravel({ world: stand.world, body: { built } }, condition);
      for (tick = 1; tick <= Math.round(protocol.end * stand.world.hz); tick++) reader.afterStep();
      return reader.reading();
    };
    const expected = { met: false, short: ["entry not reached", "held speed", "stop entry not reached"], firstLeg: "left",
      fromRest: true, reachedAt: null, entryMade: false, entryHeld: null, held: 0, turnedAt: null,
      corridor: 0, lag: null, facingError: null, route: null, stopEntered: false, stoppedAt: 0, fellAt: null, seconds: protocol.end, downFor: null };
    const still = read();
    // A body that never moves loses the whole move it was ordered, and nothing standing still under the stop.
    assert.ok(Math.abs(still.lost - (protocol.stop - TRAVEL.start)) < 1e-9, `lost ${still.lost} s against a ${protocol.stop - TRAVEL.start} s move`);
    assert.deepEqual(still, { ...expected, lost: still.lost });
    // Detached toes can still contact the floor but cannot support their body's standing or prove its first step.
    stand.built.joints.get("mtp.left").joint.release();
    stand.built.joints.get("mtp.right").joint.release();
    assert.deepEqual(read(), { ...expected, short: [...expected.short, "stop and settle"], firstLeg: null, fromRest: false, stoppedAt: null, lost: still.lost });
  } finally { stand.dispose(); }
});
