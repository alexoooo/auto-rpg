import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import {
  PhysicsMotionType,
  PhysicsConstraintAxis,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import HavokPhysics from "@babylonjs/havok";

import { CONFIG } from "../src/config.ts";
import { attachPhysics } from "../src/physics.ts";
import { Fighter } from "../src/fighter.ts";
import { idleMind } from "../src/mind.ts";
import { beaten } from "../src/bout.ts";
import { blankIntent } from "../src/policies.ts";

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

async function ring() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  scene.getPhysicsEngine().setSubTimeStep(1000 / CONFIG.world.physicsHz);

  const mat = (name) => new StandardMaterial(name, scene);
  const materials = {
    flesh: mat("flesh"), cloth: mat("cloth"), steel: mat("steel"),
    leather: mat("leather"), brass: mat("brass"), hide: mat("hide"),
    wood: mat("wood"),
  };

  const mind = counter();
  const left = new Fighter(scene, {
    side: "left", origin: Vector3.Zero(), facing: 0, mind,
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
    left.torso.body.getMotionType(),
    PhysicsMotionType.ANIMATED,
    "a living torso goes exactly where it is steered",
  );
  const standing = left.torso.mesh.position.y;

  left.sever(limbOf(left, "head"), new Vector3(0, 1, 0));

  assert.equal(
    left.torso.body.getMotionType(),
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

test("a corpse's joints go slack, but not to nothing", async (t) => {
  const { engine, left } = await ring();
  t.after(() => engine.dispose());

  // The waist, which is the joint the whole upper body hangs its weight on and
  // the one a stiff corpse reads worst at.
  const waist = limbOf(left, "pelvis").attachment;
  const axis = PhysicsConstraintAxis.ANGULAR_X;
  const living = waist.getAxisMotorMaxForce(axis);
  assert.equal(living, CONFIG.body.jointStiffness * CONFIG.body.waistStrength);

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
    right.torso.body.getMotionType(),
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
