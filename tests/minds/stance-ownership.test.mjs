import test from "node:test";
import assert from "node:assert/strict";
import { modelSpec } from "../../src/core/bodies/models.ts";
import { embody } from "../../src/minds/embodiment.ts";
import { commandedMind } from "../../src/minds/sub-mind.ts";
import { SERVO_SECONDS } from "../../src/control/body.ts";
import { wholeBodyMotor } from "../../src/control/whole-body-motor.ts";
import { coreStand } from "../harness/core-stand.mjs";

test("a stance's named bearing end excludes another controller of its segment", async () => {
  const spec = modelSpec("workshop-fighter");
  const end = spec.ends.find(end => end.kind === "foot" && spec.effectors.some(e => e.segment === end.segment));
  assert.ok(end, "the fixture needs a stance end that is also a controllable effector");
  const point = spec.effectors.find(e => e.segment === end.segment).point;
  for (const owns of ["effectors", "points"]) {
    const stand = await coreStand(spec);
    const embodied = embody(stand.built, stand.world,
      own => commandedMind(own, { servoSeconds: SERVO_SECONDS, motor: wholeBodyMotor() }, stand.world));
    try {
      const body = embodied.mind.body;
      let carried = 0;
      body.drive(() => { carried++; return { posture: {}, pushes: [],
        stance: { feet: [end.name], centre: null, height: body.view.standing, heading: 0 },
        ...(owns === "effectors"
          ? { effectors: { [end.segment]: { places: [{ point, position: [0, 0, 0] }], seconds: 1 } } }
          : { points: [{ segment: end.segment, point, accel: [0, 0, 0] }] }),
      }; });
      let failed = null;
      try { stand.step(3); } catch (error) { failed = { name: error.name, message: error.message }; }
      assert.ok(carried > 0, "the fixture needs its overlapping command delivered");
      assert.deepEqual(failed, { name: "Error", message: `two controllers own ${end.segment}` }, owns);
    } finally { embodied.dispose(); stand.dispose(); }
  }
});
