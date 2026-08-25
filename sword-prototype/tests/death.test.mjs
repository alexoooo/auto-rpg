import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import {
  PhysicsMotionType,
  PhysicsConstraintAxis,
  PhysicsEventType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import HavokPhysics from "@babylonjs/havok";

import { CONFIG } from "../src/config.ts";
import { attachPhysics } from "../src/physics.ts";
import { Fighter } from "../src/fighter.ts";
import { Combat } from "../src/combat.ts";
import { Blood } from "../src/blood.ts";
import { idleMind } from "../src/mind.ts";
import { beaten, begin, defaultMatchup, selectScreen } from "../src/bout.ts";
import { blankIntent } from "../src/policies.ts";
import { advanceFight, FightEnd } from "../src/fight-end.ts";
import { researchLabelMind } from "../src/learning/research-policy.ts";

/**
 * What losing your head costs.
 *
 * `bout.ts` has named the head in `beaten()` since it was written, and for a
 * long time that was the *only* consequence: the banner changed and the body
 * went on walking, turning, aiming and swinging with a stump for a neck.
 * `Phase`'s docstring is explicit that a decided bout deliberately does not stop
 * the world, so nothing else was ever going to notice.
 *
 * Each consequence is asserted on its own, because they fail on their own. The
 * mind going quiet is the one that matters most, and the one a screenshot
 * cannot show you.
 *
 * Real solver, for the same reason `view.test.mjs` uses one: the interesting
 * claims here are about motion types and joint ceilings, which are native
 * objects. Havok's wasm has to be handed over as bytes -- its emscripten glue
 * calls `fetch()` and Node cannot fetch a `file://` URL.
 */

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const FIXED = 1 / CONFIG.world.physicsHz;

/** A mind that answers neutrally and counts how many times it was asked. */
function counter() {
  const intent = blankIntent();
  let asked = 0;
  return {
    name: "counter",
    decide: () => {
      asked += 1;
      return intent;
    },
    get asked() {
      return asked;
    },
  };
}

async function ring(leftMind = null, leftLoadout = undefined) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  scene.getPhysicsEngine().setSubTimeStep(1000 / CONFIG.world.physicsHz);

  const mat = (name) => new StandardMaterial(name, scene);
  const materials = {
    flesh: mat("flesh"), cloth: mat("cloth"), steel: mat("steel"),
    leather: mat("leather"), brass: mat("brass"), hide: mat("hide"),
    wood: mat("wood"), arrowAccent: mat("arrow-accent"),
  };

  const mind = leftMind ?? counter();
  const left = new Fighter(scene, {
    side: "left", origin: Vector3.Zero(), facing: 0, mind, loadout: leftLoadout,
  }, materials);
  const right = new Fighter(scene, {
    side: "right", origin: new Vector3(0, 0, CONFIG.fighter.separation),
    facing: Math.PI, mind: idleMind(),
  }, materials);

  return { engine, scene, left, right, mind };
}

function frame(scene, left, right, clock) {
  scene._renderId += 1;
  const observer = scene.onBeforePhysicsObservable.add(() => {
    left.observe(right, clock.now);
    right.observe(left, clock.now);
    left.update(FIXED);
    right.update(FIXED);
    clock.now += FIXED;
  });
  scene._advancePhysicsEngineStep(1000 / 60);
  scene.onBeforePhysicsObservable.remove(observer);
}

const limbOf = (fighter, key) => fighter.limbs.find((limb) => limb.key === key);

const waistReading = (fighter) => {
  const B = CONFIG.body;
  const relative = fighter.pelvis.mesh.rotationQuaternion
    .conjugate()
    .multiply(fighter.torso.mesh.rotationQuaternion)
    .toEulerAngles();
  const parent = new Vector3(0, B.waist - B.pelvisCentre, 0)
    .rotateByQuaternionToRef(fighter.pelvis.mesh.rotationQuaternion, new Vector3())
    .addInPlace(fighter.pelvis.mesh.position);
  const child = new Vector3(0, B.waist - B.torsoCentre, 0)
    .rotateByQuaternionToRef(fighter.torso.mesh.rotationQuaternion, new Vector3())
    .addInPlace(fighter.torso.mesh.position);
  return { relative, error: Vector3.Distance(parent, child) };
};

test("a fighter is alive until its head comes off", async (t) => {
  const { engine, left, right } = await ring();
  t.after(() => engine.dispose());

  assert.equal(left.alive, true);
  assert.equal(right.alive, true);

  // An arm off is a fighter with a problem, not a dead one. This is the
  // distinction `armLost` and `dead` exist to keep apart.
  left.sever(limbOf(left, "upperArm"), new Vector3(1, 0, 0));
  assert.equal(left.armed, false, "the arm is off");
  assert.equal(left.alive, true, "but a one-armed fighter is not a dead one");
});

test("losing a head stops the mind being asked at all", async (t) => {
  const { engine, scene, left, right, mind } = await ring();
  t.after(() => engine.dispose());

  const clock = { now: 0 };
  for (let i = 0; i < 20; i += 1) frame(scene, left, right, clock);

  const asked = mind.asked;
  assert.ok(asked > 0, "the mind was driving before the blow");

  left.sever(limbOf(left, "head"), new Vector3(0, 1, 0));
  assert.equal(left.alive, false);

  for (let i = 0; i < 20; i += 1) frame(scene, left, right, clock);
  assert.equal(mind.asked, asked, "a dead fighter is never asked what it wants");
});

test("a dead fighter stops being keyframed and falls", async (t) => {
  const { engine, scene, left, right } = await ring();
  t.after(() => engine.dispose());

  const clock = { now: 0 };
  for (let i = 0; i < 20; i += 1) frame(scene, left, right, clock);

  assert.equal(
    left.pelvis.body.getMotionType(),
    PhysicsMotionType.ANIMATED,
    "a living pelvis goes exactly where it is steered",
  );
  const standing = left.torso.mesh.position.y;

  left.sever(limbOf(left, "head"), new Vector3(0, 1, 0));

  assert.equal(
    left.pelvis.body.getMotionType(),
    PhysicsMotionType.DYNAMIC,
    "a dead one is let go of",
  );

  for (let i = 0; i < 90; i += 1) frame(scene, left, right, clock);

  assert.ok(
    left.torso.mesh.position.y < standing - 0.2,
    `the body should be on its way down: ${standing.toFixed(3)} -> ` +
      `${left.torso.mesh.position.y.toFixed(3)} m`,
  );
});

test("a_twisted_living_waist_remains_constrained_and_a_dead_one_still_falls", async (t) => {
  const { engine, scene, left, right } = await ring();
  t.after(() => engine.dispose());
  const intent = blankIntent();
  intent.posture.trunkTwist = 1;
  left.mind = { name: "twisted", decide: () => intent };
  const clock = { now: 0 };
  for (let i = 0; i < 120; i += 1) frame(scene, left, right, clock);

  const waist = limbOf(left, "pelvis").attachment;
  assert.equal(left.pelvis.body.getMotionType(), PhysicsMotionType.ANIMATED,
    "the living pelvis is the planted locomotion root");
  assert.ok(waist.getAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_Y) > 0,
    "the living waist is motor constrained while twisted");
  const achieved = waistReading(left);
  assert.ok(achieved.relative.y > CONFIG.body.trunkTwistMax * 0.70,
    `requested +${CONFIG.body.trunkTwistMax} rad, achieved ${achieved.relative.y.toFixed(3)}`);
  assert.ok(achieved.error < 0.006,
    `the articulated waist anchors separated ${(achieved.error * 1000).toFixed(2)} mm`);
  const standing = left.torso.mesh.position.y;

  left.sever(limbOf(left, "head"), new Vector3(0, 1, 0));
  assert.equal(left.pelvis.body.getMotionType(), PhysicsMotionType.DYNAMIC,
    "death releases the locomotion root");
  for (let i = 0; i < 90; i += 1) frame(scene, left, right, clock);
  assert.ok(left.torso.mesh.position.y < standing - 0.2,
    `the twisted corpse should fall: ${standing.toFixed(3)} -> ${left.torso.mesh.position.y.toFixed(3)} m`);
});

test("a corpse's joints go slack, but not to nothing", async (t) => {
  const { engine, left } = await ring();
  t.after(() => engine.dispose());

  // The waist, which is the joint the whole upper body hangs its weight on and
  // the one a stiff corpse reads worst at.
  const waist = limbOf(left, "pelvis").attachment;
  const axis = PhysicsConstraintAxis.ANGULAR_X;
  const living = waist.getAxisMotorMaxForce(axis);
  assert.equal(living, CONFIG.body.trunkMotorForce);

  left.sever(limbOf(left, "head"), new Vector3(0, 1, 0));

  const dead = waist.getAxisMotorMaxForce(axis);
  assert.ok(dead < living, `the waist should give: ${living} -> ${dead} N.m`);
  // Zero is the obvious first guess and it is wrong: a body with no torque
  // anywhere in it lands as a bag of capsules rather than as a person who has
  // just been killed. `config.ts` carries the argument.
  assert.ok(dead > 0, "a corpse has joints, it just has no strength in them");
});

test("the other fighter is untouched by it", async (t) => {
  const { engine, scene, left, right } = await ring();
  t.after(() => engine.dispose());

  const clock = { now: 0 };
  for (let i = 0; i < 20; i += 1) frame(scene, left, right, clock);

  left.sever(limbOf(left, "head"), new Vector3(0, 1, 0));
  for (let i = 0; i < 60; i += 1) frame(scene, left, right, clock);

  assert.equal(right.alive, true);
  assert.equal(right.armed, true);
  assert.equal(
    right.pelvis.body.getMotionType(),
    PhysicsMotionType.ANIMATED,
    "one death is not two",
  );
});

test("the body's own rule and the bout's rule agree about it", async (t) => {
  const { engine, left } = await ring();
  t.after(() => engine.dispose());

  assert.equal(beaten(left.limbs), false);
  left.sever(limbOf(left, "head"), new Vector3(0, 1, 0));

  // Two separate judgements of one event, deliberately kept apart: whether the
  // body is finished is the body's business, and whether the bout is finished is
  // `bout.ts`'s. They are asserted together here because the day they disagree
  // is the day a corpse wins a fight.
  assert.equal(left.alive, false);
  assert.equal(beaten(left.limbs), true);
});

test("a corpse can still be tuned", async (t) => {
  const { engine, scene, left, right } = await ring();
  t.after(() => engine.dispose());

  const clock = { now: 0 };
  for (let i = 0; i < 10; i += 1) frame(scene, left, right, clock);
  left.sever(limbOf(left, "head"), new Vector3(0, 1, 0));

  // `applyTuning` is the only path that pushes CONFIG into native solver
  // objects, and `die` goes through it rather than writing ceilings itself. The
  // test of that is that calling it again on a body already on the floor is
  // harmless -- and, in particular, does not touch the two constraints `dropArm`
  // has already disposed.
  assert.doesNotThrow(() => left.applyTuning());
  for (let i = 0; i < 10; i += 1) frame(scene, left, right, clock);
  assert.equal(left.alive, false);
});

test("the_winning_mind_is_not_asked_again_after_the_verdict", async (t) => {
  const { engine, scene, left, right, mind } = await ring();
  t.after(() => engine.dispose());

  const clock = { now: 0 };
  for (let i = 0; i < 10; i += 1) frame(scene, left, right, clock);
  const asked = mind.asked;
  left.stopFighting();
  for (let i = 0; i < 10; i += 1) frame(scene, left, right, clock);

  assert.equal(left.alive, true, "the winner is not killed");
  assert.equal(mind.asked, asked, "a verdict revokes the winning mind's authority");
  assert.equal(left.pelvis.body.getLinearVelocity().length(), 0,
    "and leaves no locomotion command running");
  assert.equal(left.pelvis.body.getAngularVelocity().length(), 0,
    "and leaves no turning command running");
});

/**
 * The only test that the host revokes a *learned* mind, rather than a scripted
 * one, at the verdict edge.
 *
 * Its vehicle used to be `networkMetaMind`, and it counted calls into the
 * network rather than into the mind -- a proxy, because that controller re-ran
 * its network only at a decision boundary. Session 17 deleted that controller;
 * the surviving learned seam is `researchLabelMind`, and counting `decide`
 * itself is both the direct measurement and the stricter one. `atVerdict` is
 * asserted non-zero because "was never asked at all" satisfies the equality
 * below just as well as "was asked and then stopped".
 */
test("the_learned_policy_stops_on_the_bout_verdict", async (t) => {
  let asked = 0;
  const policy = researchLabelMind("neat-qd", () => ({ movement: "close", action: "cover", persistence: 0.10 }));
  const learned = { name: policy.name, decide(view, dt) { asked += 1; return policy.decide(view, dt); } };
  const { engine, scene, left, right } = await ring(learned);
  t.after(() => engine.dispose());
  const clock = { now: 0 };
  for (let i = 0; i < 10; i += 1) frame(scene, left, right, clock);
  const atVerdict = asked;
  assert.ok(atVerdict > 0, "the learned mind was driving the fighter before the verdict");
  left.stopFighting();
  for (let i = 0; i < 10; i += 1) frame(scene, left, right, clock);
  assert.equal(asked, atVerdict, "the host revokes the learned mind at the verdict edge");
});

test("a_surviving_torso_has_no_residual_turn_after_the_verdict", async (t) => {
  const { engine, scene, left, right } = await ring();
  t.after(() => engine.dispose());
  const intent = blankIntent();
  intent.posture.trunkLean = 0.7;
  intent.posture.trunkTwist = -0.8;
  intent.turn = 1;
  left.mind = { name: "turning winner", decide: () => intent };
  const clock = { now: 0 };
  for (let i = 0; i < 90; i += 1) frame(scene, left, right, clock);

  left.stopFighting();
  const stopped = left.torso.mesh.rotationQuaternion.clone();
  for (let i = 0; i < 20; i += 1) frame(scene, left, right, clock);

  assert.ok(left.torso.body.getAngularVelocity().length() < 0.03,
    `torso retained ${left.torso.body.getAngularVelocity().length().toFixed(4)} rad/s`);
  assert.ok(1 - Math.abs(Quaternion.Dot(stopped, left.torso.mesh.rotationQuaternion)) < 0.002,
    "the winner should hold its achieved waist pose after combat authority ends");
});

test("a_surviving_archers_both_hand_anchors_stop_on_the_verdict_step", async (t) => {
  const intent = blankIntent();
  intent.primary.pointerX = 0.8;
  intent.primary.pointerY = 0.7;
  intent.secondary.pointerX = -0.7;
  intent.secondary.pointerY = 0.5;
  const { engine, scene, left, right } = await ring(
    { name: "moving archer", decide: () => intent },
    { primary: "bow", secondary: "empty" },
  );
  t.after(() => engine.dispose());
  const clock = { now: 0 };
  for (let i = 0; i < 90; i += 1) frame(scene, left, right, clock);
  left.stopFighting();
  const stopped = Object.fromEntries(["primary", "secondary"].map((name) => [name, {
    hand: left.arms[name].handAnchor.mesh.position.clone(),
    elbow: left.arms[name].elbowAnchor.mesh.rotationQuaternion.clone(),
  }]));
  for (let i = 0; i < 180; i += 1) frame(scene, left, right, clock);
  for (const name of ["primary", "secondary"]) {
    assert.ok(Vector3.Distance(stopped[name].hand, left.arms[name].handAnchor.mesh.position) < 0.002,
      `${name} hand anchor remained stationary`);
    assert.ok(1 - Math.abs(Quaternion.Dot(stopped[name].elbow,
      left.arms[name].elbowAnchor.mesh.rotationQuaternion)) < 0.002,
    `${name} elbow anchor remained stationary`);
  }
});

test("a_bow_held_at_the_verdict_cannot_loose_afterward", async (t) => {
  const intent = blankIntent();
  intent.primary.thrust = true;
  const { engine, scene, left, right } = await ring(
    { name: "draw", decide: () => intent },
    { primary: "bow", secondary: "empty" },
  );
  t.after(() => engine.dispose());
  const clock = { now: 0 };
  for (let i = 0; i < 90; i += 1) frame(scene, left, right, clock);
  left.stopFighting();
  intent.primary.thrust = false;
  for (let i = 0; i < 30; i += 1) frame(scene, left, right, clock);
  assert.equal(left.arms.primary.quiver.flying, 0);
});

test("stopping_a_survivor_twice_is_harmless", async (t) => {
  const { engine, left } = await ring();
  t.after(() => engine.dispose());
  assert.doesNotThrow(() => { left.stopFighting(); left.stopFighting(); });
  assert.equal(left.alive, true);
});

test("the_fight_to_over_edge_revokes_both_sides_once_and_rebuild_starts_active", async (t) => {
  const first = await ring();
  const second = await ring();
  t.after(() => first.engine.dispose());
  t.after(() => second.engine.dispose());

  const firstRightMind = counter();
  first.right.mind = firstRightMind;
  const clock = { now: 0 };
  for (let i = 0; i < 10; i += 1) frame(first.scene, first.left, first.right, clock);
  const asked = [first.mind.asked, firstRightMind.asked];

  const stops = [0, 0];
  const ending = new FightEnd([
    {
      fighter: first.left,
      combat: { stop: () => { stops[0] += 1; } },
    },
    {
      fighter: first.right,
      combat: { stop: () => { stops[1] += 1; } },
    },
  ]);
  assert.equal(ending.isActive, true);
  let state = begin(selectScreen(defaultMatchup()), defaultMatchup());
  limbOf(first.right, "torso").health = 0;
  const boutRing = {
    left: { parts: first.left.limbs, lastBlow: null },
    right: { parts: first.right.limbs, lastBlow: null },
  };
  state = advanceFight(state, boutRing, FIXED, ending);
  assert.equal(state.phase, "over", "the real bout rule delivered the verdict edge");
  assert.equal(ending.transition("fight", "over"), false,
    "even a repeated edge delivery cannot revoke the bout twice");
  assert.deepEqual(stops, [1, 1], "both scoring authorities stop exactly once");

  for (let i = 0; i < 10; i += 1) frame(first.scene, first.left, first.right, clock);
  assert.deepEqual([first.mind.asked, firstRightMind.asked], asked,
    "neither mind retains authority after the verdict");

  const rebuiltStops = [0, 0];
  const rebuilt = new FightEnd([
    { fighter: second.left, combat: { stop: () => { rebuiltStops[0] += 1; } } },
    { fighter: second.right, combat: { stop: () => { rebuiltStops[1] += 1; } } },
  ]);
  assert.equal(rebuilt.isActive, true, "a rebuilt bout does not inherit the old verdict latch");
  const freshState = begin(selectScreen(defaultMatchup()), defaultMatchup());
  const freshRing = {
    left: { parts: second.left.limbs, lastBlow: null },
    right: { parts: second.right.limbs, lastBlow: null },
  };
  assert.equal(advanceFight(freshState, freshRing, FIXED, rebuilt).phase, "fight");
  assert.deepEqual(rebuiltStops, [0, 0], "fresh combat remains active until its own verdict");
});

test("contacts_after_the_verdict_cannot_change_health_or_sever_a_limb", () => {
  let contact;
  const weapon = {
    kind: "sword",
    spent: false,
    body: {
      getCollisionObservable: () => ({
        add: (callback) => { contact = callback; return {}; },
        remove: () => {},
      }),
    },
    velocityAt: () => new Vector3(20, 0, 0),
    edgeDirection: () => new Vector3(1, 0, 0),
    bladeDirection: () => new Vector3(0, 0, 1),
    tipPosition: () => new Vector3(2, 0, 0),
  };
  const limb = {
    key: "forearm", label: "Sword forearm", health: 5, maxHealth: 100,
    severed: false, lastHitAt: -999,
    part: { body: { applyImpulse: () => {} } },
  };
  let severs = 0;
  const target = {
    limbFor: () => limb,
    parriedBy: () => null,
    sever: () => { severs += 1; },
  };
  const combat = new Combat("left", [weapon]);
  combat.attach(target);
  combat.stop();
  contact({
    type: PhysicsEventType.COLLISION_STARTED,
    point: Vector3.Zero(),
    impulse: 10,
    collidedAgainst: {},
  });

  assert.equal(limb.health, 5);
  assert.equal(severs, 0);
  assert.equal(combat.lastHit, null);
});

test("a_loser_still_falls_and_blood_still_ages_after_combat_stops", async (t) => {
  const { engine, scene, left, right } = await ring();
  t.after(() => engine.dispose());
  const blood = new Blood(scene, { dispose: () => {} });
  t.after(() => blood.dispose());

  const clock = { now: 0 };
  for (let i = 0; i < 20; i += 1) frame(scene, left, right, clock);
  const standing = left.torso.mesh.position.y;
  limbOf(left, "torso").health = 0;
  blood.spray(left.torso.mesh.position, Vector3.Up(), CONFIG.blood.fullSpray);
  assert.equal(blood.count, 1);

  left.stopFighting();
  right.stopFighting();
  assert.equal(left.pelvis.body.getMotionType(), PhysicsMotionType.DYNAMIC);
  for (let i = 0; i < 90; i += 1) frame(scene, left, right, clock);
  blood.update(CONFIG.blood.sprayLife + 1);

  assert.ok(left.torso.mesh.position.y < standing - 0.2);
  assert.equal(blood.count, 0, "combat stopping does not pause cosmetic time");
});
