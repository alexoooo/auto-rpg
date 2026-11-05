/** Command delivery, suspension and restoration, independent of skill capability. */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "../src/core/math/vector.ts";
import { modelSpec } from "../src/core/models.ts";
import { poseAngles } from "../src/core/control/kinematics.ts";
import { GUARD } from "../src/core/skills/guard/guard.ts";
import { createWorld } from "../src/core/world.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { embody } from "../src/core/mind/mind.ts";
import { loadState, saveState } from "../src/core/state.ts";
import { freshEngine } from "./harness/core-stand.mjs";

/** The command's delay a world is made with to show it: more than one step, so its ring is read through. */
const SHOWN_DELAY = 2;

test("a body's command is applied the world's delay after it is sent, none before, none again after its level leaves full, and across a save and load", async () => {
  const spec = modelSpec("workshop-fighter");
  const world = createWorld(await freshEngine(), { actuation: "directional", delay: SHOWN_DELAY });
  const built = buildBody(spec, world, { position: [0, 1, 0], joints: poseAngles(spec, GUARD) });
  // Held in place, every muscle's strength is the one at rest, so a ceiling reads the activation that set it; its weight sets its assist's ceiling.
  for (const segment of built.segments.values()) segment.body.setFixed(true);
  const right = built.handPoses.model.find((hand) => hand.hand === "right"), poses = right.poses.slice(0, 2);
  assert.equal(poses.length, 2, "the fixture needs a hand with two poses");
  const sent = [], level = (k) => 0.05 + 0.1 * (k % 7), push = (k) => [k + 1, 0, 0];
  const embodied = embody(built, world, () => {
    const state = { pending: -1 };
    return { name: "delay probe", has: () => "delay probe", dispose() {}, mind: {
      state, interrupt() { state.pending = -1; },
      think() { state.pending = sent.length; sent.push(state.pending); },
      act(control) {
        const k = state.pending;
        if (k < 0) return;
        control.muscles.activation.fill(level(k)); control.muscles.velocity.fill(0);
        control.assist.force.set(...push(k)); control.assist.moment.setAll(0);
        control.hands.request("right", poses[k % 2]);
      },
    } };
  }, { assist: { force: 10, moment: 10 } });
  // The body's own muscles and assist, not the mind's view of them, which a world with a delay keeps on a mirror a step behind.
  const muscles = embodied.held.muscles, channel = muscles.channels.findIndex((c) => c.positive.tendon === null && c.negative.tendon === null);
  assert.ok(channel >= 0, "the fixture needs a channel without a tendon");
  // What the body was given on the step just taken: the activation its ceiling reads, the assist's push and the hand's pose asked.
  const given = () => ({ activation: Math.round(1e9 * muscles.bounds.positive[channel] / muscles.strength(channel, 1)) / 1e9,
    push: embodied.held.assist.given.force.x, pose: built.handPoses.state.right.requested });
  const expected = (k, since) => k - since < SHOWN_DELAY ? { activation: 0, push: 0, pose: null }
    : { activation: Math.round(1e9 * level(k - SHOWN_DELAY)) / 1e9, push: push(k - SHOWN_DELAY)[0], pose: poses[(k - SHOWN_DELAY) % 2] };
  // A hand keeps the pose it was last asked: where none is due, the reading names none if the hand holds the one it held as the steps began.
  const played = (from, steps, since) => {
    const held = built.handPoses.state.right.requested;
    return Array.from({ length: steps }, (_, i) => {
      world.step();
      const reading = given(), want = expected(from + i, since);
      return { ...reading, pose: want.pose === null && reading.pose === held ? null : reading.pose };
    });
  };
  const wanted = (from, steps, since) => Array.from({ length: steps }, (_, i) => expected(from + i, since));
  assert.deepEqual(played(0, 8, 0), wanted(0, 8, 0));
  // Off its level and back, the body is its mind's again from its next command: none sent before is given.
  muscles.setLevel("limp"); world.step(3); muscles.setLevel("full");
  for (const segment of built.segments.values()) segment.body.setFixed(true);
  assert.deepEqual(played(8, 6, 8), wanted(8, 6, 8));
  // Saved between a command sent and its step, the load gives the same commands again.
  const root = { world: world.state, body: embodied.state, sent }, saved = saveState(root);
  const after = played(14, 5, 8);
  loadState(root, saved);
  assert.deepEqual(played(14, 5, 8), after);
  assert.deepEqual(after, wanted(14, 5, 8));
  embodied.dispose(); world.dispose();
});

test("a fresh physics fork resets exactly the forces pending at its save", async () => {
  const engine = await freshEngine("rapier");
  const make = () => {
    const world = engine.createPhysics({ hz: 120, gravity: false });
    const bodies = [0, 3, 6].map((x, i) => world.addBody(
      { name: `box ${i}`, position: new Vector3(x, 2, 0), rotation: Quaternion.Identity() },
      [{ kind: "box", centre: [0, 0, 0], size: [1, 1, 1] }],
      { mass: 1, centre: [0, 0, 0], moments: [1, 1, 1], orientation: Quaternion.Identity() },
    ));
    return { world, bodies };
  };
  const original = make(), fork = make();
  try {
    original.world.step(1 / 120);
    original.bodies[1].applyForce(new Vector3(), original.bodies[1].pose.position);
    original.bodies[0].applyForce(new Vector3(2, 0, 0), original.bodies[0].pose.position);
    original.bodies[0].applyTorque(new Vector3(0, 1, 0));
    fork.world.load(original.world.save());
    assert.deepEqual(fork.world.save(), original.world.save());
    for (let i = 0; i < 3; i++) {
      original.world.step(1 / 120); fork.world.step(1 / 120);
      assert.deepEqual(fork.world.save(), original.world.save(), `continuation step ${i + 1}`);
    }
  } finally { original.world.dispose(); fork.world.dispose(); }
});
