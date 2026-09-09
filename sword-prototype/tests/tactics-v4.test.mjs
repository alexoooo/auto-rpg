// The fourth executor: a body whose command is a vector, and the mind that drives it.
//
// **Every threshold in this file is provisional.** They are pinned from the 2026-09-08 Node arena
// run and are to be re-taken after the owner's gate; they are *not* regression floors. The rule
// this directory keeps applies here too: a green test asserting something the code does not do is
// the worst defect this tree produces, so what is asserted is a *claim about the surface* -- the
// clamp is counted, the arc did not move, the abort is charged for -- and never a feel.
//
// Two harnesses, and they are never mixed in one column. The cheap tests drive `golemDriven`
// directly in front of a **real** published view flattened into a fixture, which is what lets a
// whole bout of the cadence be stepped in milliseconds; the bout test is `scripts/measure.mjs`
// used as a library, the same `NullEngine` arena and the same real Havok the page runs.
//
// **Seven mutations were watched red on 2026-09-08, and an eighth on 2026-09-09**, because the
// alternative is a suite that agrees with its own setup. Each was applied on its own, the file run,
// and the source restored:
//
// | mutation in `src/golem/tactics-v4.ts` | what went red |
// |---|---|
// | pick the half of the arc from the clock (`run < chamberSeconds`) rather than from the stance | the v3 arc test |
// | write the mark from the command in force at the top of the step, not the one the ask just wrote | the v3 arc test |
// | interpolate `blendArc` as `a + s(b - a)` rather than `(1 - s)a + sb` | the arc-shape test |
// | drop the `Number.isFinite` branch in `take` | the clamp test |
// | charge a whole cooldown for an abort instead of `abortCooldown` | the abort test |
// | read the gates only at an ask rather than every step | the abort test |
// | floor the hold at `reach * holdFraction`, or at `near + slack`, the way v2 and v3 do | the stand-off test |
// | *(2026-09-09)* have `holdFor` return `them.reach * standOff` whatever `holdMetres` says | the candidates test, on the flag turned up |
//
// One mutation that was tried and is **not** in the table: swapping the commit gate ahead of the
// abort gate changes nothing, because the two branches are already exclusive by stance -- `abort`
// is read while striking and `commit` while free. There is no test for it because there is nothing
// to test, which is worth a line here so that the next reader does not go looking for one.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import HavokPhysics from "@babylonjs/havok";

import { CONFIG } from "../src/config.ts";
import { attachPhysics, COLLIDES, LAYER } from "../src/physics.ts";
import { unitDefinition } from "../src/units.ts";
import { defaultGolemSetup } from "../src/golem/build.ts";
import { BUTTON_REACH } from "../src/buttons.ts";
import { GOLEM_TACTICS } from "../src/golem/tactics.ts";
import { COMMITTED_SHAPES, GOLEM_TACTICS_V3, THRUST_SHAPES, golemStyled } from "../src/golem/tactics-v3.ts";
import {
  COMMAND_AXES, COMMAND_GATES, COMMAND_RANGES, GOLEM_TACTICS_V4,
  blendArc, freshCommand, golemDriven,
} from "../src/golem/tactics-v4.ts";
import {
  PILOT_FEATURE_COUNT, PILOT_FEATURE_NAMES, PILOT_FEATURES_VERSION, PILOT_HZ,
  askCadence, pilotFeatures,
} from "../src/golem/pilot.ts";
import { DRIVER, golemDriver } from "../src/golem/styles/driver.ts";
import { golemFencer } from "../src/golem/tactics-v2.ts";

process.env.SWORD_MEASURE_LIBRARY = "1";
const { freshHavok, runBout } = await import("../scripts/measure.mjs");

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const FIXED = 1 / CONFIG.world.physicsHz;
const FRAME_MS = 1000 / 60;
const SEED = 20260908;

const MAUL = { chain: "wrist", terminal: "maul" };
const setupWith = (over) => ({ ...defaultGolemSetup(), ...over });

// ---------------------------------------------------------------------------------------
// The two harnesses, copied from `tests/golem-mind.test.mjs` for the reason every test file
// in this directory stands its own arena: a shared one would be a second claim about what a
// body publishes, and the fixture is taken from the real record precisely so it cannot be.
// ---------------------------------------------------------------------------------------

const blankIntent = () => ({
  forward: 0, strafe: 0, turn: 0, actingHand: "primary",
  natural: { thrust: false, guard: false },
  posture: { trunkLean: 0, trunkTwist: 0, crouch: 0 },
  primary: {
    pointerX: 0, pointerY: 0, reach: BUTTON_REACH.neutral,
    roll: 0, wristBend: 0, thrust: false, guard: false,
  },
  secondary: {
    pointerX: 0, pointerY: 0, reach: BUTTON_REACH.neutral,
    roll: 0, wristBend: 0, thrust: false, guard: false,
  },
});

async function standAGolem(t, setup = defaultGolemSetup()) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  scene.getPhysicsEngine().setSubTimeStep(1000 / CONFIG.world.physicsHz);
  const mat = (name) => new StandardMaterial(name, scene);
  const materials = {
    flesh: mat("flesh"), cloth: mat("cloth"), steel: mat("steel"), leather: mat("leather"),
    brass: mat("brass"), hide: mat("hide"), wood: mat("wood"), arrowAccent: mat("arrow"),
  };
  const ground = MeshBuilder.CreateBox("ground", { width: 60, height: 1, depth: 60 }, scene);
  ground.position.y = -0.5;
  const slab = new PhysicsAggregate(ground, PhysicsShapeType.BOX,
    { mass: 0, friction: 0.9, restitution: 0.02 }, scene);
  slab.shape.filterMembershipMask = LAYER.WORLD;
  slab.shape.filterCollideMask = COLLIDES.WORLD;

  const golem = unitDefinition("golem").build({
    scene, side: "left", origin: Vector3.Zero(), facing: 0, golem: setup, materials,
    mind: { name: "still", decide: () => blankIntent() },
  });
  t.after(() => { golem.dispose(); scene.dispose(); engine.dispose(); });

  let clock = 0;
  scene.onBeforePhysicsObservable.add(() => {
    golem.observe(golem, clock);
    golem.locomotion.beginControlStep();
    golem.control.driver.step(FIXED);
    const proposal = golem.locomotion.proposal(FIXED);
    const fraction = golem.locomotion.registry.allowedFraction(
      proposal.prior, proposal.next, proposal.footprint, proposal.ownerPartIds);
    golem.locomotion.commitPhysical(proposal, Object.freeze({
      x: proposal.displacement.x * fraction, z: proposal.displacement.z * fraction,
      yaw: proposal.displacement.yaw,
    }), FIXED);
    golem.afterLocomotion(FIXED);
    clock += FIXED;
  });
  for (let frame = 0; frame < 60; frame += 1) {
    scene._renderId += 1;
    scene._advancePhysicsEngineStep(FRAME_MS);
  }
  return golem;
}

function fixtureOf(view) {
  const point = (value) => ({ x: value.x, y: value.y, z: value.z });
  const hand = (value) => ({ ...value, shoulder: point(value.shoulder), tip: point(value.tip),
    tipVelocity: point(value.tipVelocity) });
  const body = (value) => ({ ...value, ground: point(value.ground), shoulder: point(value.shoulder),
    tip: point(value.tip), health: { ...value.health },
    naturalAttacks: Object.fromEntries(Object.entries(value.naturalAttacks ?? {})
      .map(([name, attack]) => [name, { ...attack }])),
    hands: Object.fromEntries(Object.entries(value.hands)
      .map(([name, slot]) => [name, hand(slot)])),
    effectors: undefined,
  });
  const self = body(view.self);
  delete self.effectors;
  const opponent = body(view.opponent);
  delete opponent.effectors;
  return { self, opponent, projectiles: [], measure: view.measure, clock: 0 };
}

/** Put the opponent somewhere, as a body of the same rough size, and re-derive `measure`. */
function place(fixture, { x, z, facing = Math.PI, shoulderY = 1.42, crownY = 1.75 }) {
  const them = fixture.opponent;
  them.unit = "warrior";
  them.ground.x = x; them.ground.y = 0; them.ground.z = z;
  them.facing = facing;
  them.shoulder.x = x + 0.21; them.shoulder.y = shoulderY; them.shoulder.z = z;
  them.crownHeight = crownY;
  them.vitalHeight = shoulderY * 0.82;
  them.reach = 1.45;
  them.collisionRadius = 0.22;
  them.tip.x = x; them.tip.y = shoulderY; them.tip.z = z - 0.8;
  them.tipSpeed = 1.0;
  for (const name of ["primary", "secondary"]) {
    const hand = them.hands[name];
    hand.weapon = name === "primary" ? "sword" : "empty";
    hand.lost = false;
    hand.shoulder.x = x + (name === "primary" ? 0.21 : -0.21);
    hand.shoulder.y = shoulderY;
    hand.shoulder.z = z;
    hand.tip.x = them.tip.x; hand.tip.y = them.tip.y; hand.tip.z = them.tip.z;
    hand.tipSpeed = name === "primary" ? 1.0 : 0;
    hand.reach = 1.45;
  }
  const self = fixture.self;
  fixture.measure = Math.hypot(self.shoulder.x - them.shoulder.x, self.shoulder.z - them.shoulder.z);
  return fixture;
}

/** `spanned` in `arm-core.ts`, written out so the test recovers what the module will command. */
const spanned = (t, min, max) => min + ((Math.max(-1, Math.min(1, t)) + 1) / 2) * (max - min);

function assertInsideEnvelope(intent, self, label) {
  const caps = self.capabilities;
  assert.ok(caps, `${label}: the golem publishes no capabilities`);
  for (const name of ["primary", "secondary"]) {
    const cap = caps.effectors[name];
    const hand = intent[name];
    const where = `${label} ${name}`;
    for (const axis of ["pointerX", "pointerY"]) {
      assert.ok(Number.isFinite(hand[axis]) && Math.abs(hand[axis]) <= 1,
        `${where}.${axis} is ${hand[axis]}, and a cursor axis runs -1 to +1`);
    }
    assert.ok(Number.isFinite(hand.reach) && Math.abs(hand.reach) <= 1,
      `${where}.reach is ${hand.reach}, and the reach axis runs -1 to +1`);
    assert.ok(hand.wristBend >= 0 && hand.wristBend <= 1,
      `${where}.wristBend is ${hand.wristBend}, and the intent's bend is normalized 0..1`);
    if (cap.bendMax === 0) {
      assert.equal(hand.wristBend, 0, `${where} has no bend axis and was asked for one`);
    }
    assert.ok(Math.abs(hand.roll) <= cap.rollMax + 1e-9,
      `${where}.roll is ${hand.roll} against a published ceiling of ${cap.rollMax}`);
    if (cap.rollMax === 0) {
      assert.equal(hand.roll, 0, `${where} has no roll axis and was asked to turn`);
    }
    if (cap.strokes.length === 0) {
      assert.equal(hand.thrust, false, `${where} has no stroke and was asked for one`);
      assert.equal(hand.guard, false, `${where} has no stroke and was asked to cover`);
    }
    const shell = cap.reachable;
    if (shell) {
      const swing = spanned(hand.pointerX * self.hands[name].outboard, shell.swingMin, shell.swingMax);
      assert.ok(swing >= shell.swingMin - 1e-9 && swing <= shell.swingMax + 1e-9,
        `${where} commands swing ${swing} outside [${shell.swingMin}, ${shell.swingMax}]`);
      const lift = spanned(hand.pointerY, shell.liftMin, shell.liftMax);
      assert.ok(lift >= shell.liftMin - 1e-9 && lift <= shell.liftMax + 1e-9,
        `${where} commands lift ${lift} outside [${shell.liftMin}, ${shell.liftMax}]`);
    }
  }
  for (const axis of ["trunkLean", "trunkTwist"]) {
    assert.ok(Math.abs(intent.posture[axis]) <= 1,
      `${label}.posture.${axis} is ${intent.posture[axis]}`);
  }
  assert.ok(intent.posture.crouch >= 0 && intent.posture.crouch <= 1,
    `${label}.posture.crouch is ${intent.posture.crouch}`);
  for (const axis of ["forward", "strafe", "turn"]) {
    assert.ok(Math.abs(intent[axis]) <= 1, `${label}.${axis} is ${intent[axis]}`);
  }
}

/** Step the mind over a grid of places the opponent could be, and check every command. */
function sweepPlaces(fixture, mind, label, seconds = 0.35) {
  const reach = fixture.self.hands.primary.reach;
  const places = [];
  for (const ring of [0.4, 0.8, 1.0, 1.3, 2.0, 4.0]) {
    for (const bearing of [0, 0.9, 1.9, 2.8, -0.9, -1.9, -2.8]) {
      places.push({ x: Math.sin(bearing) * reach * ring, z: Math.cos(bearing) * reach * ring });
    }
  }
  const heights = [1.42, 0.35, 2.10];
  let steps = 0;
  for (const spot of places) {
    for (const shoulderY of heights) {
      place(fixture, { ...spot, shoulderY });
      for (let step = 0; step < Math.round(seconds * CONFIG.world.physicsHz); step += 1) {
        fixture.clock += FIXED;
        assertInsideEnvelope(mind.decide(fixture, FIXED), fixture.self, `${label} step ${steps}`);
        steps += 1;
      }
    }
  }
  return steps;
}

/** A pilot that writes one fixed command, and remembers what it was asked. */
function fixedPilot(over = {}) {
  const command = { ...freshCommand(), ...over };
  const seen = { asks: 0, last: null };
  const pilot = (reading, view) => {
    seen.asks += 1;
    seen.last = { ...reading, clock: view.clock };
    return command;
  };
  return { pilot, command, seen };
}

/** Step one executor in front of a fixture for `seconds`, calling `each` after every step. */
function drive(fixture, mind, seconds, each = null) {
  const steps = Math.round(seconds * CONFIG.world.physicsHz);
  for (let step = 0; step < steps; step += 1) {
    fixture.clock += FIXED;
    const intent = mind.decide(fixture, FIXED);
    if (each) each(intent, step);
  }
  return steps;
}

// ---------------------------------------------------------------------------------------
// The arc: the one thing this session promised would not move.
// ---------------------------------------------------------------------------------------

/**
 * A swing of one is the third executor's committed cut, and a swing of zero is its thrust.
 *
 * The whole claim of the continuous surface rests on this. A `swing` command is a blend between
 * two *measured* shapes -- Session 02's bench cell at one end and the point stroke at the other --
 * and if the ends of the blend are not those shapes to the digit, then every arc this executor
 * swings is a shape nobody measured and the bench rows in `docs/measurements.md` describe a stroke
 * that no longer exists.
 */
test("a_swing_of_one_is_v3s_committed_cut_and_a_swing_of_zero_is_its_thrust", () => {
  const fields = Object.keys(COMMITTED_SHAPES.sword);
  for (const kind of Object.keys(COMMITTED_SHAPES)) {
    const wide = blendArc(kind, 1);
    const point = blendArc(kind, 0);
    for (const field of fields) {
      assert.equal(wide[field], COMMITTED_SHAPES[kind][field],
        `${kind}.${field} at swing 1 is ${wide[field]} against the committed cut's ${COMMITTED_SHAPES[kind][field]}`);
      assert.equal(point[field], THRUST_SHAPES[kind][field],
        `${kind}.${field} at swing 0 is ${point[field]} against the thrust's ${THRUST_SHAPES[kind][field]}`);
    }
    // And the middle is genuinely between, rather than either end rounded.
    const half = blendArc(kind, 0.5);
    for (const field of fields) {
      const lo = Math.min(point[field], wide[field]);
      const hi = Math.max(point[field], wide[field]);
      assert.ok(half[field] >= lo - 1e-12 && half[field] <= hi + 1e-12,
        `${kind}.${field} at swing 0.5 is ${half[field]}, outside [${lo}, ${hi}]`);
    }
  }
  // Out of range is clamped rather than extrapolated: there is nothing beyond the two shapes.
  assert.deepEqual({ ...blendArc("sword", 4) }, { ...blendArc("sword", 1) });
  assert.deepEqual({ ...blendArc("sword", -4) }, { ...blendArc("sword", 0) });
});

/**
 * A whole stroke at swing one is the third executor's `cut`, command for command.
 *
 * The shape test above says the arc's *table* did not move. This one says the arc as **driven** did
 * not move: the same aim, the same bite, the same chamber, the same twelve-frame sweep, and the
 * same two-phase clock -- v3 restarts its clock at the chamber-to-commit transition, so a single
 * clock through both would put every commit frame one step early and this test is what says so.
 *
 * Only the acting hand's seven channels are compared, and deliberately: the feet, the lean and the
 * spare hand are the things the surface *changed*, and comparing them would be asserting that the
 * session did nothing.
 */
test("a_whole_stroke_at_swing_one_is_the_third_executors_cut_command_for_command", async (t) => {
  const golem = await standAGolem(t);
  const channels = ["pointerX", "pointerY", "reach", "roll", "wristBend", "thrust", "guard"];

  /**
   * Record the acting hand through **one** exchange: the first step of the chamber to the last
   * step of the commit, and nothing after it. Both executors open with a seeded cooldown of up to
   * a second, so the window has to be long enough to hold a whole stroke after one; and the run
   * has to stop at the end of that stroke, because a second one starting inside the window would
   * make "the two agree for 160 frames" a claim about a stroke and a half.
   */
  const record = (fixture, mind, inExchange, seconds = 2.2) => {
    const frames = [];
    let done = false;
    drive(fixture, mind, seconds, (intent) => {
      if (done) return;
      if (!inExchange()) {
        done = frames.length > 0;
        return;
      }
      const hand = intent[intent.actingHand];
      frames.push(Object.fromEntries(channels.map((name) => [name, hand[name]])));
    });
    return frames;
  };

  const left = place(fixtureOf(golem.view), { x: 0, z: 1.35 });
  const styled = golemStyled(SEED, GOLEM_TACTICS_V3, (available) =>
    (available.includes("cut") ? "cut" : "hold"));
  const v3 = record(left, styled, () => styled.stance === "chamber" || styled.stance === "commit");

  const right = place(fixtureOf(golem.view), { x: 0, z: 1.35 });
  const them = right.opponent;
  const trunkHeight = (them.shoulder.y - them.ground.y) / (them.crownHeight - them.ground.y);
  const { pilot } = fixedPilot({
    commit: 1, swing: 1, bite: GOLEM_TACTICS_V4.strikeBite,
    targetHeight: trunkHeight, targetLateral: 0, advance: 1,
  });
  const driven = golemDriven(SEED, GOLEM_TACTICS_V4, pilot);
  const v4 = record(right, driven,
    () => driven.stance === "chamber" || driven.stance === "commit");

  assert.ok(v3.length > 100, `the third executor never threw a cut: ${v3.length} exchange frames`);
  assert.equal(v4.length, v3.length,
    `v3's cut ran ${v3.length} frames and v4's swing of one ran ${v4.length}`);
  for (let i = 0; i < v3.length; i += 1) {
    for (const name of channels) {
      const a = v3[i][name];
      const b = v4[i][name];
      if (typeof a === "boolean") {
        assert.equal(b, a, `frame ${i} ${name}: v4 says ${b} and v3 says ${a}`);
      } else {
        assert.ok(Math.abs(a - b) < 1e-12,
          `frame ${i} ${name}: v4 says ${b} and v3 says ${a}, a difference of ${a - b}`);
      }
    }
  }
  // And what was compared is a whole stroke and not a fragment of one: the chamber plus the sweep
  // plus the follow-through, from the shape's own seconds, is the length of what was recorded.
  const oneStroke = COMMITTED_SHAPES.sword;
  const expected = Math.round(
    (oneStroke.chamberSeconds + Math.max(GOLEM_TACTICS_V3.commitSeconds,
      oneStroke.strokeSeconds + GOLEM_TACTICS_V3.followSeconds)) * CONFIG.world.physicsHz);
  assert.ok(Math.abs(v3.length - expected) <= 2,
    `a stroke ran ${v3.length} frames against the ${expected} the shape asks for`);
});

// ---------------------------------------------------------------------------------------
// The cadence.
// ---------------------------------------------------------------------------------------

/**
 * Twelve a second, plus the events, and not one ask more.
 *
 * Two halves, because there are two things that could be wrong and only one of them needs a body.
 * The clock is a pure object and is checked as one -- against an independent count of how many
 * periods have elapsed, so a drift of one frame's worth per second would show. Then the executor
 * is checked to ask exactly what the clock says and never off its own bat.
 */
test("the_ask_cadence_is_twelve_a_second_plus_the_events_and_not_one_more", async (t) => {
  const clock = askCadence(PILOT_HZ);
  let asks = 0;
  for (let step = 0; step < CONFIG.world.physicsHz; step += 1) if (clock.step(FIXED, false)) asks += 1;
  assert.equal(asks, clock.asks);
  assert.equal(clock.events, 0, "nothing was an event and the clock counted some anyway");
  assert.ok(asks === PILOT_HZ || asks === PILOT_HZ + 1,
    `a second at ${PILOT_HZ} Hz took ${asks} asks, counting the one on the first step`);

  // An event asks between the ticks, and is counted apart so that the two can be told from each
  // other in a run's header. It also *restarts* the period, which is v3's rule. A clock of its own,
  // stepped to a point that is plainly not due, because an event landing on a step that was going
  // to ask anyway is not an event ask and the column would be right to say so.
  const between = askCadence(PILOT_HZ);
  assert.equal(between.step(FIXED, false), true, "the first step of a clock did not ask");
  for (let step = 0; step < 3; step += 1) {
    assert.equal(between.step(FIXED, false), false, "a step a fiftieth of a second in was due");
  }
  const before = between.asks;
  assert.equal(between.step(FIXED, true), true, "an event on a step that was not due asked nothing");
  assert.equal(between.asks, before + 1);
  assert.equal(between.events, 1, "an ask nothing but the event could have caused was not counted");
  assert.equal(between.step(FIXED, false), false, "the period did not restart on the event ask");
  between.arm();
  assert.equal(between.step(FIXED, false), true, "arm() did not force the next step");
  assert.equal(between.events, 1, "a forced ask is not an event ask");

  // Now the executor. The events are switched off and the pilot never commits, so the only thing
  // that can ask is the clock -- and the count has to match an independent one exactly.
  const golem = await standAGolem(t);
  const fixture = place(fixtureOf(golem.view), { x: 0, z: 1.6 });
  const { pilot, seen } = fixedPilot({ commit: 0, parry: 0 });
  const table = { ...GOLEM_TACTICS_V4, eventAsks: false };
  const driven = golemDriven(SEED, table, pilot);
  const steps = drive(fixture, driven, 2.0);

  const reference = askCadence(PILOT_HZ);
  let expected = 0;
  for (let step = 0; step < steps; step += 1) if (reference.step(FIXED, false)) expected += 1;
  assert.equal(driven.asks, expected, `the executor asked ${driven.asks} times over ${steps} steps`);
  assert.equal(seen.asks, driven.asks, "the pilot was called a different number of times than the count says");
  assert.equal(driven.events, 0, "the events were off and some were counted anyway");
  assert.equal(driven.strokes, 0, "nothing asked for a stroke and one was thrown");
});

/**
 * With the events on, their arm turning is an ask, and it is counted as one.
 *
 * The control is the same bout with `eventAsks` off: the difference between the two counts is
 * exactly the events, which is what makes the row a sweep rather than an assertion about a body.
 */
test("their_phase_turning_is_an_ask_of_its_own_and_the_control_row_is_the_same_bout(events off)", async (t) => {
  const golem = await standAGolem(t);
  const run = (eventAsks) => {
    const fixture = place(fixtureOf(golem.view), { x: 0, z: 1.5 });
    const { pilot, seen } = fixedPilot({ commit: 0 });
    const driven = golemDriven(SEED, { ...GOLEM_TACTICS_V4, eventAsks }, pilot);
    // Their arm draws back and runs out again, twice a second, which is a phase turn the reader
    // can see: the extension crosses the guard, chamber and commit thresholds on the way.
    drive(fixture, driven, 3.0, () => {
      const them = fixture.opponent;
      const phase = Math.sin(fixture.clock * Math.PI * 2);
      const out = 1.05 + phase * 0.55;
      for (const name of ["primary", "secondary"]) {
        const hand = them.hands[name];
        hand.tip.x = hand.shoulder.x;
        hand.tip.y = hand.shoulder.y;
        hand.tip.z = hand.shoulder.z - out;
        hand.tipVelocity = { x: 0, y: 0, z: -Math.cos(fixture.clock * Math.PI * 2) * 0.55 * Math.PI * 2 };
        hand.tipSpeed = Math.abs(hand.tipVelocity.z);
      }
      them.tip = { ...them.hands.primary.tip };
    });
    return { asks: driven.asks, events: driven.events, seen: seen.asks };
  };
  const on = run(true);
  const off = run(false);
  assert.equal(on.seen, on.asks);
  assert.ok(on.events > 0, "their arm turned through four phases a second and nothing was an event");
  assert.ok(on.asks > off.asks,
    `the events added nothing: ${on.asks} asks with them and ${off.asks} without`);
  // The due asks with the events on cannot outnumber the asks with them off, and that is the whole
  // of what "and not one ask more" can mean here: an event ask *restarts* the period, so it does
  // not add an ask to the cadence's own, it displaces one. A build that asked on an event and then
  // asked again on the tick it had just pre-empted would break this line and nothing else would.
  assert.ok(on.asks - on.events <= off.asks,
    `${on.asks - on.events} due asks with the events on against ${off.asks} with them off`);
});

// ---------------------------------------------------------------------------------------
// The abort, which is the interruptibility this session is for.
// ---------------------------------------------------------------------------------------

/**
 * A stroke can be taken back at any point in the chamber or in the commit, it leaves a legal pose,
 * it takes effect on the step the gate goes up whether or not that step is an ask, and it costs
 * `abortCooldown` of a cooldown.
 *
 * Four claims in one test because they are one behaviour, and each of them is a way of getting
 * interruptibility wrong that compiles: an abort that only worked mid-chamber would be v3's
 * `chamberAbort` under a new name; an abort that left the arm wherever the arc had got to would be
 * a hand outside its own envelope for the rest of the bout; an abort read only at an ask would take
 * up to a twelfth of a second to arrive, which is a third of a commit; and an abort that cost
 * nothing would make a feint free, which is the whole reason the gate is a decision and not a
 * reflex.
 */
test("an_abort_mid_chamber_and_mid_commit_leaves_a_legal_pose_and_charges_half_a_cooldown", async (t) => {
  const golem = await standAGolem(t);

  // The pilot raises the gate itself, so that the abort lands on the ask that carried it rather
  // than up to a period later: what is being timed is the executor and not the ask cadence.
  const run = (abortIn) => {
    const fixture = place(fixtureOf(golem.view), { x: 0, z: 1.35 });
    let driven = null;
    let raisedAt = -1;
    driven = golemDriven(SEED, GOLEM_TACTICS_V4, () => {
      const wanted = { ...freshCommand(), commit: 1, swing: 1, advance: 0 };
      if (driven !== null && driven.stance === abortIn) {
        wanted.abort = 1;
        wanted.commit = 0;
        if (raisedAt < 0) raisedAt = fixture.clock;
      }
      return wanted;
    });
    let freeAgainAt = -1;
    drive(fixture, driven, 2.5, (intent, step) => {
      assertInsideEnvelope(intent, fixture.self, `${abortIn} step ${step}`);
      if (raisedAt >= 0 && freeAgainAt < 0 && driven.stance === "free") freeAgainAt = fixture.clock;
    });
    return { driven, raisedAt, freeAgainAt };
  };

  for (const stance of ["chamber", "commit"]) {
    const { driven, raisedAt, freeAgainAt } = run(stance);
    assert.ok(raisedAt >= 0, `the executor never reached ${stance}`);
    assert.ok(driven.aborts >= 1, `${stance}: ${driven.aborts} aborts for a raised gate`);
    assert.equal(freeAgainAt, raisedAt,
      `${stance}: the gate went up at ${raisedAt}s and the arm was free at ${freeAgainAt}s`);
  }

  // **Read every step, and not only at an ask.** A command holding both gates up throws a stroke
  // the moment the cooldown allows one and takes it back on the very next step -- and that next
  // step is twenty frames from the nearest ask at twelve a second, so an executor that read its
  // gates at the ask alone would abort a fifth of a second later and this count would be zero.
  const quiet = place(fixtureOf(golem.view), { x: 0, z: 1.35 });
  const both = { ...freshCommand(), commit: 1, abort: 1, swing: 1, advance: 0 };
  const holding = golemDriven(SEED, { ...GOLEM_TACTICS_V4, eventAsks: false }, () => both);
  let offAsk = 0;
  let lastAsks = 0;
  let lastAborts = 0;
  drive(quiet, holding, 3.0, (intent, step) => {
    assertInsideEnvelope(intent, quiet.self, `holding step ${step}`);
    if (holding.aborts > lastAborts && holding.asks === lastAsks) offAsk += 1;
    lastAborts = holding.aborts;
    lastAsks = holding.asks;
  });
  assert.ok(holding.aborts > 1, `a command holding both gates aborted ${holding.aborts} strokes`);
  assert.equal(holding.aborts, holding.strokes,
    `${holding.strokes} strokes and ${holding.aborts} aborts, and every one of them was taken back`);
  assert.ok(offAsk > 0,
    `all ${holding.aborts} aborts landed on an ask, so the gate is not being read every step`);

  // And what it costs. The cooldown is not published, so it is read the only honest way: hold the
  // commit gate up again and see when the next stroke actually starts.
  const cost = (abort) => {
    const fixture = place(fixtureOf(golem.view), { x: 0, z: 1.35 });
    let driven = null;
    let abortedAt = -1;
    let secondAt = -1;
    driven = golemDriven(SEED, { ...GOLEM_TACTICS_V4, abortCooldown: abort }, () => {
      const wanted = { ...freshCommand(), commit: 1, swing: 1, advance: 0 };
      if (driven !== null && driven.stance === "chamber" && driven.strokes === 1) wanted.abort = 1;
      return wanted;
    });
    drive(fixture, driven, 4.0, () => {
      if (abortedAt < 0 && driven.aborts === 1) abortedAt = fixture.clock;
      else if (abortedAt >= 0 && secondAt < 0 && driven.strokes === 2) secondAt = fixture.clock;
    });
    assert.ok(secondAt > 0, `no second stroke after an abort at ${abort}`);
    return secondAt - abortedAt;
  };
  const half = cost(0.5);
  const whole = cost(1);
  const cooldown = GOLEM_TACTICS_V4.cooldown;
  assert.ok(Math.abs(half - cooldown * 0.5) < 0.10,
    `an abort at 0.5 kept the arm for ${half}s against the ${cooldown * 0.5}s it charged`);
  assert.ok(whole - half > cooldown * 0.35,
    `an abort at 1.0 cost ${whole}s and one at 0.5 cost ${half}s, which is not twice`);
});

// ---------------------------------------------------------------------------------------
// The clamp, the envelope, and what the surface resolves against.
// ---------------------------------------------------------------------------------------

/**
 * Every axis outside its range is clamped, and every clamp is counted.
 *
 * The counting is the part worth a test. A clamp is not an error and never shows up as one, so a
 * policy whose head has drifted out of the box would fight for a whole league at the ends of every
 * axis and the only evidence would be that it fought oddly. `NaN` is the case that has to be
 * handled separately and is the one a gradient step actually produces: there is no nearer end of a
 * range to a `NaN`, so it falls back to the neutral command rather than to a bound.
 */
test("every_axis_outside_its_range_is_clamped_and_every_clamp_is_counted", async (t) => {
  const golem = await standAGolem(t);
  const fields = [...COMMAND_AXES, ...COMMAND_GATES];

  const fixture = place(fixtureOf(golem.view), { x: 0, z: 1.4 });
  const wild = Object.fromEntries(fields.map((name) => [name, 99]));
  const driven = golemDriven(SEED, GOLEM_TACTICS_V4, () => wild);
  drive(fixture, driven, 0.5, (intent, step) =>
    assertInsideEnvelope(intent, fixture.self, `wild step ${step}`));
  for (const name of fields) {
    assert.equal(driven.refusals[name], driven.asks, `${name} was written 99 and refused ${driven.refusals[name]} times`);
    assert.equal(driven.command[name], COMMAND_RANGES[name][1], `${name} was not clamped to its roof`);
  }

  const low = place(fixtureOf(golem.view), { x: 0, z: 1.4 });
  const under = Object.fromEntries(fields.map((name) => [name, -99]));
  const sunk = golemDriven(SEED, GOLEM_TACTICS_V4, () => under);
  drive(low, sunk, 0.5, (intent, step) =>
    assertInsideEnvelope(intent, low.self, `sunk step ${step}`));
  for (const name of fields) {
    assert.equal(sunk.command[name], COMMAND_RANGES[name][0], `${name} was not clamped to its floor`);
  }

  const nan = place(fixtureOf(golem.view), { x: 0, z: 1.4 });
  const broken = Object.fromEntries(fields.map((name) => [name, Number.NaN]));
  const neutral = freshCommand();
  const poisoned = golemDriven(SEED, GOLEM_TACTICS_V4, () => broken);
  drive(nan, poisoned, 0.5, (intent, step) =>
    assertInsideEnvelope(intent, nan.self, `nan step ${step}`));
  for (const name of fields) {
    assert.equal(poisoned.command[name], neutral[name], `${name} arrived as NaN and did not fall back`);
    assert.equal(poisoned.refusals[name], poisoned.asks, `${name} arrived as NaN and was not counted`);
  }

  // A command inside every range is refused nothing at all, which is the other half of the claim.
  const clean = place(fixtureOf(golem.view), { x: 0, z: 1.4 });
  const { pilot } = fixedPilot({ commit: 1, swing: 0.5 });
  const good = golemDriven(SEED, GOLEM_TACTICS_V4, pilot);
  drive(clean, good, 1.0);
  for (const name of fields) assert.equal(good.refusals[name], 0, `${name} was refused on a legal command`);
});

/**
 * Every command the driver emits sits inside the published envelope, on seven real bodies.
 *
 * `tests/golem-mind.test.mjs` asks this of the first executor and the sweep is the same sweep: six
 * rings, seven bearings and three heights, which is a body in front of another body in every
 * arrangement the two can be in, including the ones a bout would never produce. The seven builds
 * are the seven that body's test uses, because the ways an envelope goes wrong are properties of a
 * chain and a terminal rather than of a mind -- a capped socket with nothing to command, a maul
 * with no azimuth at all, a paired grip whose second channel is written over.
 */
test("every_command_the_driver_emits_sits_inside_the_published_envelope", async (t) => {
  for (const [label, setup] of [
    ["default", defaultGolemSetup()],
    ["mace", setupWith({ primary: { chain: "wrist", terminal: "mace" },
      secondary: { chain: "reach", terminal: "plate" } })],
    ["maul", setupWith({ primary: MAUL, secondary: MAUL })],
    ["pitch", setupWith({ primary: { chain: "pitch", terminal: "blade" },
      secondary: { chain: "pitch", terminal: "plate" } })],
    ["whip", setupWith({ primary: { chain: "wrist", terminal: "whip" },
      secondary: { chain: "reach", terminal: "plate" } })],
    ["fist", setupWith({ primary: { chain: "wrist", terminal: "fist" },
      secondary: { chain: "pitch", terminal: "fist" } })],
    ["capped", setupWith({ head: "head.ram",
      primary: { chain: "none", terminal: "none" },
      secondary: { chain: "none", terminal: "none" } })],
  ]) {
    const golem = await standAGolem(t, setup);
    const fixture = fixtureOf(golem.view);
    const steps = sweepPlaces(fixture, golemDriver(SEED), label);
    assert.ok(steps > 3000, `${label} only stepped ${steps} times`);
  }
});

/**
 * The mark is resolved against what the body in front publishes, and against no module id.
 *
 * The two target axes are the only place on this surface where a mind names a *place on somebody
 * else*, and frozen rule 1 of the set says it may not do that by naming a part. So the height is a
 * fraction of the rise from the floor they stand on to the crown of their head, and the lateral is
 * a fraction of the radius they take up, across the way they are facing -- four numbers every body
 * in the program publishes. What is asserted here is that the two commands actually steer the arm,
 * monotonically and in the right sense, because a target resolved against the wrong frame would
 * still look like a mind aiming somewhere.
 */
test("the_target_command_steers_the_arm_and_is_resolved_against_the_published_body", async (t) => {
  const golem = await standAGolem(t);
  const strokePose = (over, z = 1.35) => {
    const fixture = place(fixtureOf(golem.view), { x: 0, z });
    const { pilot } = fixedPilot({ commit: 1, swing: 0, bite: 0, advance: 0, ...over });
    const driven = golemDriven(SEED, GOLEM_TACTICS_V4, pilot);
    let pose = null;
    drive(fixture, driven, 1.2, (intent) => {
      if (driven.stance !== "commit" || pose !== null) return;
      const hand = intent[intent.actingHand];
      pose = { pointerX: hand.pointerX, pointerY: hand.pointerY, crouch: intent.posture.crouch };
    });
    assert.ok(pose, "no stroke ever committed");
    return pose;
  };

  const low = strokePose({ targetHeight: 0.15 });
  const mid = strokePose({ targetHeight: 0.5 });
  const high = strokePose({ targetHeight: 0.95 });
  assert.ok(low.pointerY < mid.pointerY && mid.pointerY < high.pointerY,
    `the lift does not follow the height: ${low.pointerY}, ${mid.pointerY}, ${high.pointerY}`);

  // The crouch, which is the derived half of the same command: the carrier sinks when the mark is
  // below the floor of the arm's own shell. It takes a mark low *and* close for the angle to run
  // out of the shell at all -- at a stand-off it is a shallow look downward and the arm has it --
  // so the pair is taken nose to nose, which is also the only place the crouch would ever matter.
  const stooped = strokePose({ targetHeight: 0 }, 0.95);
  const upright = strokePose({ targetHeight: 1 }, 0.95);
  assert.ok(stooped.crouch > 0.1,
    `a mark on the floor at arm's length did not crouch the carrier: ${stooped.crouch}`);
  assert.equal(upright.crouch, 0, `a mark at the crown crouched the carrier: ${upright.crouch}`);

  const left = strokePose({ targetLateral: -1 });
  const centre = strokePose({ targetLateral: 0 });
  const right = strokePose({ targetLateral: 1 });
  assert.ok((left.pointerX - centre.pointerX) * (right.pointerX - centre.pointerX) < 0,
    `the two sides of their body are on the same side of the swing: ${left.pointerX}, ${centre.pointerX}, ${right.pointerX}`);
});

/**
 * The stand-off is the mind's, and the executor floors it at nothing.
 *
 * v2 and v3 floor a hold at `max(reach * holdFraction, near + slack, theirReach * standOffFraction)`
 * and all three of those terms are tactics. Here the whole of it is the command, which is what makes
 * "half a step closer than last time" a thing that can be said: the same body at the same gap walks
 * *in* under one number and *out* under another, and nothing in the executor has an opinion about
 * which of them is sensible.
 *
 * The two floors are tested by putting the feet somewhere each of them would visibly move. A floor
 * at `reach * holdFraction` turns the first row's full-speed walk-in into a fifth of one, and a
 * floor at `near + slack` turns the third row's walk-in into a walk *out*, because the third row
 * asks the body to stand somewhere it cannot reach from -- which is a thing to be charged for on
 * the bar and not forbidden by the arm.
 */
test("the_stand_off_is_the_minds_and_the_executor_floors_it_at_nothing", async (t) => {
  const golem = await standAGolem(t);
  const feet = (standOff, z) => {
    const fixture = place(fixtureOf(golem.view), { x: 0, z });
    const { pilot } = fixedPilot({ standOff, commit: 0 });
    const driven = golemDriven(SEED, GOLEM_TACTICS_V4, pilot);
    let forward = 0;
    drive(fixture, driven, 0.5, (intent) => { forward = intent.forward; });
    return { forward, hold: driven.reading.hold, gap: driven.reading.gap, near: driven.reading.near };
  };
  const close = feet(0.2, 1.5);
  const far = feet(2.4, 1.5);
  assert.ok(close.forward > 0.9,
    `a stand-off of a fifth of their reach did not walk in at full speed: forward ${close.forward}`);
  assert.ok(far.forward < -0.9,
    `a stand-off of two and a half of their reach did not back off: forward ${far.forward}`);
  assert.ok(close.hold < far.hold);

  // Inside its own inner radius is a place this executor will hold, and it is the reason the floor
  // is gone: refusing it would be the executor having a tactic about where a fight happens.
  const inner = feet(0, 0.5);
  assert.equal(inner.hold, 0, "a stand-off of zero was floored at something");
  assert.ok(inner.gap < inner.near,
    `the close row was meant to be inside the arm's own radius: gap ${inner.gap}, near ${inner.near}`);
  assert.ok(inner.forward > 0.9,
    `a stand-off of zero backed the body out of its own inner radius: forward ${inner.forward}`);
});

// ---------------------------------------------------------------------------------------
// The four candidates Session 07 of the learn set landed behind flags.
// ---------------------------------------------------------------------------------------

/**
 * Every candidate the probe measures is off in the table that ships, and off means inert.
 *
 * Two claims, and the second is the one worth having. That the rows *read* as the shipped values is
 * a spelling check; what says a flag is really defaulted off is that a bout under the shipped table
 * and a bout under the table with all four candidates written out at their defaults are the same
 * bout to the digit. A row added to the executor and then read somewhere it should not be -- a
 * `closeGain` that quietly moved, an `askHz` that rounds differently once it is spelled -- passes the
 * first half and fails the second.
 *
 * `closeGain` is checked against the first executor's row rather than a literal because the whole
 * point of the candidate is that 1.8 is inherited and not chosen: it has been the same number since
 * `src/golem/tactics.ts`, through v2 and v3, and no session has ever measured whether it is right.
 */
test("the_four_candidates_default_to_what_ships_and_a_default_is_inert", async (t) => {
  assert.equal(GOLEM_TACTICS_V4.holdMetres, false, "the metres flag shipped up");
  assert.equal(GOLEM_TACTICS_V4.strokeOutOfRange, true, "the out-of-range gate shipped closed");
  assert.equal(GOLEM_TACTICS_V4.askHz, PILOT_HZ, "the executor and the pilot disagree about cadence");
  assert.equal(GOLEM_TACTICS_V4.closeGain, GOLEM_TACTICS.closeGain,
    "the fourth executor's closing gain has drifted off the first's, which is where 1.8 comes from");

  const golem = await standAGolem(t);
  const trace = (table, command, z) => {
    const fixture = place(fixtureOf(golem.view), { x: 0, z });
    const driven = golemDriven(SEED, table, fixedPilot(command).pilot);
    const frames = [];
    drive(fixture, driven, 3.0, (intent) => {
      const hand = intent[intent.actingHand];
      frames.push([intent.forward, intent.strafe, hand.reach, hand.thrust ? 1 : 0,
        driven.reading.hold, driven.strokes, driven.aborts]);
    });
    return frames;
  };
  const CLOSE = [{ standOff: 1.1, advance: 0.4, commit: 1 }, 1.6];
  const shipped = trace(GOLEM_TACTICS_V4, ...CLOSE);
  const spelled = trace({ ...GOLEM_TACTICS_V4,
    holdMetres: false, strokeOutOfRange: true, askHz: PILOT_HZ, closeGain: GOLEM_TACTICS.closeGain },
  ...CLOSE);
  assert.deepEqual(spelled, shipped, "writing the four defaults out changed the bout");
  assert.ok(shipped.length > 100, `only ${shipped.length} steps in three seconds`);

  // And each flag, turned up on its own, moves something -- otherwise the row above is a test that
  // four names exist and the probe would be measuring nothing at all. Three of them are asked at the
  // close stand-off the row above uses; `strokeOutOfRange` cannot be, because it is a gate on being
  // *out* of range and at a hold the arm can reach from there is nothing for it to gate. It is asked
  // where it bites: held two and a half of their reach out, with the commit gate up the whole time.
  const moved = (over, command, z) =>
    !deepEqualish(trace({ ...GOLEM_TACTICS_V4, ...over }, command, z), trace(GOLEM_TACTICS_V4, command, z));
  assert.ok(moved({ holdMetres: true }, ...CLOSE),
    "holdMetres true changed nothing on a body of this reach");
  assert.ok(moved({ closeGain: 3.6 }, ...CLOSE), "doubling the closing gain changed nothing");
  assert.ok(moved({ strokeOutOfRange: false }, { standOff: 2.5, advance: 0, commit: 1 }, 2.6),
    "gating the stroke on range changed nothing at a hold the arm cannot reach from");

  // `askHz` is the fourth, and it is counted rather than compared, because a pilot that answers the
  // same thing every ask -- which is what `fixedPilot` is -- produces the same bout at any cadence.
  // What the flag buys is how often the mind is *consulted*, so that is what is asked for.
  const askedAt = (askHz) => {
    const fixture = place(fixtureOf(golem.view), { x: 0, z: 1.6 });
    const { pilot, seen } = fixedPilot(CLOSE[0]);
    drive(fixture, golemDriven(SEED, { ...GOLEM_TACTICS_V4, askHz, eventAsks: false }, pilot), 3.0);
    return seen.asks;
  };
  const shippedAsks = askedAt(PILOT_HZ);
  assert.ok(Math.abs(shippedAsks - PILOT_HZ * 3) <= 2,
    `the shipped cadence asked ${shippedAsks} times in three seconds, not about ${PILOT_HZ * 3}`);
  assert.ok(askedAt(24) > shippedAsks * 1.8,
    `doubling the ask cadence took ${askedAt(24)} asks against ${shippedAsks}`);
});

/** Deep equality that answers rather than throws, for the four rows above. */
function deepEqualish(a, b) {
  try { assert.deepEqual(a, b); return true; } catch { return false; }
}

// ---------------------------------------------------------------------------------------
// The seed, the refusal, and the columns.
// ---------------------------------------------------------------------------------------

test("the_fourth_executor_refuses_a_null_pilot", () => {
  assert.throws(() => golemDriven(SEED, GOLEM_TACTICS_V4, null), /no pilot/);
  assert.throws(() => golemDriven(SEED), /no pilot/);
});

/**
 * A bout under a seed is the bout, and a different seed is a different bout.
 *
 * The second half is the one that catches the defect worth catching. A mind seeded from
 * `Math.random()` rather than from its argument passes the first half of this test every time,
 * because two instances built in one process do not have to differ; what says the seed is wired is
 * that two *different* seeds produce two different bouts.
 */
test("a_bout_under_a_seed_is_the_bout", async (t) => {
  const golem = await standAGolem(t);
  const trace = (seed) => {
    const fixture = place(fixtureOf(golem.view), { x: 0, z: 1.45 });
    const driven = golemDriver(seed, DRIVER);
    const frames = [];
    drive(fixture, driven, 4.0, (intent) => {
      const hand = intent[intent.actingHand];
      frames.push([intent.forward, intent.strafe, intent.posture.trunkLean,
        hand.pointerX, hand.pointerY, hand.reach, hand.thrust ? 1 : 0]);
    });
    return frames;
  };
  assert.deepEqual(trace(SEED), trace(SEED), "the same seed produced two different bouts");
  const other = trace(SEED + 1);
  const same = trace(SEED);
  assert.notDeepEqual(other, same, "two different seeds produced the same bout to the digit");
});

/**
 * The feature vector is the published width, refuses any other, and is finite everywhere.
 *
 * Finite everywhere is not a formality: half the tail is a clock that is infinity until the thing
 * it counts has happened, and a column that carried `Infinity` into a first layer of weights would
 * make every output of the network `NaN` from the first ask of the bout.
 */
test("the_pilot_feature_vector_is_the_published_width_and_is_finite_everywhere", async (t) => {
  assert.equal(PILOT_FEATURE_NAMES.length, PILOT_FEATURE_COUNT);
  assert.equal(new Set(PILOT_FEATURE_NAMES).size, PILOT_FEATURE_COUNT, "two columns share a name");
  assert.equal(PILOT_FEATURES_VERSION, 1);

  const golem = await standAGolem(t);
  const fixture = place(fixtureOf(golem.view), { x: 0, z: 1.4 });
  const into = new Float64Array(PILOT_FEATURE_COUNT);
  const seen = [];
  const driven = golemDriven(SEED, GOLEM_TACTICS_V4, (reading, view) => {
    pilotFeatures(reading, view, into);
    seen.push(Float64Array.from(into));
    return { ...freshCommand(), commit: 1 };
  });
  drive(fixture, driven, 2.0);
  assert.ok(seen.length > 20, `only ${seen.length} asks in two seconds`);
  for (const [ask, row] of seen.entries()) {
    for (const [i, value] of row.entries()) {
      assert.ok(Number.isFinite(value),
        `ask ${ask} column ${i} (${PILOT_FEATURE_NAMES[i]}) is ${value}`);
      assert.ok(Math.abs(value) <= 4, `ask ${ask} column ${PILOT_FEATURE_NAMES[i]} is ${value}`);
    }
  }
  assert.throws(() => pilotFeatures(driven.reading, fixture, new Float64Array(3)), /wide/);
});

// ---------------------------------------------------------------------------------------
// One real bout.
// ---------------------------------------------------------------------------------------

/**
 * The driver in front of a real body, against the mind the set has been rating against since
 * Session 05 of the matchup set.
 *
 * Fourteen seconds is not a rating and this test does not pretend to be one -- the rating is 2,048
 * bouts in `docs/measurements.md` under Session 12. What it is for is the four things that can only
 * go wrong with real physics under them: the mind is asked at all, it lands something, it does not
 * spend the bout refusing its own commands, and the ram head charges on a body whose arms are
 * capped sockets and which therefore has no stroke to gate.
 */
test("golem_driver_fights_a_real_bout_and_the_ram_head_charges", async () => {
  const physics = await freshHavok();
  const run = (setup, label) => {
    const driven = golemDriver(SEED, DRIVER);
    const blows = { left: 0, right: 0 };
    const result = runBout({
      left: "golem-driver", right: "golem-fencer",
      leftUnit: "golem", rightUnit: "golem",
      leftGolem: setup, rightGolem: defaultGolemSetup(),
      locomotionMode: "supported",
      seeds: [SEED, SEED + 17],
      maxSeconds: 14,
      physics,
      leftMind: { name: "golem-driver", driven, decide: (view, dt) => driven.decide(view, dt) },
      rightMind: golemFencer(SEED + 17),
      onEvent: (event) => { blows[event.side] += 1; },
    });
    assert.ok(driven.asks > 0, `${label}: the driver was never asked anything in fourteen seconds`);
    const rate = driven.asks / result.seconds;
    assert.ok(rate > PILOT_HZ * 0.9 && rate < PILOT_HZ * 2.5,
      `${label}: ${rate.toFixed(1)} asks a second against a cadence of ${PILOT_HZ}`);
    for (const [name, count] of Object.entries(driven.refusals)) {
      assert.equal(count, 0, `${label}: the driver wrote ${name} out of range ${count} times`);
    }
    return { blows, strokes: driven.strokes, aborts: driven.aborts, seconds: result.seconds };
  };

  const plain = run(defaultGolemSetup(), "the default golem");
  assert.ok(plain.strokes > 0, "the driver never threw a stroke in fourteen seconds");
  assert.ok(plain.blows.left > 0, "golem-driver landed nothing at all in fourteen seconds");
  assert.ok(plain.aborts > 0,
    "the driver never took a stroke back, and a feint at 0.15 over that many strokes is a certainty");

  const capped = run(setupWith({ head: "head.ram",
    primary: { chain: "none", terminal: "none" },
    secondary: { chain: "none", terminal: "none" } }), "the ram head");
  assert.ok(capped.strokes > 0, "a body whose only weapon is its head never charged");
  assert.ok(capped.blows.left > 0, "the ram head landed nothing at all in fourteen seconds");
});
