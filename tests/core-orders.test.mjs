/**
 * **Orders** (`src/core/mind/orders.ts`) and the tactics that carry them out (`fighterTactics`,
 * `src/core/mind/fighter.ts`): what an order becomes as an intent, on sights made by hand, and a
 * body walking one way while it faces another (Node stand, Rapier, 120 Hz: the Warrior with the
 * club in its right hand).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { armed } from "../src/core/human/grip.ts";
import { modelSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { fighterTactics, STRAFE } from "../src/core/mind/fighter.ts";
import { GUARD_ACTION } from "../src/core/mind/intent.ts";
import { sameOrders, STAND_ORDERS } from "../src/core/mind/orders.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { coreStand } from "./harness/core-stand.mjs";

const QUARTER = Math.PI / 2, WALK = 0.7;
const EAST = { x: 1, z: 0 }, NORTH = { x: 0, z: 1 }, SOUTH = { x: 0, z: -1 };

test("tactics_turn_orders_into_an_intent", () => {
  /** The intent `orders` become for a body whose stance is asked to face `heading`. */
  const intent = (orders, heading = 0, envelope = { walk: { value: WALK } }) =>
    fighterTactics("orders", () => orders).decide({ view: { resumed: false }, report: { heading, strike: { thrown: { right: 0 } } }, envelope }, 1 / 120);
  const guard = { left: GUARD_ACTION, right: GUARD_ACTION };
  /** `got` is `{ move, face, hands: guard }`, its numbers within 1e-12. */
  const is = (got, move, face, what) => {
    const near = (a, b) => Math.abs(a - b) < 1e-12;
    assert.ok(move === null ? got.move === null : got.move !== null && near(got.move[0], move[0]) && near(got.move[1], move[1]),
      `${what}: move ${JSON.stringify(got.move)}, not ${JSON.stringify(move)}`);
    assert.ok(near(got.face, face), `${what}: face ${got.face}, not ${face}`);
    assert.deepEqual(got.hands, guard, what);
    assert.deepEqual(Object.keys(got).sort(), ["face", "hands", "move"], what);
  };
  const half = STRAFE.share * WALK;
  assert.equal(half, 0.35);

  // Facing its walk, it walks forward at its fastest and turns to it.
  is(intent({ move: NORTH, face: null, attack: null }), [WALK, 0], 0, "walking ahead");
  is(intent({ move: EAST, face: null, attack: null }), [WALK, 0], QUARTER, "walking to its right");
  // Facing elsewhere, the walk is in the heading's frame: forward, and to the right.
  is(intent({ move: EAST, face: NORTH, attack: null }), [0, half], 0, "across its heading");
  is(intent({ move: NORTH, face: NORTH, attack: null }), [WALK, 0], 0, "ahead, facing ahead");
  is(intent({ move: SOUTH, face: NORTH, attack: null }), [-half, 0], 0, "backward");
  is(intent({ move: { x: 1, z: 1 }, face: NORTH, attack: null }),
    [(0.5 + 0.5 * Math.SQRT1_2) * WALK * Math.SQRT1_2, (0.5 + 0.5 * Math.SQRT1_2) * WALK * Math.SQRT1_2], 0, "an eighth off its heading");
  // Not yet turned to its facing, it holds the half pace even walking straight ahead.
  is(intent({ move: NORTH, face: SOUTH, attack: null }), [half, 0], Math.PI, "a half turn to make");
  is(intent({ move: NORTH, face: EAST, attack: null }, 0.2), [half * Math.cos(-0.2), half * Math.sin(-0.2)], QUARTER, "a quarter turn to make");
  // Either side of the angle within which it counts as turned.
  const turnedTo = (angle) => ({ x: Math.sin(angle), z: Math.cos(angle) });
  is(intent({ move: NORTH, face: turnedTo(STRAFE.turned - 0.01), attack: null }), [WALK, 0], STRAFE.turned - 0.01, "all but turned");
  is(intent({ move: NORTH, face: turnedTo(-STRAFE.turned - 0.01), attack: null }), [half, 0], -STRAFE.turned - 0.01, "not quite turned");
  // The angle is taken the short way round: a heading of 3 and a facing of -3 are 0.28 rad apart.
  is(intent({ move: turnedTo(3), face: turnedTo(-3), attack: null }, 3), [WALK, 0], -3, "across the half turn");

  // Standing, it asks for the facing ordered, or for the heading it has.
  is(intent({ move: null, face: EAST, attack: null }), null, QUARTER, "standing, facing");
  is(intent(STAND_ORDERS, 0.4), null, 0.4, "standing");
  is(intent({ move: null, face: { x: 0.05, z: 0 }, attack: null }, 0.4), null, 0.4, "a facing too short to read");
  // With no envelope it has no walk to ask for.
  is(intent({ move: EAST, face: NORTH, attack: null }, 0.4, null), null, 0, "no envelope");

  // An attack waits for no walk, and holds the heading.
  assert.deepEqual(intent({ move: EAST, face: NORTH, attack: [1, 1.6, 0] }, 0.4),
    { move: null, face: 0.4, hands: { left: GUARD_ACTION, right: { kind: "attack", target: [1, 1.6, 0] } } });

  // An experiment's rule is passed in.
  const slow = fighterTactics("orders", () => ({ move: EAST, face: NORTH, attack: null }), { ...STRAFE, share: 0.25 })
    .decide({ view: { resumed: false }, report: { heading: 0, strike: { thrown: { right: 0 } } }, envelope: { walk: { value: WALK } } }, 1 / 120);
  is(slow, [0, 0.175], 0, "a quarter share");
});

test("a_body_walks_one_way_while_it_faces_another", async () => {
  /** The Warrior, club in hand, 8 s under `orders`: whether it fell, how far it went, and the heading its stance was asked. */
  const walk = async (orders) => {
    const stand = await coreStand(armed(modelSpec("workshop-fighter"), "right", woodenClub()));
    const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS });
    try {
      const skills = driveBy(body, fighterTactics("orders", () => orders));
      const from = body.view.stance.centre.clone();
      stand.step(stand.seconds(8));
      const to = body.view.stance.centre;
      return { fallen: body.view.down, x: to.x - from.x, z: to.z - from.z, heading: skills.report.heading };
    } finally { body.dispose(); stand.dispose(); }
  };
  // Read on this stand: 2.07 m along x and 0.04 m along z, facing; 3.10 m, turning to its walk.
  const facing = await walk({ move: EAST, face: NORTH, attack: null });
  assert.equal(facing.fallen, false, "it fell");
  assert.ok(facing.x > 1.6 && facing.x < 2.5, `along its walk: ${facing.x}`);
  assert.ok(Math.abs(facing.z) < 0.3, `across it: ${facing.z}`);
  assert.ok(Math.abs(facing.heading) < 0.01, `it kept its heading: ${facing.heading}`);
  // The control: the same walk, facing it.
  const turning = await walk({ move: EAST, face: null, attack: null });
  assert.equal(turning.fallen, false, "the control fell");
  assert.ok(turning.x > 2.6, `the control went ${turning.x}`);
  assert.ok(Math.abs(turning.heading - QUARTER) < 0.02, `the control turned to ${turning.heading}`);
});

test("orders_are_the_same_when_they_say_the_same", () => {
  const walk = { move: { x: 1, z: 0 }, face: { x: 0, z: 1 }, attack: [1, 1.6, 0] };
  assert.equal(sameOrders(null, null), true);
  assert.equal(sameOrders(STAND_ORDERS, { move: null, face: null, attack: null }), true);
  assert.equal(sameOrders(null, STAND_ORDERS), false, "no orders are not orders to stand");
  assert.equal(sameOrders(STAND_ORDERS, null), false);
  assert.equal(sameOrders(walk, structuredClone(walk)), true);
  for (const other of [{ ...walk, move: { x: 1, z: 1e-9 } }, { ...walk, face: null }, { ...walk, attack: [1, 1.6, 1e-9] }, { ...walk, attack: null }]) {
    assert.equal(sameOrders(walk, other), false, JSON.stringify(other));
  }
});
