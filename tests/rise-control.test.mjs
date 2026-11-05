import "./harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { coreStand } from "./harness/core-stand.mjs";
import { modelSpec } from "../src/core/models.ts";
import { commandedBody } from "../src/core/mind/host.ts";
import { riseLimbs } from "../src/core/recovery/rise/limbs.ts";
import { servoAsk } from "../src/core/control/servo.ts";
import { Vector3 } from "../src/core/math/vector.ts";

test("bearing posture accelerations use the joint turning map, including damping and transfer", async () => {
  const stand = await coreStand(modelSpec("workshop-fighter"), { gravity: false, ground: false, posture: {
    "shoulder.left flexion": .6, "shoulder.left abduction": .8, "shoulder.left internal rotation": .4,
    "hip.left flexion": 1, "hip.left abduction": .4, "hip.left internal rotation": .4,
  } });
  let own;
  const host = commandedBody(stand.built, stand.world, {}, [(body) => {
    own = body;
    return { name: "bearing coordinates", state: {}, wants: () => false, begin() {}, end() {}, step() {} };
  }]);
  try {
    for (const name of ["shoulder.left", "hip.left"]) {
      const joint = stand.built.joints.get(name);
      joint.child.body.applyTorqueImpulse(new Vector3(.03, -.05, .04));
    }
    stand.step();
    const muscles = own.muscles, limbs = riseLimbs(own);
    const goals = Float64Array.from(muscles.channels, (_, i) => muscles.angle(i) + [.1, -.2, .05][i % 3]);
    assert.ok(muscles.channels.some((_, i) => Math.abs(muscles.rate(i)) > 1e-8), "the fixture exercises damping at nonzero joint rates");
    let different = false;
    limbs.read(-10, false);
    for (const name of ["hand.left", "shin.left"]) {
      const index = own.spec.ends.findIndex(end => end.name === name), end = own.spec.ends[index], limb = limbs.limbs[index];
      for (const transfer of [false, true]) {
        limbs.bear(index, goals, 2, -10, 1, transfer);
        const seconds = i => !transfer && end.takes.includes(muscles.channels[i].name) ? .1 : .5;
        const reference = servoAsk(muscles, i => goals[i], .5, stand.world.dt,
          { seconds, rate: () => 0, acceleration: () => 0 });
        for (let k = 0; k < limb.memory.channels.length; k++) {
          const i = limb.memory.channels[k], rate = 1 / seconds(i);
          const unmapped = rate * rate * (goals[i] - muscles.angle(i)) - 2 * rate * muscles.rate(i);
          different ||= Math.abs(unmapped - reference.accel[i]) > 1e-6;
          assert.ok(Math.abs(limb.work.toward[k] - reference.accel[i]) < 1e-10,
            `${name}, transfer ${transfer}, ${muscles.channels[i].name}: bearing ${limb.work.toward[k]}, servo ${reference.accel[i]}`);
          if (end.takes.includes(muscles.channels[i].name)) assert.ok(Number.isNaN(limb.work.ahead[k]));
          else assert.equal(limb.work.ahead[k], limb.work.toward[k]);
        }
      }
    }
    assert.ok(different, "the compound poses distinguish joint-angle and motor-axis accelerations");
  } finally { host.dispose(); stand.dispose(); }
});
