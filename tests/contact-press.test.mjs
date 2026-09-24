// Physical contact session 07: contact force lifts and pushes a standing body.
import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsMotionType, PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";

import { CONFIG } from "../src/config.ts";
import { CONTACT_PRESS, ContactPress, NO_PRESS } from "../src/contact-press.ts";
import { freshIntent } from "../src/action-primitives.ts";
import { stepPair } from "../src/fighter.ts";
import { defaultGolemSetup } from "../src/golem/build.ts";
import { withAttributeSetting } from "../src/golem/attributes.ts";
import { Golem } from "../src/golem/golem.ts";
import { idleMind } from "../src/mind.ts";
import { attachPhysics } from "../src/physics.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import {
  VirtualLocomotionCarrier, StandableWorldRegistry, deriveLocomotionFootprint, resolveCarrierPair,
} from "../src/supported-locomotion-runtime.ts";
import { freshHavok } from "./harness/bout-runner.mjs";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";

const FIXED = 1 / CONFIG.world.physicsHz;

/**
 * A 10 kg box driven into an ANIMATED post by a constant force, on raw Havok, with a press watching
 * the post. The force goes on as an impulse per solver step: `applyForce` scales by the plugin's
 * own 1/60 time step, which is four times what it asks at a 240 Hz substep.
 */
async function pressRig({ force, up = false, source }) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  attachPhysics(scene, await freshHavok());
  scene.getPhysicsEngine().setSubTimeStep(1000 * FIXED);
  const floor = MeshBuilder.CreateBox("floor", { width: 6, height: 0.2, depth: 6 }, scene);
  floor.position.y = -0.1;
  new PhysicsAggregate(floor, PhysicsShapeType.BOX, { mass: 0 }, scene);
  const post = MeshBuilder.CreateBox("post", up ? { width: 1, height: 0.2, depth: 1 } : { width: 0.2, height: 1, depth: 1 }, scene);
  post.position.set(up ? 0 : 0.6, up ? 0.9 : 0.5, 0);
  const postBody = new PhysicsAggregate(post, PhysicsShapeType.BOX, { mass: 100 }, scene).body;
  postBody.setMotionType(PhysicsMotionType.ANIMATED);
  const box = MeshBuilder.CreateBox("box", { size: 0.5 }, scene);
  box.position.set(up ? 0 : 0.24, up ? 0.55 : 0.25, 0);
  const boxBody = new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 10, friction: 0.5 }, scene).body;
  scene.getPhysicsEngine().getPhysicsPlugin().setActivationControl(boxBody, 1);
  const press = new ContactPress(FIXED, (body) => body === postBody);
  press.watch(postBody);
  const src = { owns: (body) => body === boxBody, standing: true, weightN: 1e6, ...source };
  const readings = [];
  const push = new Vector3(up ? 0 : force * FIXED, up ? force * FIXED : 0, 0);
  scene.onBeforePhysicsObservable.add(() => {
    readings.push(press.sample([src]));
    boxBody.applyImpulse(push, box.position);
  });
  for (let frame = 0; frame < 60; frame += 1) { scene._renderId += 1; scene._advancePhysicsEngineStep(1000 / 60); }
  const result = { readings, pressing: press.pressing(postBody, boxBody), ageS: press.ageS(postBody, boxBody),
    strangerAge: press.ageS(postBody, floor.physicsBody) };
  press.dispose();
  scene.dispose();
  engine.dispose();
  return result;
}

test("a press reads a sustained contact's force past the blow window, from standing sources only, capped at the source's grip and weight", async () => {
  const { readings, pressing, ageS } = await pressRig({ force: 200 });
  const last = readings.at(-1);
  // The box pushes the post along +x with the 200 N driving it, less the floor's friction on a 10 kg
  // box, which is at most 0.5 x 98 N. The press reads the force on the post.
  assert.ok(last.pushX > 140 && last.pushX < 210, `the press read ${last.pushX.toFixed(1)} N along +x`);
  assert.ok(Math.abs(last.pushZ) < 5 && last.liftN < 5, "and nothing across or up");
  assert.ok(pressing && ageS > 0.9, `the contact has lasted ${ageS.toFixed(3)} s and is a press`);
  // The first BLOW_S of the contact is a blow, and the press reads none of it.
  const blowSteps = Math.round(CONTACT_PRESS.BLOW_S / FIXED);
  const touched = readings.findIndex((r) => r.pushX !== 0);
  assert.ok(touched >= blowSteps, `the press first read a force on step ${touched}, not before ${blowSteps}`);

  const capped = (await pressRig({ force: 200, source: { weightN: 100 } })).readings.at(-1);
  assert.ok(Math.abs(capped.pushX - CONTACT_PRESS.GRIP * 100) < 1e-9, `a 100 N body pushes with its grip, ${capped.pushX}`);
  const lying = (await pressRig({ force: 200, source: { standing: false } })).readings.at(-1);
  assert.deepEqual([lying.pushX, lying.pushZ, lying.liftN], [0, 0, 0], "a body that is not standing presses nothing");

  // Up: 300 N under a slab, against the box's own 98 N, holds the slab up with about 200.
  const lift = (await pressRig({ force: 300, up: true })).readings.at(-1);
  assert.ok(lift.liftN > 170 && lift.liftN < 230, `the press read ${lift.liftN.toFixed(1)} N up`);
  const light = (await pressRig({ force: 300, up: true, source: { weightN: 100 } })).readings.at(-1);
  assert.ok(Math.abs(light.liftN - 100) < 1e-9, `a 100 N body lifts no more than it weighs, ${light.liftN}`);
});

const footprint = (id) => deriveLocomotionFootprint({ radiusM: 0.5, heightM: 1.8,
  provenance: { profileId: id, source: "fighter-bind-geometry", measuredAt: "fixture bind AABB" } });
const carrier = (x, id) => new VirtualLocomotionCarrier({ position: { x, y: 0.9, z: 0 }, yaw: 0 }, footprint(id),
  { maxSpeedMps: 1, maxAccelerationMps2: 10, maxYawSpeedRadS: 2, maxYawAccelerationRadS2: 20 }, new Set([`${id}.root`]));
const STOP = { localForward: 0, localRight: 0, yaw: 0 };

test("a carrier's slide moves it apart from its gait, a wall stops it, the feet brake it and a reset ends it", () => {
  const free = carrier(0, "free");
  free.slideBy(2, 0);
  const moved = free.propose(STOP, 0.1);
  assert.equal(moved.displacement.x, 0.2, "a 2 m/s slide moves an idle carrier 0.2 m in 0.1 s");
  free.commit(moved, moved.displacement);
  assert.equal(free.state.x, 0.2);
  assert.equal(free.state.velocityX, 0, "and is no part of its gait");
  // Walking one way while slid the other: the move nets to nothing along x, which must not read as a
  // blocked gait.
  const walker = carrier(0, "walker");
  walker.slideBy(-1, 0);
  let proposal = walker.propose({ localForward: 0, localRight: 1, yaw: 0 }, 1);
  walker.commit(proposal, proposal.displacement);
  assert.equal(walker.state.velocityX, 1, "the gait keeps its velocity under a slide that cancels it");
  // Half the move allowed, half the slide kept.
  const walled = carrier(0, "walled");
  walled.slideBy(2, 0);
  proposal = walled.propose(STOP, 0.1);
  walled.commit(proposal, { x: 0.1, z: 0, yaw: 0 });
  assert.equal(walled.slide.x, 1, "a wall that stops half the slide's move stops half the slide");
  walled.brakeSlide(0.4);
  assert.ok(Math.abs(walled.slide.x - 0.6) < 1e-12, "the feet take speed off it");
  walled.brakeSlide(5);
  assert.equal(walled.slide.x, 0, "and never reverse it");
  walled.slideBy(1, 1);
  walled.reset({ x: 0, y: 0.9, z: 0 });
  assert.deepEqual(walled.slide, { x: 0, z: 0 }, "a reset stops it");
});

test("where two footprints meet the pair resolver says along what and how hard each was closing", () => {
  const registry = new StandableWorldRegistry();
  const left = carrier(-0.52, "left");
  const right = carrier(0.52, "right");
  const walking = resolveCarrierPair(left.propose({ localForward: 0, localRight: 1, yaw: 0 }, 0.1),
    right.propose(STOP, 0.1), registry);
  assert.ok(walking.contact, "they met");
  assert.ok(Math.abs(walking.contact.nx - 1) < 1e-12 && Math.abs(walking.contact.nz) < 1e-12);
  assert.ok(walking.contact.leftClosing > 0 && walking.contact.rightClosing === 0);
  const apart = resolveCarrierPair(carrier(-3, "a").propose(STOP, 0.1), carrier(3, "b").propose(STOP, 0.1), registry);
  assert.equal(apart.contact, null, "the control: two bodies apart meet nowhere");
});

/** Two golems facing each other `gap` metres apart, stepped together as `stepPair` steps a bout. */
async function pair({ left = defaultGolemSetup(), right = defaultGolemSetup(), gap = 6, leftMind = idleMind() } = {}) {
  const arena = await createHeadlessArena();
  const world = flatSupportedWorldRegistry();
  const bodies = [left, right].map((setup, i) => new Golem(arena.scene, {
    side: i === 0 ? "left" : "right", origin: new Vector3(0, 0, i * gap), facing: i * Math.PI,
    setup, mind: i === 0 ? leftMind : idleMind(), controlPolicies: [], locomotionWorld: world,
  }));
  let clock = 0;
  arena.scene.onBeforePhysicsObservable.add(() => { stepPair(bodies[0], bodies[1], FIXED, clock); clock += FIXED; });
  const run = (seconds) => {
    const end = clock + seconds;
    while (clock < end) { arena.scene._renderId += 1; arena.scene._advancePhysicsEngineStep(1000 / 60); }
  };
  const dispose = () => { for (const body of bodies) body.dispose(); arena.dispose?.(); };
  return { bodies, run, dispose };
}

test("a standing body held up past its weight is lifted off its feet, and one held just under it is not", async () => {
  // A press from a body of the same weight is capped at exactly this one's, and a rounding past it is
  // not a lift.
  for (const [share, lifted] of [[1.01, true], [0.99, false], [1 + 1e-12, false]]) {
    const { bodies: [golem], run, dispose } = await pair();
    try {
      run(1);
      assert.equal(golem.locomotion.state, "supported", "it stood");
      const weightN = golem.locomotion.contactPress().weightN;
      golem.press.sample = () => ({ liftN: weightN * share, pushX: 0, pushZ: 0 });
      run(0.1);
      const { state } = golem.locomotion;
      const reason = golem.locomotion.diagnostic().releaseReason;
      if (lifted) {
        assert.equal(state, "fallen", `held up at ${share} W it fell`);
        assert.equal(reason, "lifted by contact");
        assert.equal(golem.locomotion.contactPress().lifts, 1, "once, on the edge");
      } else {
        assert.equal(state, "supported", `held up at ${share} W it stood`);
        assert.equal(golem.locomotion.contactPress().lifts, 0);
      }
    } finally {
      dispose();
    }
  }
});

/**
 * Walked into by a body of the same weight, an idle body stays where it stood; walked into by one
 * twice as heavy, it is shoved back, and when the heavy one stops its feet brake the slide. The walker
 * starts a metre and a half away, so the footprints meet within the first half second. The pushed
 * body's own press reads nothing here, so what moves it is the trunk alone, through the pair resolver:
 * an arm's press is the first test's subject.
 */
test("a body walking into one of its own weight never pushes it, and one twice as heavy does", async () => {
  let walking = true;
  const walker = { name: "walks", decide: () => ({ ...freshIntent(), forward: walking ? 1 : 0 }) };
  const heavy = withAttributeSetting(defaultGolemSetup(), { weight: 2 });
  const results = {};
  for (const [name, left] of [["equal", defaultGolemSetup()], ["heavy", heavy]]) {
    walking = true;
    const { bodies: [pusher, pushed], run, dispose } = await pair({ left, gap: 1.5, leftMind: walker });
    try {
      pushed.press.sample = () => NO_PRESS;
      const start = pushed.locomotion.carrierGround().z;
      run(3);
      const slideMps = pushed.locomotion.contactPress().slideMps;
      walking = false;
      run(1.5);
      results[name] = { moved: pushed.locomotion.carrierGround().z - start,
        pushedS: pushed.locomotion.contactPress().pushedS, slideMps,
        stoppedMps: pushed.locomotion.contactPress().slideMps,
        resistance: [pusher, pushed].map((body) => body.locomotion.proposal(FIXED).resistance),
        massKg: [pusher, pushed].map((body) => body.locomotion.supportedMassKg) };
    } finally {
      dispose();
    }
  }
  assert.equal(results.equal.pushedS, 0, "an equal body never pushes past the grip");
  assert.ok(Math.abs(results.equal.moved) < 0.01, `the idle body stood its ground (${results.equal.moved.toFixed(4)} m)`);
  assert.ok(results.heavy.pushedS > 0, "a body twice as heavy pushes past the grip");
  assert.ok(results.heavy.moved > 0.2, `and shoves the idle body back (${results.heavy.moved.toFixed(3)} m)`);
  assert.ok(results.heavy.slideMps > 0.05, `sliding it while it walks (${results.heavy.slideMps.toFixed(3)} m/s)`);
  assert.equal(results.heavy.stoppedMps, 0, "and the pushed body's feet stop the slide once it stops");
  // Each carrier resists the other with its own mass, so a light body walking into a heavy one is the
  // one stopped (`resolveCarrierPair`).
  assert.deepEqual(results.heavy.resistance, results.heavy.massKg, "a carrier resists with its mass");
  assert.ok(results.heavy.massKg[0] > 1.5 * results.heavy.massKg[1], "and the heavy one's is the larger");
});

test("a contact the press is reading is not filed a second time as a blow", async () => {
  const { bodies: [golem, other], run, dispose } = await pair();
  try {
    run(1);
    const [struck] = golem.limbs.map((limb) => limb.part.body);
    const [striker] = other.limbs.map((limb) => limb.part.body);
    const ledger = () => golem.locomotion.diagnostic().stability.specificImpulseMps;
    const shove = { horizontalShoveNs: [40, 0] };
    const filed = (pressing, bodies) => {
      golem.press.pressing = () => pressing;
      const before = ledger();
      golem.queueStabilityEvent(shove, ...bodies);
      run(FIXED);
      return ledger() - before;
    };
    assert.ok(filed(false, [struck, striker]) > 0, "the control: a blow is filed");
    assert.ok(filed(true, []) > 0, "and so is one that names no contact");
    const pressed = filed(true, [struck, striker]);
    assert.ok(pressed <= 0, `a press is not (${pressed})`);
  } finally {
    dispose();
  }
});
