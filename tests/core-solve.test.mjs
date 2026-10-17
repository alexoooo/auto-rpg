/**
 * **The whole-body solve** (`src/core/control/solve.ts`) beside the bearing solve, chosen per body
 * (`BodyOptions.solve`): the Warrior standing on either stands the same. Node stand, Rapier,
 * 120 Hz; the Warrior, unarmed, balance 0.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { standIntent } from "../src/core/mind/intent.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { coreStand } from "./harness/core-stand.mjs";

const spec = humanSpec("workshop-fighter");
/** A body's centre of mass, world: the mass-weighted mean of its segments' centres. */
function centreOfMass(built) {
  const sum = new Vector3(), p = new Vector3();
  let mass = 0;
  for (const segment of built.segments.values()) { sum.addInPlace(centreOfToRef(segment, p).scaleInPlace(segment.rigid.mass)); mass += segment.rigid.mass; }
  return sum.scaleInPlace(1 / mass);
}

/** The Warrior standing 3 s under the command layers on the solve asked: its centre of mass's height and travel, and the recovery steps it took. */
async function stood(solve) {
  const stand = await coreStand(spec);
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS, solve });
  try {
    driveBy(body, { name: "stand", decide: () => standIntent(0) });
    stand.step(stand.seconds(1));
    const from = centreOfMass(stand.built), { stance } = body.view, settled = stance.recoveries;
    let low = Infinity, far = 0;
    for (let step = 0; step < stand.seconds(2); step++) {
      stand.step();
      const c = centreOfMass(stand.built);
      low = Math.min(low, c.y);
      far = Math.max(far, Math.hypot(c.x - from.x, c.z - from.z));
    }
    return { height: from.y, low, far, recoveries: stance.recoveries - settled, down: body.view.down, assisted: body.assist.meter.steps };
  } finally { body.dispose(); stand.dispose(); }
}

test("the_warrior_stands_on_the_whole_body_solve_as_on_the_bearing_solve", async () => {
  const [old, whole] = await Promise.all([stood(false), stood(true)]);
  for (const [path, r] of [["bearing solve", old], ["whole-body solve", whole]]) {
    assert.ok(!r.down && r.low > 0.9 && r.far < 0.03 && r.recoveries === 0, `on the ${path}: ${JSON.stringify(r)}`);
    assert.equal(r.assisted, 0, `on the ${path} it stood unassisted`);
  }
  assert.ok(Math.abs(whole.height - old.height) < 0.01 && Math.abs(whole.low - old.low) < 0.01, `the two stand at one height: ${JSON.stringify({ old, whole })}`);
});
