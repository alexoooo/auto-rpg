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

/**
 * **A walker follows a body that gives way** (physical contact session 10). The resolver takes away
 * only what would still overlap at the end of the step, so a walker behind a body being driven off
 * keeps up with it. Taking its whole closing move stopped it where they touched, which left a gap, so
 * every sustained push ran one step on and one step off and the feet braked the driven body between.
 */
test("a walker touching a body that is moving off follows it, and is stopped by one standing still", () => {
  const registry = new StandableWorldRegistry();
  const walk = { localForward: 0, localRight: 1, yaw: 0 };
  const receding = carrier(0.52, "right");
  receding.slideBy(0.5, 0);
  const following = resolveCarrierPair(carrier(-0.52, "left").propose(walk, 0.1), receding.propose(STOP, 0.1), registry);
  const standing = resolveCarrierPair(carrier(-0.52, "left").propose(walk, 0.1), carrier(0.52, "right").propose(STOP, 0.1), registry);
  assert.ok(following.contact && standing.contact, "they meet");
  assert.ok(standing.left.x < 0.1 - 1e-6, `the control: one standing still stops it short of its 0.1 m (${standing.left.x})`);
  assert.ok(Math.abs(following.left.x - standing.left.x - 0.05) < 1e-9,
    `the walker keeps up with the 0.05 m the other gave way (${following.left.x} against ${standing.left.x})`);
  assert.ok(Math.abs(following.right.x - 0.05) < 1e-9, "and the body giving way is not held back");
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
 * **Walked into, a body stands, gives ground, or is tipped** (physical contact session 10). A walker
 * pushes with no more than its grip and its own balance hold, and the other stands against it with its
 * lean over its whole base; what is past that drives it back, and what drives it faster than its legs
 * can follow tips it. So of one weight the push holds; a tenth heavier and twice as heavy, the walker
 * walks the idle body back, further the heavier it is; and a giant, twice the weight and a quarter the
 * size again, outruns its legs and puts it down. Nothing is special at one weight.
 *
 * The giant fells a body of half the stability, on the first contact and within a few centimetres of
 * where it stood. **What the giant felled here before 2026-09-25 was a post.** A default body backs
 * away at the giant's pace once the contact's acceleration is spent. The outrun rule files only the
 * part of a push past what the legs can accelerate, so a steady push files nothing. Measured (Node,
 * this test's own pair), such a body went down 8.08 m from where it stood, 2.90 s in, against the
 * headless arena's ring of posts at 9.5 m, at `LOCOMOTION_BIPED.targetRate` 10.5. At 11.5 it went
 * down at 8.11 m, by "supported posture was lost". At 11.0 it was still standing at 8.48 m when the
 * three seconds ran out. A giant at movement x1.5 does no better: it drives it 8 m and more. With
 * stability x0.5 it goes down at 0.47 s and 0.09 m at both rates, which is the rule acting in open
 * ground. With the outrun filing in `readContact` switched off, that body stands, so the case is
 * about the rule. The distance guard is what stops a post from passing this again.
 *
 * The walker starts a
 * metre and a half away (the giant 1.8), so the footprints meet within the first half second, files
 * the push's reaction to its own ledger as a held force, and never tips on it. The filing is counted
 * at the call, because a push the walker holds leaves its ledger at zero. Reading the ledger for it
 * once passed on the residue one step left there (2026-09-25 rate falls). The pushed body's own press
 * reads nothing here, so what moves it is the trunk alone, through the pair resolver: an arm's press
 * is the first test's subject.
 */
test("a body walked into stands against one weight, is walked back by a heavier one and felled by a giant", async () => {
  let walking = true;
  const walker = { name: "walks", decide: () => ({ ...freshIntent(), forward: walking ? 1 : 0 }) };
  const results = {};
  for (const [name, attributes, gap] of [["equal", {}, 1.5], ["heavier", { weight: 1.1 }, 1.5],
    ["heavy", { weight: 2 }, 1.5], ["giant", { size: 1.25, weight: 2 }, 1.8]]) {
    walking = true;
    const left = withAttributeSetting(defaultGolemSetup(), attributes);
    const right = withAttributeSetting(defaultGolemSetup(), name === "giant" ? { stability: 0.5 } : {});
    const { bodies: [pusher, pushed], run, dispose } = await pair({ left, right, gap, leftMind: walker });
    try {
      pushed.press.sample = () => NO_PRESS;
      const start = pushed.locomotion.carrierGround().z;
      let fell = false, walkerFell = false, movedStanding = 0;
      const filed = { held: 0, struck: 0 };
      const staged = pusher.locomotion.staged;
      const queue = staged.queueStabilityEvent;
      staged.queueStabilityEvent = function (event) {
        filed[event.sustained ? "held" : "struck"] += 1;
        return queue.call(this, event);
      };
      for (let t = 0; t < 3; t += 1 / 60) {
        run(1 / 60);
        if (!fell && pushed.locomotion.state === "fallen") {
          fell = true;
          assert.equal(pushed.locomotion.diagnostic().releaseReason, "stability threshold was exceeded",
            `${name}: it was tipped over, not lifted`);
        }
        if (!fell) movedStanding = pushed.locomotion.carrierGround().z - start;
        walkerFell ||= pusher.locomotion.state === "fallen";
      }
      walking = false;
      run(1.5);
      results[name] = { fell, movedStanding, walkerFell, filed,
        stoppedMps: pushed.locomotion.contactPress().slideMps,
        resistance: [pusher, pushed].map((body) => body.locomotion.proposal(FIXED).resistance),
        massKg: [pusher, pushed].map((body) => body.locomotion.supportedMassKg) };
    } finally {
      dispose();
    }
  }
  const { equal, heavier, heavy, giant } = results;
  assert.equal(equal.fell, false, "a body of one weight stands against the push");
  assert.ok(Math.abs(equal.movedStanding) < 0.05, `and all but holds its ground (${equal.movedStanding.toFixed(4)} m)`);
  assert.equal(heavier.fell, false, "a tenth heavier does not tip it");
  assert.ok(heavier.movedStanding > 0.3, `it walks it back (${heavier.movedStanding.toFixed(3)} m)`);
  assert.equal(heavy.fell, false, "twice as heavy does not tip it either");
  assert.ok(heavy.movedStanding > 3 * heavier.movedStanding,
    `and walks it back further (${heavy.movedStanding.toFixed(3)} m)`);
  assert.equal(heavy.stoppedMps, 0, "and the pushed body's feet stop the slide once it stops");
  assert.equal(giant.fell, true, "a giant drives it faster than its legs can follow, and tips it");
  assert.ok(giant.movedStanding < 1, `in open ground, not against a post (${giant.movedStanding.toFixed(3)} m)`);
  for (const [name, result] of Object.entries(results)) {
    assert.ok(result.filed.held > 0, `${name}: the walker files the push's reaction`);
    assert.equal(result.filed.struck, 0, `${name}: as a held force, not as blows`);
    assert.equal(result.walkerFell, false, `${name}: and never pushes past its own balance`);
  }
  // Each carrier resists the other with its own mass, so a light body walking into a heavy one is the
  // one stopped (`resolveCarrierPair`).
  assert.deepEqual(heavy.resistance, heavy.massKg, "a carrier resists with its mass");
  assert.ok(heavy.massKg[0] > 1.5 * heavy.massKg[1], "and the heavy one's is the larger");
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
