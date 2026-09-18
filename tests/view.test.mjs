import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import HavokPhysics from "@babylonjs/havok";

import { CONFIG } from "../src/config.ts";
import { attachPhysics } from "../src/physics.ts";
import { armForLimbKey, Fighter, legPose, stepPair } from "../src/fighter.ts";
import { idleMind } from "../src/mind.ts";
import { blankIntent } from "../src/policies.ts";
import { BODY_FIELDS, HAND_FIELDS, PROJECTILE_FIELDS, VIEW_FIELDS } from "./fixtures/view.mjs";

/**
 * The one test in this directory that runs the real solver.
 *
 * It exists because of a defect that no amount of reading could have settled and
 * that cost a session: `Fighter.observe` used to read the world through
 * `getWorldMatrix()` and `absolutePosition`, both of which **stamp the scene's
 * render id on the node as a side effect**. The arm was completely unaffected --
 * it reads through the same cache and got the same matrix it always had -- but
 * every later reader in that frame, including a person measuring from the
 * console, was silently converted from a fresh sample to one up to three
 * substeps old. The standard sweep came back at 273.84 mm of peak anchor-to-hand
 * error against a true 242.88, and it read exactly like a nine per cent
 * regression in the weapon.
 *
 * So: a mind may look at the world, and looking must leave no trace. That is not
 * a property any pure test can check, because the trace is in Babylon's cache
 * and the damage is to whoever reads next. It needs a real scene, so here is
 * one -- about two seconds, and worth every one of them.
 *
 * Babylon and Havok both run headless under plain Node. Havok's wasm has to be
 * handed over as bytes: its emscripten glue calls `fetch()`, and Node cannot
 * fetch a `file://` URL, so `locateFile` does not save you.
 */

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const FIXED = 1 / CONFIG.world.physicsHz;

test("all_six_arm_limb_keys_map_to_the_arm_they_can_drop", () => {
  assert.deepEqual(
    ["upperArm", "forearm", "hand", "offUpperArm", "offForearm", "offHand"]
      .map((key) => [key, armForLimbKey(key)]),
    [
      ["upperArm", "primary"], ["forearm", "primary"], ["hand", "primary"],
      ["offUpperArm", "secondary"], ["offForearm", "secondary"], ["offHand", "secondary"],
    ],
  );
  assert.equal(armForLimbKey("torso"), undefined);
});

async function ring(loadout = undefined, rightLoadout = undefined) {
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

  // Built from the real `blankIntent` rather than from a literal of its own.
  // Four test files used to carry their own copies of that shape, all plain JS
  // and all untyped, and every one of them went on compiling and started handing
  // `undefined` to an arm the day the intent grew a second hand.
  const busy = (pointerX) => {
    const intent = blankIntent();
    intent.forward = 1;
    intent.strafe = 0.3;
    intent.turn = 0.4;
    for (const hand of [intent.primary, intent.secondary]) {
      hand.pointerX = pointerX;
      hand.pointerY = -0.2;
      hand.roll = 0.5;
    }
    return { name: "busy", decide: () => intent };
  };

  const left = new Fighter(scene, {
    side: "left", origin: Vector3.Zero(), facing: 0, mind: busy(0.5), loadout,
  }, materials);
  const right = new Fighter(scene, {
    side: "right", origin: new Vector3(0, 0, CONFIG.fighter.separation),
    facing: Math.PI, mind: idleMind(), loadout: rightLoadout,
  }, materials);

  return { engine, scene, left, right };
}

/**
 * A frame of the page: the render id moves once, and the solver takes four
 * substeps inside it. That cadence is the whole mechanism -- with the id frozen,
 * as it is when nothing renders at all, the defect is invisible.
 */
function frame(scene, before) {
  scene._renderId += 1;
  const observer = before ? scene.onBeforePhysicsObservable.add(before) : null;
  scene._advancePhysicsEngineStep(1000 / 60);
  if (observer) scene.onBeforePhysicsObservable.remove(observer);
}

test("looking at the world leaves no trace on it", async (t) => {
  const { engine, scene, left, right } = await ring();
  t.after(() => engine.dispose());

  let clock = 0;
  const control = () => {
    clock += FIXED;
    stepPair(left, right, FIXED, clock);
  };

  // Get everything moving, so a stale sample and a fresh one are different
  // numbers. A settled arm would pass this test no matter how it was written.
  for (let i = 0; i < 90; i += 1) frame(scene, control);

  // One frame in which the *only* thing that looks at the world is `observe`,
  // and then the solver moves everything without the render id advancing --
  // which is precisely the substep-2-to-4 situation in the page.
  scene._renderId += 1;
  left.observe(right, clock);
  right.observe(left, clock);
  scene._advancePhysicsEngineStep(1000 / 60);

  // Nodes nothing else in the control loop reads, so `observe` is the only
  // candidate for having stamped them. `hand` in particular is the node the
  // anchor-to-hand error is measured against, and it is the one the defect was
  // found on.
  // Both hands of both fighters, because `describe` reads two arms now and the
  // second one is exactly as able to stamp a node as the first.
  for (const part of [
    left.hand,
    left.arms.secondary.hand,
    left.head,
    left.pelvis,
    right.hand,
    right.arms.secondary.hand,
  ]) {
    const lazy = part.mesh.absolutePosition.clone();
    part.mesh.computeWorldMatrix(true);
    const fresh = part.mesh.absolutePosition.clone();
    assert.ok(
      Vector3.Distance(lazy, fresh) < 1e-9,
      `${part.name}: an unforced read came back ${(Vector3.Distance(lazy, fresh) * 1000).toFixed(2)} mm ` +
        "stale, so something in observe() stamped the render id on it",
    );
  }

  // The blade too. `Sword.tipPosition` goes through the world matrix on purpose
  // -- the damage model is built on it and it is called once a frame -- so the
  // view has to use `tipPositionToRef`, and this is what says so.
  const lazyTip = left.sword.tipPosition().clone();
  left.sword.root.computeWorldMatrix(true);
  assert.ok(
    Vector3.Distance(lazyTip, left.sword.tipPosition()) < 1e-9,
    "the sword's world matrix was stamped by observe()",
  );
});

test("the view says the same thing the world matrix would have said", async (t) => {
  const { engine, scene, left, right } = await ring();
  t.after(() => engine.dispose());

  let clock = 0;
  let snap = null;

  const control = () => {
    clock += FIXED;
    left.observe(right, clock);
    right.observe(left, clock);
    if (clock > 0.35 && !snap) {
      // Taken in the same breath as the view, because the view is republished
      // every substep and the solver moves everything between them: comparing a
      // view from one substep against a matrix from another is worth a whole
      // substep of travel and reads exactly like a broken formula.
      left.torso.mesh.computeWorldMatrix(true);
      left.sword.root.computeWorldMatrix(true);
      const world = left.torso.mesh.getWorldMatrix();
      const F = CONFIG.fighter;
      const shoulderLocal = new Vector3(
        F.shoulderSide,
        F.shoulderHeight - CONFIG.body.torsoCentre,
        F.shoulderFront,
      );
      snap = {
        view: {
          facing: left.view.self.facing,
          shoulder: left.view.self.shoulder.clone(),
          tip: left.view.self.tip.clone(),
          tipSpeed: left.view.self.tipSpeed,
        },
        facing: Math.atan2(world.m[8], world.m[10]),
        shoulder: Vector3.TransformCoordinates(shoulderLocal, world),
        tip: left.sword.tipPosition().clone(),
        tipSpeed: left.sword.tipSpeed(),
      };
    }
    left.update(FIXED);
    right.update(FIXED);
  };

  for (let i = 0; i < 60; i += 1) frame(scene, control);

  assert.ok(snap, "the comparison was taken");
  // Turning and walking, so none of these is the identity case that would let a
  // wrong quaternion column through.
  assert.ok(Math.abs(snap.facing) > 0.05, `the fighter should have turned, facing ${snap.facing}`);
  assert.ok(snap.tipSpeed > 0.2, `the blade should be moving, ${snap.tipSpeed} m/s`);

  assert.ok(Math.abs(snap.view.facing - snap.facing) < 1e-6, "facing");
  assert.ok(Vector3.Distance(snap.view.shoulder, snap.shoulder) < 1e-6, "shoulder");
  assert.ok(Vector3.Distance(snap.view.tip, snap.tip) < 1e-6, "tip");
  assert.ok(Math.abs(snap.view.tipSpeed - snap.tipSpeed) < 1e-6, "tip speed");
});

test("trunk_motion_moves_both_shoulders_but_not_the_planted_hips", async (t) => {
  const { engine, scene, left, right } = await ring();
  t.after(() => engine.dispose());

  const intent = blankIntent();
  intent.posture.trunkLean = 0.8;
  intent.posture.trunkTwist = -0.9;
  left.mind = { name: "posture probe", decide: () => intent };
  const hips = left.pelvis.mesh.position.clone();
  let clock = 0;
  left.observe(right, clock);
  const before = {
    primary: left.view.self.hands.primary.shoulder.clone(),
    secondary: left.view.self.hands.secondary.shoulder.clone(),
  };
  const control = () => {
    clock += FIXED;
    stepPair(left, right, FIXED, clock);
  };
  for (let i = 0; i < 120; i += 1) frame(scene, control);
  left.observe(right, clock);

  assert.ok(Vector3.Distance(left.pelvis.mesh.position, hips) < 0.002,
    "posture must not orbit or translate the planted hips");
  for (const name of ["primary", "secondary"]) {
    const travel = Vector3.Distance(left.view.self.hands[name].shoulder, before[name]);
    assert.ok(travel > 0.04,
      `${name} shoulder should ride the articulated trunk, moved ${travel.toFixed(4)} m`);
  }
});

test("leaning_the_trunk_does_not_remap_a_centre_cursor_off_world_vertical", async (t) => {
  for (const lean of [-1, 1]) {
    await t.test(`${lean < 0 ? "negative" : "positive"} lean`, async (leanTest) => {
      const { engine, scene, left, right } = await ring();
      leanTest.after(() => engine.dispose());
      const intent = blankIntent();
      intent.posture.trunkLean = lean;
      intent.primary.pointerX = 0;
      intent.primary.pointerY = 0;
      left.mind = { name: `lean ${lean}`, decide: () => intent };
      let clock = 0;
      const control = () => {
        clock += FIXED;
        stepPair(left, right, FIXED, clock);
      };
      for (let i = 0; i < 120; i += 1) frame(scene, control);

      const aimed = left.aimPoint().subtract(left.targetPosition()).normalize();
      assert.ok(Math.abs(aimed.y) < 0.02,
        `lean ${lean}: a centre cursor should remain horizontal, got y ${aimed.y}`);
      assert.ok(aimed.z > 0.98,
        `lean ${lean}: a centre cursor should remain on pelvis heading, got ${aimed.toString()}`);
    });
  }
});

test("body_view_reports_pelvis_heading_separately_from_trunk_twist", async (t) => {
  const { engine, scene, left, right } = await ring();
  t.after(() => engine.dispose());
  const intent = blankIntent();
  intent.posture.trunkTwist = 1;
  left.mind = { name: "twist probe", decide: () => intent };
  let clock = 0;
  const control = () => {
    clock += FIXED;
    stepPair(left, right, FIXED, clock);
  };
  for (let i = 0; i < 120; i += 1) frame(scene, control);
  left.observe(right, clock);

  left.torso.mesh.computeWorldMatrix(true);
  const trunk = left.torso.mesh.getWorldMatrix();
  const trunkHeading = Math.atan2(trunk.m[8], trunk.m[10]);
  assert.ok(Math.abs(trunkHeading) > 0.25,
    `the physical trunk should twist, got ${trunkHeading.toFixed(4)} rad`);
  assert.ok(Math.abs(left.view.self.facing) < 0.02,
    `BodyView.facing is pelvis heading, not trunk twist: ${left.view.self.facing}`);
});

test("crouch_lowers_the_pelvis_without_moving_either_foot_through_the_floor", async (t) => {
  const { engine, scene, left, right } = await ring();
  t.after(() => engine.dispose());
  const intent = blankIntent();
  intent.posture.crouch = 1;
  left.mind = { name: "crouch probe", decide: () => intent };
  const standing = left.pelvis.mesh.position.y;
  let clock = 0;
  const control = () => {
    clock += FIXED;
    stepPair(left, right, FIXED, clock);
  };
  for (let i = 0; i < 180; i += 1) frame(scene, control);

  assert.ok(standing - left.pelvis.mesh.position.y > CONFIG.body.crouchDepth * 0.85,
    `pelvis drop ${(standing - left.pelvis.mesh.position.y).toFixed(3)} m`);
  for (const key of ["shinL", "shinR"]) {
    const shin = left.limbs.find((limb) => limb.key === key).part.mesh;
    const down = new Vector3(0, -CONFIG.body.shinLength / 2, 0)
      .rotateByQuaternionToRef(shin.rotationQuaternion, new Vector3());
    const footY = shin.position.y + down.y;
    assert.ok(footY > -0.015, `${key} went ${(footY * 1000).toFixed(1)} mm through the floor`);
    assert.ok(footY < 0.09, `${key} floated ${(footY * 1000).toFixed(1)} mm above the floor`);
  }
});

test("gait_and_crouch_add_without_reversing_a_knee", () => {
  for (const crouch of [0, 0.25, 0.5, 0.75, 1]) {
    for (let phase = 0; phase < Math.PI * 2; phase += Math.PI / 12) {
      const pose = legPose(phase, CONFIG.fighter.walkSpeed, crouch);
      assert.ok(pose.kneeLeft >= 0, `left knee ${pose.kneeLeft} at ${phase}`);
      assert.ok(pose.kneeRight >= 0, `right knee ${pose.kneeRight} at ${phase}`);
      if (crouch > 0) {
        assert.ok(pose.kneeLeft > 0 && pose.kneeRight > 0,
          `both knees bend in crouch: ${pose.kneeLeft}, ${pose.kneeRight}`);
      }
    }
  }
});

test("posture_readings_do_not_stamp_world_matrices", async (t) => {
  const { engine, scene, left, right } = await ring();
  t.after(() => engine.dispose());
  const intent = blankIntent();
  intent.posture.crouch = 0.7;
  intent.posture.trunkLean = 0.6;
  intent.posture.trunkTwist = -0.5;
  left.mind = { name: "reading probe", decide: () => intent };
  let clock = 0;
  const control = () => {
    clock += FIXED;
    stepPair(left, right, FIXED, clock);
  };
  for (let i = 0; i < 90; i += 1) frame(scene, control);
  scene._renderId += 1;
  left.observe(right, clock);
  scene._advancePhysicsEngineStep(1000 / 60);

  for (const part of [left.pelvis, left.torso]) {
    const lazy = part.mesh.absolutePosition.clone();
    part.mesh.computeWorldMatrix(true);
    assert.ok(Vector3.Distance(lazy, part.mesh.absolutePosition) < 1e-9,
      `${part.name}: posture observation stamped a stale matrix`);
  }
  assert.ok(left.view.self.crouch > 0.5, `factual crouch ${left.view.self.crouch}`);
  assert.ok(left.view.self.trunkLean > 0.25, `factual lean ${left.view.self.trunkLean}`);
  assert.ok(left.view.self.trunkTwist < -0.2, `factual twist ${left.view.self.trunkTwist}`);
});

test("both hands are published, and the primary's is the one at the top level", async (t) => {
  // A shield in the off hand, so `weapon`, `face` and `outboard` all have
  // something to say and a stubbed-out second hand cannot pass by looking like
  // an empty one.
  const { engine, scene, left, right } = await ring({ primary: "sword", secondary: "shield" });
  t.after(() => engine.dispose());

  let clock = 0;
  const control = () => {
    clock += FIXED;
    stepPair(left, right, FIXED, clock);
  };
  for (let i = 0; i < 60; i += 1) frame(scene, control);

  const view = left.view.self;
  assert.equal(view.hands.primary.weapon, "sword");
  assert.equal(view.hands.secondary.weapon, "shield");
  assert.equal(view.hands.primary.outboard, 1, "the primary is on the fighter's right");
  assert.equal(view.hands.secondary.outboard, -1);
  assert.equal(view.hands.primary.lost, false);
  assert.equal(view.hands.secondary.lost, false);
  assert.ok(view.hands.secondary.tip.length() > 0.5, "the shield's point is somewhere");

  // The top-level three are the primary's, and say so by being equal to them
  // rather than by a comment. A field that quietly started meaning "whichever
  // hand is interesting" would make every reading in `docs/measurements.md`
  // incomparable with the next one taken, and neither would look wrong.
  assert.ok(Vector3.Distance(view.shoulder, view.hands.primary.shoulder) < 1e-9, "shoulder");
  assert.ok(Vector3.Distance(view.tip, view.hands.primary.tip) < 1e-9, "tip");
  assert.equal(view.tipSpeed, view.hands.primary.tipSpeed);

  // The two sockets are a body apart, so a second hand copied off the first
  // would show up here immediately.
  const across = Vector3.Distance(view.hands.primary.shoulder, view.hands.secondary.shoulder);
  assert.ok(
    Math.abs(across - 2 * CONFIG.fighter.shoulderSide) < 1e-6,
    `the shoulders should be ${2 * CONFIG.fighter.shoulderSide} m apart, got ${across}`,
  );

  // The opponent's hands too: a view that only filled its own would leave every
  // policy guarding against a pair of zeroes.
  for (const name of ["primary", "secondary"]) {
    const hand = left.view.opponent.hands[name];
    assert.ok(hand.shoulder.length() > 0.5, `${name}: the opponent's shoulder is somewhere`);
    assert.ok(
      Vector3.Distance(hand.shoulder, right.view.self.hands[name].shoulder) < 1e-9,
      `${name}: both fighters agree where that shoulder is`,
    );
  }
});

test("wrist_bend_changes_weapon_orientation_without_moving_the_commanded_hand", async (t) => {
  const { engine, scene, left, right } = await ring();
  t.after(() => engine.dispose());

  const intent = blankIntent();
  intent.primary.pointerX = 0.35;
  intent.primary.pointerY = 0.15;
  left.mind = { name: "wrist probe", decide: () => intent };
  let clock = 0;
  const step = () => frame(scene, () => {
    clock += FIXED;
    stepPair(left, right, FIXED, clock);
  });

  for (let i = 0; i < 45; i += 1) step();
  const beforePose = left.armAngles();
  const beforeRotation = left.handAnchor.mesh.rotationQuaternion.clone();
  intent.primary.wristBend = 1;
  for (let i = 0; i < 45; i += 1) step();
  const afterPose = left.armAngles();
  const afterRotation = left.handAnchor.mesh.rotationQuaternion.clone();

  const axis = (local, rotation) => {
    const matrix = Matrix.Identity();
    Matrix.FromQuaternionToRef(rotation, matrix);
    return Vector3.TransformNormal(local, matrix).normalize();
  };
  const beforeX = axis(new Vector3(1, 0, 0), beforeRotation);
  const afterX = axis(new Vector3(1, 0, 0), afterRotation);
  const beforeY = axis(new Vector3(0, 1, 0), beforeRotation);
  const afterY = axis(new Vector3(0, 1, 0), afterRotation);

  assert.equal(afterPose.azimuth, beforePose.azimuth);
  assert.equal(afterPose.elevation, beforePose.elevation);
  assert.equal(afterPose.reach, beforePose.reach);
  assert.ok(Vector3.Dot(beforeX, afterX) > 0.999,
    "wrist bend must preserve the rolled lateral hinge axis");
  assert.ok(Math.abs(Vector3.Dot(beforeY, afterY)) < 0.2,
    "the hand's Y/Z arc should turn close to ninety degrees around that hinge");
  assert.ok(Math.abs(Quaternion.Dot(beforeRotation, afterRotation)) < 0.9,
    "a full bend should visibly turn the commanded weapon frame");
});

test("a strapped shield's face is welded to its hand's own +X", async (t) => {
  const { engine, scene, left, right } = await ring({ primary: "sword", secondary: "shield" });
  t.after(() => engine.dispose());

  let clock = 0;
  let snap = null;
  const control = () => {
    clock += FIXED;
    left.observe(right, clock);
    right.observe(left, clock);
    if (clock > 0.5 && !snap) {
      // Taken in the same breath as the view, for the reason the test below
      // gives: the solver moves everything between substeps.
      const arm = left.arms.secondary;
      arm.hand.mesh.computeWorldMatrix(true);
      arm.weapon.root.computeWorldMatrix(true);
      const m = arm.hand.mesh.getWorldMatrix();
      snap = {
        // The first row of the hand's rotation matrix: the image of (1, 0, 0),
        // which is the axis `HandIntent.roll` turns.
        hand: new Vector3(m.m[0], m.m[1], m.m[2]).normalize(),
        // And what the plate is actually doing. `mountFor("shield")` welds the
        // board's face normal -- its own local +Y -- onto the hand's +X, so the
        // two are the same direction or the mount is not what it says it is,
        // and every number `GUARD.roll` was chosen from is measuring something
        // else.
        plate: arm.weapon.bladeDirection().clone(),
      };
    }
    left.update(FIXED);
    right.update(FIXED);
  };
  for (let i = 0; i < 60; i += 1) frame(scene, control);

  assert.ok(snap, "the comparison was taken");
  // Not to within a rounding error, and it should not be: the weld is a
  // constraint the solver satisfies rather than a parenting, so the board sits a
  // couple of degrees out from the fist under its own weight. Measured 0.9989
  // here, which is 2.7 degrees. The bound is set at 0.99 -- 8 degrees -- which is
  // loose enough to be about compliance and tight enough that a mount welding
  // the plate to the wrong axis is 90 degrees out and cannot pass.
  const square = Vector3.Dot(snap.hand, snap.plate);
  assert.ok(
    square > 0.99,
    `the plate's normal should be the hand's +X, dot ${square} (${((Math.acos(square) * 180) / Math.PI).toFixed(1)} deg out)`,
  );
});

test("a hand publishes how far it reaches, and it is the weapon's not the arm's", async () => {
  // The number both policies shift every one of their ranges by. It went out of
  // the view one session ago for having no readers, which was right then and is
  // not now: the ranges were the sword's length written into a constant, and an
  // axe standing at them swings at the air.
  const { engine, scene, left, right } = await ring({ primary: "axe", secondary: "sword" });
  try {
    let clock = 0;
    for (let i = 0; i < 20; i += 1) {
      frame(scene, () => {
        clock += FIXED;
        stepPair(left, right, FIXED, clock);
      });
    }
    const mine = left.view.self.hands;
    const theirs = right.view.self.hands;

    const axe = CONFIG.arm.reachNeutral + left.arms.primary.weapon.tipOffset;
    const sword = CONFIG.arm.reachNeutral + left.arms.secondary.weapon.tipOffset;
    assert.ok(Math.abs(mine.primary.reach - axe) < 1e-9, "the axe hand reaches arm plus haft");
    assert.ok(Math.abs(mine.secondary.reach - sword) < 1e-9, "and the sword hand arm plus blade");

    // The claim the policies rest on, stated as the inequality rather than as
    // two numbers: a shorter weapon is a shorter reach, from the same shoulder.
    assert.ok(mine.primary.reach < mine.secondary.reach - 0.2);

    // Both fighters agree, and neither is reading the other's arm.
    assert.equal(theirs.primary.reach, CONFIG.arm.reachNeutral + right.arms.primary.weapon.tipOffset);
  } finally {
    engine.dispose();
  }
});

/**
 * A point that is moving, and which way.
 *
 * `tipSpeed` was the whole of what a view said about a blade in motion, and a
 * magnitude cannot answer the question every guard in the tree is actually
 * asking: a blade withdrawing at 8 m/s and one arriving at 8 m/s are the same
 * number. The direction is what session 16 added, so the direction is what has
 * to be checked -- an assertion that the magnitudes agree would pass on a
 * `tipVelocity` that pointed anywhere at all.
 *
 * So it is checked against the tip's own travel, differenced across one solver
 * substep. That is a reading taken from the world rather than from the same
 * arithmetic the publication used, which is the difference between a test and a
 * restatement.
 */
test("hand_tip_velocity_has_direction_and_an_empty_fist_is_not_always_stationary", async (t) => {
  // A sword in one hand and nothing in the other, because the two are published
  // through different readers -- `Weapon.velocityAtToRef` and
  // `FistStrike.centreVelocityToRef` -- and a test that only carried steel would
  // leave the fist's half unrun.
  const { engine, scene, left, right } = await ring({ primary: "sword", secondary: "empty" });
  t.after(() => engine.dispose());

  let clock = 0;
  const samples = { primary: [], secondary: [] };
  const control = () => {
    clock += FIXED;
    left.observe(right, clock);
    right.observe(left, clock);
    for (const name of ["primary", "secondary"]) {
      const hand = left.view.self.hands[name];
      samples[name].push({
        tip: hand.tip.clone(),
        velocity: hand.tipVelocity.clone(),
        speed: hand.tipSpeed,
      });
    }
    left.update(FIXED);
    right.update(FIXED);
  };
  // `ring`'s left mind is `busy`, which drives both hands, so both are swinging.
  for (let i = 0; i < 120; i += 1) frame(scene, control);

  for (const name of ["primary", "secondary"]) {
    const track = samples[name];
    // The speed is the magnitude of the vector, exactly, because `describeFighter`
    // takes one from the other. A pair that merely agreed to a tolerance would be
    // two independent readings and the next session would have to work out which
    // of them a policy was reading.
    for (const sample of track) {
      assert.equal(sample.speed, sample.velocity.length(), `${name}: speed is the magnitude of the velocity`);
    }
    // The fist moves. This is the assertion the whole test hangs on for the
    // empty hand: before session 16 a bare hand published `tipSpeed = 0`
    // forever, so "is that fist coming at me" had no answer at all.
    const fastest = Math.max(...track.map((sample) => sample.speed));
    assert.ok(fastest > 0.5, `${name}: nothing ever moved, fastest ${fastest.toFixed(3)} m/s`);

    // And it points where the point is going. Taken at the fastest substep, so
    // the finite difference is dominated by travel rather than by the curvature
    // of a slow arc.
    const at = track.findIndex((sample) => sample.speed === fastest);
    assert.ok(at > 0 && at < track.length - 1, `${name}: the peak is inside the track`);
    const travelled = track[at + 1].tip.subtract(track[at].tip).scale(1 / FIXED);
    const along = Vector3.Dot(travelled.normalizeToNew(), track[at].velocity.normalizeToNew());
    assert.ok(along > 0.9,
      `${name}: the published velocity should point where the tip actually went, dot ${along.toFixed(4)}`);
    assert.ok(Math.abs(travelled.length() - fastest) < fastest * 0.35,
      `${name}: and be about as fast, ${travelled.length().toFixed(3)} against ${fastest.toFixed(3)} m/s`);
  }

  // The fist's cheap reader is the general one with a term that vanishes taken
  // out, and this is the check that says so rather than the comment on it.
  // `describeFighter` calls `centreVelocityToRef`, which makes one boundary read
  // instead of two; it is only equal to `velocityAtToRef` at the fist's own
  // centre, which is exactly the point the view publishes for a bare hand.
  const fist = left.arms.secondary.fist;
  const centre = left.arms.secondary.hand.mesh.position;
  const cheap = new Vector3();
  const general = new Vector3();
  fist.centreVelocityToRef(cheap);
  fist.velocityAtToRef(centre, general);
  assert.equal(general.subtract(cheap).length(), 0,
    `the fist's two readers disagree at its own centre: ${general} against ${cheap}`);
  // Anywhere else they differ by exactly the term the cheap one drops, which is
  // the whole reason it may not be used anywhere else.
  const offset = new Vector3(0.25, 0, 0);
  fist.velocityAtToRef(centre.add(offset), general);
  const spin = new Vector3();
  fist.body.getAngularVelocityToRef(spin);
  assert.ok(general.subtract(cheap).subtract(Vector3.Cross(spin, offset)).length() < 1e-12,
    "a quarter of a metre out, the difference between the two readers is w x r");
});

/**
 * One shaft per side in the air, and nothing else in the list.
 *
 * The filter is `live && !spent`, which is three exclusions wearing two words: a
 * parked arrow is sixty metres under the floor, a spent one is lying against
 * whatever it hit, and a shaft that was never loosed is neither. A quiver holds
 * twelve, so a publication that forgot the filter would hand a policy
 * twenty-four things to reason about, twenty-two of them scenery.
 *
 * Both owners, because the labelling is the part that can go wrong silently:
 * the same shaft is `self` in its owner's view and `opponent` in the other's,
 * and one shared pool of records would have the second `observe` of a step
 * rewrite the label the first had just published. That is not an intermittent
 * fault -- both observations run before either mind decides -- so every archer
 * in the game would read its own arrows as incoming.
 */
test("projectile_view_contains_only_live_unspent_arrows_from_both_owners", async (t) => {
  const bow = { primary: "bow", secondary: "empty" };
  const { engine, scene, left, right } = await ring(bow, bow);
  t.after(() => engine.dispose());
  // Both standing still. `ring`'s left mind walks and turns, and this test aims
  // a shaft at a point on the other fighter -- so a fighter that had wandered
  // would miss, and the assertion about a spent shaft would fail for a reason
  // that is not about the publication at all.
  left.mind = { name: "still", decide: () => blankIntent() };

  let clock = 0;
  let pending = [];
  const control = () => {
    clock += FIXED;
    stepPair(left, right, FIXED, clock);
    // **After** `update`, and this is not a detail. `Arm.update` runs
    // `Quiver.step` first thing, and that is what takes down the one-step
    // teleport `loose` puts up -- so a shot queued before it is cancelled before
    // the solver ever sees it, and the shaft starts from where the last one
    // ended, sixty metres under the floor. It then parks itself on the `y < -2`
    // rule and this test reads an empty list for a reason that has nothing to do
    // with the publication. `Arm.shoot` sits in exactly this slot for exactly
    // this reason; the failure it avoids is the one in `arrow.ts`'s header.
    for (const shot of pending) shot();
    pending = [];
  };

  for (let i = 0; i < 20; i += 1) frame(scene, control);
  assert.deepEqual(left.view.projectiles, [], "nothing is in the air before anybody shoots");
  assert.equal(left.arms.primary.quiver.arrows.length, CONFIG.arrow.count,
    "and the quiver is full of parked shafts that are not projectiles");

  // One each, well over the other fighter's head, so both stay in flight while
  // the list is read. A shot that struck immediately would test the other half
  // of the filter and not this one.
  // Up and over, each toward the other. Both climbing: a shaft aimed downward
  // parks itself on the `y < -2` rule within a few substeps and would leave this
  // reading an empty list for a reason that is not the filter.
  const outward = new Vector3(0, 0.55, 1).normalize();
  const back = new Vector3(0, 0.55, -1).normalize();
  pending.push(() => left.arms.primary.quiver.loose(
    left.view.self.hands.primary.shoulder.clone(), outward, CONFIG.arrow.speedMax));
  pending.push(() => right.arms.primary.quiver.loose(
    right.view.self.hands.primary.shoulder.clone(), back, CONFIG.arrow.speedMax));
  for (let i = 0; i < 6; i += 1) frame(scene, control);

  for (const [name, fighter, other] of [["left", left, right], ["right", right, left]]) {
    const published = fighter.view.projectiles;
    assert.equal(published.length, 2, `${name}: one shaft each, not a quiver each`);
    assert.deepEqual(published.map((shot) => shot.owner), ["self", "opponent"],
      `${name}: its own first, then the other side's`);
    assert.ok(published.every((shot) => shot.kind === "arrow"));
    assert.equal(fighter.arms.primary.quiver.flying, 1);
    assert.equal(other.arms.primary.quiver.flying, 1);
    for (const shot of published) {
      assert.ok(shot.velocity.length() > CONFIG.arrow.speedMax * 0.5,
        `${name}: a shaft in flight is travelling, got ${shot.velocity.length()}`);
      assert.ok(shot.age >= 0 && shot.age < 0.2, `${name}: freshly loosed, age ${shot.age}`);
    }
  }

  // Now put one into the other fighter point blank, and watch it leave the list
  // the moment it is spent rather than when it is finally collected.
  pending.push(() => left.arms.primary.quiver.loose(
    left.view.self.hands.primary.shoulder.clone(), new Vector3(0, 0, 1), CONFIG.arrow.speedMax));
  for (let i = 0; i < 30; i += 1) frame(scene, control);

  const struck = left.arms.primary.quiver.arrows.filter((arrow) => arrow.live && arrow.spent);
  assert.equal(struck.length, 1, "the point-blank shot hit something and stopped being a projectile");
  assert.equal(left.view.projectiles.length, left.arms.primary.quiver.flying + right.arms.primary.quiver.flying,
    "the published count is exactly `Quiver.flying`, both sides");
  assert.equal(left.view.projectiles.length < 3, true, "and the spent shaft is not one of them");
});

/**
 * The hand-rolled fixtures, checked against the real thing rather than against a
 * reading of `mind.ts`.
 *
 * `tests/fixtures/view.mjs` is a hand-maintained copy of a contract, which is
 * the failure mode `AGENTS.md` has a rule about: a list kept in step by somebody
 * remembering. This is the test that makes remembering unnecessary. A field
 * added to `HandView`, `BodyView`, `ProjectileView` or `FighterView` appears in
 * a real published view, does not appear in the list, and fails here -- which is
 * one file to fix rather than sixty tests to rediscover, and it is why the pure
 * fixtures can be trusted to be complete rather than merely un-thrown.
 */
test("a_hand_rolled_fixture_carries_every_field_a_real_view_does", async (t) => {
  const bow = { primary: "bow", secondary: "empty" };
  const { engine, scene, left, right } = await ring(bow, { primary: "sword", secondary: "shield" });
  t.after(() => engine.dispose());

  let clock = 0;
  let pending = null;
  const control = () => {
    clock += FIXED;
    stepPair(left, right, FIXED, clock);
    // After `update`, for the reason the test above gives at length.
    if (pending) { pending(); pending = null; }
  };
  for (let i = 0; i < 20; i += 1) frame(scene, control);
  // A shaft in the air, or `projectiles` would be empty and its record shape
  // would go unchecked -- which is exactly how the array came to be the one
  // thing every fixture in the directory was missing.
  pending = () => left.arms.primary.quiver.loose(
    left.view.self.hands.primary.shoulder.clone(), new Vector3(0, 0.55, 1).normalize(), CONFIG.arrow.speedMax);
  for (let i = 0; i < 4; i += 1) frame(scene, control);

  const view = left.view;
  assert.ok(view.projectiles.length > 0, "a shaft is up, so the record shape is actually sampled");
  assert.deepEqual(Object.keys(view).sort(), [...VIEW_FIELDS], "FighterView");
  for (const side of ["self", "opponent"]) {
    assert.deepEqual(Object.keys(view[side]).sort(), [...BODY_FIELDS], `BodyView (${side})`);
    for (const name of Object.keys(view[side].hands)) {
      assert.deepEqual(Object.keys(view[side].hands[name]).sort(), [...HAND_FIELDS], `HandView (${side}.${name})`);
    }
  }
  assert.deepEqual(Object.keys(view.projectiles[0]).sort(), [...PROJECTILE_FIELDS], "ProjectileView");
});
