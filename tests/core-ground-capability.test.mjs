/** Whether the stance falls to a hard shove, and the view reads it: Node stand, Rapier, 120 Hz. */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { modelSpec } from "../src/core/models.ts";
import { standIntent } from "../src/core/mind/intent.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { coreStand } from "./harness/core-stand.mjs";

const warrior = modelSpec("workshop-fighter");

/** The Warrior under the command layers, standing in guard, shoved `impulse` N s forward at its middle trunk's centre a second in. */
async function shoved(impulse, seconds, each) {
  const stand = await coreStand(warrior);
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS });
  try {
    driveBy(body, { name: "stand", decide: () => standIntent(0) });
    stand.step(stand.seconds(1));
    const trunk = stand.built.segments.get("middleTrunk");
    trunk.body.applyImpulse(new Vector3(0, 0, impulse), centreOfToRef(trunk, new Vector3()));
    for (let i = 0; i < stand.seconds(seconds); i++) { stand.step(); each(body, i / stand.world.hz); }
  } finally { body.dispose(); stand.dispose(); }
}

test("a shoved body reads down, lying", async () => {
  let at = null, up = 0;
  await shoved(120, 5, (body, time) => {
    if (body.view.down) at ??= time;
    else if (at !== null && time < at + 2) up += 1;
  });
  assert.ok(at !== null && at < 3, `it was down ${at} s after the shove`);
  assert.equal(up, 0, "and stayed down the 2 s that followed");
  // The control: a shove it holds leaves it up.
  let held = true;
  await shoved(20, 3, (body) => { held &&= !body.view.down; });
  assert.ok(held, "a sixth of the shove leaves it standing");
});
