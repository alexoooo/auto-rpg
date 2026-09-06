// The golem's scripted mind, in front of a real body and in front of a real published view.
//
// **Every threshold in this file is provisional.** They are pinned from the 2026-09-05 Node arena
// run and are to be re-taken after the owner's gate; they are *not* regression floors. This plan
// set exists because three body experiments each cleared a scalar proxy while the owner's judgement
// stayed red, and a number that has never been checked against a person's eye can only say "this
// did not change", never "this is right". Sessions 02 to 08 marked theirs the same way.
//
// Two harnesses, and they are never mixed in one column. The cheap tests drive `golemTactics`
// directly in front of a **real** published view flattened into a fixture -- no Babylon in that
// path at all once the fixture exists, which is what lets a whole bout of the mind's cadence be
// stepped in milliseconds. The bout tests are `scripts/measure.mjs` used as a library: the same
// `NullEngine` arena, the same real Havok, the same `stepPair` loop the page runs with the render
// half taken out. Nothing here may be compared with a page reading or with a figure from
// `scripts/golem-bench.mjs`.
//
// **Six mutations were watched red on 2026-09-05**, because a green test asserting something the
// code does not do is the worst defect this tree produces and it is invisible by construction:
//
// | mutation in `src/golem/tactics.ts` | what went red |
// |---|---|
// | write the wanted swing straight into `pointerX` instead of `unspan`ping it | the envelope test |
// | write `GOLEM_TACTICS.cutRoll` without the `rollMax > 0` guard | the envelope test |
// | write `GOLEM_TACTICS.coverBend` without the `bendMax > 0` guard | the envelope test |
// | drop the `canAttack(cap)` guard on the commit gate | the capped-socket test |
// | hold `trunkTwist` at zero through an exchange | the mace test |
// | seed the mulberry stream from `Math.random()` rather than the argument | the determinism test |
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
import { POLICIES } from "../src/mind.ts";
import { unitDefinition } from "../src/units.ts";
import { defaultGolemSetup } from "../src/golem/build.ts";
import {
  GOLEM_TACTICS, canAttack, golemTactics, innerReach, tacticalRanges, unspan,
} from "../src/golem/tactics.ts";
import { BUTTON_REACH } from "../src/buttons.ts";

process.env.SWORD_MEASURE_LIBRARY = "1";
const { freshHavok, runBout } = await import("../scripts/measure.mjs");

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const FIXED = 1 / CONFIG.world.physicsHz;
const FRAME_MS = 1000 / 60;
const SEED = 20260904;

const MACE = { chain: "wrist", terminal: "mace" };
const setupWith = (over) => ({ ...defaultGolemSetup(), ...over });

// ---------------------------------------------------------------------------------------
// The picker: two surfaces, and neither offers the other's mind.
// ---------------------------------------------------------------------------------------

/**
 * A Warrior is never offered a golem's mind, and a golem is never offered a Warrior's.
 *
 * The half `compatiblePolicies` could not state on its own. `null` there means "every policy this
 * body's surface admits", and it meant that safely for exactly as long as every policy in the
 * program drove one kind of body -- Session 09 adds one that does not. `duelist`'s ranges are an
 * arming sword's length in disguise and `golem-duelist` aims in an effector socket's own frame, so
 * each is a measurement of the wrong thing on the other body.
 *
 * `idle` is the deliberate exception and is asserted as one: standing still with the cursor centred
 * is a command any body can execute, and it is the control condition Session 08's whole golem
 * baseline was taken on.
 */
test("a_units_picker_never_offers_a_mind_written_for_the_other_control_surface", () => {
  const warrior = unitDefinition("warrior");
  const golem = unitDefinition("golem");
  const names = (unit) => unit.driverOptions.map(({ name }) => name);
  assert.ok(!names(warrior).includes("golem-duelist"),
    `a Warrior's picker offers ${names(warrior).join(", ")}`);
  assert.deepEqual(names(golem), ["idle", "golem-duelist"]);
  assert.throws(() => unitDefinition("warrior").createPolicy("golem-duelist"),
    /does not support policy/);
  assert.throws(() => unitDefinition("golem").createPolicy("duelist"),
    /does not support policy/);
  // And the field that does the work, so a policy added without one is caught here rather than by
  // appearing in every picker in the program.
  for (const policy of POLICIES) {
    assert.ok(policy.surface === null || typeof policy.surface === "string",
      `policy "${policy.name}" declares no surface`);
  }
  assert.equal(POLICIES.find((policy) => policy.name === "idle").surface, null);
  assert.equal(POLICIES.find((policy) => policy.name === "golem-duelist").surface, "golem-v1");
});

// ---------------------------------------------------------------------------------------
// One real golem, and a fixture taken from its own published view.
// ---------------------------------------------------------------------------------------

/** One golem standing in a bare arena, so its real published view can be read. */
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

/**
 * A hand slot's neutral reach, from the mouse adapter rather than written out.
 *
 * The blank below is a hand-written `Intent` and `tsc` never sees it, which is
 * the trap this directory has its own rule about -- and it went off on the day
 * Session 12 gave `HandIntent` a third positional axis. A blank with no `reach`
 * hands the chain `undefined`, `spanned` answers `NaN`, and the anchor is driven
 * at a target that is not a place: `a_walking_golems_effector_stays_on_its_own
 * _anchor` read **6031.7 mm** of stray, which is the arm having left. Taking the
 * value from `src/buttons.ts` rather than typing 1/7 is the same argument the
 * bench script makes: a fixture that hard-codes the number would go on passing
 * after the mapping it is standing in for had changed. `buttons.ts` imports
 * nothing, so no test's import graph grows a scene by reading it.
 */
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

/**
 * A real published view, flattened into a plain record a test can move around.
 *
 * `tests/fixtures/view.mjs` would be the place for this and cannot be: its `exactly` refuses a
 * record with a field its hand-kept list does not name, and a golem publishes two the list does not
 * have -- `effectors`, which a construct has published since session 18, and `capabilities`, which
 * is this session's. Extending the list would make it fail for every Warrior, because both fields
 * are optional and a Warrior has neither.
 *
 * So the fixture is taken from the real record instead of written out, which is the stronger form
 * of the same rule and the reason `publishedFixture` exists at all: a hand-rolled body is a second
 * claim about what a body publishes, and the defects worth testing for are claims about a body that
 * were wrong. The key sets are asserted against the live view below, so a field added to the golem's
 * publication and forgotten here fails rather than arriving as `undefined`.
 */
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

/**
 * The whole of "every hand command it emits is inside the envelope".
 *
 * Four claims, and each of them is a claim a mind can get wrong in a way that compiles:
 *
 * - the two aiming axes are **cursor positions**, not angles. A policy that wrote the wanted swing
 *   in radians straight into `pointerX` would be asking for 1.30 on a channel that runs -1 to +1,
 *   and the chain would clamp it to the outboard limit for the whole bout -- silently, because a
 *   clamp is not an error.
 * - `roll` is inside the published roll axis and is **exactly zero** when there is no roll axis.
 *   Every chain below rung 3 chose its edge at build because it had to, and a mace has no edge at
 *   all; a command written into an axis nobody reads is the button-nobody-can-press defect from
 *   the other side.
 * - `wristBend` is normalized and is zero when there is no bend axis, same rule.
 * - a socket with no strokes is never asked for one.
 *
 * The recovered swing and lift are checked against the shell as well, which is not tautological
 * even though `unspan` clamps: it is what catches a mapping written with the wrong sign or against
 * the wrong socket's `outboard`, which does not look like a hand held wrong -- it looks like an arm
 * coming apart.
 */
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
function sweepPlaces(fixture, mind, label, seconds = 1.0) {
  const reach = fixture.self.hands.primary.reach;
  const places = [];
  for (const ring of [0.4, 0.8, 1.0, 1.3, 2.0, 4.0]) {
    for (const bearing of [0, 0.9, 1.9, 2.8, -0.9, -1.9, -2.8]) {
      places.push({ x: Math.sin(bearing) * reach * ring, z: Math.cos(bearing) * reach * ring });
    }
  }
  // And two heights that are not a standing body: a fallen one, and one on a step.
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

test("a_hand_written_golem_view_carries_every_field_the_real_one_publishes", async (t) => {
  const golem = await standAGolem(t);
  const fixture = fixtureOf(golem.view);
  const live = golem.view;
  assert.deepEqual(Object.keys(fixture).sort(), Object.keys(live).sort());
  for (const side of ["self", "opponent"]) {
    const expected = Object.keys(live[side]).filter((key) => key !== "effectors").sort();
    assert.deepEqual(Object.keys(fixture[side]).sort(), expected, side);
    for (const name of Object.keys(live[side].hands)) {
      assert.deepEqual(Object.keys(fixture[side].hands[name]).sort(),
        Object.keys(live[side].hands[name]).sort(), `${side}.hands.${name}`);
    }
  }
  // The field this session added, present on the body's own view and on nobody else's.
  assert.ok(fixture.self.capabilities, "a golem publishes its own capabilities");
  assert.equal(fixture.opponent.capabilities, undefined,
    "capabilities are self-knowledge and are never written into an opponent's record");
  const caps = fixture.self.capabilities;
  assert.deepEqual([...caps.effectors.primary.strokes].sort(), ["cover", "cut", "thrust"]);
  assert.ok(caps.effectors.primary.reachable, "an arm chain publishes a reachable shell");
  assert.ok(caps.effectors.primary.rollMax > 0, "rung 3 can turn its terminal");
  assert.ok(caps.trunkTwistMax > 0, "a plain trunk can twist");
  assert.ok(caps.crouchTravel > 0, "a biped can crouch");
});

test("every_hand_command_the_mind_emits_sits_inside_the_published_envelope", async (t) => {
  for (const [label, setup] of [
    ["default", defaultGolemSetup()],
    ["mace", setupWith({ primary: MACE, secondary: MACE })],
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
    const steps = sweepPlaces(fixture, golemTactics(SEED), label, 0.35);
    assert.ok(steps > 3000, `${label} only stepped ${steps} times`);
  }
});

/**
 * A mace pins the swing, so the mind turns the body instead.
 *
 * The capability fact Session 08 left written down for this one to read: `TERMINAL_MACE.limits`
 * states `swingMin = swingMax = 0`, the chain folds it into its own limits before it publishes
 * anything, and a golem carrying one **cannot turn its weapon with its arm**. What the mind must do
 * about it is turn with the trunk or the carrier, and what it must not do is keep writing an
 * azimuth into a channel that has one value.
 *
 * The blade beside it is the control, and it is what makes this test say something: a mind that
 * never wrote `pointerX` at all would pass the mace half on its own.
 */
test("a_mace_is_aimed_with_the_trunk_because_its_own_swing_is_pinned", async (t) => {
  const mace = await standAGolem(t, setupWith({ primary: MACE, secondary: MACE }));
  const maceFixture = fixtureOf(mace.view);
  const shell = maceFixture.self.capabilities.effectors.primary.reachable;
  assert.ok(shell, "a mace still publishes a reachable shell");
  assert.equal(shell.swingMax - shell.swingMin, 0, "a mace has exactly one azimuth");

  const run = (fixture, label) => {
    const mind = golemTactics(SEED);
    let pointer = 0;
    let twist = 0;
    // Inside the published shell and off to one side, so an arm that *could* aim would have
    // something to aim at. The distance is derived from the same two published numbers the mind
    // uses, and asserted, because a placement inside the inner radius is a placement the mind
    // answers by giving ground -- which would make this test pass for the wrong reason.
    const self = fixture.self;
    const reach = self.hands.primary.reach;
    const shell = self.capabilities.effectors.primary.reachable;
    const at = ((reach - (shell.reachMax - shell.reachMin)) + reach * 0.92) / 2;
    const bearing = 0.55;
    place(fixture, { x: Math.sin(bearing) * at, z: Math.cos(bearing) * at });
    const gap = Math.hypot(self.hands.primary.shoulder.x - fixture.opponent.shoulder.x,
      self.hands.primary.shoulder.y - fixture.opponent.shoulder.y,
      self.hands.primary.shoulder.z - fixture.opponent.shoulder.z);
    assert.ok(gap > reach - (shell.reachMax - shell.reachMin) && gap < reach,
      `${label} was placed at ${gap.toFixed(3)} m, outside its own shell`);
    for (let step = 0; step < CONFIG.world.physicsHz * 6; step += 1) {
      fixture.clock += FIXED;
      const intent = mind.decide(fixture, FIXED);
      pointer = Math.max(pointer, Math.abs(intent.primary.pointerX));
      twist = Math.max(twist, Math.abs(intent.posture.trunkTwist));
    }
    return { pointer, twist };
  };

  const withMace = run(maceFixture, "the mace golem");
  assert.equal(withMace.pointer, 0,
    "a pinned swing has one azimuth, so no cursor position asks for another");
  assert.ok(withMace.twist > 0.3,
    `a mace golem turned its trunk by at most ${withMace.twist.toFixed(3)} of its envelope`);

  const blade = await standAGolem(t);
  const withBlade = run(fixtureOf(blade.view), "the blade golem");
  assert.ok(withBlade.pointer > 0.2,
    `an arm that can swing was only asked for ${withBlade.pointer.toFixed(3)} of its cursor`);
});

/**
 * A capped socket is never asked for a stroke, and a head that has one is.
 *
 * Rung 0 publishes no strokes at all, which is how a mind learns that an effector cannot attack
 * without knowing that rung 0 is called `none`. What is left to a golem built that way is its head,
 * and `BodyView.naturalAttacks` is read by iteration rather than by the name `ram` -- so a head
 * option added later with another name needs no new mind.
 */
test("a_capped_socket_is_never_asked_for_a_stroke_and_a_ram_head_is", async (t) => {
  const golem = await standAGolem(t, setupWith({ head: "head.ram",
    primary: { chain: "none", terminal: "none" }, secondary: { chain: "none", terminal: "none" } }));
  const fixture = fixtureOf(golem.view);
  const caps = fixture.self.capabilities;
  assert.deepEqual([...caps.effectors.primary.strokes], []);
  assert.equal(canAttack(caps.effectors.primary), false);
  assert.ok(Object.keys(fixture.self.naturalAttacks).length > 0, "a ram head publishes an attack");

  const mind = golemTactics(SEED);
  let lunges = 0;
  let handStrokes = 0;
  let closing = 0;
  let fired = 0;
  let leaningWhileFiring = 0;
  let wasThrust = false;
  // Close enough for the head, which is what the natural attack's own published reach decides.
  place(fixture, { x: 0.1, z: 0.45 });
  for (let step = 0; step < CONFIG.world.physicsHz * 4; step += 1) {
    fixture.clock += FIXED;
    const intent = mind.decide(fixture, FIXED);
    if (intent.natural.thrust) lunges += 1;
    if (intent.natural.thrust && !wasThrust) fired += 1;
    if (intent.natural.thrust && intent.posture.trunkLean > 0) leaningWhileFiring += 1;
    wasThrust = intent.natural.thrust;
    if (intent.primary.thrust || intent.secondary.thrust) handStrokes += 1;
    if (intent.forward > 0) closing += 1;
    assertInsideEnvelope(intent, fixture.self, `capped step ${step}`);
  }
  assert.equal(handStrokes, 0, "a capped socket was asked for a stroke it does not have");
  assert.ok(lunges > 0, "a golem with no arms never used the head it does have");
  // **An edge, not a level, and leaning in.** The head fires on the rising edge of `thrust` and
  // ignores it held, so a mind that wrote it true and left it would ram once a bout; and the
  // forward half of a lunge is the waist, so a thrust with the trunk upright is half a blow.
  // Measured before either was so: one lunge in four seconds, and 0.48 damage a contact against
  // a blade stroke's 3.6. Session 01 of the matchup set.
  assert.ok(fired > 1, `the thrust was written as a level: ${fired} rising edge(s) in four seconds`);
  assert.ok(lunges < CONFIG.world.physicsHz * 4 * GOLEM_TACTICS.ramFollowSeconds * 2,
    `the thrust was held for ${lunges} of ${CONFIG.world.physicsHz * 4} steps`);
  assert.equal(leaningWhileFiring, lunges, "a ram was fired with the trunk upright");

  // And that it still closes when the opponent is out at walking distance.
  place(fixture, { x: 0, z: 4.0 });
  closing = 0;
  for (let step = 0; step < CONFIG.world.physicsHz; step += 1) {
    fixture.clock += FIXED;
    if (mind.decide(fixture, FIXED).forward > 0.5) closing += 1;
  }
  assert.ok(closing > CONFIG.world.physicsHz * 0.9,
    `a golem with no arms walked in on ${closing} of ${CONFIG.world.physicsHz} steps`);
});

/**
 * It attacks with the thing that is for attacking, whichever socket that is in.
 *
 * The terminal's own description is what says so -- a plate reads as a shield, a blade as a sword --
 * and it is deliberately **not** the bite row: a plate scores with mass and would be a perfectly
 * legal thing to swing, which is exactly why the choice has to be made on what a terminal is *for*
 * rather than on whether it can hurt somebody. A Warrior carrying a shield in the primary and a
 * sword in the secondary used to attack with the shield, and this is that defect asked of a body
 * whose weapons are bolted on.
 */
test("the_mind_attacks_with_the_terminal_that_is_not_a_shield_whichever_socket_holds_it", async (t) => {
  const golem = await standAGolem(t, setupWith({
    primary: { chain: "wrist", terminal: "plate" },
    secondary: { chain: "wrist", terminal: "blade" },
  }));
  const fixture = fixtureOf(golem.view);
  assert.equal(fixture.self.hands.primary.weapon, "shield");
  assert.equal(fixture.self.hands.secondary.weapon, "sword");
  const mind = golemTactics(SEED);
  const acting = new Set();
  const struck = new Set();
  // In the *secondary's* band, because that is the socket the blade is in and the mind's ranges are
  // the attacking effector's own. Placed square in front of that socket so the gap is the distance.
  const blade = fixture.self.hands.secondary;
  const shell = fixture.self.capabilities.effectors.secondary.reachable;
  const band = ((blade.reach - (shell.reachMax - shell.reachMin)) + blade.reach * 0.92) / 2;
  place(fixture, { x: blade.shoulder.x - 0.21, z: band });
  for (let step = 0; step < CONFIG.world.physicsHz * 8; step += 1) {
    fixture.clock += FIXED;
    const intent = mind.decide(fixture, FIXED);
    acting.add(intent.actingHand);
    for (const name of ["primary", "secondary"]) if (intent[name].thrust) struck.add(name);
  }
  assert.deepEqual([...acting], ["secondary"], "the plate took a turn at attacking");
  assert.deepEqual([...struck], ["secondary"], "the plate was swung");
});

/**
 * The carrier lowers the body when the mark is below what the arm can be pointed at.
 *
 * Derived rather than chosen, which is why it is worth a test of its own: the shortfall in
 * *elevation* times the ground distance is the shortfall in *height*, and `crouchTravel` is how
 * much of that the carrier can make up. There is no `downed` branch anywhere in the mind -- what
 * makes this fire is that the mark is the opponent's live published shoulder, which comes down with
 * a body that has fallen.
 *
 * The standing case is the control: a mark at chest height is inside the shell, so the shortfall is
 * negative and the crouch is zero.
 */
test("the_carrier_crouches_only_when_the_mark_is_below_the_arms_own_floor", async (t) => {
  const golem = await standAGolem(t);
  const fixture = fixtureOf(golem.view);
  // Close in, because the rule is about an *elevation* the arm cannot reach: a body on the floor
  // four metres away is a shallow angle and well inside the shell, and it is only when it is near
  // that the line to it drops below what the shoulder can be pointed at.
  const peak = (shoulderY) => {
    const mind = golemTactics(SEED);
    let crouch = 0;
    place(fixture, { x: 0.2, z: 0.7, shoulderY });
    for (let step = 0; step < CONFIG.world.physicsHz * 2; step += 1) {
      fixture.clock += FIXED;
      crouch = Math.max(crouch, mind.decide(fixture, FIXED).posture.crouch);
    }
    return crouch;
  };
  const floor = fixture.self.capabilities.effectors.primary.reachable.liftMin;
  const socket = fixture.self.hands.primary.shoulder.y;
  assert.ok(Math.atan2(1.42 - socket, 0.7) > floor, "the standing control is inside the shell");
  assert.ok(Math.atan2(0.10 - socket, 0.7) < floor, "the fallen mark is below the shell");
  assert.equal(peak(1.42), 0, "a standing mark is inside the shell, so nothing is asked of the legs");
  assert.ok(peak(0.10) > 0.2, `a fallen mark drew a crouch of only ${peak(0.10).toFixed(3)}`);
});

test("the_mind_is_deterministic_under_a_fixed_seed_and_varies_without_one", async (t) => {
  const golem = await standAGolem(t);
  const trace = (seed) => {
    const fixture = fixtureOf(golem.view);
    const mind = golemTactics(seed);
    const out = [];
    for (const z of [3.5, 1.6, 1.2]) {
      place(fixture, { x: 0.3, z });
      for (let step = 0; step < CONFIG.world.physicsHz * 2; step += 1) {
        fixture.clock += FIXED;
        const intent = mind.decide(fixture, FIXED);
        out.push(`${intent.primary.pointerX.toFixed(6)},${intent.primary.pointerY.toFixed(6)},` +
          `${intent.primary.thrust ? 1 : 0}${intent.primary.guard ? 1 : 0},` +
          `${intent.strafe.toFixed(6)},${intent.posture.trunkTwist.toFixed(6)}`);
      }
    }
    return out.join("|");
  };
  assert.equal(trace(SEED), trace(SEED), "one seed, one bout");
  assert.notEqual(trace(SEED), trace(SEED + 1), "two seeds, two bouts");
});

// ---------------------------------------------------------------------------------------
// A whole bout, under real Havok.
// ---------------------------------------------------------------------------------------

/**
 * The same envelope claim, over a real bout, against a body that is actually moving.
 *
 * The fixture sweep above visits more places than a bout does and visits them with a golem standing
 * still; this one has a walking carrier, a twisting trunk and a Warrior hitting it, which is the
 * only way to find a command that is only wrong while the body is somewhere the fixture never put
 * it. `GolemControlEndpoint.observer` is the seam -- it is handed the view and the command on every
 * control step, which is exactly what has to be checked.
 */
test("every_hand_command_over_a_whole_bout_sits_inside_the_published_envelope", async () => {
  let checked = 0;
  let wired = false;
  const bout = runBout({
    left: "golem-duelist", right: "duelist",
    leftUnit: "golem", rightUnit: "warrior",
    leftGolem: defaultGolemSetup(),
    rightLoadout: { primary: "sword", secondary: "empty" },
    locomotionMode: "supported",
    seeds: [SEED, SEED + 17],
    maxSeconds: 12,
    physics: await freshHavok(),
    onSample: ({ left }) => {
      if (wired) return;
      wired = true;
      left.control.observer = (view, intent) => {
        checked += 1;
        assertInsideEnvelope(intent, view.self, `bout step ${checked}`);
      };
    },
  });
  // **The bound is the bout's own length and not a constant**, because the constant went red the
  // first time the golem got faster. It was `checked > 2000`, which is 8.3 s of control at 240 Hz,
  // and it held only while a golem-versus-Warrior bout took that long to resolve. The 2026-09-05
  // gait fix -- a stride that has a sideways half, so a strafe carries the body instead of
  // dragging it -- brought the same bout in at 3.23 s, and 774 commands over a bout that lasted
  // 776 control steps is complete coverage rather than a shortfall. A count pinned to wall clock
  // was measuring how quickly the golem wins, which is not what this test is about.
  const steps = Math.round(bout.seconds * CONFIG.world.physicsHz);
  assert.ok(checked >= steps - 10,
    `only ${checked} of the bout's ${steps} control steps were observed`);
  // ...and the bout has to be a real one, so a build that resolves on frame one cannot pass by
  // observing nothing and matching it.
  assert.ok(checked > 500, `only ${checked} commands were observed`);
});

/**
 * It fights: it lands blows, it completes exchanges, and it does not stop doing things.
 *
 * **A green counter cannot rescue a red bout**, which is why the passive-interval budget is not
 * asserted on its own: a zero-damage corpus once had zero stuck steps and zero capability losses
 * because its action loop never progressed. So the assertion is the pair -- the mind lands real
 * scored blows *and* never spends longer than the budget in range with nothing running.
 *
 * **What "doing something" is read from moved on 2026-09-05, and the old reading is now blind.**
 * This counted `EffectorStroke` transitions off the primary's own view, on the argument that a
 * chain running a scripted stroke is a body doing something. Session 12 deleted those scripts: an
 * arm chain follows a commanded point and is never in a phase, so `stroke` is `"idle"` on every
 * sample of every bout and this test failed with "the golem completed only 0 strokes" against a
 * golem that was winning both bouts in under nine seconds. A counter that reads zero on a body
 * fighting well is measuring something that has stopped existing.
 *
 * So it reads the mind instead, which is where an exchange now lives: the tactics are built here
 * and handed in, `stance` is the field they publish for exactly this, and a completed exchange is
 * the edge from `commit` to `recover`. That is a stronger statement than the old one as well as a
 * live one -- a stroke phase said the *body* had been asked for something, and this says the mind
 * carried a decision all the way through.
 *
 * **The floor is a rate and not a count, and that is forced by the bouts getting shorter.** Eight
 * completed strokes was reachable when a bout ran its full twenty seconds; the golem now wins the
 * right-corner bout in 3.60 s, and asking for eight exchanges inside it would be asking the mind
 * to fight faster for having won sooner. One per two seconds is a floor against a cadence whose
 * own chamber-plus-commit-plus-recover is 0.74 s and whose cooldown adds 0.30 s more, so it is
 * about half the rate the machine can physically run at.
 *
 * Both budgets are **provisional** and are 2026-09-05 readings, not targets. Measured over these
 * two bouts: 7 exchanges in 8.92 s from the left corner and 2 in 3.60 s from the right, and the
 * longest in-range interval outside an exchange was 0.47 s -- against a cadence whose cooldown and
 * patience can legitimately add 2.2 s before it makes an opening of its own, which is what the
 * 3.0 s budget is sized for and why it is not tightened onto the reading.
 */
test("the_golem_mind_lands_blows_and_does_not_stall_while_it_is_in_range", async () => {
  for (const golemLeft of [true, false]) {
    let worstPassive = 0;
    let run = 0;
    let exchanges = 0;
    let previous = "approach";
    // Built here rather than left to the picker, because `stance` is the thing being read and a
    // mind the harness constructed for itself is one this test cannot see inside.
    const tactics = golemTactics(SEED);
    const watched = { name: "golem-duelist", decide: (view, dt) => tactics.decide(view, dt) };
    const result = runBout({
      left: golemLeft ? "golem-duelist" : "duelist",
      right: golemLeft ? "duelist" : "golem-duelist",
      leftUnit: golemLeft ? "golem" : "warrior",
      rightUnit: golemLeft ? "warrior" : "golem",
      leftGolem: golemLeft ? defaultGolemSetup() : undefined,
      rightGolem: golemLeft ? undefined : defaultGolemSetup(),
      leftLoadout: golemLeft ? undefined : { primary: "sword", secondary: "empty" },
      rightLoadout: golemLeft ? { primary: "sword", secondary: "empty" } : undefined,
      locomotionMode: "supported",
      seeds: [SEED, SEED + 17],
      maxSeconds: 20,
      physics: await freshHavok(),
      [golemLeft ? "leftMind" : "rightMind"]: watched,
      onSample: ({ left, right, dt }) => {
        const golem = golemLeft ? left : right;
        const foe = golemLeft ? right : left;
        const self = golem.view.self;
        const cap = self.capabilities.effectors.primary;
        const gap = Math.hypot(self.shoulder.x - foe.view.self.shoulder.x,
          self.shoulder.z - foe.view.self.shoulder.z);
        const stance = tactics.stance;
        if (previous === "commit" && stance === "recover") exchanges += 1;
        previous = stance;
        // Anything but the three legs of one exchange is the mind not currently committing to
        // anything, which is what the budget below is about.
        const busy = stance === "chamber" || stance === "commit" || stance === "recover";
        // "In range" is the golem's own published shell: inside the far edge and outside the near
        // one is where a blow can actually land, and both numbers are the module's.
        const inside = gap <= self.hands.primary.reach &&
          gap >= innerReach(self.hands.primary.reach, cap);
        if (inside && !busy) { run += dt; worstPassive = Math.max(worstPassive, run); }
        else run = 0;
      },
    });
    const golem = golemLeft ? result.left : result.right;
    assert.ok(golem.hits > 20,
      `the golem landed ${golem.hits} contacts from the ${golemLeft ? "left" : "right"} corner`);
    assert.ok(golem.damage > 1,
      `the golem scored ${golem.damage.toFixed(2)} damage, which is a bout it did not fight`);
    const wanted = Math.max(1, Math.floor(result.seconds / 2));
    assert.ok(exchanges >= wanted,
      `the golem completed ${exchanges} exchanges in ${result.seconds.toFixed(2)} s, wanting ${wanted}`);
    assert.ok(worstPassive < 3.0,
      `the golem stood in its own range doing nothing for ${worstPassive.toFixed(2)} s`);
  }
});

/**
 * A golem whose arms are capped sockets still closes, and still uses what it has.
 *
 * The plan's own case, and the one that says the dispatch is on capabilities rather than on which
 * module is fitted: with no stroke on either socket the mind has to fall through to the head, and
 * a ram is the only striker such a body has. What is asserted is the bout, not a win -- a golem
 * head-butting a Warrior with no arms is not expected to beat one.
 */
test("a_golem_with_capped_sockets_closes_and_fights_with_its_head", async () => {
  const setup = setupWith({ head: "head.ram",
    primary: { chain: "none", terminal: "none" }, secondary: { chain: "none", terminal: "none" } });
  let lunges = 0;
  let wired = false;
  const result = runBout({
    left: "golem-duelist", right: "duelist",
    leftUnit: "golem", rightUnit: "warrior",
    leftGolem: setup,
    rightLoadout: { primary: "sword", secondary: "empty" },
    locomotionMode: "supported",
    seeds: [SEED, SEED + 17],
    maxSeconds: 20,
    physics: await freshHavok(),
    onSample: ({ left }) => {
      if (wired) return;
      wired = true;
      left.control.observer = (_view, intent) => { if (intent.natural.thrust) lunges += 1; };
    },
  });
  assert.ok(lunges > 0, "a golem with no arms never asked its head for anything");
  assert.ok(result.left.hits > 0, "a golem with no arms never reached its opponent at all");
});

/**
 * The constants are what the file says they are.
 *
 * Not a behaviour test and not pretending to be one: it is the guard against the range gates
 * quietly becoming lengths again. `holdFraction` and `strikeFraction` are dimensionless multiples
 * of a published reach, so both must stay inside a sensible fraction and `strike` must stay outside
 * `hold` -- a mind whose commit gate opened *inside* its hold distance would never commit from
 * where it chose to stand.
 */
test("the_tactics_ranges_are_fractions_of_a_published_reach_and_not_lengths", () => {
  assert.ok(GOLEM_TACTICS.strikeFraction > GOLEM_TACTICS.holdFraction);
  for (const key of ["holdFraction", "strikeFraction", "slackFraction"]) {
    assert.ok(GOLEM_TACTICS[key] > 0 && GOLEM_TACTICS[key] <= 1.2,
      `${key} is ${GOLEM_TACTICS[key]}, which is a length rather than a fraction`);
  }
  // And the inverse mapping the aim is written through, both sides of centre -- the one inverse
  // this directory has got wrong agreed with the right one for every positive input.
  assert.equal(unspan(0.5, 0.5, 0.5), 0, "a pinned axis has one pose and every cursor commands it");
  assert.equal(unspan(-0.5, -0.5, 1.3), -1);
  assert.equal(unspan(1.3, -0.5, 1.3), 1);
  assert.ok(Math.abs(unspan(0.4, -0.5, 1.3)) < 1e-9);
});

/**
 * The stand-off is a floor under `hold`, and only an opponent with a long arm raises it.
 *
 * **The half of the range rule that was missing until 2026-09-05.** Every gate in `tactics.ts` was
 * a fraction of what *this* body publishes, which is what the session trap asks for and is only
 * half of an answer: a hold distance is where the fight happens and a fight has two bodies in it.
 * Against the Warrior duelist the fractions were swept on, 0.78 of a golem's 1.78 m arm is well
 * outside a 0.45 m one and the tuning is right. Against another golem it is 0.78 of *theirs* too,
 * and both bodies drive to a distance at which both are already in range -- measured, two default
 * golems stood 1.31 m apart on the floor for a whole bout, hit each other 10 times a second at
 * 5.64 m/s, and neither bar emptied in 60 seconds.
 *
 * So this asserts the shape and not the value: below the fraction the floor is inert and every
 * number this file was tuned with survives untouched, and at the mirror it binds and puts the hold
 * at the opponent's own reach. The invariant `strike > hold` has to survive both, because a commit
 * gate inside the hold distance is a mind that never commits from where it chose to stand.
 */
test("the_stand_off_is_a_floor_under_hold_that_only_a_long_arm_raises", async (t) => {
  const golem = await standAGolem(t);
  const self = golem.view.self;
  const cap = self.capabilities.effectors.primary;
  const reach = self.hands.primary.reach;
  const standOff = GOLEM_TACTICS.standOffFraction;

  // No opponent at all, and an opponent whose arm is short enough that the floor cannot bind:
  // both must read exactly what the two self-fractions alone produce.
  const alone = tacticalRanges(reach, cap);
  const short = tacticalRanges(reach, cap, (alone.hold / standOff) * 0.5);
  assert.deepEqual({ ...short }, { ...alone },
    "a short-armed opponent moved a gate that is a fraction of this body's own reach");

  // The mirror: the same body in front, so the floor is the whole story.
  const mirror = tacticalRanges(reach, cap, reach);
  assert.ok(mirror.hold >= reach * standOff - 1e-9,
    `against its own reach of ${reach.toFixed(3)} m the golem still holds at`
    + ` ${mirror.hold.toFixed(3)} m, which is inside the arm in front of it`);
  assert.ok(mirror.hold > alone.hold,
    "the mirror match did not move the hold distance at all, so the floor is not wired in");

  for (const [label, ranges] of [["alone", alone], ["mirror", mirror]]) {
    assert.ok(ranges.strike >= ranges.hold + ranges.slack - 1e-9,
      `${label}: strike ${ranges.strike.toFixed(3)} is not outside hold ${ranges.hold.toFixed(3)}`);
    assert.ok(ranges.hold >= ranges.near,
      `${label}: the hold distance is inside the shell's own inner radius`);
  }
});

/**
 * Two golems fight each other at arm's length, and the fight goes somewhere.
 *
 * **The defect this is the guard against is a draw**, and it survived four sessions because
 * nothing asserted it: golem against golem ran to the 60 s cap 40 times out of 40, at 224 damage
 * a bout against a bar worth about 736 of it. Two things were wrong and they compound. The mind
 * stood inside the other's reach, so its strokes met a body already too close and arrived at
 * 5.64 m/s against a `referenceSpeed` of 11.0; and a golem's declared part health was written in
 * its own units before there was a weapon to measure it against, so 2620 points of it stood
 * against the Warrior's sword `damageScale`.
 *
 * The bout here is deliberately short -- a fifth of the cap -- because what is being asserted is a
 * *rate* rather than an outcome, and a test that ran a golem bout to its end would cost more than
 * the rest of this file put together. A bar that has come down this far in 14 s is a bout that
 * ends; the spacing bound beside it is the other half, and is what the owner actually saw.
 */
test("two_golems_fight_at_arms_length_and_the_bout_goes_somewhere", async () => {
  const setup = defaultGolemSetup();
  const floorGaps = [];
  const bars = { left: 1, right: 1 };
  const result = runBout({
    left: "golem-duelist", right: "golem-duelist",
    leftUnit: "golem", rightUnit: "golem",
    leftGolem: setup, rightGolem: setup,
    locomotionMode: "supported",
    seeds: [SEED, SEED + 17],
    maxSeconds: 14,
    physics: await freshHavok(),
    onSample: ({ left, right }) => {
      const a = left.view.self.ground;
      const b = right.view.self.ground;
      floorGaps.push(Math.hypot(a.x - b.x, a.z - b.z));
      bars.left = left.view.self.vitality;
      bars.right = right.view.self.vitality;
    },
  });
  floorGaps.sort((x, y) => x - y);
  const median = floorGaps[Math.floor(floorGaps.length / 2)];
  const loser = Math.min(bars.left, bars.right);

  // **Both bounds were placed by watching this bout go red with each half of the fix taken back
  // out**, which is the only way to know a threshold is a threshold and not a decoration. At this
  // seed, over the same 14 s:
  //
  //     GOLEM_TACTICS.standOffFraction / GOLEM_ASSEMBLY.healthScale   median gap   weaker bar
  //      1.00 / 0.25   as shipped                                       1.729 m       0.168
  //      0    / 0.25   the mind blind to the arm in front of it         1.367 m       0.691
  //      1.00 / 1.0    a stone body against a person's weapon           1.669 m       0.909
  //      0    / 1.0    the pair the owner watched                       1.367 m       0.923
  //
  // So the spacing bound sits between 1.367 and 1.729 and the bar bound between 0.168 and 0.691,
  // and neither half of the fix can be lost without one of them saying so. Provisional as figures
  // and to be re-taken after the owner's gate; the separations are what is not provisional.
  assert.ok(median > 1.5,
    `two golems held ${median.toFixed(3)} m apart on the floor, which is chest to chest`);
  assert.ok(loser < 0.45,
    `after ${result.seconds.toFixed(1)} s the weaker golem is still at ${loser.toFixed(3)},`
    + ` which does not finish inside the cap`);
});
