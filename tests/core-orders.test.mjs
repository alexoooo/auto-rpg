/**
 * **Orders** (`src/core/mind/orders.ts`) and the tactics that carry them out (`orderedIntent`,
 * `src/core/mind/ordered.ts`): what an order becomes as an intent, on sights made by hand, what a
 * hand that does not attack is given under each way of guarding, and a body walking one way while
 * it faces another (Node stand, Rapier, 120 Hz: the Warrior with the
 * club in its right hand).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { armed } from "../src/core/human/grip.ts";
import { modelSpec } from "../src/core/models.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { actionTactics } from "../src/core/mind/action-tactics.ts";
import { FIGHTING } from "../src/core/mind/config.ts";
import { RUN, STRAFE, orderedIntent } from "../src/core/mind/ordered.ts";
import { NO_COVER } from "../src/core/mind/intent.ts";
import { isOrders, sameOrders, STAND_ORDERS } from "../src/core/mind/orders.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { threatReader } from "../src/core/mind/threat.ts";
import { coreStand } from "./harness/core-stand.mjs";

const { threatOf } = threatReader();

/** A body's walk every way and forward (`StanceEnvelope`), m/s: its fastest walk forward is its own, and it kept no trials. */
const QUARTER = Math.PI / 2, WALK = 0.7, FORWARD = 1.2;
const ENVELOPE = { walk: { value: WALK }, ways: { forward: { value: FORWARD }, right: { value: WALK }, back: { value: WALK }, left: { value: WALK } }, turns: [], tried: null };
const EAST = { x: 1, z: 0 }, NORTH = { x: 0, z: 1 }, SOUTH = { x: 0, z: -1 };

test("tactics_turn_orders_into_an_intent", () => {
  /** The intent `orders` become for a body whose stance is asked to face `heading`. */
  const intent = (orders, heading = 0, envelope = ENVELOPE) =>
    orderedIntent({ report: { heading }, envelope }, orders, NO_COVER);
  /** `got` is `{ move, face, guard: NO_COVER }`, its numbers within 1e-12. */
  const is = (got, move, face, what) => {
    const near = (a, b) => Math.abs(a - b) < 1e-12;
    assert.ok(move === null ? got.move === null : got.move !== null && near(got.move[0], move[0]) && near(got.move[1], move[1]),
      `${what}: move ${JSON.stringify(got.move)}, not ${JSON.stringify(move)}`);
    assert.ok(near(got.face, face), `${what}: face ${got.face}, not ${face}`);
    assert.deepEqual([got.guard, got.actions], [NO_COVER, []], what);
    assert.deepEqual(Object.keys(got).sort(), ["actions", "face", "guard", "move"], what);
  };
  const half = STRAFE.share * WALK;
  assert.equal(half, 0.35);

  // Facing its walk, it walks forward at its fastest and turns to it; sent somewhere or run, at its fastest forward.
  is(intent({ move: NORTH, face: null }), [WALK, 0], 0, "walking ahead");
  is(intent({ move: EAST, face: null }), [WALK, 0], QUARTER, "walking to its right");
  const sent = orderedIntent({ report: { heading: 0 }, envelope: ENVELOPE }, { move: EAST, face: null, destination: 9 }, NO_COVER);
  assert.deepEqual([sent.move, sent.destination], [[FORWARD, 0], 9], "sent somewhere");
  // Ordered to run, it faces the way it goes at its fastest forward, the facing ordered set aside.
  is(intent({ move: EAST, face: NORTH, run: true }), [FORWARD, 0], QUARTER, "running to its right");
  // Where it kept its trials, a run goes at the fastest forward that held `RUN.share` of them, past the one every trial held.
  const count = (...held) => held.map((value) => ({ value })), trials = 10;
  const tried = { speeds: count(1, 2, 3, 4), trials: { value: trials }, held: { forward: count(10, 8, Math.ceil(RUN.share * trials), Math.ceil(RUN.share * trials) - 1), right: count(0, 0, 0, 0), back: count(0, 0, 0, 0), left: count(0, 0, 0, 0) } };
  is(intent({ move: EAST, face: null, run: true }, 0, { ...ENVELOPE, tried }), [3, 0], QUARTER, "running at the pace it risks");
  is(intent({ move: EAST, face: null }, 0, { ...ENVELOPE, tried }), [WALK, 0], QUARTER, "walking at the walk every trial held");
  assert.deepEqual([true, undefined, false, "yes"].map((run) => isOrders({ move: EAST, run, face: null })), [true, true, false, false], "a run is ordered or not");
  // Facing elsewhere, the walk is in the heading's frame: forward, and to the right.
  is(intent({ move: EAST, face: NORTH }), [0, half], 0, "across its heading");
  is(intent({ move: NORTH, face: NORTH }), [WALK, 0], 0, "ahead, facing ahead");
  is(intent({ move: SOUTH, face: NORTH }), [-half, 0], 0, "backward");
  is(intent({ move: { x: 1, z: 1 }, face: NORTH }),
    [(0.5 + 0.5 * Math.SQRT1_2) * WALK * Math.SQRT1_2, (0.5 + 0.5 * Math.SQRT1_2) * WALK * Math.SQRT1_2], 0, "an eighth off its heading");
  // Not yet turned to its facing, it holds the half pace even walking straight ahead.
  is(intent({ move: NORTH, face: SOUTH }), [half, 0], Math.PI, "a half turn to make");
  is(intent({ move: NORTH, face: EAST }, 0.2), [half * Math.cos(-0.2), half * Math.sin(-0.2)], QUARTER, "a quarter turn to make");
  // Either side of the angle within which it counts as turned.
  const turnedTo = (angle) => ({ x: Math.sin(angle), z: Math.cos(angle) });
  is(intent({ move: NORTH, face: turnedTo(STRAFE.turned - 0.01) }), [WALK, 0], STRAFE.turned - 0.01, "all but turned");
  is(intent({ move: NORTH, face: turnedTo(-STRAFE.turned - 0.01) }), [half, 0], -STRAFE.turned - 0.01, "not quite turned");
  // The angle is taken the short way round: a heading of 3 and a facing of -3 are 0.28 rad apart.
  is(intent({ move: turnedTo(3), face: turnedTo(-3) }, 3), [WALK, 0], -3, "across the half turn");

  // Standing, it asks for the facing ordered, or for the heading it has.
  is(intent({ move: null, face: EAST }), null, QUARTER, "standing, facing");
  is(intent(STAND_ORDERS, 0.4), null, 0.4, "standing");
  is(intent({ move: null, face: { x: 0.05, z: 0 } }, 0.4), null, 0.4, "a facing too short to read");
  // With no envelope it has no walk to ask for.
  is(intent({ move: EAST, face: NORTH }, 0.4, null), null, 0, "no envelope");

  // An experiment's rule is passed in.
  const slow = orderedIntent({ report: { heading: 0 }, envelope: ENVELOPE }, { move: EAST, face: NORTH }, NO_COVER, { ...STRAFE, share: .25 });
  is(slow, [0, 0.175], 0, "a quarter share");
});

test("a_fighter_told_to_cover_gives_the_cover_to_the_hand_that_does_not_attack", () => {
  // A sight with one foe, whose left hand hangs still two metres off and whose right hand's frame
  // is 0.6 m before the head, coming at it at `speed` m/s.
  const head = new Vector3(0, 1.6, 0);
  const sensedHand = (at, velocity) => ({ position: at, rotation: Quaternion.Identity(), centre: at, velocity, spin: Vector3.Zero() });
  const sight = (speed) => ({
    view: { resumed: false, head, senses: { time: 0, side: "left", out: false, others: [{
      id: "foe", side: "right", spec: modelSpec("workshop-fighter"), out: false, centre: new Vector3(0, 1, 2), velocity: Vector3.Zero(),
      segments: new Map([["hand.left", sensedHand(new Vector3(0.2, 1.2, 2), Vector3.Zero())], ["hand.right", sensedHand(new Vector3(0, 1.6, 0.6), new Vector3(0, 0, -speed))]]),
    }] } },
    report: { heading: 0, strike: { thrown: { right: 0 } } }, envelope: ENVELOPE,
  });
  const cover = threatOf(sight(5).view);
  assert.ok(cover && Math.hypot(cover.threat[0], cover.threat[1] - 1.6, cover.threat[2] - 0.6) < 0.2, `the sight's threat: ${JSON.stringify(cover)}`);
  assert.deepEqual(cover.guarded, [0, 1.6, 0]);
  assert.equal(threatOf(sight(1).view), null, "a hand that comes slowly is no threat");
  const predicted = threatOf(sight(5).view, undefined, { out: .3, horizon: .75 });
  assert.ok(predicted && predicted.threat[2] < cover.threat[2], "the cover follows the future plane crossing");
  const from = cover.threat.map((v, k) => v - [head.x, head.y, head.z][k]), length = Math.hypot(...from);
  const projection = predicted.threat.reduce((sum, v, k) => sum + (v - [head.x, head.y, head.z][k]) * from[k] / length, 0);
  assert.ok(Math.abs(projection - .3) < 1e-12);
  assert.equal(threatOf(sight(5).view, undefined, { out: .3, horizon: .001 }), null, "a crossing beyond the planning horizon is refused");
  const read = sight(5);
  read.view.time = 0; read.view.stance = { centre: new Vector3(), phase: "stand" };
  read.report = { heading: 0, actions: [], ledger: [] };
  const tactics = actionTactics(modelSpec("workshop-fighter"), [], { ...FIGHTING, list: [{ kind: "cover", guard: "cover" }] });
  assert.deepEqual(tactics.decide(read, 1 / 120).guard, { left: cover, right: cover });
  read.view.senses = sight(1).view.senses;
  assert.deepEqual(tactics.decide(read, 1 / 120).guard, NO_COVER);
});

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
  const facing = await walk({ move: EAST, face: NORTH });
  assert.equal(facing.fallen, false, "it fell");
  assert.ok(facing.x > 1.1 && facing.x < 1.8, `along its walk: ${facing.x}`);
  assert.ok(Math.abs(facing.z) < 0.3, `across it: ${facing.z}`);
  assert.ok(Math.abs(facing.heading) < 0.01, `it kept its heading: ${facing.heading}`);
  // The control: the same walk, facing it.
  const turning = await walk({ move: EAST, face: null });
  assert.equal(turning.fallen, false, "the control fell");
  assert.ok(turning.x > 2.6, `the control went ${turning.x}`);
  assert.ok(Math.abs(turning.heading - QUARTER) < 0.02, `the control turned to ${turning.heading}`);
});

test("orders_are_the_same_when_they_say_the_same", () => {
  const walk = { move: { x: 1, z: 0 }, face: { x: 0, z: 1 }, foe: "target", region: "head" };
  assert.equal(sameOrders(null, null), true);
  assert.equal(sameOrders(STAND_ORDERS, { move: null, face: null }), true);
  assert.equal(sameOrders(null, STAND_ORDERS), false, "no orders are not orders to stand");
  assert.equal(sameOrders(STAND_ORDERS, null), false);
  assert.equal(sameOrders(walk, structuredClone(walk)), true);
  for (const other of [{ ...walk, move: { x: 1, z: 1e-9 } }, { ...walk, face: null }, { ...walk, region: "upperTrunk" }, { ...walk, foe: "other" }]) {
    assert.equal(sameOrders(walk, other), false, JSON.stringify(other));
  }
});
