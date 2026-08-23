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
import { azimuthOf, elevationOf, blankIntent } from "../src/policies.ts";
import {
  cursorForPose,
  handOffset,
  handover,
  humanMind,
  policyMind,
  poseShiftMm,
} from "../src/mind.ts";

/**
 * A body changing hands without the blade jumping.
 *
 * Two halves, and the second is the one that matters. The first is pure and
 * costs microseconds: the cursor mapping inverts, a pose is its own zero, and
 * the rebase starts exactly where it was told to and then gets out of the way.
 * The second builds a real fighter on real Havok and takes an arm off a policy
 * mid-swing, because the mapping this all rests on has **three copies** in the
 * tree -- `fighter.ts`'s `spread`, and the two directions in `policies.ts` -- and
 * the pure half can only pin two of them against each other. Only a real
 * `Fighter` can say whether the inverse agrees with the arm.
 *
 * Every jump assertion below comes in a pair: the seeded handover, and the same
 * handover with the seed taken away. The second is not decoration. A test that
 * only asserted "less than 20 mm" would pass just as happily against a fighter
 * that was not swinging, against a taker whose cursor happened to be in the
 * right place, and against a `handover` that did nothing at all -- which is the
 * exact shape of green test this repository's own notes call its worst defect.
 * The control says what the number would be if the mechanism were absent, and it
 * is hundreds of millimetres.
 */

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const FIXED = 1 / CONFIG.world.physicsHz;
const A = CONFIG.arm;

/**
 * An intent, with one hand's fields overridden.
 *
 * Built from the real `blankIntent` rather than from a literal of its own. This
 * file used to carry its own copy of the shape, in plain untyped JS, and when
 * the intent grew a second hand the copy went on compiling and started handing
 * `undefined` to an arm. Four files had the same copy and all four broke
 * together.
 *
 * `over` names the *driven* hand's fields, because that is what every test here
 * is about; `handsOf` below is for the cases that need to see both.
 */
const blank = (over = {}) => {
  const intent = blankIntent();
  Object.assign(intent, over);
  Object.assign(intent[intent.driving], over);
  return intent;
};

/** One pose per hand, for `handover`, which seeds both. */
const bothPoses = (pose) => ({ primary: pose, secondary: pose });

/** A mind that always asks for one fixed thing, which is what a still hand is. */
const fixed = (name, intent) => ({ name, decide: () => intent });

/**
 * The pose `Fighter.aimArm` would be left holding for a given cursor.
 *
 * Written through `policies.ts`'s forward map rather than by hand, so the pure
 * tests below exercise both directions of the one mapping instead of restating
 * either of them.
 */
const poseFor = (pointerX, pointerY, roll = 0, reach = A.reachNeutral) => ({
  azimuth: azimuthOf(pointerX),
  elevation: elevationOf(pointerY),
  roll,
  reach,
});

// ---- the cursor mapping, inverted -----------------------------------------

test("the cursor a pose asks for is the cursor that produced it", () => {
  for (let x = -1; x <= 1.0001; x += 0.125) {
    for (let y = -1; y <= 1.0001; y += 0.25) {
      const seed = cursorForPose(poseFor(x, y, 0.3));
      assert.ok(
        Math.abs(seed.pointerX - x) < 1e-12 && Math.abs(seed.pointerY - y) < 1e-12,
        `cursor (${x.toFixed(3)}, ${y.toFixed(3)}) came back as ` +
          `(${seed.pointerX.toFixed(6)}, ${seed.pointerY.toFixed(6)})`,
      );
    }
  }
});

test("the inverse is asymmetric in the direction the arm is", () => {
  // The envelope is deliberately lopsided -- the arm reaches 1.30 rad across its
  // own side and 1.15 rad across the far one -- so an inverse that divided by one
  // half-range would be right on one side of centre and wrong on the other by the
  // ratio between the two limits. That is 13 %, which is 0.15 rad at a full-width
  // cursor and about 67 mm of hand at a neutral reach: a nudge, easily written
  // off as the solver settling, and permanent.
  assert.notEqual(A.azMax, -A.azMin, "the fixture assumes an asymmetric envelope");
  assert.equal(cursorForPose(poseFor(-1, 0)).pointerX, -1);
  assert.equal(cursorForPose(poseFor(1, 0)).pointerX, 1);

  const angle = A.azMax / 2;
  const outboard = cursorForPose({ azimuth: angle, elevation: 0, roll: 0, reach: 0.45 }).pointerX;
  const across = cursorForPose({ azimuth: -angle, elevation: 0, roll: 0, reach: 0.45 }).pointerX;
  assert.equal(outboard, 0.5);
  assert.ok(
    Math.abs(across) - Math.abs(outboard) > 0.05,
    `the same angle either side of centre came back as ${outboard} and ${across}`,
  );
});

test("a pose outside the envelope comes back at the edge of the cursor, not wrapped", () => {
  // A severed arm's angles, a pose read off a body mid-fall, or simply a
  // retuned envelope: the inverse has to answer something a controller can
  // actually ask for. Unclamped, an azimuth past +-pi comes back as a cursor
  // several units out and the arm flails to whichever stop it reaches first.
  const behind = { azimuth: Math.PI, elevation: -3, roll: 0, reach: 0.45 };
  const seed = cursorForPose(behind);
  assert.equal(seed.pointerX, 1);
  assert.equal(seed.pointerY, -1);
});

test("roll is carried across whole, because the wrist has no home to find", () => {
  // Unlike the two pointer axes, roll is an accumulator: `Controls.sample`
  // integrates Z and X into it and nothing writes an absolute value, so the
  // seeded number is durable and there is nothing to invert.
  assert.equal(cursorForPose(poseFor(0, 0, -1.7)).roll, -1.7);
});

// ---- what a pose puts the hand at -----------------------------------------

test("a centred pose puts the hand straight out in front at its reach", () => {
  const point = handOffset({ azimuth: 0, elevation: 0, roll: 0, reach: 0.5 });
  assert.ok(Math.abs(point.x) < 1e-12, `x ${point.x}`);
  assert.ok(Math.abs(point.y) < 1e-12, `y ${point.y}`);
  assert.ok(Math.abs(point.z - 0.5) < 1e-12, `z ${point.z}`);
});

test("a pose is its own zero, and the far corner of the envelope is not", () => {
  const corner = poseFor(-1, -1);
  assert.equal(poseShiftMm(corner, corner), 0);
  // This is the number that gives the 20 mm acceptance its meaning: an unseeded
  // handover is a jump somewhere in this range, and 20 mm is two per cent of it.
  const across = poseShiftMm(corner, poseFor(1, 1));
  assert.ok(across > 600, `a corner-to-corner jump is only ${across.toFixed(0)} mm`);
});

// ---- the rebase ------------------------------------------------------------

test("the first command after a handover is exactly the pose it found", () => {
  const pose = poseFor(0.8, -0.6, 0.4);
  const centre = fixed("centre", blank());
  const held = handover(centre, bothPoses(pose), 0.25);

  const first = held.decide(null, FIXED);
  assert.equal(first.primary.pointerX, cursorForPose(pose).pointerX);
  assert.equal(first.primary.pointerY, cursorForPose(pose).pointerY);
  assert.equal(first.primary.roll, pose.roll);
  assert.equal(poseShiftMm(pose, poseFor(first.primary.pointerX, first.primary.pointerY)), 0);

  // The control: the same taker with no rebase at all is the teleport this whole
  // session exists to stop, and it is 300 mm of hand in one substep.
  const raw = centre.decide(null, FIXED);
  const jump = poseShiftMm(pose, poseFor(raw.primary.pointerX, raw.primary.pointerY));
  assert.ok(jump > 300, `an unseeded handover only moved the hand ${jump.toFixed(1)} mm`);
});

test("the rebase arrives, and then gets out of the way", () => {
  const pose = poseFor(-0.9, 0.9, -1.0);
  const asked = blank({ pointerX: 0.5, pointerY: -0.4, roll: 0.8 });
  const inner = fixed("swinger", asked);
  const held = handover(inner, bothPoses(pose), 0.25);

  assert.equal(held.name, "swinger", "a readout should name the mind, not the wrapper");
  assert.equal(held.settled, false);

  // 60 steps of 1/240 s. Counted rather than accumulated, because summing a
  // float step until it passes a float bound is off by one about half the time.
  let last = null;
  for (let i = 0; i < 60; i += 1) last = held.decide(null, FIXED);
  assert.equal(held.settled, true);

  // Transparent afterwards: the very object the inner mind owns, not a copy of
  // it, which is what says the wrapper has stopped touching anything.
  const after = held.decide(null, FIXED);
  assert.equal(after, asked);
  assert.ok(last !== asked, "it was still blending on the last step of the window");
});

test("the rebase walks the cursor across, monotonically and once", () => {
  const pose = poseFor(-1, -1);
  const held = handover(fixed("centre", blank()), bothPoses(pose), 0.25);

  let previous = -Infinity;
  let steps = 0;
  while (!held.settled) {
    const intent = held.decide(null, FIXED);
    assert.ok(intent.primary.pointerX >= previous, "the rebase reversed direction");
    previous = intent.primary.pointerX;
    steps += 1;
    assert.ok(steps < 500, "the rebase never finished, which is what an exponential one does");
  }
  // 0.25 s at 240 Hz, exactly.
  assert.equal(steps, 60);
  // And the step after the window is the taker's own cursor, not a blend of it
  // that got close: this is the difference between a rebase that ends and one
  // that merely becomes hard to see.
  assert.equal(held.decide(null, FIXED).primary.pointerX, 0);
});

test("the feet, the buttons and the zoom are the new driver's from the first step", () => {
  // None of them can teleport anything: reach is filtered at `arm.reachResponse`
  // and locomotion at `fighter.accelResponse`, so blending them would be a lag
  // bought for nothing. Only the two aiming axes and the wrist are absolute.
  const asked = blank({ forward: 1, strafe: -1, turn: 0.5, thrust: true, guard: true, zoom: 1.4 });
  const held = handover(fixed("driver", asked), bothPoses(poseFor(-1, 1, 1)), 0.25);

  const first = held.decide(null, FIXED);
  assert.equal(first.forward, 1);
  assert.equal(first.strafe, -1);
  assert.equal(first.turn, 0.5);
  assert.equal(first.primary.thrust, true);
  assert.equal(first.primary.guard, true);
  assert.equal(first.zoom, 1.4);
});

test("a zero-width rebase is the plan's seed alone, and is not a broken handover", () => {
  // `config.takeover.rebaseSeconds = 0` is the control condition for any argument
  // about whether the rebase is worth having, so it has to keep working.
  const asked = blank({ pointerX: 0.5 });
  const held = handover(fixed("centre", asked), bothPoses(poseFor(-1, -1)), 0);
  assert.equal(held.settled, true);
  assert.equal(held.decide(null, FIXED), asked);
});

test("the inner mind is driven every step of the window, at its own dt", () => {
  // A policy whose cadence stopped for a quarter of a second while its hand was
  // rebased would be a different policy, and the difference would show up as a
  // swing that arrived late rather than as anything anybody could name.
  const seen = [];
  const inner = {
    name: "counter",
    decide: (view, dt) => {
      seen.push(dt);
      return blank();
    },
  };
  const held = handover(inner, bothPoses(poseFor(-1, -1)), 0.25);
  for (let i = 0; i < 24; i += 1) held.decide(null, FIXED);

  assert.equal(seen.length, 24);
  assert.ok(seen.every((dt) => dt === FIXED), "the inner mind was handed a different clock");
});

// ---- and the same thing against a real arm ---------------------------------

/**
 * A fighter in a real solver, plus the two lines of cadence the page has.
 *
 * Copied from `tests/view.test.mjs` rather than shared with it, because that
 * file's whole subject is that a *reading* must not disturb what it reads, and a
 * fixture two suites edit is a fixture neither of them owns.
 */
async function ring(mind) {
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

  const left = new Fighter(scene, {
    side: "left", origin: Vector3.Zero(), facing: 0, mind,
  }, materials);
  const right = new Fighter(scene, {
    side: "right", origin: new Vector3(0, 0, CONFIG.fighter.separation),
    facing: Math.PI, mind: policyMind("idle"),
  }, materials);

  return { engine, scene, left, right };
}

/**
 * A cursor sweeping back and forth across most of the envelope.
 *
 * A triangle rather than a single sweep, so that the arm is moving *whenever*
 * the handover is taken rather than only if it is timed right. 1.8 cursor units
 * in half a second is about a third of the speed of `swinger`'s commit -- fast
 * enough that the blade carries real momentum through the swap, slow enough that
 * what is being measured is the handover and not a limb about to come off.
 */
function sweeper() {
  const intent = blank();
  // The driven hand only. The other one holds centre, which is what a hand not
  // being swept looks like, and leaving it out of the sweep is what keeps this
  // a measurement of one arm being handed over rather than of two.
  const hand = intent[intent.driving];
  let elapsed = 0;
  return {
    name: "sweeper",
    decide: (view, dt) => {
      elapsed += dt;
      const phase = (elapsed / 0.5) % 2;
      const across = phase < 1 ? phase : 2 - phase;
      hand.pointerX = -0.9 + across * 1.8;
      hand.pointerY = 0.7 - across * 1.3;
      hand.roll = -0.6 + across * 1.2;
      return intent;
    },
  };
}

/**
 * Take a body off `driver` and give it to `incoming`, mid-swing, and answer how
 * far the hand was asked to jump on the step that followed.
 *
 * `seeded` false is the control: the same swap with `handover` taken out, which
 * is exactly the code this session replaced and is what a teleport measures.
 */
async function jumpOnHandover(t, { driver, incoming, seeded, frames = 25 }) {
  const { engine, scene, left, right } = await ring(driver);
  t.after(() => engine.dispose());

  let clock = 0;
  const control = () => {
    clock += FIXED;
    left.observe(right, clock);
    right.observe(left, clock);
    left.update(FIXED);
    right.update(FIXED);
  };

  // Long enough for the arm to be genuinely in flight rather than settling out
  // of its build pose, and landing mid-sweep rather than at a turning point.
  for (let i = 0; i < frames; i += 1) {
    scene._renderId += 1;
    const observer = scene.onBeforePhysicsObservable.add(control);
    scene._advancePhysicsEngineStep(1000 / 60);
    scene.onBeforePhysicsObservable.remove(observer);
  }

  const pose = left.armAngles();
  const speed = left.sword.speedAt(left.sword.tipPositionToRef(new Vector3()));

  left.mind = seeded ? handover(incoming, bothPoses(pose), CONFIG.takeover.rebaseSeconds) : incoming;

  // One control step, and no solver step: what is being measured is the command
  // the new mind produced, and `aimArm` has written it by the time `update`
  // returns. Stepping the solver as well would fold in the four substeps of
  // legitimate blade travel that make a tip reading useless here.
  scene._renderId += 1;
  left.observe(right, clock);
  right.observe(left, clock);
  left.update(FIXED);

  return { jump: poseShiftMm(pose, left.armAngles()), pose, speed };
}

/**
 * Two moments in the sweep, one either side of centre.
 *
 * Both are needed and finding that out is the reason they are written down as a
 * pair. The mapping is asymmetric, so its two spellings -- the correct one and
 * the plausible one that divides by a single half-range -- **agree exactly for a
 * positive azimuth** and differ only across the body. A version of this test that
 * took its reading at frame 25 alone passed against a deliberately broken
 * inverse, which is the green-test-asserting-nothing failure this repository
 * warns about, caught by breaking the code on purpose.
 */
const MOMENTS = [
  { frames: 25, side: 1, where: "on the sword shoulder's own side" },
  { frames: 54, side: -1, where: "across the body" },
];

test("taking a body mid-swing does not move the blade, either side of centre", async (t) => {
  for (const moment of MOMENTS) {
    const { jump, pose, speed } = await jumpOnHandover(t, {
      driver: sweeper(),
      incoming: humanMind({ state: blank() }),
      seeded: true,
      frames: moment.frames,
    });

    // The fixture has to be hard before the answer means anything: an arm parked
    // at centre would pass this against any implementation, including none.
    assert.ok(speed > 1.5, `${moment.where}: the blade should be in flight, ${speed.toFixed(2)} m/s`);
    assert.equal(
      Math.sign(pose.azimuth),
      moment.side,
      `${moment.where}: the arm was at azimuth ${pose.azimuth.toFixed(3)}, which is the wrong branch`,
    );

    assert.ok(
      jump < 20,
      `${moment.where}: the hand was asked to jump ${jump.toFixed(2)} mm on the takeover frame`,
    );
  }
});

test("and without the seed it jumps the width of the envelope", async (t) => {
  // The same manoeuvre, the same fighter, the same taker, and the only
  // difference is the seed. This is what the acceptance is measured against and
  // what the page would do without it.
  for (const moment of MOMENTS) {
    const { jump } = await jumpOnHandover(t, {
      driver: sweeper(),
      incoming: humanMind({ state: blank() }),
      seeded: false,
      frames: moment.frames,
    });
    assert.ok(
      jump > 200,
      `${moment.where}: an unseeded takeover only moved the hand ${jump.toFixed(1)} mm`,
    );
  }
});

test("releasing a body mid-swing does not make its policy flinch", async (t) => {
  // The other direction, and it needs its own test rather than an argument: a
  // freshly built `swinger` parks its cursor at centre guard on the first
  // `decide` it is ever asked for, which has no relation at all to the pose it
  // is being handed. Measured, it is the *worse* of the two directions.
  for (const moment of MOMENTS) {
    const { jump, speed } = await jumpOnHandover(t, {
      driver: sweeper(),
      incoming: policyMind("swinger", 4242),
      seeded: true,
      frames: moment.frames,
    });
    assert.ok(speed > 1.5, `${moment.where}: the blade should be in flight, ${speed.toFixed(2)} m/s`);
    assert.ok(
      jump < 20,
      `${moment.where}: the released hand was asked to jump ${jump.toFixed(2)} mm`,
    );
  }
});

test("and without the seed the policy flinches just as hard", async (t) => {
  for (const moment of MOMENTS) {
    const { jump } = await jumpOnHandover(t, {
      driver: sweeper(),
      incoming: policyMind("swinger", 4242),
      seeded: false,
      frames: moment.frames,
    });
    assert.ok(
      jump > 200,
      `${moment.where}: an unseeded release only moved the hand ${jump.toFixed(1)} mm`,
    );
  }
});
