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
// | *(2026-09-12)* read `command.abort` every step whatever `latchAbort` says | the latch test |
// | *(2026-09-12)* have the latch disable the gate rather than hold its first read | the refusal test |
// | *(2026-09-12)* clear the latch nowhere **and** write it at the chamber as `latchedAbort \|\| ...` | the refusal test |
// | *(2026-09-12)* `askHz` 16, or `commitSeconds` 0.40 | the five-to-eight-asks test |
//
// The third of those is a pair on purpose and the entry says so: the clear on the way into `free`
// and the outright write at each chamber mask each other, so **neither mutates red on its own**.
// That is a redundancy rather than a defect and `tactics-v4.ts` carries the argument for keeping
// both; what a table of single mutations would have claimed here is a pin that does not exist.
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
  PILOT_FEATURE_COUNT, PILOT_FEATURE_COUNT_V2, PILOT_FEATURE_NAMES, PILOT_FEATURE_NAMES_V2,
  PILOT_FEATURE_VERSIONS_READ, PILOT_FEATURES_DEFAULT, PILOT_FEATURES_VERSION, PILOT_HZ,
  PILOT_TRACE_COLUMNS, PILOT_TRACE_DECAYS, PILOT_TRACE_NAMES,
  askCadence, pilotFeatureCount, pilotFeatureNames, pilotFeatures, pilotTrace,
} from "../src/golem/pilot.ts";
import { DRIVER, golemDriver } from "../src/golem/styles/driver.ts";
import { golemFencer } from "../src/golem/tactics-v2.ts";
import { golemPolicy } from "../src/golem/policy.ts";
import { POLICY_WEIGHTS } from "../src/golem/policy-weights.ts";

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
function place(fixture, { x, z, facing = Math.PI, shoulderY = 1.42, crownY = 1.75, reach = 1.45 }) {
  const them = fixture.opponent;
  them.unit = "warrior";
  them.ground.x = x; them.ground.y = 0; them.ground.z = z;
  them.facing = facing;
  them.shoulder.x = x + 0.21; them.shoulder.y = shoulderY; them.shoulder.z = z;
  them.crownHeight = crownY;
  them.vitalHeight = shoulderY * 0.82;
  them.reach = reach;
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
    hand.reach = reach;
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
// `latchAbort`: the same gate read once a stroke instead of once a step. Session 04 of the
// signal set, and the row ships **off** -- that session measures it and adopts nothing.
// ---------------------------------------------------------------------------------------

/**
 * With the row up the abort gate is the stroke's, taken at the chamber; with it down it is the
 * step's, and a command that goes up after the stroke has started still takes the stroke back.
 *
 * **This is the difference between one Bernoulli draw and five to eight of them**, which is the
 * whole of what the row is for: a policy whose abort head sits at p aborts a stroke with
 * probability `p` under the latch and `1 - (1 - p)^k` without it, and at the shipped table's
 * p = 0.45 those are 45 % and 99 %. The two arms are driven by *the same pilot* against the same
 * fixture from the same seed, so the only thing that differs between the two columns below is the
 * row, and a latch that merely delayed the read by a step would leave both columns equal.
 */
test("the_latch_reads_the_abort_gate_at_the_stroke_and_the_row_down_reads_it_every_step", async (t) => {
  assert.equal(GOLEM_TACTICS_V4.latchAbort, false, "the latch flag shipped up");

  const golem = await standAGolem(t);
  // The gate goes up only once a stroke is in flight, and comes down again while the arm is free.
  // So the ask that *starts* each stroke always carries `abort` at nothing, and every ask after it
  // carries it at one: exactly the command a held read must abort and a latched read must not.
  const run = (latchAbort) => {
    const fixture = place(fixtureOf(golem.view), { x: 0, z: 1.35 });
    let driven = null;
    driven = golemDriven(SEED, { ...GOLEM_TACTICS_V4, latchAbort }, () => {
      const wanted = { ...freshCommand(), commit: 1, swing: 1, advance: 0 };
      if (driven !== null && driven.stance !== "free") { wanted.abort = 1; wanted.commit = 0; }
      return wanted;
    });
    let recovered = 0;
    let wasRecovering = false;
    drive(fixture, driven, 3.0, (intent, step) => {
      assertInsideEnvelope(intent, fixture.self, `latchAbort ${latchAbort} step ${step}`);
      if (driven.stance === "recover" && !wasRecovering) recovered += 1;
      wasRecovering = driven.stance === "recover";
    });
    return { strokes: driven.strokes, aborts: driven.aborts, recovered };
  };

  const latched = run(true);
  const held = run(false);

  assert.ok(latched.strokes >= 2,
    `the latched arm threw ${latched.strokes} strokes in three seconds, which is too few to read`);
  assert.equal(latched.aborts, 0,
    `${latched.aborts} of ${latched.strokes} latched strokes were aborted by a gate raised after `
    + "the stroke had already started");
  assert.equal(latched.recovered, latched.strokes,
    `${latched.strokes} latched strokes and ${latched.recovered} of them ran through to a recover`);

  assert.ok(held.aborts >= 2,
    `the held arm aborted ${held.aborts} of ${held.strokes} strokes under the same pilot`);
  assert.equal(held.aborts, held.strokes,
    `${held.strokes} held strokes and ${held.aborts} aborts, and the gate is up on every ask after `
    + "the first one, so every stroke should have been taken back");
  assert.equal(held.recovered, 0,
    `${held.recovered} held strokes reached a recover with the abort gate up throughout`);
});

/**
 * The row latches the gate; it does not disable it.
 *
 * The cheap way to make the test above pass is to stop reading `abort` at all while striking, and
 * that would be a body which cannot be called off a stroke by any command whatsoever -- a strictly
 * worse surface than the one it replaces, and green on every assertion in this file. So the other
 * half is asserted directly: with the gate up on the ask that *starts* the stroke, the stroke is
 * refused on the very next step, at the same `abortCooldown`, and never reaches its commit.
 */
test("a_latched_abort_raised_on_the_ask_that_starts_the_stroke_still_refuses_it", async (t) => {
  const golem = await standAGolem(t);
  // `eventAsks` off for the reason the held-gate half of the abort test turns it off: what is being
  // counted is strokes against aborts, and an event ask in the middle of one is a second command in
  // a window this test wants to be a single standing order.
  const hold = (over) => {
    const fixture = place(fixtureOf(golem.view), { x: 0, z: 1.35 });
    const command = { ...freshCommand(), commit: 1, swing: 1, advance: 0, ...over };
    const driven = golemDriven(SEED,
      { ...GOLEM_TACTICS_V4, latchAbort: true, eventAsks: false }, () => command);
    const stances = new Set();
    drive(fixture, driven, 3.0, (intent, step) => {
      assertInsideEnvelope(intent, fixture.self, `holding ${JSON.stringify(over)} step ${step}`);
      stances.add(driven.stance);
    });
    return { strokes: driven.strokes, aborts: driven.aborts, stances };
  };

  const refused = hold({ abort: 1 });
  assert.ok(refused.strokes > 1,
    `a command holding both gates started ${refused.strokes} strokes under the latch`);
  assert.equal(refused.aborts, refused.strokes,
    `${refused.strokes} strokes started and ${refused.aborts} refused: a latch that read the gate `
    + "at the chamber takes every one of them back on the next step");
  assert.ok(!refused.stances.has("commit"),
    "a stroke refused on the step after its chamber cannot have reached its commit");

  // And the control, because "every stroke aborted" is also what a body that cannot strike at all
  // reports: the same table, the same pilot, the gate down.
  const thrown = hold({ abort: 0 });
  assert.ok(thrown.strokes > 1, `${thrown.strokes} strokes with the gate down under the latch`);
  assert.equal(thrown.aborts, 0, `${thrown.aborts} aborts with the gate down under the latch`);
  assert.ok(thrown.stances.has("commit"), "no stroke reached its commit with the gate down");

  // And a latch is a property of *this* stroke: raised for the first one and lowered afterwards, it
  // takes the first back and leaves the second alone. A latch cleared anywhere but on the way into
  // `free` -- or not cleared at all -- aborts every stroke after the first from a command the mind
  // has since withdrawn, which is a body that goes permanently inert on one raised gate.
  const fixture = place(fixtureOf(golem.view), { x: 0, z: 1.35 });
  let once = null;
  once = golemDriven(SEED, { ...GOLEM_TACTICS_V4, latchAbort: true, eventAsks: false }, () => ({
    ...freshCommand(), commit: 1, swing: 1, advance: 0,
    abort: once !== null && once.strokes === 0 ? 1 : 0,
  }));
  let reachedRecover = false;
  drive(fixture, once, 3.0, (intent, step) => {
    assertInsideEnvelope(intent, fixture.self, `one latched stroke step ${step}`);
    if (once.strokes > 1 && once.stance === "recover") reachedRecover = true;
  });
  assert.ok(once.strokes > 1, `only ${once.strokes} strokes after one latched abort`);
  assert.equal(once.aborts, 1,
    `${once.aborts} aborts for a gate raised on the first stroke alone: the latch outlived it`);
  assert.ok(reachedRecover, "no stroke after the latched one ran through to a recover");
});

/**
 * A stroke spans five to eight asks, and that exponent is what the record's two abort rates are.
 *
 * `uniform` was measured aborting **99.2 %** of the strokes it started and the 400-iteration fit
 * **88 %**, and both were written down as facts about a policy. They are not. A gate drawn afresh
 * on every ask of a stroke survives `(1 - p)^k`, and at `p` 0.5 with `k` 7 that is 0.8 % and at
 * `p` 0.30 with `k` 6 it is 12 % -- the two measured rates, to the digit, from the executor's own
 * timings and the ask period. So the exponent is a published quantity and is pinned here: if a
 * stroke's duration or `askHz` ever moves, this test goes red and the two rates in
 * `docs/measurements.md` stop being predictions of anything.
 *
 * Both halves are asserted, because either alone is satisfied by its own setup. The arithmetic is
 * taken over **every** blended shape -- each weapon kind at five swings -- and then the same
 * arithmetic is checked against a stroke actually driven, so what is pinned is the executor's
 * clock and not a second copy of the table.
 */
test("a_stroke_spans_five_to_eight_asks_which_is_what_the_two_published_abort_rates_predict",
  async (t) => {
    const T = GOLEM_TACTICS_V4;
    const period = 1 / T.askHz;
    /** What `plan` runs a stroke for: the chamber, then the longer of the commit and the follow. */
    const strokeSecondsOf = (kind, swing) => {
      const arc = blendArc(kind, swing);
      const wide = T.cutSeconds > 0 ? T.cutSeconds : COMMITTED_SHAPES[kind].strokeSeconds;
      const quick = T.thrustSeconds > 0 ? T.thrustSeconds : THRUST_SHAPES[kind].strokeSeconds;
      const sweep = (1 - swing) * quick + swing * wide;
      return arc.chamberSeconds + Math.max(T.commitSeconds, sweep + T.followSeconds);
    };

    let shortest = { seconds: Infinity, at: "" };
    let longest = { seconds: -Infinity, at: "" };
    for (const kind of Object.keys(COMMITTED_SHAPES)) {
      for (const swing of [0, 0.25, 0.5, 0.75, 1]) {
        const seconds = strokeSecondsOf(kind, swing);
        const asks = Math.floor(seconds / period);
        assert.ok(asks >= 5 && asks <= 8,
          `${kind} at swing ${swing} runs ${seconds.toFixed(3)}s, which is ${asks} asks at `
          + `${T.askHz} Hz and not the five to eight the survival arithmetic is stated over`);
        if (seconds < shortest.seconds) shortest = { seconds, at: `${kind} at swing ${swing}` };
        if (seconds > longest.seconds) longest = { seconds, at: `${kind} at swing ${swing}` };
      }
    }
    assert.equal(shortest.seconds.toFixed(2), "0.44",
      `the shortest blended stroke is ${shortest.at} at ${shortest.seconds}s`);
    assert.equal(longest.seconds.toFixed(2), "0.67",
      `the longest blended stroke is ${longest.at} at ${longest.seconds}s`);

    // The two rates the record published, recomputed from those two exponents.
    assert.equal(((1 - 0.5) ** 7 * 100).toFixed(1), "0.8",
      "a coin-flip gate over seven asks is not the 0.8 % of strokes `uniform` finished");
    assert.equal(((1 - 0.30) ** 6 * 100).toFixed(0), "12",
      "a gate at 0.30 over six asks is not the 12 % of strokes the 400-iteration fit finished");

    // And the same arithmetic against a stroke that was actually driven, so that this is a claim
    // about the executor's clock rather than a second reading of the table it is written from.
    const golem = await standAGolem(t);
    const measured = (swing) => {
      const fixture = place(fixtureOf(golem.view), { x: 0, z: 1.35 });
      const driven = golemDriven(SEED, GOLEM_TACTICS_V4,
        fixedPilot({ commit: 1, swing, advance: 0 }).pilot);
      let frames = 0;
      let done = false;
      drive(fixture, driven, 2.5, () => {
        const striking = driven.stance === "chamber" || driven.stance === "commit";
        if (done) return;
        if (striking) frames += 1;
        else done = frames > 0;
      });
      return frames;
    };
    const kind = (await standAGolem(t)).view.self.hands.primary.weapon;
    assert.ok(kind in COMMITTED_SHAPES, `the fixture golem holds ${kind}, which has no arc`);
    for (const swing of [0, 1]) {
      const frames = measured(swing);
      const expected = Math.round(strokeSecondsOf(kind, swing) * CONFIG.world.physicsHz);
      assert.ok(Math.abs(frames - expected) <= 2,
        `a driven ${kind} stroke at swing ${swing} ran ${frames} frames against the ${expected} `
        + "the shape's own seconds ask for");
      const asks = Math.floor((frames / CONFIG.world.physicsHz) / period);
      assert.ok(asks >= 5 && asks <= 8,
        `a driven ${kind} stroke at swing ${swing} spanned ${asks} asks`);
    }
  });

/**
 * The property Session 04 of the signal set is stated on: the shipped head, read **drawn**, in a
 * real bout, completes about one stroke in ten with the gate held and about two in three latched.
 *
 * **This is checked here and not inferred from a rating**, because a rating is a margin and a
 * margin cannot say why it moved. What the two columns have to show is the exponent: a gate at `p`
 * re-drawn on every ask of a stroke survives `(1 - p)^k` and the same gate read once survives
 * `1 - p`, so `ln(held) / ln(latched)` recovers the number of draws a stroke actually pays for.
 *
 * **The band asserted on it is deliberately wider than the five to eight the test above pins, and
 * the reason is a finding rather than slack.** The asks inside one stroke are independent coin
 * flips only if the logit they are drawn at is independent, and it is not: the observation barely
 * moves through a stroke, so a stroke is closer to one draw of `p` followed by `k` flips at that
 * same `p`, and `E[(1-p)^k]` over a spread of `p` is well above `(1-E[p])^k`. Measured, the
 * effective exponent is **5.58 on this fixture and 3.13 over the 600-bout random-viable rating in
 * `docs/measurements.md`** -- both above one, neither as high as the ask count. So what is
 * asserted is the pair of bounds the argument actually supports: more than one draw a stroke, and
 * no more than the asks a stroke spans.
 *
 * The bar the plan stated was **0.80 latched** and it is missed; the reason is not the row and is
 * written down where the miss is, in `docs/measurements.md`. In short: under the latch the
 * completion rate *is* one minus the gate's own rate on the ask that starts the stroke, by
 * construction, and that rate is a third to a half on the shipped head. A latch cannot make a gate
 * say something the head did not.
 */
test("the_latch_turns_one_completed_stroke_in_ten_into_two_in_three_at_the_drawn_read", async () => {
  const physics = await freshHavok();
  const run = (latchAbort) => {
    let strokes = 0;
    let aborts = 0;
    let asks = 0;
    let raised = 0;
    for (const seed of [SEED, SEED + 101, SEED + 202, SEED + 303]) {
      const mind = golemPolicy(seed, POLICY_WEIGHTS, { ...GOLEM_TACTICS_V4, latchAbort }, null, true,
        (reading, view, command) => { asks += 1; if (command.abort >= 0.5) raised += 1; });
      runBout({
        left: "golem-policy", right: "golem-fencer",
        leftUnit: "golem", rightUnit: "golem",
        leftGolem: defaultGolemSetup(), rightGolem: defaultGolemSetup(),
        locomotionMode: "supported",
        seeds: [seed, seed + 17], maxSeconds: 30, physics,
        leftMind: { name: "golem-policy", driven: mind.driven, decide: (v, dt) => mind.decide(v, dt) },
        rightMind: golemFencer(seed + 17),
      });
      strokes += mind.driven.strokes;
      aborts += mind.driven.aborts;
    }
    return { strokes, completion: (strokes - aborts) / strokes, p: raised / asks };
  };

  const held = run(false);
  const latched = run(true);
  assert.ok(held.strokes > 100 && latched.strokes > 40,
    `${held.strokes} held strokes and ${latched.strokes} latched ones is too few to read a rate off`);

  // The head sits near a coin flip on this gate, which is the thing `entropyGrad` does to every
  // gate logit and the reason the exponent matters at all. If this ever leaves the band, the two
  // completion figures below are about a different policy and the arithmetic has to be re-taken.
  for (const [label, arm] of [["held", held], ["latched", latched]]) {
    assert.ok(arm.p > 0.2 && arm.p < 0.7,
      `${label}: the drawn head raised abort on ${(arm.p * 100).toFixed(1)} % of asks, which is not `
      + "the near-coin-flip the survival arithmetic is stated over");
  }

  assert.ok(held.completion < 0.20,
    `the held gate completed ${held.completion.toFixed(3)} of the strokes it started, and a gate `
    + "re-drawn five to eight times a stroke cannot complete a fifth of them");
  assert.ok(latched.completion > 0.50,
    `the latched gate completed ${latched.completion.toFixed(3)} of its strokes, and one draw at a `
    + "rate under a half cannot lose more than half of them");
  assert.ok(latched.completion > held.completion * 4,
    `${latched.completion.toFixed(3)} latched against ${held.completion.toFixed(3)} held is less `
    + "than the fourfold the exponent asks for");

  // And the exponent itself, recovered from the two rates, against the two bounds the argument
  // supports rather than against the ask count it does not. See the block comment above.
  const k = Math.log(held.completion) / Math.log(latched.completion);
  assert.ok(k > 2 && k < 9,
    `two measured completion rates imply ${k.toFixed(2)} effective draws a stroke, and the held `
    + "gate has to cost more than the one draw the latch costs and cannot cost more than the "
    + "five to eight asks a stroke spans");
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

// ---------------------------------------------------------------------------------------
// The three rows Session 09 of the learn set drove an arm under.
// ---------------------------------------------------------------------------------------

/**
 * `holdMyReach`: the zero of the stand-off axis stops being a fact about the body in front.
 *
 * **This is the row the whole session's reading of the owner's complaint rests on.** The complaint
 * is that a mind cannot say "just inside my own range", and Session 07 measured why: the stroke's
 * own gate opens at `max(reach * strikeFraction, near + slack)` -- 0.92 of *my* arm -- while the
 * axis that decides where the feet stand is a multiple of *theirs*. Over the viable pool their
 * reach spans 17 % and mine spans a factor of 3.4, so the two coordinates are not close to being
 * the same coordinate, and no output of the policy expresses the fraction the body actually cares
 * about. This row makes `standOff` a multiple of the acting hand's own reach instead.
 *
 * The claim is a **pair against a pair**, as `holdMetres`'s is: the same command driven at two
 * opponents whose arms differ by half a metre, and what is asserted is that under the flag the
 * hold does not move and under the multiple it moves by exactly the difference in their arms.
 *
 * That the number it settles on is *my own reach* and not some other constant is then established
 * against something the executor publishes for its own reasons: `longer` and `shorter` compare my
 * arm to theirs across a `reachEdge` band, so walking their arm either side of the measured hold
 * flips them, and a hold that was reading anything but my reach would flip them somewhere else.
 */
test("hold_my_reach_reads_my_own_arm_and_the_shipped_row_reads_theirs", async (t) => {
  assert.equal(GOLEM_TACTICS_V4.holdMyReach, false, "the own-reach flag shipped up");

  const golem = await standAGolem(t);
  const reading = (over, reach, standOff) => {
    const fixture = place(fixtureOf(golem.view), { x: 0, z: 2.4, reach });
    const driven = golemDriven(SEED, { ...GOLEM_TACTICS_V4, ...over, eventAsks: false },
      fixedPilot({ standOff, commit: 0 }).pilot);
    drive(fixture, driven, 0.5);
    return driven.reading;
  };

  // The shipped row: the hold *is* their arm at a stand-off of one, whatever their arm is.
  assert.ok(Math.abs(reading({}, 1.2, 1.0).hold - 1.2) < 1e-9);
  assert.ok(Math.abs(reading({}, 1.7, 1.0).hold - 1.7) < 1e-9);

  // The flag: the same hold against both, so half a metre of somebody else's arm buys nothing.
  const mine = reading({ holdMyReach: true }, 1.2, 1.0).hold;
  assert.equal(reading({ holdMyReach: true }, 1.7, 1.0).hold, mine,
    `an own-reach hold read ${mine} against a 1.2 m arm and ` +
    `${reading({ holdMyReach: true }, 1.7, 1.0).hold} against a 1.7 m one, which is what it exists not to do`);
  // And it is still a multiple: the axis has not become a constant.
  assert.ok(Math.abs(reading({ holdMyReach: true }, 1.2, 0.5).hold - mine / 2) < 1e-9,
    "half the stand-off did not halve the hold");
  assert.ok(Math.abs(reading({ holdMyReach: true }, 1.7, 1.6).hold - mine * 1.6) < 1e-9);
  assert.ok(Math.abs(reading({ holdMyReach: true }, 1.2, 0).hold) < 1e-12, "a zero stand-off held somewhere");

  // That the multiple is *my arm*, checked against a fact the executor publishes for its own
  // reasons: `longer` and `shorter` bracket my reach against theirs across `reachEdge`.
  const edge = GOLEM_TACTICS_V4.reachEdge;
  assert.ok(mine > 0.5 && mine < 3, `the own-reach hold is ${mine} m, which is not an arm`);
  const shortArm = reading({}, mine * (1 - edge * 2), 1.0);
  const longArm = reading({}, mine * (1 + edge * 2), 1.0);
  assert.equal(shortArm.longer, true, `against a ${(mine * (1 - edge * 2)).toFixed(2)} m arm I am not the longer`);
  assert.equal(shortArm.shorter, false);
  assert.equal(longArm.shorter, true, `against a ${(mine * (1 + edge * 2)).toFixed(2)} m arm I am not the shorter`);
  assert.equal(longArm.longer, false);

  // `holdMetres` wins if both are up, which is what that row's note says and is worth pinning:
  // two flags that quietly composed would be a third reading of the axis nobody chose.
  assert.equal(reading({ holdMetres: true, holdMyReach: true }, 1.2, 1.3).hold, 1.3);
  assert.equal(reading({ holdMetres: true, holdMyReach: true }, 1.7, 1.3).hold, 1.3);

  // Off, it is inert to the digit -- the same claim the four candidates before it are held to.
  const trace = (over, reach) => {
    const fixture = place(fixtureOf(golem.view), { x: 0, z: 1.6, reach });
    const driven = golemDriven(SEED, { ...GOLEM_TACTICS_V4, ...over },
      fixedPilot({ standOff: 1.1, advance: 0.4, commit: 1 }).pilot);
    const frames = [];
    drive(fixture, driven, 2.0, (intent) => {
      frames.push([intent.forward, intent.turn, driven.reading.hold, driven.strokes]);
    });
    return frames;
  };
  assert.deepEqual(trace({ holdMyReach: false }, 1.45), trace({}, 1.45),
    "writing the own-reach flag out at its default changed the bout");
  assert.notDeepEqual(trace({ holdMyReach: true }, 1.45), trace({}, 1.45),
    "the own-reach flag changed nothing on a body whose arm differs from theirs");
});

/**
 * `strokeOutOfRange` false: a hand is not asked for a stroke it cannot land, and the gate bites.
 *
 * The shipped table lets a stroke start whatever the gap, which is deliberate -- a stroke thrown
 * at nothing is a stroke that is already moving when they close, and Session 07 measured that as
 * worth **+29 % damage against a fighting opponent and -18 % against a motionless one**. Which of
 * those two the pool is made of is exactly what an arm is for, and this test only says the gate is
 * real: out of range it stops every stroke, in range it stops none, and a mind that turned it off
 * would notice on its own.
 */
test("the_out_of_range_gate_stops_a_stroke_it_cannot_land_and_stops_nothing_in_range", async (t) => {
  const golem = await standAGolem(t);
  const strokesAt = (over, command, z) => {
    const fixture = place(fixtureOf(golem.view), { x: 0, z });
    const driven = golemDriven(SEED, { ...GOLEM_TACTICS_V4, ...over, eventAsks: false },
      fixedPilot(command).pilot);
    drive(fixture, driven, 3.0);
    return { strokes: driven.strokes, gap: driven.reading.gap };
  };

  // Held two and a half of their reach out, with the commit gate up the whole three seconds.
  const FAR = [{ standOff: 2.5, advance: 0, commit: 1 }, 2.6];
  const farShipped = strokesAt({}, ...FAR);
  const farGated = strokesAt({ strokeOutOfRange: false }, ...FAR);
  assert.ok(farShipped.strokes > 2,
    `the shipped table threw ${farShipped.strokes} strokes from ${farShipped.gap.toFixed(2)} m out`);
  assert.equal(farGated.strokes, 0,
    `the gate let ${farGated.strokes} strokes go at ${farGated.gap.toFixed(2)} m, which is out of range`);

  // Close enough to land, where the gate is a condition that is always true and costs nothing.
  const NEAR = [{ standOff: 0.6, advance: 0.3, commit: 1 }, 1.2];
  const nearShipped = strokesAt({}, ...NEAR);
  const nearGated = strokesAt({ strokeOutOfRange: false }, ...NEAR);
  assert.ok(nearShipped.strokes > 2, `only ${nearShipped.strokes} strokes in three seconds inside range`);
  assert.equal(nearGated.strokes, nearShipped.strokes,
    `the gate cost ${nearShipped.strokes - nearGated.strokes} strokes at ${nearShipped.gap.toFixed(2)} m, ` +
    "which is inside the arm and is where it is supposed to be inert");
});

/**
 * `closeGain` lowered, not raised: the feet settle at `hold - advance / closeGain`.
 *
 * **The plan asked for this row raised and the arithmetic is the other way round.** The feet are a
 * proportional controller: `forward = clamp(clamp((gap - hold) * closeGain, -1, 1) + advance)`, so
 * the gap at which they stop is `hold - advance / closeGain`, and *raising* the gain makes a
 * saturated `advance` buy **less** distance rather than more. What widens the window the closing
 * axis can reach is lowering it, which is what arm j drove.
 *
 * Measured rather than asserted from the formula: the fixed point is found by walking the opponent
 * out along the line in centimetre steps and watching the sign of `forward`, which is what "settle"
 * means for feet that are a gain and not a teleport, and the formula is then what it is compared
 * against. The slack is two centimetres, which is the sweep's own step plus a step of physics.
 */
test("lowering_the_closing_gain_is_what_widens_what_the_advance_axis_buys", async (t) => {
  const golem = await standAGolem(t);
  const advance = 0.5;
  /** The gap at which the feet change their mind, walked out in centimetre steps. */
  const settles = (closeGain) => {
    let previous = null;
    for (let z = 0.7; z <= 3.6; z += 0.01) {
      const fixture = place(fixtureOf(golem.view), { x: 0, z });
      const driven = golemDriven(SEED, { ...GOLEM_TACTICS_V4, closeGain, eventAsks: false },
        fixedPilot({ standOff: 1.0, advance, commit: 0 }).pilot);
      let forward = 0;
      drive(fixture, driven, 0.25, (intent) => { forward = intent.forward; });
      const { gap, hold } = driven.reading;
      if (previous !== null && previous.forward <= 0 && forward > 0) return { gap, hold };
      previous = { forward, gap, hold };
    }
    assert.fail(`the feet never turned round at a closing gain of ${closeGain}`);
    return null;
  };

  const shipped = settles(GOLEM_TACTICS_V4.closeGain);
  const lowered = settles(0.9);
  const raised = settles(3.6);
  for (const [name, seen, gain] of [
    ["shipped", shipped, GOLEM_TACTICS_V4.closeGain], ["lowered", lowered, 0.9], ["raised", raised, 3.6],
  ]) {
    const predicted = seen.hold - advance / gain;
    assert.ok(Math.abs(seen.gap - predicted) < 0.02,
      `the ${name} gain settled at ${seen.gap.toFixed(3)} m against a predicted ${predicted.toFixed(3)}`);
  }
  // The direction, said as the thing the plan had backwards: half the gain, twice the distance an
  // advance of a half buys off the hold, and four times the shipped gain buys half of it.
  assert.ok(lowered.gap < shipped.gap - 0.2,
    `a gain of 0.9 settled at ${lowered.gap.toFixed(3)} m against the shipped ${shipped.gap.toFixed(3)}, ` +
    "so lowering the gain did not buy the closing axis more distance");
  assert.ok(raised.gap > shipped.gap + 0.1,
    `a gain of 3.6 settled at ${raised.gap.toFixed(3)} m against the shipped ${shipped.gap.toFixed(3)}, ` +
    "so raising it -- which is what the plan asked for -- did not buy less");
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
  // Two versions are defined and version 1 is what a fit takes unless it is asked for another;
  // Session 09 of the learn set added the second behind --features 2. Both are pinned, because a
  // build that quietly moved the default would move what every table on disk means.
  assert.equal(PILOT_FEATURES_VERSION, 2);
  assert.equal(PILOT_FEATURES_DEFAULT, 1);
  assert.deepEqual([...PILOT_FEATURE_VERSIONS_READ], [1, 2]);

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

/**
 * Version 2's nine trailing columns are the exponential traces a hand-stepped recursion predicts.
 *
 * Session 09 of the learn set, and the one arm that changes what the mind can *see* rather than
 * what it may write. The nine are three quantities -- the gap, its rate and their tip speed -- each
 * carried at three decays, and the reason they are worth a test of their own is that they are the
 * first columns in this file that are **not a pure function of the reading**: a trace is a function
 * of every ask before it, and it lives in an object the mind owns for the length of a bout.
 *
 * So the assertion is the recursion itself, stepped by hand off the *raw* columns of the very same
 * asks. Two failures it is here to catch and nothing else would: a trace that was re-seeded every
 * ask, which is nine copies of the raw column and no error anywhere; and a trace stepped before the
 * raw columns were written, which is the same nine numbers one ask stale and would read as a mind
 * that learned slightly less than it should have.
 *
 * The other half is that version 2 **appends**: the same bout observed at both widths agrees on
 * every one of version 1's seventy-one columns, ask for ask, because a version that moved a column
 * would silently reinterpret every table on disk that names the other one.
 */
test("version_2s_nine_columns_are_the_trace_a_hand_stepped_recursion_predicts", async (t) => {
  assert.equal(PILOT_FEATURE_COUNT_V2, PILOT_FEATURE_COUNT + PILOT_TRACE_NAMES.length);
  assert.equal(PILOT_TRACE_NAMES.length, PILOT_TRACE_COLUMNS.length * PILOT_TRACE_DECAYS.length);
  assert.deepEqual(PILOT_FEATURE_NAMES_V2.slice(0, PILOT_FEATURE_COUNT), [...PILOT_FEATURE_NAMES]);
  assert.equal(new Set(PILOT_FEATURE_NAMES_V2).size, PILOT_FEATURE_COUNT_V2, "two columns share a name");
  assert.deepEqual([...pilotFeatureNames(1)], [...PILOT_FEATURE_NAMES]);
  assert.deepEqual([...pilotFeatureNames(2)], [...PILOT_FEATURE_NAMES_V2]);
  assert.equal(pilotFeatureCount(1), PILOT_FEATURE_COUNT);
  assert.equal(pilotFeatureCount(2), PILOT_FEATURE_COUNT_V2);
  assert.throws(() => pilotFeatureNames(3), /version 3/);

  const golem = await standAGolem(t);
  const observe = (width, trace) => {
    const fixture = place(fixtureOf(golem.view), { x: 0, z: 1.4 });
    const into = new Float64Array(width);
    const rows = [];
    const driven = golemDriven(SEED, GOLEM_TACTICS_V4, (reading, view) => {
      pilotFeatures(reading, view, into, trace);
      rows.push(Float64Array.from(into));
      return { ...freshCommand(), advance: 0.6, commit: 1 };
    });
    drive(fixture, driven, 3.0);
    return { rows, driven, fixture };
  };

  const trace = pilotTrace();
  assert.equal(trace.primed, false, "a fresh trace claims to have been stepped");
  const wide = observe(PILOT_FEATURE_COUNT_V2, trace);
  assert.ok(wide.rows.length > 30, `only ${wide.rows.length} asks in three seconds`);
  assert.equal(trace.primed, true);

  // The recursion, ask by ask, against the raw column it is a trace of.
  for (const [q, name] of PILOT_TRACE_COLUMNS.entries()) {
    const column = PILOT_FEATURE_NAMES.indexOf(name);
    assert.ok(column >= 0, `the trace names "${name}", which is not a version-1 column`);
    for (const [d, decay] of PILOT_TRACE_DECAYS.entries()) {
      const at = PILOT_FEATURE_COUNT + q * PILOT_TRACE_DECAYS.length + d;
      assert.equal(PILOT_FEATURE_NAMES_V2[at], `trace:${name}@${decay}`);
      // The first ask *is* the reading rather than a fraction of it, which is what keeps a trace
      // from spending the first two thirds of a second climbing out of its own transient.
      let want = wide.rows[0][column];
      for (const [ask, row] of wide.rows.entries()) {
        if (ask > 0) want += (1 - decay) * (row[column] - want);
        assert.ok(Math.abs(row[at] - want) < 1e-12,
          `ask ${ask}, ${PILOT_FEATURE_NAMES_V2[at]}: read ${row[at]}, stepped ${want}`);
      }
    }
  }

  // **A trace of a constant is that constant**, and a body on a bench that does not integrate
  // its own motion is very nearly one -- so the run above says the recursion is wired to the
  // right column and cannot say the three decays are three different memories. That claim is
  // made directly, on a square wave no executor standing still could produce: after a step the
  // fastest decay is nearest the new reading and the slowest furthest, in that order, and every
  // one of them is strictly between the value it left and the value it is going to.
  const bench = pilotTrace();
  const wave = [0.3, 0.3, 0.3, 2.7, 2.7, 2.7, 2.7, 0.3, 0.3];
  const stepped = wave.map((gap) => Float64Array.from(
    bench.step({ gap, gapRate: gap - 1.5 }, { opponent: { tipSpeed: gap } })));
  for (const [q, name] of PILOT_TRACE_COLUMNS.entries()) {
    const hand = PILOT_TRACE_DECAYS.map(() => null);
    for (const [ask, gap] of wave.entries()) {
      const now = q === 0 ? gap / 3 : q === 1 ? (gap - 1.5) / 2 : gap / 5;
      for (const [d, decay] of PILOT_TRACE_DECAYS.entries()) {
        hand[d] = hand[d] === null ? now : hand[d] + (1 - decay) * (now - hand[d]);
        const at = q * PILOT_TRACE_DECAYS.length + d;
        assert.ok(Math.abs(stepped[ask][at] - hand[d]) < 1e-12,
          `${name}@${decay} at ask ${ask}: read ${stepped[ask][at]}, stepped ${hand[d]}`);
      }
      // Ordered by memory, on the ask the wave rises -- and only there, because the three have
      // converged onto the low value by then and a fall four asks later would be asking the
      // slowest one about a rise it has not finished.
      if (ask === 3) {
        const [fast, middle, slow] = PILOT_TRACE_DECAYS.map((_, d) => stepped[ask][q * 3 + d]);
        const was = stepped[ask - 1][q * 3];
        const rising = now > was;
        assert.ok(rising ? fast > middle && middle > slow : fast < middle && middle < slow,
          `${name} at ask ${ask}: the three decays read ${fast}, ${middle} and ${slow}, which ` +
          "is not three different memories of one quantity");
        for (const value of [fast, middle, slow]) {
          assert.ok(rising ? value > was && value < now : value < was && value > now,
            `${name} at ask ${ask}: a trace read ${value}, outside the step from ${was} to ${now}`);
        }
      }
    }
  }

  // Version 2 appends. The same bout at the narrow width agrees on all seventy-one.
  const narrow = observe(PILOT_FEATURE_COUNT, null);
  assert.equal(narrow.rows.length, wide.rows.length, "the two widths were not the same bout");
  for (const [ask, row] of narrow.rows.entries()) {
    assert.deepEqual([...row], [...wide.rows[ask].slice(0, PILOT_FEATURE_COUNT)],
      `ask ${ask} reads differently at the two widths`);
  }

  // A version-2 width with no trace is refused by name rather than filled with zeros, because
  // zeros are what a trace looks like at the start of every bout and would read as a fit that
  // learned nothing from nine columns it never had.
  assert.throws(() => pilotFeatures(narrow.driven.reading, narrow.fixture,
    new Float64Array(PILOT_FEATURE_COUNT_V2)), /trace/);
  assert.throws(() => pilotFeatures(narrow.driven.reading, narrow.fixture,
    new Float64Array(PILOT_FEATURE_COUNT_V2 + 1), trace), /wide/);

  // A bout ends and the next one starts from the reading, not from the last bout's memory.
  trace.reset();
  assert.equal(trace.primed, false);
  assert.deepEqual([...trace.values], new Array(PILOT_TRACE_NAMES.length).fill(0));
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
