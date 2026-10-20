/**
 * **How far a body walks one way while it faces another** (`orderedIntent`,
 * `src/core/mind/ordered.ts`), measured on the Node stand (Rapier, 120 Hz: the Warrior with the club
 * in its right hand), and not a gate (`tests/experimental.json`).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { armed } from "../src/core/human/grip.ts";
import { modelSpec } from "../src/core/models.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { actionTactics } from "../src/core/mind/action-tactics.ts";
import { FIGHTING } from "../src/core/mind/config.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { coreStand } from "./harness/core-stand.mjs";

const QUARTER = Math.PI / 2;
const EAST = { x: 1, z: 0 }, NORTH = { x: 0, z: 1 };

test("a_body_walks_one_way_while_it_faces_another", async () => {
  /** The Warrior, club in hand, 8 s under `orders`: whether it fell, how far it went, and the heading its stance was asked. */
  const walk = async (orders) => {
    const stand = await coreStand(armed(modelSpec("workshop-fighter"), "right", woodenClub()));
    const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS });
    try {
      const skills = driveBy(body, actionTactics(stand.built.spec, [], FIGHTING, () => orders));
      const from = body.view.stance.centre.clone();
      stand.step(stand.seconds(8));
      const to = body.view.stance.centre;
      return { fallen: body.view.down, x: to.x - from.x, z: to.z - from.z, heading: skills.report.heading };
    } finally { body.dispose(); stand.dispose(); }
  };
  // Read on this stand: 1.47 m along x and 0.03 m along z, facing; 2.89 m, turning to its walk.
  const facing = await walk({ move: { kind: "direct", direction: EAST }, face: NORTH });
  assert.equal(facing.fallen, false, "it fell");
  assert.ok(facing.x > 1.1 && facing.x < 1.8, `along its walk: ${facing.x}`);
  assert.ok(Math.abs(facing.z) < 0.3, `across it: ${facing.z}`);
  assert.ok(Math.abs(facing.heading) < 0.01, `it kept its heading: ${facing.heading}`);
  // The control: the same walk, facing it.
  const turning = await walk({ move: { kind: "direct", direction: EAST }, face: null });
  assert.equal(turning.fallen, false, "the control fell");
  assert.ok(turning.x > 2.6, `the control went ${turning.x}`);
  assert.ok(Math.abs(turning.heading - QUARTER) < 0.02, `the control turned to ${turning.heading}`);
});
