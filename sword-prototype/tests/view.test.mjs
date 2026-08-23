import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import HavokPhysics from "@babylonjs/havok";

import { CONFIG } from "../src/config.ts";
import { attachPhysics } from "../src/physics.ts";
import { Fighter } from "../src/fighter.ts";
import { idleMind } from "../src/mind.ts";
import { blankIntent } from "../src/policies.ts";

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

async function ring(loadout = undefined) {
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
    facing: Math.PI, mind: idleMind(),
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
    left.observe(right, clock);
    right.observe(left, clock);
    left.update(FIXED);
    right.update(FIXED);
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

test("both hands are published, and the primary's is the one at the top level", async (t) => {
  // A shield in the off hand, so `weapon`, `face` and `outboard` all have
  // something to say and a stubbed-out second hand cannot pass by looking like
  // an empty one.
  const { engine, scene, left, right } = await ring({ primary: "sword", secondary: "shield" });
  t.after(() => engine.dispose());

  let clock = 0;
  const control = () => {
    clock += FIXED;
    left.observe(right, clock);
    right.observe(left, clock);
    left.update(FIXED);
    right.update(FIXED);
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
