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
// | hold `trunkTwist` at zero through an exchange | the maul test |
// | drop the `mirror` of the primary into the secondary when `pairedHands` | the paired-hands test |
// | use `CUT` for every weapon kind instead of `STROKE_SHAPES[me.weapon]` | the smash test |
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
  GOLEM_TACTICS, STROKE_SHAPES, aimAt, canAttack, golemTactics, innerReach, tacticalRanges, unspan,
} from "../src/golem/tactics.ts";
import { GOLEM_TACTICS_V2, golemFencer, slotHealth, strokeReader } from "../src/golem/tactics-v2.ts";
import {
  COMMITTED_SHAPES, GOLEM_TACTICS_V3, golemStyled, reachAt,
} from "../src/golem/tactics-v3.ts";
import { FORM, golemForm } from "../src/golem/styles/form.ts";
import { BRAWLER, golemBrawler } from "../src/golem/styles/brawler.ts";
import { GUARDIAN, golemGuardian } from "../src/golem/styles/guardian.ts";
import { SKIRMISHER, golemSkirmisher } from "../src/golem/styles/skirmisher.ts";
import { golemPlanner } from "../src/golem/planner.ts";
import { NO_CHAMPIONS, golemChampionMind } from "../src/golem/champion.ts";
import { BUTTON_REACH } from "../src/buttons.ts";

process.env.SWORD_MEASURE_LIBRARY = "1";
const { freshHavok, runBout } = await import("../scripts/measure.mjs");
const { strokeSequence } = await import("../scripts/golem-bench.mjs");

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const FIXED = 1 / CONFIG.world.physicsHz;
const FRAME_MS = 1000 / 60;
const SEED = 20260904;

const MACE = { chain: "wrist", terminal: "mace" };
const MAUL = { chain: "wrist", terminal: "maul" };
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
  assert.deepEqual(names(golem), ["idle", "golem-duelist", "golem-fencer", "golem-planner", "golem-champion", "golem-neural", "golem-form", "golem-skirmisher", "golem-guardian", "golem-brawler", "golem-tactician", "golem-learner", "golem-driver", "golem-selector"]);
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
  assert.equal(POLICIES.find((policy) => policy.name === "golem-fencer").surface, "golem-v1");
  assert.equal(POLICIES.find((policy) => policy.name === "golem-planner").surface, "golem-v1");
  assert.equal(POLICIES.find((policy) => policy.name === "golem-champion").surface, "golem-v1");
  assert.equal(POLICIES.find((policy) => policy.name === "golem-neural").surface, "golem-v1");
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
    ["mace", setupWith({ primary: MACE, secondary: { chain: "reach", terminal: "plate" } })],
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
    const steps = sweepPlaces(fixture, golemTactics(SEED), label, 0.35);
    assert.ok(steps > 3000, `${label} only stepped ${steps} times`);
  }
});

/**
 * A maul pins the swing, so the mind turns the body instead.
 *
 * The capability fact Session 08 left written down for this one to read, moved from the mace to
 * the maul by the matchup set's Session 02: `TERMINAL_MAUL.limits` states `swingMin = swingMax`,
 * the chain folds it into its own limits before it publishes anything, and a golem carrying one
 * **cannot turn its weapon with its arm**. What the mind must do about it is turn with the trunk
 * or the carrier, and what it must not do is keep writing an azimuth into a channel that has one
 * value.
 *
 * The blade beside it is the control, and it is what makes this test say something: a mind that
 * never wrote `pointerX` at all would pass the maul half on its own.
 */
test("a_maul_is_aimed_with_the_trunk_because_its_own_swing_is_pinned", async (t) => {
  const mace = await standAGolem(t, setupWith({ primary: MAUL, secondary: MAUL }));
  const maceFixture = fixtureOf(mace.view);
  const shell = maceFixture.self.capabilities.effectors.primary.reachable;
  assert.ok(shell, "a maul still publishes a reachable shell");
  assert.equal(shell.swingMax - shell.swingMin, 0, "a maul has exactly one azimuth");

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
    // The middle of the shell, whatever its depth: a maul's is 0.06 m deep, and the old
    // `(inner + 0.92 reach) / 2` stood outside it.
    const at = reach - (shell.reachMax - shell.reachMin) / 2;
    const bearing = 0.55;
    // The placement is of the opponent's body and the gap is from the primary *shoulder*, which
    // stands a socket's width off the body's line, so the two differ; a blade's shell is 0.42 m
    // deep and did not notice, and a maul's is 0.06 m deep and does. Corrected until they agree.
    let scale = 1;
    let gap = 0;
    for (let round = 0; round < 4; round += 1) {
      place(fixture, { x: Math.sin(bearing) * at * scale, z: Math.cos(bearing) * at * scale });
      gap = Math.hypot(self.hands.primary.shoulder.x - fixture.opponent.shoulder.x,
        self.hands.primary.shoulder.y - fixture.opponent.shoulder.y,
        self.hands.primary.shoulder.z - fixture.opponent.shoulder.z);
      scale *= at / gap;
    }
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

  const withMace = run(maceFixture, "the maul golem");
  assert.equal(withMace.pointer, 0,
    "a pinned swing has one azimuth, so no cursor position asks for another");
  assert.ok(withMace.twist > 0.3,
    `a maul golem turned its trunk by at most ${withMace.twist.toFixed(3)} of its envelope`);

  const blade = await standAGolem(t);
  const withBlade = run(fixtureOf(blade.view), "the blade golem");
  assert.ok(withBlade.pointer > 0.2,
    `an arm that can swing was only asked for ${withBlade.pointer.toFixed(3)} of its cursor`);
});

/**
 * The stroke is the weapon's: a mace is smashed from overhead and stepped into, a blade is cut.
 *
 * `STROKE_SHAPES` is read by `HandView.weapon`, and the two rows this reads are `club` -- the
 * chamber high, the feet closing by `stepIn` through the commit -- and `sword`, which is the
 * cut that was the only stroke until the matchup set's Session 02. Both golems are stood where a
 * strike is on, the same way the maul test stands them, and what is compared is the highest the
 * cursor was raised while chambering and how much the commit added to `forward`. The blade is
 * the control on both counts: it chambers low and steps in by nothing.
 */
test("a_mace_is_smashed_overhead_and_stepped_into_and_a_blade_is_not", async (t) => {
  const run = (fixture, label) => {
    const mind = golemTactics(SEED);
    const self = fixture.self;
    const reach = self.hands.primary.reach;
    const shell = self.capabilities.effectors.primary.reachable;
    const at = ((reach - (shell.reachMax - shell.reachMin)) + reach * 0.92) / 2;
    place(fixture, { x: 0, z: at });
    let chamberLift = -Infinity;
    let chamberForward = 0;
    let chambers = 0;
    let commitForward = 0;
    let commits = 0;
    for (let step = 0; step < CONFIG.world.physicsHz * 6; step += 1) {
      fixture.clock += FIXED;
      const intent = mind.decide(fixture, FIXED);
      if (mind.stance === "chamber") {
        chamberLift = Math.max(chamberLift, intent.primary.pointerY);
        chamberForward += intent.forward;
        chambers += 1;
      } else if (mind.stance === "commit") {
        commitForward += intent.forward;
        commits += 1;
      }
      assertInsideEnvelope(intent, self, `${label} step ${step}`);
    }
    assert.ok(chambers > 0 && commits > 0, `${label} never struck`);
    return { chamberLift, stepIn: commitForward / commits - chamberForward / chambers };
  };

  const mace = await standAGolem(t, setupWith({ primary: MACE,
    secondary: { chain: "reach", terminal: "plate" } }));
  const maceFixture = fixtureOf(mace.view);
  assert.equal(maceFixture.self.hands.primary.weapon, "club");
  const smash = run(maceFixture, "the mace golem");
  const blade = await standAGolem(t);
  const cut = run(fixtureOf(blade.view), "the blade golem");

  assert.ok(smash.chamberLift > cut.chamberLift + 0.3,
    `a mace chambered at ${smash.chamberLift.toFixed(3)} against a blade's ${cut.chamberLift.toFixed(3)}`);
  assert.ok(smash.stepIn > 0.3,
    `a mace's commit added ${smash.stepIn.toFixed(3)} of forward to its chamber's`);
  assert.ok(Math.abs(cut.stepIn) < 0.05,
    `a blade's commit moved the feet by ${cut.stepIn.toFixed(3)}, and a cut does not step`);
});

/**
 * A maul is swung with both hands on one grip: one attacker, and the second hand written as the
 * first.
 *
 * `GolemCapabilities.pairedHands` is the one fact the mind is told -- not the module's name --
 * and what it does with it is `mirror` the primary's seven fields into the secondary every step,
 * so a bar the body drives from the primary socket is never asked by the secondary for a guard
 * on the other side. The default golem is the control: its two hands are two, and they differ.
 */
test("a_maul_is_swung_with_both_hands_on_one_grip", async (t) => {
  const FIELDS = ["pointerX", "pointerY", "reach", "roll", "wristBend", "thrust", "guard"];
  const differs = (intent) => FIELDS.some((field) => intent.primary[field] !== intent.secondary[field]);
  const run = (fixture, label) => {
    const mind = golemTactics(SEED);
    let apart = 0;
    let steps = 0;
    for (const z of [0.9, 1.4, 2.2, 3.5]) {
      place(fixture, { x: 0.15, z });
      for (let step = 0; step < CONFIG.world.physicsHz * 2; step += 1) {
        fixture.clock += FIXED;
        const intent = mind.decide(fixture, FIXED);
        if (differs(intent)) apart += 1;
        steps += 1;
        assertInsideEnvelope(intent, fixture.self, `${label} step ${step}`);
      }
    }
    return { apart, steps };
  };

  const maul = await standAGolem(t, setupWith({ primary: MAUL, secondary: MAUL }));
  const maulFixture = fixtureOf(maul.view);
  assert.equal(maulFixture.self.capabilities.pairedHands, true, "a maul publishes paired hands");
  const paired = run(maulFixture, "the maul golem");
  assert.equal(paired.apart, 0,
    `the maul's second hand was asked for something else on ${paired.apart} of ${paired.steps} steps`);

  const blade = await standAGolem(t);
  const bladeFixture = fixtureOf(blade.view);
  assert.equal(bladeFixture.self.capabilities.pairedHands, false);
  const two = run(bladeFixture, "the default golem");
  assert.ok(two.apart > two.steps / 2,
    `the default golem's two hands agreed on ${two.steps - two.apart} of ${two.steps} steps`);
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
 * The bout here is deliberately short of the cap because what is being asserted is a *rate*
 * rather than an outcome, and a test that ran a golem bout to its end would cost more than the
 * rest of this file put together. A bar that has come down this far is a bout that ends; the
 * spacing bound beside it is the other half, and is what the owner actually saw.
 *
 * **It is 25 s rather than the original 14 s because Session 01 of the style set slowed the
 * fight down on purpose.** One claim per part per stroke stopped a rake being billed six or seven
 * times, and the cost named in that plan is longer bouts.
 *
 * **And since 2026-09-07 this cell does not finish inside the 60 s cap at all, which is the
 * finding this docstring exists to carry rather than a threshold to be re-fitted around.**
 * Session 03 of the style set scores a blow on `0.5 mu v^2` taken along the contact normal, and
 * a golem's median contact arrives at 46 % of its tip speed -- so the median rake, squared, is
 * worth a fifth of what the retired speed ramp paid it. Run to the cap, the weaker of the two
 * reads 0.588 with no winner, having come down 0.125 over the last thirty seconds; at that rate
 * the bout ends somewhere near 200 s. The lever is how fast a stroke arrives at the mark, which
 * is Session 02's bench and Session 04's committed cut, and it is deliberately not a scoring
 * row: `docs/measurements.md` under Session 03 reports the fall and leaves the 60 s cap in front
 * of the owner, as the plan's sixth named risk says to.
 *
 * What that costs this test is the *bar's* half of the discrimination. Re-taken at 25 s on
 * 2026-09-07:
 *
 *     GOLEM_TACTICS.standOffFraction / GOLEM_ASSEMBLY.healthScale   median gap   weaker bar
 *      1.00 / 0.25   as shipped                                       1.670 m       0.783
 *      0    / 0.25   the mind blind to the arm in front of it         1.299 m       0.776
 *      1.00 / 1.0    a stone body against a person's weapon           1.670 m       0.946
 *      0    / 1.0    the pair the owner watched                       1.299 m       0.944
 *
 * The bar no longer separates the stand-off at all -- 0.783 against 0.776 is nothing -- and
 * still separates the health scale by a wide margin. So the two bounds below now hold one half
 * of the fix each rather than both: lose the stand-off and the spacing bound says so, lose the
 * health scale and the bar bound does. That is a weaker guard than the one it replaces and it is
 * stated as one. Running to the cap would restore a little of it (0.588 shipped against 0.672
 * blind, a margin of 0.084) at more than twice the cost, and a margin that thin is not worth
 * buying.
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
    maxSeconds: 25,
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
  // out**, which is the only way to know a threshold is a threshold and not a decoration. The
  // table is in the docstring above, and it has been re-taken three times now -- the figures move
  // with every contact rule and will move again; the separations are what is not provisional.
  //
  // The spacing bound sits between 1.299 and 1.670 and is where it has always been.
  assert.ok(median > 1.5,
    `two golems held ${median.toFixed(3)} m apart on the floor, which is chest to chest`);
  // The bar bound sits between 0.783 and 0.944, which is what is left of it: it says the golem's
  // declared part health is still written to the scale of the weapon that has to cut it, and it
  // no longer says anything about the stand-off. 0.85 is the midpoint of the two, rounded to a
  // number somebody chose rather than one a run happened to produce.
  assert.ok(loser < 0.85,
    `after ${result.seconds.toFixed(1)} s the weaker golem is still at ${loser.toFixed(3)},`
    + ` which is a bout the weapon is not cutting into at all`);
});

// ---------------------------------------------------------------------------------------
// The fencer: the same machine with the other fighter read into it. Session 05 of the matchup set.
// ---------------------------------------------------------------------------------------

/** A fencer's table with some rows moved, for one test, without touching what the others read. */
const fencerWith = (over) => ({ ...GOLEM_TACTICS_V2, ...over });

/**
 * Their arm as the fixture shows it: the primary tip put at a fraction of its reach from its
 * own socket, pointed at my primary socket or straight up, and optionally driven toward me
 * over the steps that follow so the gap rate the mind keeps reads as closing.
 */
function theirArm(fixture, { extension, toward = true }) {
  const hand = fixture.opponent.hands.primary;
  const mine = fixture.self.hands.primary.shoulder;
  const dx = mine.x - hand.shoulder.x;
  const dy = mine.y - hand.shoulder.y;
  const dz = mine.z - hand.shoulder.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  const along = extension * hand.reach;
  if (toward) {
    hand.tip.x = hand.shoulder.x + (dx / length) * along;
    hand.tip.y = hand.shoulder.y + (dy / length) * along;
    hand.tip.z = hand.shoulder.z + (dz / length) * along;
  } else {
    hand.tip.x = hand.shoulder.x;
    hand.tip.y = hand.shoulder.y + along;
    hand.tip.z = hand.shoulder.z;
  }
  fixture.opponent.tip.x = hand.tip.x;
  fixture.opponent.tip.y = hand.tip.y;
  fixture.opponent.tip.z = hand.tip.z;
}

/**
 * Step the mind for `seconds`, with their whole body walking in on me at `closing` m/s along
 * the floor, collecting what the caller wants. The body and not the point alone, because the
 * reader's commit is an arm held *drawn* while its point closes -- the duelist reaches for a mark
 * past the point and its trunk carries the arm in -- and a point flying out of a still body is
 * an arm extending, which the reader rightly reads as the guard going back out.
 */
function drive(fixture, mind, seconds, { closing = 0, each = null } = {}) {
  const them = fixture.opponent;
  const mine = fixture.self.ground;
  for (let step = 0; step < Math.round(seconds * CONFIG.world.physicsHz); step += 1) {
    if (closing !== 0) {
      const dx = mine.x - them.ground.x;
      const dz = mine.z - them.ground.z;
      const length = Math.hypot(dx, dz) || 1;
      const move = Math.min(closing * FIXED, Math.max(0, length - 0.5));
      const shift = (point) => { point.x += (dx / length) * move; point.z += (dz / length) * move; };
      shift(them.ground); shift(them.shoulder); shift(them.tip);
      for (const name of ["primary", "secondary"]) { shift(them.hands[name].shoulder); shift(them.hands[name].tip); }
      fixture.measure = Math.hypot(fixture.self.shoulder.x - them.shoulder.x, fixture.self.shoulder.z - them.shoulder.z);
    }
    fixture.clock += FIXED;
    const intent = mind.decide(fixture, FIXED);
    if (each) each(intent, step);
  }
}

/**
 * The reader, with no body behind it, on the profile the duelist's own stroke makes: a guard held
 * out, the arm drawing in, the point coming at me with the arm drawn, the arm going back out.
 * `GOLEM_TACTICS_V2.readSeconds` carries the table these thresholds were read off; what is
 * asserted here is that the reader says what that table says it says.
 */
test("the_stroke_reader_tells_a_chamber_a_commit_and_a_recover_from_the_arms_extension", () => {
  const reader = strokeReader();
  const seen = [];
  const feed = (seconds, extension, gapRate) => {
    for (let step = 0; step < Math.round(seconds * CONFIG.world.physicsHz); step += 1) {
      seen.push(reader.update(extension, gapRate, FIXED));
    }
  };
  feed(0.5, 0.88, 0);
  assert.equal(reader.phase, "idle", "a guard held out is idle");
  assert.ok(seen.every((phase) => phase === "idle"), "a guard was read as something before any stroke");
  // Drawing in: the extension falls at about one reach a second, which is the duelist's chamber.
  for (let step = 0; step < 36; step += 1) reader.update(0.88 - (step / 36) * 0.18, 0.5, FIXED);
  assert.equal(reader.phase, "chamber", `an arm drawing in reads as ${reader.phase}`);
  feed(0.15, 0.60, -3.0);
  assert.equal(reader.phase, "commit", `an arm drawn with its point closing reads as ${reader.phase}`);
  feed(0.10, 0.88, 0);
  assert.equal(reader.phase, "recover", `the moment after a commit reads as ${reader.phase}`);
  feed(GOLEM_TACTICS_V2.readRecoverSeconds, 0.88, 0);
  assert.equal(reader.phase, "idle", "the recover window has run out");

  // A guard being adjusted is not a chamber: the arm out past the guard extension, whatever
  // the point is doing.
  const still = strokeReader();
  for (let step = 0; step < 120; step += 1) still.update(0.90, step % 2 ? 3 : -3, FIXED);
  assert.equal(still.phase, "idle");

  // The switch: off, every phase is idle, and the features that read one are inert.
  const blind = strokeReader(fencerWith({ readStroke: false }));
  for (let step = 0; step < 60; step += 1) blind.update(0.5, -4, FIXED);
  assert.equal(blind.phase, "idle");
});

/**
 * Counter-timing, feature 2, on a synthetic arm: while their point is coming at me the fencer's
 * feet go back and no exchange starts; the moment their arm is read recovering, it chambers,
 * in line or not. The duelist under the same view waits for its patience, which is the
 * control -- and the fencer with `counterTiming` off is the same control.
 */
test("the_fencer_voids_a_read_commit_and_strikes_into_the_recover_behind_it", async (t) => {
  const golem = await standAGolem(t);
  const run = (tactics) => {
    const fixture = fixtureOf(golem.view);
    const mind = golemFencer(SEED, tactics);
    // Out of range, with their point off the line, for long enough that the start-of-bout
    // cooldown is spent: nothing fires out of reach, and an opening every step keeps patience
    // from being banked against the moment the range closes.
    place(fixture, { x: 0.3, z: 4.5 });
    theirArm(fixture, { extension: 0.88, toward: false });
    drive(fixture, mind, 2.5);
    assert.equal(mind.stance, "approach");
    // Now inside both reaches with their arm drawn, in line, and the body walking it in: a
    // commit as the reader defines one, and neither an opening nor patience.
    place(fixture, { x: 0.3, z: 1.75 });
    fixture.opponent.reach = 1.78;
    theirArm(fixture, { extension: 0.62 });
    let forward = 0;
    let exchanges = 0;
    const phases = new Set();
    drive(fixture, mind, 0.20, {
      closing: 1.5,
      each: (intent) => {
        forward = Math.min(forward, intent.forward);
        phases.add(mind.phase);
        if (process.env.DBG) console.log("dbg", mind.phase, mind.stance, fixture.opponent.hands.primary.tip.z.toFixed(3), fixture.self.hands.primary.shoulder.z.toFixed(3), fixture.opponent.hands.primary.shoulder.z.toFixed(3));
        if (mind.stance === "chamber" || mind.stance === "commit" || mind.stance === "feint") exchanges += 1;
      },
    });
    const commitRead = phases.has("commit");
    // Their arm back on guard, out past the guard extension and still on my line, so that the
    // only thing that can fire an exchange is the recover being read.
    theirArm(fixture, { extension: 0.88 });
    let chamberedAt = -1;
    drive(fixture, mind, 0.30, {
      each: (intent, step) => {
        if (chamberedAt < 0 && (mind.stance === "chamber" || mind.stance === "commit")) chamberedAt = step * FIXED;
      },
    });
    return { forward, exchanges, commitRead, chamberedAt, phase: mind.phase };
  };

  const fencer = run(GOLEM_TACTICS_V2);
  assert.ok(fencer.commitRead, "their drawn, closing arm was never read as a commit");
  assert.ok(fencer.forward <= -GOLEM_TACTICS_V2.voidStep + 1e-9,
    `the feet were asked for ${fencer.forward.toFixed(2)} during their commit, and a void is a step back`);
  assert.equal(fencer.exchanges, 0, "an exchange was started into their commit");
  assert.ok(fencer.chamberedAt >= 0 && fencer.chamberedAt < GOLEM_TACTICS_V2.readRecoverSeconds,
    `the fencer chambered ${fencer.chamberedAt.toFixed(2)} s into their recover`);

  const patient = run(fencerWith({ counterTiming: false, voidDuringCommit: false }));
  assert.ok(patient.forward > -GOLEM_TACTICS_V2.voidStep + 0.05,
    "with the void off the feet still stepped back");
  assert.equal(patient.chamberedAt, -1,
    "with counter-timing off the fencer still chambered into the recover, so the recover was not what fired it");
});

/**
 * A stop-hit, feature 2's third rule: the longer arm strikes the moment their point closes on
 * it, from a chamber cut to `stopHitChamberSeconds`. The same drive with the reaches equal is
 * the control, and so is the switch.
 */
test("the_longer_arm_stop_hits_a_point_that_closes_on_it", async (t) => {
  const golem = await standAGolem(t);
  const run = (tactics, theirReach) => {
    const fixture = fixtureOf(golem.view);
    const mind = golemFencer(SEED, tactics);
    place(fixture, { x: 0.3, z: 4.5 });
    theirArm(fixture, { extension: 0.88, toward: false });
    drive(fixture, mind, 2.5);
    place(fixture, { x: 0.3, z: 1.85 });
    fixture.opponent.reach = theirReach;
    for (const name of ["primary", "secondary"]) fixture.opponent.hands[name].reach = theirReach;
    // Their arm out on guard and its point walking in at me: a body closing, not a stroke.
    theirArm(fixture, { extension: 0.88 });
    let chamberedAt = -1;
    let committedAt = -1;
    drive(fixture, mind, 0.25, {
      closing: 2.0,
      each: (intent, step) => {
        if (chamberedAt < 0 && mind.stance === "chamber") chamberedAt = step * FIXED;
        if (committedAt < 0 && mind.stance === "commit") committedAt = step * FIXED;
      },
    });
    return { chamberedAt, committedAt };
  };
  const longer = run(GOLEM_TACTICS_V2, 1.14);
  assert.ok(longer.chamberedAt >= 0, "the longer arm never chambered on a closing point");
  assert.ok(longer.committedAt >= 0 &&
    longer.committedAt - longer.chamberedAt <= GOLEM_TACTICS_V2.stopHitChamberSeconds + 2 * FIXED,
    `the stop-hit's chamber lasted ${(longer.committedAt - longer.chamberedAt).toFixed(3)} s`);
  const equal = run(GOLEM_TACTICS_V2, 1.78);
  assert.equal(equal.chamberedAt, -1, "an equal arm stop-hit a body merely walking in");
  const off = run(fencerWith({ stopHit: false }), 1.14);
  assert.equal(off.chamberedAt, -1, "with the stop-hit off the longer arm still struck at a closing point");
});

/**
 * Reach asymmetry, feature 3, from the short side: a fist against a blade holds outside the
 * blade and does not commit from there -- the duelist would, on patience, and walk the stroke
 * in -- and goes in on the walk axis when their arm is read recovering.
 */
test("the_shorter_arm_holds_outside_and_goes_in_on_their_recover", async (t) => {
  const golem = await standAGolem(t, setupWith({
    primary: { chain: "wrist", terminal: "fist" }, secondary: { chain: "wrist", terminal: "fist" },
  }));
  const fixture0 = fixtureOf(golem.view);
  const reach = fixture0.self.hands.primary.reach;
  const theirReach = 1.78;
  assert.ok(reach < theirReach * (1 - GOLEM_TACTICS_V2.reachEdge), `a fist at ${reach} m is not the shorter arm against ${theirReach}`);
  const run = (tactics) => {
    const fixture = fixtureOf(golem.view);
    const mind = golemFencer(SEED, tactics);
    // At their reach, which is where both minds hold against a longer arm.
    place(fixture, { x: 0.3, z: theirReach });
    fixture.opponent.reach = theirReach;
    for (const name of ["primary", "secondary"]) fixture.opponent.hands[name].reach = theirReach;
    theirArm(fixture, { extension: 0.88, toward: false });
    let strokes = 0;
    let forwardMax = -1;
    drive(fixture, mind, 4.0, {
      each: (intent) => {
        if (intent.primary.thrust || intent.secondary.thrust) strokes += 1;
        forwardMax = Math.max(forwardMax, intent.forward);
      },
    });
    const held = { strokes, forwardMax, inside: mind.inside };
    // Their arm commits and recovers; the shorter arm should go in during the recover.
    theirArm(fixture, { extension: 0.62 });
    drive(fixture, mind, 0.15, { closing: 3.0 });
    theirArm(fixture, { extension: 0.88, toward: false });
    let forwardIn = -1;
    drive(fixture, mind, 0.25, { each: (intent) => { forwardIn = Math.max(forwardIn, intent.forward); } });
    return { held, forwardIn };
  };
  const fencer = run(GOLEM_TACTICS_V2);
  assert.equal(fencer.held.strokes, 0, "the shorter arm struck from outside its own reach");
  assert.ok(fencer.held.forwardMax < 0.5, `the shorter arm walked in on nothing, forward ${fencer.held.forwardMax.toFixed(2)}`);
  assert.equal(fencer.held.inside, false);
  assert.ok(fencer.forwardIn >= 1 - 1e-9, `on their recover the shorter arm's feet were asked for ${fencer.forwardIn.toFixed(2)}`);
  const duelistLike = run(fencerWith({ closeOnRecover: false }));
  assert.ok(duelistLike.held.strokes > 0, "with the rule off the fencer still never committed on patience from their reach");
});

/**
 * Target selection, feature 4: the exchange is aimed at the reachable slot with the least
 * published health, by `targetMargin` under the trunk, and at the trunk otherwise. The keys
 * are the ones a golem publishes -- side, body, slot, part -- and the slot is what is read.
 */
test("the_fencer_aims_at_the_slot_with_the_least_health_when_it_can_reach_it", async (t) => {
  const golem = await standAGolem(t);
  // The feature ships off -- the mirror tournament read it as a loss on the vitality bar -- so
  // the choice is tested with it on, and the default is asserted last.
  const chosen = (health, tactics = fencerWith({ targetByHealth: true })) => {
    const fixture = fixtureOf(golem.view);
    const mind = golemFencer(SEED, tactics);
    place(fixture, { x: 0.3, z: 1.5 });
    fixture.opponent.health = health;
    theirArm(fixture, { extension: 0.88, toward: false });
    const targets = new Set();
    drive(fixture, mind, 4.0, {
      each: () => { if (mind.stance === "chamber" || mind.stance === "commit") targets.add(mind.target); },
    });
    assert.ok(targets.size > 0, "no exchange happened in four seconds at strike range");
    return [...targets];
  };
  const whole = {
    "x.golem.trunk.core": 1, "x.golem.trunk.waist": 1, "x.golem.head.head": 1, "x.golem.head.neck": 1,
    "x.golem.primary.upperArm": 1, "x.golem.primary.forearm": 1, "x.golem.secondary.upperArm": 1,
    "x.golem.legs.thighL": 1,
  };
  assert.deepEqual(chosen(whole), ["trunk"], "a whole body is struck at the trunk");
  assert.deepEqual(chosen({ ...whole, "x.golem.primary.forearm": 0.4 }), ["primary"],
    "a worn arm inside the margin was not chosen");
  assert.deepEqual(chosen({ ...whole, "x.golem.primary.forearm": 0.9 }), ["trunk"],
    "an arm barely worn was chosen over the trunk");
  assert.deepEqual(chosen({ ...whole, "x.golem.head.neck": 0.3 }), ["head"]);
  assert.deepEqual(chosen({ ...whole, "x.golem.primary.forearm": 0 }), ["trunk"],
    "a slot with a part gone is not a target");
  assert.equal(GOLEM_TACTICS_V2.targetByHealth, false, "the feature ships off, on the tournament row");
  assert.deepEqual(chosen({ ...whole, "x.golem.primary.forearm": 0.4 }, GOLEM_TACTICS_V2),
    ["trunk"], "with the feature off the trunk is the only mark");

  const bySlot = {};
  slotHealth({ ...whole, "x.golem.primary.forearm": 0.4, "x.golem.primary.upperArm": 0.7 }, bySlot);
  assert.equal(bySlot.primary, 0.4, "a slot's health is its least part");
  assert.equal(bySlot.locomotion, -1, "a slot with no part published is absent, not whole");
});

/**
 * The two-weapon combination, feature 7: with a blade in each socket the spare hand's stroke
 * starts as the acting hand's arc ends, so the two thrusts overlap or nearly do. With the
 * feature off the hands take turns, an exchange apart.
 */
test("the_second_blade_strikes_into_the_first_ones_follow_through", async (t) => {
  const golem = await standAGolem(t, setupWith({ secondary: { chain: "wrist", terminal: "blade" } }));
  const run = (tactics) => {
    const fixture = fixtureOf(golem.view);
    const mind = golemFencer(SEED, tactics);
    place(fixture, { x: 0.0, z: 1.5 });
    theirArm(fixture, { extension: 0.88, toward: false });
    let combos = 0;
    let wasCombo = false;
    let closest = Infinity;
    const lastThrust = { primary: -Infinity, secondary: -Infinity };
    const wasThrust = { primary: false, secondary: false };
    drive(fixture, mind, 6.0, {
      each: (intent, step) => {
        const now = step * FIXED;
        for (const name of ["primary", "secondary"]) {
          if (intent[name].thrust && !wasThrust[name]) {
            const other = name === "primary" ? "secondary" : "primary";
            closest = Math.min(closest, now - lastThrust[other]);
            lastThrust[name] = now;
          }
          wasThrust[name] = intent[name].thrust;
        }
        if (mind.combo && !wasCombo) combos += 1;
        wasCombo = mind.combo;
        assertInsideEnvelope(intent, fixture.self, `two blades step ${step}`);
      },
    });
    return { combos, closest };
  };
  const on = run(GOLEM_TACTICS_V2);
  assert.ok(on.combos > 0, "no combination was started in six seconds of two blades in range");
  assert.ok(on.closest < 0.30, `the second blade's stroke started ${on.closest.toFixed(2)} s after the first's`);
  const off = run(fencerWith({ comboFraction: 0 }));
  assert.equal(off.combos, 0);
  assert.ok(off.closest > GOLEM_TACTICS_V2.recoverSeconds,
    `with the combination off the hands struck ${off.closest.toFixed(2)} s apart`);
});

/**
 * The feint, feature 6: a chamber shown and taken back. With every chamber a feint and their
 * arm idle, the stance runs chamber-shaped into `feint`, steps back for the feint's length,
 * and returns to measure without a commit.
 */
test("a_feint_is_a_chamber_taken_back_without_a_commit", async (t) => {
  const golem = await standAGolem(t);
  const fixture = fixtureOf(golem.view);
  const mind = golemFencer(SEED, fencerWith({ feintFraction: 1 }));
  place(fixture, { x: 0.3, z: 1.5 });
  theirArm(fixture, { extension: 0.88, toward: false });
  const stances = [];
  let backSteps = 0;
  let commits = 0;
  drive(fixture, mind, 5.0, {
    each: (intent) => {
      if (stances[stances.length - 1] !== mind.stance) stances.push(mind.stance);
      if (mind.stance === "feint" && intent.forward <= -1 + 1e-9) backSteps += 1;
      if (mind.stance === "commit") commits += 1;
    },
  });
  assert.ok(stances.includes("feint"), `no feint in ${stances.join(" > ")}`);
  assert.equal(commits, 0, `a feint became a commit: ${stances.join(" > ")}`);
  for (let i = 0; i < stances.length - 1; i += 1) {
    if (stances[i] === "feint") assert.equal(stances[i + 1], "measure", `a feint went to ${stances[i + 1]}`);
  }
  assert.ok(backSteps >= Math.round(GOLEM_TACTICS_V2.feintBackSeconds * CONFIG.world.physicsHz) - 2,
    `the feint stepped back for ${backSteps} steps`);
});

/**
 * The same two claims the duelist makes, of the fencer: every command over a grid of places sits
 * inside the published envelope, on the builds whose sockets differ most, and one seed is one
 * bout.
 */
test("the_fencer_stays_inside_the_envelope_and_is_deterministic_under_a_seed", async (t) => {
  for (const [label, setup] of [
    ["the default golem", defaultGolemSetup()],
    ["two blades", setupWith({ secondary: { chain: "wrist", terminal: "blade" } })],
    ["the maul", setupWith({ primary: MAUL, secondary: MAUL })],
    ["fists", setupWith({ primary: { chain: "wrist", terminal: "fist" }, secondary: { chain: "pitch", terminal: "fist" } })],
  ]) {
    const golem = await standAGolem(t, setup);
    const fixture = fixtureOf(golem.view);
    sweepPlaces(fixture, golemFencer(SEED), label, 0.35);
  }
  const golem = await standAGolem(t);
  const trace = (seed) => {
    const fixture = fixtureOf(golem.view);
    const mind = golemFencer(seed);
    const out = [];
    for (const z of [3.5, 1.6, 1.2]) {
      place(fixture, { x: 0.3, z });
      drive(fixture, mind, 2.0, {
        each: (intent) => out.push(`${intent.primary.pointerX.toFixed(6)},${intent.primary.pointerY.toFixed(6)},` +
          `${intent.primary.thrust ? 1 : 0}${intent.forward.toFixed(6)},${mind.stance}`),
      });
    }
    return out.join("|");
  };
  assert.equal(trace(SEED), trace(SEED), "one seed, one bout");
  assert.notEqual(trace(SEED), trace(SEED + 1), "two seeds, two bouts");
});

// ---------------------------------------------------------------------------------------
// A director over the fencer, and the planner that is one. Session 06 of the matchup set.
// ---------------------------------------------------------------------------------------

/**
 * A director names the option; the fencer runs it and its own triggers stand aside. Two
 * directors on the same synthetic view: one that always says withdraw keeps the feet going back
 * and starts no exchange with their arm on guard in range, where the fencer alone would have
 * chambered; one that says strike the moment a strike is open starts one on that step. Between
 * them, the ask cadence: the director is consulted again only after `replanSeconds`, or when
 * what it named stops being open.
 */
test("a_directed_fencer_runs_the_option_it_is_handed_and_asks_again_on_the_cadence", async (t) => {
  const golem = await standAGolem(t);
  const run = (choose) => {
    const fixture = fixtureOf(golem.view);
    const asks = [];
    const mind = golemFencer(SEED, GOLEM_TACTICS_V2, (available, reading, view) => {
      asks.push({ available: [...available], gap: reading.gap, theirs: reading.theirs, mine: reading.mine, clock: fixture.clock });
      assert.equal(view, fixture, "the director sees the view the fencer decided on");
      return choose(available);
    });
    place(fixture, { x: 0.3, z: 4.5 });
    theirArm(fixture, { extension: 0.88, toward: false });
    drive(fixture, mind, 2.5);
    const asksOutOfRange = asks.length;
    assert.ok(asks.every((ask) => !ask.available.includes("strike")), "a strike was open from out of range");
    // Inside my strike range (1.64 m at this build) with their arm on guard: a strike is open,
    // and nothing of theirs is read.
    place(fixture, { x: 0.3, z: 1.5 });
    theirArm(fixture, { extension: 0.88 });
    let forward = 0;
    let exchanges = 0;
    let firstExchangeAt = -1;
    const options = new Set();
    drive(fixture, mind, 1.0, {
      each: (intent, step) => {
        forward = Math.min(forward, intent.forward);
        options.add(mind.option);
        if (mind.stance === "chamber" || mind.stance === "commit" || mind.stance === "feint") {
          exchanges += 1;
          if (firstExchangeAt < 0) firstExchangeAt = step * FIXED;
        }
      },
    });
    return { asks, asksOutOfRange, forward, exchanges, firstExchangeAt, options, mind };
  };

  const backing = run(() => "withdraw");
  assert.equal(backing.exchanges, 0, "a fencer told to withdraw started an exchange anyway");
  assert.ok(backing.forward < 0, `the feet were asked for ${backing.forward.toFixed(2)} under a withdraw`);
  assert.deepEqual([...backing.options], ["withdraw"]);
  const inRange = backing.asks.slice(backing.asksOutOfRange);
  assert.ok(inRange.length >= 5 && inRange.length <= 7,
    `${inRange.length} asks over a second at replanSeconds ${GOLEM_TACTICS_V2.replanSeconds}`);
  assert.ok(inRange.some((ask) => ask.available.includes("strike") && ask.available.includes("wait")),
    "in range with the cooldown spent, a strike and a wait were never on offer");
  assert.equal(inRange[0].theirs, "idle");
  assert.equal(inRange[0].mine, "free");
  assert.equal(backing.mind.available.length, 7, `${backing.mind.available.join(",")} is not every option but the ram`);

  const striking = run((available) => available.includes("strike") ? "strike" : "close");
  assert.ok(striking.exchanges > 0, "a fencer told to strike never chambered");
  // The last ask was made out of range and named a close; the strike is named at the next
  // ask, which is the cadence and not the step.
  assert.ok(striking.firstExchangeAt < GOLEM_TACTICS_V2.replanSeconds + FIXED,
    `the strike was named at the first ask it was open and started ${striking.firstExchangeAt.toFixed(3)} s in`);
  assert.ok(striking.options.has("strike"));
  // While the exchange ran the director was not asked: the exchange is the fencer's to finish.
  const during = striking.asks.slice(striking.asksOutOfRange).filter((ask) => ask.mine === "exchange");
  assert.equal(during.length, 0, "the director was asked in the middle of an exchange");
});

/**
 * The planner is the director the duel model makes, over a real bout: it replans on the
 * fencer's cadence, every replan is a plan over the checked-in tables, and the whole of it costs
 * what the model test measured and not what a physics rollout would. The bout is short for the
 * reason the duelist's is; the claim is that the mind runs, chooses and stays in budget.
 */
test("the_planner_drives_a_real_bout_replanning_on_the_cadence_inside_its_budget", async () => {
  const setup = defaultGolemSetup();
  const planner = golemPlanner(SEED);
  const options = new Map();
  const result = runBout({
    left: "golem-planner", right: "golem-fencer",
    leftUnit: "golem", rightUnit: "golem",
    leftGolem: setup, rightGolem: setup,
    locomotionMode: "supported",
    leftMind: { name: "golem-planner", fencer: planner.fencer, decide: (view, dt) => planner.decide(view, dt) },
    seeds: [SEED, SEED + 17],
    maxSeconds: 8,
    physics: await freshHavok(),
    onSample: () => {
      const option = planner.fencer.option;
      options.set(option, (options.get(option) ?? 0) + 1);
    },
  });
  assert.ok(result.seconds >= 7.9, `the bout ran ${result.seconds.toFixed(1)} s`);
  assert.ok(planner.replans >= 8 * 3 && planner.replans <= 8 * 8,
    `${planner.replans} replans over ${result.seconds.toFixed(1)} s is not four to eight a second`);
  assert.ok(planner.lastPlan !== null && planner.lastPlan.values.length === 8);
  const perReplan = planner.totalMs / planner.replans;
  console.log(`planner: ${planner.replans} replans, ${perReplan.toFixed(3)} ms each, options ${[...options].map(([k, v]) => `${k} ${v}`).join(", ")}`);
  assert.ok(perReplan < 5, `${perReplan.toFixed(2)} ms a replan is over the budget`);
  assert.ok(options.size >= 2, `the planner ran one option the whole bout: ${[...options.keys()].join(",")}`);
});

/**
 * The champion is the planner with a table's numbers, and which numbers is decided by the arm
 * class it reads off its first view: a blade at full extension takes the `sword/long` row and a
 * body with both sockets capped falls through to the general one. Built at the first view and
 * not before, so `fencer` is null until then, which the tournament worker's exchange log reads
 * per sample for. The table is refused by version by name, as the duel model's is.
 */
test("the_champion_reads_its_arm_class_off_its_first_view_and_plays_the_row_for_it", async () => {
  const entry = (cls, over) => ({
    class: cls, builds: 1, generations: 0, bouts: 0, score: 0, baseline: 0, margin: 0, baselineMargin: 0,
    fencer: {}, planner: {}, ...over,
  });
  const tables = {
    ...NO_CHAMPIONS,
    general: entry("general", { planner: { aggression: 0.3 } }),
    classes: { "sword/long": entry("sword/long", { fencer: { replanSeconds: 0.25 }, planner: { aggression: 0.7 } }) },
  };
  const bout = async (setup) => {
    const mind = golemChampionMind(SEED, tables);
    assert.equal(mind.name, "golem-champion");
    assert.equal(mind.fencer, null, "no fencer before the first view");
    assert.equal(mind.armClass, null);
    const result = runBout({
      left: "golem-champion", right: "golem-fencer",
      leftUnit: "golem", rightUnit: "golem",
      leftGolem: setup, rightGolem: setup,
      locomotionMode: "supported",
      leftMind: mind,
      seeds: [SEED, SEED + 3],
      maxSeconds: 3,
      physics: await freshHavok(),
    });
    return { mind, result };
  };
  const blade = await bout(defaultGolemSetup());
  assert.ok(blade.result.seconds >= 2.9, `the bout ran ${blade.result.seconds.toFixed(1)} s`);
  assert.equal(blade.mind.armClass, "sword/long");
  assert.equal(blade.mind.entry.class, "sword/long");
  assert.ok(blade.mind.fencer !== null && blade.mind.planner.replans > 0, "the planner under it never planned");
  const capped = await bout({
    ...defaultGolemSetup(), head: "head.ram",
    primary: { chain: "none", terminal: "none" }, secondary: { chain: "none", terminal: "none" },
  });
  assert.equal(capped.mind.armClass, "empty/short");
  assert.equal(capped.mind.entry.class, "general", "a class without a row plays the general vector");
  assert.throws(() => golemChampionMind(SEED, { ...NO_CHAMPIONS, version: 0 }), /version 0; this build reads version 1/);
  // The shipped table loads through the picker, whatever it holds.
  const shipped = unitDefinition("golem").createPolicy("golem-champion");
  assert.equal(shipped.name, "golem-champion");
});

/**
 * The stroke bench writes what the fencer writes, command for command, to the last digit.
 *
 * `driveStroke` and the acting hand's commit block are inside `golemFencer`'s closure and cannot
 * be called from a bench, so `strokeSequence` in `scripts/golem-bench.mjs` is a **transcription**
 * of them -- and a transcription is exactly the kind of thing that goes quietly wrong. A sign on
 * `followLift`, a `windRoll` left as `roll`, `cutBend` where `coverBend` belongs: each of those
 * compiles, each of them moves every number the grid is read on, and none of them is visible in
 * the row. So the fencer is put in front of a real published view, driven until it chambers and
 * commits, and every field of its acting hand's intent is compared with what the bench's own
 * writers produce for the same shape, capability, socket, mark and heading at the same instant.
 *
 * **The clocks are aligned off the fencer's own stance changes, and they are off by one step.**
 * `goTo` runs at the *end* of a stance block, after that block has written its command, so the
 * first step on which `stance` reads "commit" still carries the chamber's pose and the arc's own
 * first write lands one step later, at `elapsed` of exactly one physics step. Assuming otherwise
 * -- which is the obvious reading, and was the first one written here -- compares the whole arc a
 * step out of phase and fails on the guard command at the head of the chamber.
 *
 * The mark is the trunk's, which is where `slotMark` puts it with `targetByHealth` off -- the
 * shipped setting -- and the heading is the published trunk twist, which a static fixture holds
 * still. Both are asserted rather than assumed: if the fencer ever aimed somewhere else the
 * comparison would fail, which is the failure this test is for.
 */
test("the_stroke_benchs_sequence_is_the_fencers_own_commit_to_the_digit", async (t) => {
  const compare = async (label, setup) => {
    const golem = await standAGolem(t, setup);
    const fixture = fixtureOf(golem.view);
    const caps = fixture.self.capabilities;
    assert.ok(caps, `${label}: the stand published no capabilities`);
    // Square on and just inside the strike range, so the exchange opens without a step to reach it.
    const ranges = tacticalRanges(fixture.self.hands.primary.reach, caps.effectors.primary, 1.45);
    place(fixture, { x: fixture.self.ground.x, z: fixture.self.ground.z + ranges.strike - 0.05 });
    theirArm(fixture, { extension: 0.88 });

    // No feint and no stop-hit, so the exchange that opens is the plain one the bench scripts.
    const mind = golemFencer(7, fencerWith({ feintFraction: 0, stopHit: false }));
    const seen = [];
    drive(fixture, mind, 4.0, {
      each: (intent) => {
        const acting = intent[intent.actingHand];
        seen.push({
          stance: mind.stance, target: mind.target, actingHand: intent.actingHand,
          pointerX: acting.pointerX, pointerY: acting.pointerY, reach: acting.reach,
          roll: acting.roll, wristBend: acting.wristBend,
          thrust: acting.thrust, guard: acting.guard,
        });
      },
    });

    // The first chamber that runs straight into a commit: a feint would not, and a stroke that
    // was interrupted would not either.
    let commitFrom = -1;
    for (let step = 1; step < seen.length; step += 1) {
      if (seen[step].stance === "commit" && seen[step - 1].stance === "chamber") {
        commitFrom = step;
        break;
      }
    }
    assert.ok(commitFrom > 0,
      `${label}: the fencer never chambered into a commit in 4 s at ${ranges.strike.toFixed(2)} m`);
    let chamberFrom = commitFrom - 1;
    while (chamberFrom > 0 && seen[chamberFrom - 1].stance === "chamber") chamberFrom -= 1;
    const acting = seen[commitFrom].actingHand;
    assert.equal(seen[chamberFrom].actingHand, acting,
      `${label}: the acting hand changed inside one exchange`);
    assert.equal(seen[commitFrom].target, "trunk",
      `${label}: the fencer aimed somewhere other than the trunk, so the bench's mark is wrong`);

    // The bench's own sequence, built from what the same body publishes.
    const hand = fixture.self.hands[acting];
    const cap = caps.effectors[acting];
    const them = fixture.opponent;
    const mark = new Vector3(them.ground.x, them.shoulder.y, them.ground.z);
    const heading = fixture.self.facing + fixture.self.trunkTwist * caps.trunkTwistMax;
    const shape = STROKE_SHAPES[hand.weapon];
    const script = strokeSequence({
      shape, cap, socket: hand.shoulder, mark, reach: hand.reach,
      outboard: hand.outboard, heading, guardSeconds: 0,
    });
    const write = (name) => script.find((phase) => phase.name === name).write;
    const blank = () => ({
      pointerX: 0, pointerY: 0, reach: 0, roll: 0, wristBend: 0, thrust: false, guard: false,
    });
    const same = (want, got, where) => {
      for (const key of ["pointerX", "pointerY", "reach", "roll", "wristBend"]) {
        assert.ok(Math.abs(want[key] - got[key]) < 1e-12,
          `${label} ${where}: the bench asked ${key} ${want[key]} and the fencer ${got[key]}`);
      }
      assert.equal(want.thrust, got.thrust, `${label} ${where}: thrust`);
      assert.equal(want.guard, got.guard, `${label} ${where}: guard`);
    };

    // The chamber holds one pose, so every step of it is the same command and each is checked.
    const chambered = blank();
    write("chamber")(chambered, 0);
    for (let step = chamberFrom + 1; step <= commitFrom; step += 1) {
      same(chambered, seen[step], `chamber step ${step - chamberFrom - 1}`);
    }
    let checked = 0;
    for (let step = commitFrom + 1; step < seen.length && seen[step].stance === "commit"; step += 1) {
      const elapsed = (step - commitFrom) * FIXED;
      const at = shape.strokeSeconds > 0 ? Math.max(0, Math.min(1, elapsed / shape.strokeSeconds)) : 1;
      const want = blank();
      write("stroke")(want, at);
      same(want, seen[step], `arc at t=${at.toFixed(4)}`);
      checked += 1;
    }
    assert.ok(checked >= Math.round(shape.strokeSeconds / FIXED),
      `${label}: only ${checked} steps of the arc were compared,`
      + ` and the arc is ${shape.strokeSeconds} s long`);
    return shape;
  };

  await compare("the blade", defaultGolemSetup());
  // The whip, because it is the **only** shape whose wind-up roll is not its arc's: every other
  // kind has `windRoll === roll`, so a bench that wrote the arc's roll into the chamber would be
  // indistinguishable from a faithful one on a blade. Watched red 2026-09-06 with exactly that
  // mutation, green on the blade alone.
  const lash = await compare("the whip",
    setupWith({ primary: { chain: "wrist", terminal: "whip" } }));
  assert.notEqual(lash.windRoll, lash.roll,
    "the whip's wind-up roll became its arc's, and with it the one shape that could tell them apart");
});

// ---------------------------------------------------------------------------------------
// The third executor and the first style. Session 04 of the style set.
//
// The claims here are all of the same shape and it is worth naming it once: this executor has no
// tactics, so every test hands it a director that names one option and asks what the body did
// about it. A test that had to arrange for a reflex to fire could not tell a rule that was wrong
// from a trigger that never went off, which is the thing four sessions of the fencer's tests
// worked around.
// ---------------------------------------------------------------------------------------

/** A v3 table with some rows moved, for one test, without touching what the others read. */
const styledWith = (over) => ({ ...GOLEM_TACTICS_V3, ...over });

/**
 * Put their body where the socket-to-shoulder gap is exactly what a test wants.
 *
 * `place` puts their shoulder a fixed 0.21 m outboard of the ground position it is given and at
 * the height it is given, so lining the two shoulders up on one axis makes the gap a subtraction
 * rather than a solve -- and a range test that has to search for its own range is a test whose
 * failure message says nothing.
 */
function atGap(fixture, gap, over = {}) {
  const socket = fixture.self.hands.primary.shoulder;
  return place(fixture, { x: socket.x - 0.21, z: socket.z + gap, shoulderY: socket.y, ...over });
}

/** Give their watched hand a tip velocity, and the tip speed that goes with it. */
function theirTipVelocity(fixture, { x = 0, y = 0, z = 0 }, name = "primary") {
  const hand = fixture.opponent.hands[name];
  hand.tipVelocity.x = x; hand.tipVelocity.y = y; hand.tipVelocity.z = z;
  hand.tipSpeed = Math.hypot(x, y, z);
  fixture.opponent.tipSpeed = Math.max(fixture.opponent.tipSpeed, hand.tipSpeed);
}

/** Step the mind while their point flies along the velocity it was given. */
function flyTip(fixture, mind, seconds, { each = null, name = "primary" } = {}) {
  const hand = fixture.opponent.hands[name];
  const velocity = hand.tipVelocity;
  for (let step = 0; step < Math.round(seconds * CONFIG.world.physicsHz); step += 1) {
    hand.tip.x += velocity.x * FIXED;
    hand.tip.y += velocity.y * FIXED;
    hand.tip.z += velocity.z * FIXED;
    fixture.opponent.tip.x = hand.tip.x;
    fixture.opponent.tip.y = hand.tip.y;
    fixture.opponent.tip.z = hand.tip.z;
    fixture.clock += FIXED;
    const intent = mind.decide(fixture, FIXED);
    if (each) each(intent, step);
  }
}

/** What distance a hand's reach command asks its business end for, in metres: `reachForDistance` back. */
function commandedDistance(hand, self, name, bite) {
  const cap = self.capabilities.effectors[name];
  const shell = cap.reachable;
  const overhang = self.hands[name].reach - shell.reachMax;
  return spanned(hand.reach, shell.reachMin, shell.reachMax) + overhang * (1 - bite);
}

test("the_third_executor_refuses_to_run_without_a_director", () => {
  assert.throws(() => golemStyled(SEED), /director/,
    "an executor with no tactics of its own ran anyway");
  assert.throws(() => golemStyled(SEED, GOLEM_TACTICS_V3, null), /director/);
  assert.ok(golemStyled(SEED, GOLEM_TACTICS_V3, () => "hold"), "a director was refused");
});

test("a_circle_goes_toward_the_side_their_weapon_is_not_on_and_flips_with_it", async (t) => {
  const golem = await standAGolem(t);
  const run = (armSecond) => {
    const fixture = fixtureOf(golem.view);
    const mind = golemStyled(SEED, GOLEM_TACTICS_V3, () => "circle");
    atGap(fixture, 1.5);
    // `watch` picks the faster hand that is not a shield, so which hand is the threat is a speed
    // and not a name. Both are given a weapon so that the pick is the speed's answer alone.
    for (const name of ["primary", "secondary"]) fixture.opponent.hands[name].weapon = "sword";
    fixture.opponent.hands.primary.tipSpeed = armSecond ? 1 : 4;
    fixture.opponent.hands.secondary.tipSpeed = armSecond ? 4 : 1;
    const strafes = [];
    drive(fixture, mind, 0.5, { each: (intent) => strafes.push(intent.strafe) });
    return strafes;
  };
  const armedRight = run(false);
  const armedLeft = run(true);
  assert.ok(armedRight.every((value) => value === armedRight[0]),
    "a circle wandered while nothing about the other body changed");
  assert.equal(Math.abs(armedRight[0]), GOLEM_TACTICS_V3.circleStrafe,
    `a circle strafed at ${armedRight[0]} and not at circleStrafe`);
  assert.equal(armedLeft[0], -armedRight[0],
    `the circle went ${armedRight[0]} against their right hand and ${armedLeft[0]} against their left,`
    + " and those should be opposite sides");
});

test("a_void_steps_back_and_off_the_line_their_point_is_travelling_on", async (t) => {
  const golem = await standAGolem(t);
  const run = (side) => {
    const fixture = fixtureOf(golem.view);
    const mind = golemStyled(SEED, GOLEM_TACTICS_V3, () => "void");
    atGap(fixture, 1.5);
    const socket = fixture.self.hands.primary.shoulder;
    // Their point 1.2 m in front of my socket and 0.2 m to one side of it, flying straight down
    // the -Z axis at 6 m/s: a line that will pass me by 0.2 m on that side.
    const hand = fixture.opponent.hands.primary;
    hand.tip.x = socket.x + side * 0.2;
    hand.tip.y = socket.y;
    hand.tip.z = socket.z + 1.2;
    fixture.opponent.tip.x = hand.tip.x;
    fixture.opponent.tip.y = hand.tip.y;
    fixture.opponent.tip.z = hand.tip.z;
    theirTipVelocity(fixture, { z: -6 });
    const seen = [];
    flyTip(fixture, mind, 0.1, { each: (intent) => seen.push({ forward: intent.forward, strafe: intent.strafe }) });
    return seen[seen.length - 1];
  };
  const fromMyRight = run(1);
  const fromMyLeft = run(-1);
  assert.ok(fromMyRight.forward < -0.5,
    `a void asked the feet for ${fromMyRight.forward.toFixed(2)} and a void is a step back`);
  // The line passes on my +X side, so away from it is -X, which is a negative strafe; the sign
  // is the whole claim, and it is the one a policy gets wrong in a way that reads as walking in.
  assert.ok(fromMyRight.strafe < -0.8,
    `their point passed 0.2 m to my right and the feet went ${fromMyRight.strafe.toFixed(2)}`);
  assert.ok(fromMyLeft.strafe > 0.8,
    `their point passed 0.2 m to my left and the feet went ${fromMyLeft.strafe.toFixed(2)}`);
});

test("a_parry_sends_the_spare_hand_to_where_their_point_crosses_its_guard_shell", async (t) => {
  const golem = await standAGolem(t);
  /**
   * The guard shell the executor solves against, read off the same published capability it reads.
   * The spare hand of the default build carries a plate, so the cover distance is `shieldReach`.
   */
  const shellOf = (view) => {
    const cap = view.self.capabilities.effectors.secondary;
    return reachAt(GOLEM_TACTICS_V3.shieldReach, view.self.hands.secondary.reach, cap);
  };
  const run = (missFraction) => {
    const fixture = fixtureOf(golem.view);
    const radius = shellOf(fixture);
    const offset = radius * missFraction;
    const mind = golemStyled(SEED, GOLEM_TACTICS_V3, (available) =>
      available.includes("parry") ? "parry" : "hold");
    atGap(fixture, 1.6);
    const spare = fixture.self.hands.secondary.shoulder;
    const hand = fixture.opponent.hands.primary;
    hand.tip.x = spare.x + offset;
    hand.tip.y = spare.y;
    hand.tip.z = spare.z + 1.2;
    fixture.opponent.tip.x = hand.tip.x;
    fixture.opponent.tip.y = hand.tip.y;
    fixture.opponent.tip.z = hand.tip.z;
    theirTipVelocity(fixture, { z: -6 });
    let last = null;
    let sawParry = false;
    flyTip(fixture, mind, 0.05, {
      each: (intent) => {
        last = { reach: intent.secondary.reach, guard: intent.secondary.guard, pointerX: intent.secondary.pointerX, pointerY: intent.secondary.pointerY };
        sawParry = sawParry || mind.parrying;
      },
    });
    return { radius, offset, last, sawParry, mind, fixture };
  };

  const met = run(0.5);
  assert.ok(met.sawParry, "a parry was named and the executor never held one");
  assert.ok(met.mind.reading.intercept !== null, "their point crossed the shell and no intercept was found");
  assert.ok(met.mind.reading.intercept.t > 0 && met.mind.reading.intercept.t < 0.35,
    `the intercept is ${met.mind.reading.intercept.t.toFixed(3)} s ahead of a point 1.2 m out at 6 m/s`);
  // The point being met is on the shell, so what the hand was asked to reach for is the radius,
  // and `parryMargin` is the tolerance the plan names for it.
  const asked = commandedDistance(met.last, met.fixture.self, "secondary", GOLEM_TACTICS_V3.parryBite);
  assert.ok(Math.abs(asked - met.radius) < GOLEM_TACTICS_V3.parryMargin,
    `the spare hand was sent ${asked.toFixed(3)} m out to meet a shell of ${met.radius.toFixed(3)} m`);
  assert.equal(met.last.guard, true, "a parrying hand is not covering");
  assertInsideEnvelope(
    { ...blankIntent(), secondary: { ...blankIntent().secondary, ...met.last } },
    met.fixture.self, "parry");

  // A line that misses the shell by half a metre is not a parry, and the guard is not moved for it.
  const missed = run(1 + 0.5 / shellOf(fixtureOf(golem.view)));
  assert.equal(missed.mind.reading.intercept, null,
    "a point that passes half a metre outside the shell was offered as an intercept");
  assert.equal(missed.sawParry, false, "the executor parried a line that misses");
  assert.ok(!missed.mind.available.includes("parry"), "parry was on offer with no intercept to make");
});

test("a_cut_opens_a_hand_further_out_than_a_strike_and_walks_the_feet_in_behind_it", async (t) => {
  const golem = await standAGolem(t);
  const fixture = fixtureOf(golem.view);
  // A director that only ever holds, so the sweep below reads what was *offered* rather than what
  // an exchange it started did to the offer on the next step.
  const mind = golemStyled(SEED, GOLEM_TACTICS_V3, () => "hold");
  // The cooldown starts at a seeded offset of up to 1.1 s and counts down only while the mind is
  // being asked, so the sweep is warmed up out of range first: without it the whole sweep runs
  // with the hand still on its cooldown and every range answer is "nothing is open".
  atGap(fixture, 3.0);
  drive(fixture, mind, 1.5);
  // The furthest gap each of the two opens at, found by walking the body out a centimetre at a
  // time. The claim is a distance and not a flag, because `cutReachMetres` is the number the
  // step-in is supposed to buy and a cut that opened at the strike range would still pass a flag.
  let strikeAt = 0;
  let cutAt = 0;
  for (let gap = 1.0; gap < 2.6; gap += 0.01) {
    atGap(fixture, gap);
    fixture.clock += FIXED;
    mind.decide(fixture, FIXED);
    if (mind.available.includes("strike")) strikeAt = gap;
    if (mind.available.includes("cut")) cutAt = gap;
  }
  assert.ok(strikeAt > 0 && cutAt > 0, `neither opened over the sweep: strike ${strikeAt}, cut ${cutAt}`);
  assert.ok(cutAt - strikeAt > GOLEM_TACTICS_V3.cutReachMetres - 0.03
    && cutAt - strikeAt < GOLEM_TACTICS_V3.cutReachMetres + 0.03,
    `a cut opened ${(cutAt - strikeAt).toFixed(3)} m further out than a strike,`
    + ` and cutReachMetres is ${GOLEM_TACTICS_V3.cutReachMetres}`);

  // And it walks. Everything below is one committed cut, driven from the range it opens at.
  const fresh = fixtureOf(golem.view);
  const cutter = golemStyled(SEED, GOLEM_TACTICS_V3, (available) =>
    available.includes("cut") ? "cut" : "hold");
  atGap(fresh, cutAt - 0.02);
  const chamber = [];
  const commit = [];
  const swings = [];
  drive(fresh, cutter, 1.2, {
    each: (intent) => {
      if (cutter.stance === "chamber") chamber.push({ forward: intent.forward, lean: intent.posture.trunkLean });
      if (cutter.stance === "commit") {
        commit.push({ forward: intent.forward, lean: intent.posture.trunkLean });
        swings.push(intent.primary.pointerX);
      }
    },
  });
  assert.ok(chamber.length > 0 && commit.length > 0, "the cut never ran");
  for (const [name, steps] of [["chamber", chamber], ["commit", commit]]) {
    assert.ok(steps.every((step) => step.forward > 0.99),
      `the feet were not asked to close through the ${name} of a cut`);
    assert.ok(steps.every((step) => Math.abs(step.lean - GOLEM_TACTICS_V3.cutLean) < 1e-9),
      `the trunk leaned ${steps[0].lean} through the ${name} and cutLean is ${GOLEM_TACTICS_V3.cutLean}`);
  }

  // The arc sweeps *through* the mark rather than starting at it: the commanded azimuth crosses
  // the aim's own bearing somewhere near the middle of the stroke. Session 02's whole finding was
  // that the shipped stroke crossed 7 ms into a 150 ms arc, so the fraction is the reading.
  const shape = COMMITTED_SHAPES.sword;
  const zeroAt = shape.chamberSwing / (shape.chamberSwing + shape.followSwing);
  assert.ok(zeroAt > 0.35 && zeroAt < 0.75,
    `the committed arc crosses its own mark ${(zeroAt * 100).toFixed(0)} % of the way through`);
  const crossed = swings.findIndex((value, index) => index > 0 && Math.sign(value - swings[0]) !== 0
    && Math.abs(value - swings[0]) > 0.5 * Math.abs(swings[swings.length - 1] - swings[0]));
  assert.ok(crossed > 0 && crossed < swings.length,
    "the commanded azimuth never got half way from where it started to where it ended");
  assert.ok(swings[0] > swings[swings.length - 1],
    `the arc ran from ${swings[0].toFixed(3)} to ${swings[swings.length - 1].toFixed(3)},`
    + " and a cut sweeps inboard");
});

test("a_shove_puts_both_hands_through_their_trunk_and_then_recovers", async (t) => {
  const golem = await standAGolem(t);
  const shoved = (setup) => async () => {
    const body = setup === null ? golem : await standAGolem(t, setup);
    const fixture = fixtureOf(body.view);
    const mind = golemStyled(SEED, GOLEM_TACTICS_V3, (available) =>
      available.includes("shove") ? "shove" : "hold");
    atGap(fixture, 3.0);
    drive(fixture, mind, 1.5);
    const reach = fixture.self.hands.primary.reach;
    atGap(fixture, mind.reading.near + 0.10 * reach);
    const during = [];
    let recoveredAt = -1;
    drive(fixture, mind, 1.0, {
      each: (intent, step) => {
        if (mind.stance === "shove") {
          during.push({
            forward: intent.forward, lean: intent.posture.trunkLean,
            primary: { ...intent.primary }, secondary: { ...intent.secondary },
          });
        } else if (during.length > 0 && recoveredAt < 0) recoveredAt = step * FIXED;
      },
    });
    return { during, recoveredAt, fixture };
  };

  const { during, recoveredAt } = await shoved(null)();
  assert.ok(during.length > 0, "a shove was named and never ran");
  assert.ok(during.every((step) => step.forward > 0.99), "a shove did not walk in");
  assert.ok(during.every((step) => Math.abs(step.lean - GOLEM_TACTICS_V3.shoveLean) < 1e-9),
    `the trunk leaned ${during[0].lean} and shoveLean is ${GOLEM_TACTICS_V3.shoveLean}`);
  for (const name of ["primary", "secondary"]) {
    assert.ok(during.every((step) => step[name].reach === 1),
      `the ${name} hand was not put all the way out through a shove`);
    assert.ok(during.every((step) => step[name].thrust === true),
      `the ${name} hand was not asked for a stroke through a shove`);
  }
  const seconds = during.length * FIXED;
  assert.ok(Math.abs(seconds - GOLEM_TACTICS_V3.shoveSeconds) < 0.02,
    `the shove ran ${seconds.toFixed(3)} s against shoveSeconds ${GOLEM_TACTICS_V3.shoveSeconds}`);
  assert.ok(recoveredAt > 0, "the shove never ended");

  // A paired grip has one command and two channels, and the executor must not be writing a
  // second-hand shove into a hand that is holding the same haft.
  const paired = await shoved(setupWith({ primary: MAUL, secondary: MAUL }))();
  assert.equal(paired.fixture.self.capabilities.pairedHands, true);
  assert.ok(paired.during.length > 0, "a paired body never shoved");
  for (const step of paired.during) {
    for (const axis of ["pointerX", "pointerY", "reach", "roll", "wristBend", "thrust", "guard"]) {
      assert.equal(step.primary[axis], step.secondary[axis],
        `a paired grip was given two different ${axis} commands during a shove`);
    }
  }
});

test("a_thrust_runs_the_point_out_along_the_reach_axis_at_their_vital_height", async (t) => {
  const golem = await standAGolem(t);
  const fixture = fixtureOf(golem.view);
  const mind = golemStyled(SEED, GOLEM_TACTICS_V3, (available) =>
    available.includes("thrust") ? "thrust" : "hold");
  atGap(fixture, 3.0);
  drive(fixture, mind, 1.5);
  atGap(fixture, mind.reading.strike - 0.05);
  const chamber = [];
  const commit = [];
  drive(fixture, mind, 0.8, {
    each: (intent) => {
      if (mind.stance === "chamber") chamber.push({ ...intent.primary });
      if (mind.stance === "commit") commit.push({ ...intent.primary });
    },
  });
  assert.ok(chamber.length > 0 && commit.length > 0, "the thrust never ran");
  assert.ok(chamber.every((step) => Math.abs(step.reach - GOLEM_TACTICS_V3.thrustShapes.sword.chamberReach) < 1e-9),
    `the chamber held the reach at ${chamber[0].reach} and the thrust draws to`
    + ` ${GOLEM_TACTICS_V3.thrustShapes.sword.chamberReach}`);
  assert.ok(commit[commit.length - 1].reach > commit[0].reach + 1.0,
    `the commit ran the reach from ${commit[0].reach.toFixed(3)} to`
    + ` ${commit[commit.length - 1].reach.toFixed(3)}, which is not running a point out`);
  assert.ok(commit.every((step, index) => index === 0 || step.reach >= commit[index - 1].reach - 1e-9),
    "the reach axis went backwards inside a thrust");

  // The mark is their vital height and not the shoulder the trunk slot uses, and the point goes
  // there rather than sweeping across it: what is recovered from the cursor is the aim itself,
  // inside the twentieth of a radian the shape's offsets allow.
  const self = fixture.self;
  const cap = self.capabilities.effectors.primary;
  const shell = cap.reachable;
  const heading = self.facing + self.trunkTwist * self.capabilities.trunkTwistMax;
  const socket = self.hands.primary.shoulder;
  const outboard = self.hands.primary.outboard;
  const them = fixture.opponent;
  const at = { swing: 0, lift: 0, horizontal: 0 };
  const vital = aimAt(socket, { x: them.ground.x, y: them.vitalHeight, z: them.ground.z }, heading, outboard, { ...at });
  const vitalLift = vital.lift;
  const vitalSwing = vital.swing;
  const trunk = aimAt(socket, { x: them.ground.x, y: them.shoulder.y, z: them.ground.z }, heading, outboard, { ...at });
  assert.ok(Math.abs(vitalLift - trunk.lift) > 0.10,
    "the two marks are at the same height, so this test could not tell them apart");
  const last = commit[commit.length - 1];
  const lift = spanned(last.pointerY, shell.liftMin, shell.liftMax);
  const swing = spanned(last.pointerX * outboard, shell.swingMin, shell.swingMax);
  assert.ok(Math.abs(lift - vitalLift) < 0.08,
    `the point was sent to a lift of ${lift.toFixed(3)}; their vital height is ${vitalLift.toFixed(3)}`
    + ` and their shoulder ${trunk.lift.toFixed(3)}`);
  assert.ok(Math.abs(swing - vitalSwing) < 0.08,
    `the point was swept ${(swing - vitalSwing).toFixed(3)} rad off the mark, and a thrust does not sweep`);
});

test("a_thrust_is_not_offered_to_a_terminal_with_no_point", async (t) => {
  const whip = await standAGolem(t, setupWith({ primary: { chain: "wrist", terminal: "whip" } }));
  const fixture = fixtureOf(whip.view);
  const mind = golemStyled(SEED, GOLEM_TACTICS_V3, () => "hold");
  atGap(fixture, 3.0);
  drive(fixture, mind, 1.5);
  const offered = new Set();
  for (let gap = 0.6; gap < 2.4; gap += 0.02) {
    atGap(fixture, gap);
    fixture.clock += FIXED;
    mind.decide(fixture, FIXED);
    for (const name of mind.available) offered.add(name);
  }
  assert.equal(fixture.self.hands.primary.weapon, "whip");
  assert.ok(offered.has("strike"), "a whip was never offered a stroke at all, so this proves nothing");
  assert.ok(offered.has("cut"), "a whip was never offered a cut");
  assert.ok(!offered.has("thrust"), "a whip, which has no point, was offered a thrust");
});

/**
 * Their arm drawn and closing on me from above, which is the one reading a duck is for.
 *
 * The recipe is the fencer's own commit drive with their shoulder raised a third of a metre, so
 * that their point sits above my socket while the reader is calling it a commit; both conditions
 * have to hold at once and a test that arranged only the phase would pass on a low thrust.
 */
function driveTheirCommit(fixture, mind, { each = null } = {}) {
  const socket = fixture.self.hands.primary.shoulder;
  const high = { shoulderY: socket.y + 0.35 };
  atGap(fixture, 4.5, high);
  theirArm(fixture, { extension: 0.88, toward: false });
  drive(fixture, mind, 2.5);
  atGap(fixture, 1.75, high);
  fixture.opponent.reach = 1.78;
  theirArm(fixture, { extension: 0.62 });
  drive(fixture, mind, 0.25, { closing: 1.5, each });
}

test("a_duck_is_offered_under_a_committed_point_and_writes_the_crouch_itself", async (t) => {
  const golem = await standAGolem(t);
  const seen = [];
  const watcher = golemStyled(SEED, GOLEM_TACTICS_V3, () => "hold");
  const fixture = fixtureOf(golem.view);
  driveTheirCommit(fixture, watcher, {
    each: () => seen.push({ theirs: watcher.reading.theirs, duck: watcher.available.includes("duck") }),
  });
  const committing = seen.filter((step) => step.theirs === "commit");
  const idling = seen.filter((step) => step.theirs === "idle");
  assert.ok(committing.length > 0, "their drawn, closing arm was never read as a commit");
  assert.ok(committing.every((step) => step.duck), "a duck was not offered under a committed point");
  assert.ok(idling.every((step) => !step.duck), "a duck was offered against an arm doing nothing");

  const ducker = golemStyled(SEED, GOLEM_TACTICS_V3, (available) =>
    available.includes("duck") ? "duck" : "hold");
  const fresh = fixtureOf(golem.view);
  const crouches = [];
  driveTheirCommit(fresh, ducker, {
    each: (intent) => crouches.push({ stance: ducker.stance, crouch: intent.posture.crouch,
      forward: intent.forward, strafe: intent.strafe }),
  });
  const ducking = crouches.filter((step) => step.stance === "duck");
  assert.ok(ducking.length > 0, "a duck was named and never ran");
  assert.ok(ducking.every((step) => step.crouch === GOLEM_TACTICS_V3.duckDepth),
    `a duck crouched to ${ducking[0].crouch} and duckDepth is ${GOLEM_TACTICS_V3.duckDepth}`);
  assert.ok(ducking.every((step) => step.forward === 0 && step.strafe === 0),
    "a duck walked, and a duck is the void of a body that stays where it is");
  // Long enough to be the constant and short enough to end: the drive above is 0.25 s and
  // `duckSeconds` is 0.35, so what is asserted is that it was still ducking at the end of it.
  assert.ok(ducking.length * FIXED > 0.10, `the duck ran ${(ducking.length * FIXED).toFixed(3)} s`);
  assert.equal(ducker.stance, "duck");

  // The head-first body's only void that is not a step: it has no hands to parry with and no
  // reason to be offered a cut, and the duck is on the list for it all the same.
  const capped = await standAGolem(t, setupWith({ head: "head.ram",
    primary: { chain: "none", terminal: "none" }, secondary: { chain: "none", terminal: "none" } }));
  const headFirst = golemStyled(SEED, GOLEM_TACTICS_V3, () => "hold");
  const cappedFixture = fixtureOf(capped.view);
  const offered = new Set();
  driveTheirCommit(cappedFixture, headFirst, {
    each: () => { for (const name of headFirst.available) offered.add(name); },
  });
  assert.equal(headFirst.reading.headfirst, true, "a capped golem did not read as head-first");
  assert.ok(offered.has("duck"), "a body with no hands was not offered the one void it has");
  for (const name of ["cut", "strike", "thrust", "parry", "shove"]) {
    assert.ok(!offered.has(name), `a body with no hands was offered ${name}`);
  }
});

test("the_director_is_asked_the_step_their_phase_turns_and_not_a_cadence_later", async (t) => {
  const golem = await standAGolem(t);
  const run = (eventAsks) => {
    const fixture = fixtureOf(golem.view);
    let asked = false;
    const asks = [];
    const phases = [];
    const mind = golemStyled(SEED, styledWith({ eventAsks }), () => { asked = true; return "hold"; });
    const socket = fixture.self.hands.primary.shoulder;
    const high = { shoulderY: socket.y + 0.35 };
    atGap(fixture, 4.5, high);
    theirArm(fixture, { extension: 0.88, toward: false });
    drive(fixture, mind, 2.5);
    atGap(fixture, 1.75, high);
    fixture.opponent.reach = 1.78;
    theirArm(fixture, { extension: 0.62 });
    asked = false;
    drive(fixture, mind, 0.25, {
      closing: 1.5,
      each: (intent, step) => {
        if (asked) asks.push(step);
        asked = false;
        phases.push(mind.reading.theirs);
      },
    });
    const turned = phases.findIndex((phase, step) => step > 0 && phase !== phases[step - 1]);
    return { asks, phases, turned };
  };

  const on = run(true);
  assert.ok(on.turned > 0, "their phase never changed over the drive, so this proves nothing");
  assert.ok(on.asks.includes(on.turned),
    `their phase turned to ${on.phases[on.turned]} at step ${on.turned} and the asks were at`
    + ` ${on.asks.join(",")}`);

  const off = run(false);
  assert.deepEqual(off.phases, on.phases, "the two runs did not read the same arm");
  assert.ok(off.asks.length < on.asks.length,
    `${off.asks.length} asks with the events off against ${on.asks.length} with them on`);
  assert.ok(!off.asks.includes(off.turned),
    "with event asks off the director was still asked on the step the phase turned");
});

test("a_chamber_is_taken_back_on_their_commit_only_when_chamberAbort_is_on", async (t) => {
  const golem = await standAGolem(t);
  const run = (chamberAbort) => {
    const fixture = fixtureOf(golem.view);
    // Names the cut when one is open, and leaves when the abort ask offers three things and no
    // hold. Two answers, so what the switch decides is whether the second one is ever asked for.
    const mind = golemStyled(SEED, styledWith({ chamberAbort }), (available) =>
      !available.includes("hold") ? "retreat"
        : available.includes("cut") ? "cut" : "hold");
    const socket = fixture.self.hands.primary.shoulder;
    const high = { shoulderY: socket.y + 0.35 };
    atGap(fixture, 4.5, high);
    theirArm(fixture, { extension: 0.88, toward: false });
    drive(fixture, mind, 2.5);
    // In range with their arm still on guard: the cut is named and the chamber starts. Stepped
    // until it does rather than for a fixed span, because the ask is on a 0.167 s cadence and a
    // fixed wait either misses the chamber or spends it.
    atGap(fixture, 1.75, high);
    fixture.opponent.reach = 1.78;
    let waited = 0;
    while (mind.stance !== "chamber" && waited < 0.4) {
      drive(fixture, mind, FIXED);
      waited += FIXED;
    }
    const chambered = mind.stance === "chamber";
    // And now their arm draws and closes, so the reader turns to commit inside my own chamber.
    theirArm(fixture, { extension: 0.62 });
    // The stances in the order they were entered, so the claim is what the chamber went *to* and
    // not merely what was seen: a cut's chamber is 0.32 s and its commit follows it either way.
    const path = [];
    let abortedWith = -1;
    drive(fixture, mind, 0.45, {
      closing: 1.5,
      each: () => {
        if (path.length === 0 || path[path.length - 1] !== mind.stance) path.push(mind.stance);
        // The reading is filled before the ask, so the step that abandons the chamber still
        // publishes the cooldown it had; what the abort cost shows up on the step after it.
        if (mind.stance === "retreat") abortedWith = Math.max(abortedWith, mind.reading.cooldown);
      },
    });
    return { chambered, path, abortedWith, mind };
  };

  const abort = run(true);
  assert.ok(abort.chambered, "the cut was never chambered, so there was nothing to take back");
  assert.deepEqual(abort.path.slice(0, 2), ["chamber", "retreat"],
    `with chamberAbort on the chamber went ${abort.path.join(" -> ")}`);
  assert.ok(Math.abs(abort.abortedWith - GOLEM_TACTICS_V3.cooldown / 2) < 0.02,
    `an abandoned chamber left ${abort.abortedWith.toFixed(3)} s of cooldown and half of`
    + ` ${GOLEM_TACTICS_V3.cooldown} is what it costs`);

  const through = run(false);
  assert.ok(through.chambered, "the control never chambered either");
  assert.deepEqual(through.path.slice(0, 2), ["chamber", "commit"],
    `with chamberAbort off the chamber went ${through.path.join(" -> ")}`);
});

/**
 * The two switches the control row is made of, each doing the one thing it says.
 *
 * `parryOnCommit` off is v2's reflex -- their committed point is stepped away from and never met
 * -- and `quickStrokes` on is v2's shapes, the part of the control the seconds alone cannot reach.
 * Both are read through the same director, so what is asserted is the option the style *names*
 * rather than the stance the executor ends up in: a control row that still parries is not a
 * control, and one that still cuts is not measuring the arc it claims to.
 */
test("the_control_row_switches_take_the_parry_and_the_committed_arc_back_out", async (t) => {
  const golem = await standAGolem(t);
  const named = (over, drive_) => {
    const seen = [];
    const mind = golemForm(SEED, { ...FORM, ...over }, (available, reading, view, option) => seen.push(option));
    drive_(fixtureOf(golem.view), mind);
    return seen;
  };
  // Their point committing from outside my own cut range, so the answer is the threat rule's
  // and not an abort of a stroke I had already started: patience is pushed out of the way and
  // the gap is wider than `strike + cutReachMetres`, which leaves meeting it and leaving it.
  const onACommit = (fixture, mind) => {
    const socket = fixture.self.hands.primary.shoulder;
    const high = { shoulderY: socket.y + 0.35 };
    atGap(fixture, 4.5, high);
    theirArm(fixture, { extension: 0.88, toward: false });
    drive(fixture, mind, 2.5);
    atGap(fixture, 2.10, high);
    fixture.opponent.reach = 2.40;
    theirArm(fixture, { extension: 0.62 });
    drive(fixture, mind, 0.25, { closing: 1.5 });
  };
  const met = named({ patience: 99 }, onACommit);
  const stepped = named({ patience: 99, parryOnCommit: false }, onACommit);
  assert.ok(met.includes("parry"), "the shipped style never met their point, so this proves nothing");
  assert.ok(!stepped.includes("parry"), "the control row parried");
  assert.ok(stepped.includes("void"), "the control row neither met their point nor stepped off it");

  // Patience alone, with their arm doing nothing: the one rule that opens an exchange without
  // being handed a reading, so the stroke it names is the style's own choice of arc.
  const outOfPatience = (fixture, mind) => {
    atGap(fixture, 4.5);
    drive(fixture, mind, 1.5);
    atGap(fixture, 1.35);
    drive(fixture, mind, 4.0);
  };
  const committed = named({ feintFraction: 0 }, outOfPatience);
  const quick = named({ feintFraction: 0, quickStrokes: true }, outOfPatience);
  assert.ok(committed.includes("cut"), "the shipped style never cut in four seconds of patience");
  assert.ok(!committed.includes("strike"), "the shipped style threw the quick stroke");
  assert.ok(quick.includes("strike"), "the control row never threw the quick stroke");
  assert.ok(!quick.includes("cut"), "the control row cut");
});

test("golem_form_stays_inside_the_envelope_and_is_deterministic_under_a_seed", async (t) => {
  for (const [label, setup] of [
    ["the default golem", defaultGolemSetup()],
    ["two blades", setupWith({ secondary: { chain: "wrist", terminal: "blade" } })],
    ["the maul", setupWith({ primary: MAUL, secondary: MAUL })],
    ["fists", setupWith({ primary: { chain: "wrist", terminal: "fist" }, secondary: { chain: "pitch", terminal: "fist" } })],
    ["the ram head", setupWith({ head: "head.ram",
      primary: { chain: "none", terminal: "none" }, secondary: { chain: "none", terminal: "none" } })],
  ]) {
    const golem = await standAGolem(t, setup);
    const fixture = fixtureOf(golem.view);
    sweepPlaces(fixture, golemForm(SEED), label, 0.35);
  }
  const golem = await standAGolem(t);
  const trace = (seed) => {
    const fixture = fixtureOf(golem.view);
    const mind = golemForm(seed);
    const out = [];
    for (const z of [3.5, 1.6, 1.2]) {
      place(fixture, { x: 0.3, z });
      drive(fixture, mind, 2.0, {
        each: (intent) => out.push(`${intent.primary.pointerX.toFixed(6)},${intent.primary.pointerY.toFixed(6)},` +
          `${intent.primary.thrust ? 1 : 0}${intent.forward.toFixed(6)},${intent.strafe.toFixed(6)},${mind.stance}`),
      });
    }
    return out.join("|");
  };
  assert.equal(trace(SEED), trace(SEED), "one seed, one bout");
  assert.notEqual(trace(SEED), trace(SEED + 1), "two seeds, two bouts");
});

/**
 * The thrust is a scoring act and not only a pose, which a synthetic view cannot say.
 *
 * A short bout against an idle golem under a director that closes and thrusts and does nothing
 * else: what is asserted is that the contact model books at least one blow of kind `thrust`, which
 * is the row `scoring.ts` reserves for a point arriving along its own axis. Everything else in
 * this file's thrust test is a claim about the command; this is the claim about the blow.
 */
test("a_thrust_books_a_thrust_in_a_real_bout", async () => {
  const setup = defaultGolemSetup();
  const kinds = new Map();
  const thrusting = golemStyled(SEED, GOLEM_TACTICS_V3, (available) =>
    available.includes("thrust") ? "thrust" : "close");
  runBout({
    left: "golem-form", right: "idle",
    leftUnit: "golem", rightUnit: "golem",
    leftGolem: setup, rightGolem: setup,
    locomotionMode: "supported",
    leftMind: { name: "thrusting", decide: (view, dt) => thrusting.decide(view, dt) },
    seeds: [SEED, SEED + 17],
    maxSeconds: 10,
    physics: await freshHavok(),
    onEvent: (event) => {
      if (event.side !== "left") return;
      const kind = event.report.kind;
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    },
  });
  assert.ok((kinds.get("thrust") ?? 0) > 0,
    `ten seconds of nothing but thrusts booked ${[...kinds].map(([k, n]) => `${n} ${k}`).join(", ") || "nothing"}`);
});

/**
 * The whole thing, on a real body against the mind it has to beat: `golem-form` against
 * `golem-fencer` for fourteen seconds on a fresh Havok.
 *
 * The claim is not a rating -- that is Session 04's tournament and lives in `docs/measurements.md`
 * -- but that the third executor runs a real bout end to end: it lands, it takes damage, and it
 * throws far fewer strokes than the fencer, which is the signature the style was built for.
 */
test("golem_form_fights_the_fencer_for_fourteen_seconds_and_lands", async () => {
  const setup = defaultGolemSetup();
  const blows = { left: 0, right: 0 };
  const bars = { left: 1, right: 1 };
  const result = runBout({
    left: "golem-form", right: "golem-fencer",
    leftUnit: "golem", rightUnit: "golem",
    leftGolem: setup, rightGolem: setup,
    locomotionMode: "supported",
    seeds: [SEED, SEED + 17],
    maxSeconds: 14,
    physics: await freshHavok(),
    onEvent: (event) => { blows[event.side] += 1; },
    onSample: ({ left, right }) => {
      bars.left = left.view.self.vitality;
      bars.right = right.view.self.vitality;
    },
  });
  assert.ok(result.seconds > 13, `the bout ran ${result.seconds.toFixed(1)} s of fourteen`);
  assert.ok(blows.left > 0, "golem-form landed nothing at all in fourteen seconds");
  assert.ok(Math.min(bars.left, bars.right) < 1, "neither golem took a scratch");
});

// ------------------------------------------------------------------ the skirmisher, Session 05
//
// Three claims about the director and one about the body. The director's claims are read off the
// option it names rather than off the stance it ends in, because a style is what it says: the
// executor's job is the same under every style and is tested above.

/** The skirmisher with some rows moved, and a hook that records every option it names. */
function skirmisherSaying(seed, over = {}) {
  const said = [];
  const mind = golemSkirmisher(seed, { ...SKIRMISHER, ...over },
    (available, reading, view, option) => said.push({ clock: view.clock, option, theirs: reading.theirs, gap: reading.gap }));
  return { mind, said };
}

/**
 * Their arm at guard, out past the guard extension and not moving, which is what the reader
 * calls idle. Everything the patience rule is about happens against this.
 */
function theirGuard(fixture) {
  theirArm(fixture, { extension: 0.88 });
}

test("the_skirmisher_does_not_open_on_an_idle_opponent_before_its_patience", async (t) => {
  const golem = await standAGolem(t);
  const { mind, said } = skirmisherSaying(SEED);
  const fixture = fixtureOf(golem.view);
  atGap(fixture, 1.35);
  theirGuard(fixture);
  let firstExchange = -1;
  drive(fixture, mind, 4.0, {
    each: (intent, step) => {
      const inExchange = mind.stance === "chamber" || mind.stance === "commit" || mind.stance === "feint";
      if (firstExchange < 0 && inExchange) firstExchange = step * FIXED;
    },
  });
  // `patience` is drawn once per exchange as `T.patience * (0.8 + random() * 0.4)`, so the floor
  // of the bracket is what a test may assert on; the ceiling is 3.0 and the drive is 4.0.
  assert.ok(firstExchange >= SKIRMISHER.patience * 0.8,
    `the skirmisher opened at ${firstExchange.toFixed(2)} s against an arm that was doing nothing`);
  assert.ok(firstExchange > 0, "the skirmisher never opened at all in four seconds, so this proves nothing");
  const before = said.filter((ask) => ask.clock < SKIRMISHER.patience * 0.8).map((ask) => ask.option);
  assert.ok(before.length > 0, "the director was never asked before its patience ran out");
  for (const option of new Set(before)) {
    assert.ok(option === "hold" || option === "circle",
      `before its patience the skirmisher named ${option}, and against an idle arm it circles or stands`);
  }
});

test("the_skirmisher_cuts_into_a_read_recover_at_the_first_ask_after_it", async (t) => {
  const golem = await standAGolem(t);
  const { mind, said } = skirmisherSaying(SEED, { patience: 99, feintFraction: 0 });
  const fixture = fixtureOf(golem.view);
  // Out of range first, so the seeded initial cooldown is spent before anything is asked of a
  // hand; patience is pushed out of the way so that the only thing that can open is the recover.
  atGap(fixture, 4.5);
  theirArm(fixture, { extension: 0.88, toward: false });
  drive(fixture, mind, 2.5);
  atGap(fixture, 1.75);
  fixture.opponent.reach = 1.78;
  theirArm(fixture, { extension: 0.62 });
  drive(fixture, mind, 0.25, { closing: 1.5 });
  const committed = said.filter((ask) => ask.theirs === "commit");
  assert.ok(committed.length > 0, "their drawn, closing arm was never read as a commit");
  assert.ok(committed.every((ask) => ask.option === "void"),
    `the skirmisher answered their commit with ${committed.map((a) => a.option).join(", ")}, and it has no parry`);

  const beforeRecover = said.length;
  theirArm(fixture, { extension: 0.88 });
  drive(fixture, mind, 0.30);
  const after = said.slice(beforeRecover);
  const recovering = after.filter((ask) => ask.theirs === "recover");
  assert.ok(recovering.length > 0, "the arm going back out was never read as a recover");
  assert.equal(recovering[0].option, "cut",
    `the first ask of their recover was answered with ${recovering[0].option}`);
});

test("an_exchange_owes_a_retreat_and_only_the_range_pays_it_off", async (t) => {
  const golem = await standAGolem(t);
  const { mind, said } = skirmisherSaying(SEED, { feintFraction: 0 });
  const fixture = fixtureOf(golem.view);
  atGap(fixture, 1.35);
  theirGuard(fixture);
  // Let patience open one exchange and let it run to its end.
  drive(fixture, mind, 4.0);
  const opened = said.findIndex((ask) => ask.option === "cut");
  assert.ok(opened >= 0, "the skirmisher never opened an exchange, so nothing is owed");
  const after = said.slice(opened + 1);
  assert.ok(after.length > 0, "the exchange never ended inside the drive");
  assert.equal(after[0].option, "retreat", `the ask after the exchange was answered with ${after[0].option}`);
  // Still closed, so still owed: every ask until the gap opens is the same answer.
  assert.ok(after.length >= 3, `only ${after.length} asks landed after the exchange`);
  for (const ask of after.slice(0, 3)) {
    assert.equal(ask.option, "retreat", `at a gap of ${ask.gap.toFixed(2)} the skirmisher named ${ask.option}`);
  }

  // Open the range by hand and the debt clears: the next answer is not a retreat.
  const mark = said.length;
  atGap(fixture, 3.2);
  drive(fixture, mind, 0.6);
  const opened2 = said.slice(mark);
  assert.ok(opened2.length > 0, "no ask landed once the gap was opened");
  assert.ok(opened2.every((ask) => ask.option !== "retreat"),
    "the skirmisher went on retreating from outside their reach");
});

test("golem_skirmisher_stays_inside_the_envelope_and_is_deterministic_under_a_seed", async (t) => {
  for (const [label, setup] of [
    ["the default golem", defaultGolemSetup()],
    ["two blades", setupWith({ secondary: { chain: "wrist", terminal: "blade" } })],
    ["the maul", setupWith({ primary: MAUL, secondary: MAUL })],
    ["fists", setupWith({ primary: { chain: "wrist", terminal: "fist" }, secondary: { chain: "pitch", terminal: "fist" } })],
    ["the ram head", setupWith({ head: "head.ram",
      primary: { chain: "none", terminal: "none" }, secondary: { chain: "none", terminal: "none" } })],
  ]) {
    const golem = await standAGolem(t, setup);
    const fixture = fixtureOf(golem.view);
    sweepPlaces(fixture, golemSkirmisher(SEED), label, 0.35);
  }
  const golem = await standAGolem(t);
  const trace = (seed) => {
    const fixture = fixtureOf(golem.view);
    const mind = golemSkirmisher(seed);
    const out = [];
    // Four seconds a place rather than the form's two: this style's only seeded numbers are the
    // patience jitter and the feint roll, and both of them are inside `openWith`, so a trace that
    // never opens an exchange is the same trace under every seed. That is a property of the style
    // and not a defect, and the test says so by driving long enough to open one.
    for (const z of [3.5, 1.6, 1.2]) {
      place(fixture, { x: 0.3, z });
      drive(fixture, mind, 4.0, {
        each: (intent) => out.push(`${intent.primary.pointerX.toFixed(6)},${intent.primary.pointerY.toFixed(6)},` +
          `${intent.primary.thrust ? 1 : 0}${intent.forward.toFixed(6)},${intent.strafe.toFixed(6)},${mind.stance}`),
      });
    }
    return out.join("|");
  };
  assert.equal(trace(SEED), trace(SEED), "one seed, one bout");
  assert.notEqual(trace(SEED), trace(SEED + 1), "two seeds, two bouts");
});

/**
 * The whole thing on a real body: `golem-skirmisher` against `golem-fencer` for fourteen seconds.
 *
 * The claim is the style's shape rather than its rating -- the rating is the tournament's and
 * lives in `docs/measurements.md`. What is asserted is that the bout runs end to end, that the
 * skirmisher lands, and that it asks its feet to go **backwards** more often than the fencer does.
 *
 * The measure is the commanded step and not the gap, and the first draft of this test got that
 * wrong in a way worth recording: on a mirrored build the socket-to-socket gap is one number
 * shared by both sides and every geometric column derived from it is symmetric, so "the skirmisher
 * stayed further out than the fencer" is not a sentence that can be false. Worse, the version that
 * compared the mean gap against a fencer-versus-fencer control *failed*: 1.808 m against 1.853,
 * because a committed cut walks its feet in through the wind-up, so a style that comes in for one
 * cut and leaves brings the pair closer than two styles that stand at their own points. That is a
 * finding about the executor rather than a broken test, and the tournament in Session 05's entry
 * is where it is measured properly.
 */
test("golem_skirmisher_fights_the_fencer_and_asks_its_feet_backwards_more_often", async () => {
  const setup = defaultGolemSetup();
  const back = { left: 0, right: 0 };
  const blows = { left: 0, right: 0 };
  const counting = (name, inner, side) => ({
    name,
    decide: (view, dt) => {
      const intent = inner.decide(view, dt);
      if (intent.forward < 0) back[side] += 1;
      return intent;
    },
  });
  const result = runBout({
    left: "golem-skirmisher", right: "golem-fencer",
    leftUnit: "golem", rightUnit: "golem",
    leftGolem: setup, rightGolem: setup,
    locomotionMode: "supported",
    seeds: [SEED, SEED + 17],
    maxSeconds: 14,
    physics: await freshHavok(),
    leftMind: counting("golem-skirmisher", golemSkirmisher(SEED), "left"),
    rightMind: counting("golem-fencer", golemFencer(SEED + 17), "right"),
    onEvent: (event) => { blows[event.side] += 1; },
  });
  assert.ok(result.seconds > 13, `the bout ran ${result.seconds.toFixed(1)} s of fourteen`);
  assert.ok(blows.left > 0, "golem-skirmisher landed nothing at all in fourteen seconds");
  assert.ok(back.left > back.right,
    `the skirmisher asked for a step back on ${back.left} steps and the fencer on ${back.right}`);
});

/** The guardian, with a hook that writes down every ask: `skirmisherSaying` for the third style. */
function guardianSaying(seed, over = {}) {
  const said = [];
  const mind = golemGuardian(seed, { ...GUARDIAN, ...over },
    (available, reading, view, option) => said.push({
      clock: view.clock, option, theirs: reading.theirs, gap: reading.gap,
      offered: [...available], intercept: reading.intercept,
    }));
  return { mind, said };
}

/**
 * Their arm drawing in, which is the profile `the_stroke_reader...` pins as a chamber: the
 * extension falls at about one reach a second and nothing else about the body moves, because a
 * chamber is the arm and not the feet. Their point never closes here, which is the whole reason
 * this is the hard case -- there is no intercept to solve against an arm going backwards.
 */
function theirChamber(fixture, mind, seconds, { from = 0.88, to = 0.60, hold = 0.30, lift = null, each = null } = {}) {
  const drawSteps = Math.round(seconds * CONFIG.world.physicsHz);
  // The draw, then the arm held drawn. The draw itself takes 0.28 s and a director is asked six
  // times a second, so a helper that stopped at the bottom of the draw would be asking whether an
  // ask happened to land in a window of that size rather than what the answer was. A held draw
  // stays a chamber -- `drawing || (phase === "chamber" && extension < readGuardExtension)` -- so
  // the hold is the same phase, given long enough to be asked about.
  const total = drawSteps + Math.round(hold * CONFIG.world.physicsHz);
  const tip = fixture.opponent.hands.primary.tip;
  for (let step = 0; step < total; step += 1) {
    const was = { x: tip.x, y: tip.y, z: tip.z };
    const t = Math.min(1, (step + 1) / drawSteps);
    theirArm(fixture, { extension: from + (to - from) * t });
    // Every step, and before `decide`, because `theirArm` writes the tip back to the line between
    // the two shoulders each time: a height set after the decision is a height the mind never saw.
    if (lift !== null) {
      tip.y = fixture.self.hands.primary.shoulder.y + lift;
      fixture.opponent.tip.y = tip.y;
    }
    // The velocity the fixture publishes has to be the velocity the tip actually has, or the
    // executor solves against one arm and reads another. Moving a tip by hand and leaving
    // `tipVelocity` where it was is how the first draft of this helper offered a *solved*
    // intercept against an arm going backwards, which made the control in the test below pass
    // for a reason that had nothing to do with the control.
    theirTipVelocity(fixture, {
      x: (tip.x - was.x) / FIXED, y: (tip.y - was.y) / FIXED, z: (tip.z - was.z) / FIXED,
    });
    fixture.clock += FIXED;
    const intent = mind.decide(fixture, FIXED);
    if (each) each(intent, step);
  }
  theirTipVelocity(fixture, { x: 0, y: 0, z: 0 });
}

/**
 * Out of range with their guard out, long enough that the seeded opening cooldown is spent, then
 * closed to `gap` with the guard still out.
 *
 * The default gap is deliberately outside the shove band. `shove` is offered at every ask while
 * the gap is inside `near + 0.15 * reach`, and the guardian takes it every time, so a test that
 * warmed up at 1.6 m spent its whole window in a shove and its recover and was never asked
 * anything -- which is how the first draft of the chamber test failed while the rule it was
 * testing worked.
 */
function warmUp(fixture, mind, gap = 2.4) {
  atGap(fixture, 4.5);
  theirArm(fixture, { extension: 0.88, toward: false });
  drive(fixture, mind, 2.5);
  atGap(fixture, gap);
  theirArm(fixture, { extension: 0.88 });
  drive(fixture, mind, 0.10);
}

/**
 * The first rule, and the one that needed the executor's `wallOnChamber` row to be sayable.
 *
 * An arm drawing back has no closing point in it, so `solveIntercept` -- which refuses anything
 * that is not closing -- returns nothing and no parry is offered at all. The form is the control:
 * same executor, same body, same scripted chamber, and it is never even given the option.
 */
test("the_guardian_meets_a_chamber_and_the_form_is_not_offered_the_chance", async (t) => {
  const golem = await standAGolem(t);
  const run = (make) => {
    const said = [];
    const mind = make((available, reading, view, option) =>
      said.push({ option, theirs: reading.theirs, offered: [...available] }));
    const fixture = fixtureOf(golem.view);
    warmUp(fixture, mind);
    theirChamber(fixture, mind, 0.28);
    return said.filter((ask) => ask.theirs === "chamber");
  };
  const guarding = run((hook) => golemGuardian(SEED, { ...GUARDIAN, patience: 99 }, hook));
  const forming = run((hook) => golemForm(SEED, { ...FORM, patience: 99 }, hook));

  assert.ok(guarding.length > 0, "the arm drawing in was never read as a chamber, so this proves nothing");
  assert.ok(guarding.every((ask) => ask.offered.includes("parry")),
    "the guardian was not offered a parry against a chamber, so `wallOnChamber` is not doing its job");
  assert.ok(guarding.every((ask) => ask.option === "parry"),
    `the guardian answered a chamber with ${[...new Set(guarding.map((a) => a.option))].join(", ")}`);

  assert.ok(forming.length > 0, "the control never read a chamber either");
  assert.ok(forming.every((ask) => !ask.offered.includes("parry")),
    "a parry was on offer against a chamber with `wallOnChamber` off");
});

/**
 * What the wall is, geometrically, and what it stops being.
 *
 * On the chamber it is a bearing: the point on my guard shell that lies toward their drawn tip,
 * `t` zero because the answer is "now", `wall` true because nothing was solved. The moment their
 * point turns round and closes, the same recompute finds a real crossing and the flag goes off --
 * which is the sentence "pre-positioned from the chamber read and refined through the commit"
 * written as an assertion.
 */
test("the_wall_is_a_bearing_on_the_chamber_and_a_solved_crossing_on_the_commit", async (t) => {
  const golem = await standAGolem(t);
  const shell = (view) => reachAt(
    GOLEM_TACTICS_V3.shieldReach, view.self.hands.secondary.reach, view.self.capabilities.effectors.secondary);
  const { mind, said } = guardianSaying(SEED, { patience: 99 });
  const fixture = fixtureOf(golem.view);
  warmUp(fixture, mind);
  const radius = shell(fixture);
  let last = null;
  theirChamber(fixture, mind, 0.28, { each: (intent) => { last = intent.secondary; } });

  const walls = said.filter((ask) => ask.theirs === "chamber" && ask.intercept !== null);
  assert.ok(walls.length > 0, "no intercept of any kind was found during the chamber");
  assert.ok(walls.every((ask) => ask.intercept.wall === true),
    "something was solved against an arm that is drawing backwards");
  assert.ok(walls.every((ask) => ask.intercept.t === 0),
    "a wall was reported as being some number of seconds ahead");
  assert.ok(walls.every((ask) => Math.abs(ask.intercept.distance - radius) < 1e-9),
    "a wall was placed somewhere other than on the guard shell");

  // And the hand was actually sent there: the reach command asks for the shell's radius.
  const asked = commandedDistance(last, fixture.self, "secondary", GUARDIAN.parryBite);
  assert.ok(Math.abs(asked - radius) < GUARDIAN.parryMargin,
    `the spare was sent ${asked.toFixed(3)} m out to a shell of ${radius.toFixed(3)} m`);
  assert.equal(last.guard, true, "a parrying hand is not covering");
  assertInsideEnvelope({ ...blankIntent(), secondary: { ...blankIntent().secondary, ...last } },
    fixture.self, "wall");

  // Now their point closes: the wall becomes an intercept without the director saying anything.
  // The body walks in at 1.5 m/s and the tip is published as travelling with it, because
  // `solveIntercept` reads `tipVelocity` and a point that the view says is standing still has
  // no crossing to solve however fast the body carrying it is moving.
  const mark = said.length;
  fixture.opponent.reach = 1.78;
  theirArm(fixture, { extension: 0.62 });
  theirTipVelocity(fixture, { z: -1.5 });
  drive(fixture, mind, 0.25, { closing: 1.5 });
  const committed = said.slice(mark).filter((ask) => ask.theirs === "commit" && ask.intercept !== null);
  assert.ok(committed.length > 0, "their drawn, closing arm was never read as a commit");
  assert.ok(committed.some((ask) => ask.intercept.wall === false),
    "a closing point was still being answered with a bearing rather than a crossing");
});

/**
 * The riposte, and the reason it comes before the shove in the order.
 *
 * The ranges are read off the mind rather than written down here, because `strike` and
 * `near + 0.15 * reach` are within a couple of hand-breadths of each other on this body and a
 * hard-coded gap is a test that passes on one build and asks a different question on the next.
 */
test("the_guardian_ripostes_into_a_recover_on_the_first_ask_after_it", async (t) => {
  const golem = await standAGolem(t);
  const run = (over) => {
    // `shovesInside` off for this one: the shove band and the strike band overlap on this body,
    // so a riposte test at strike range with the shove on would be measuring which of two rules
    // comes first in the order -- which is what the shove's own test below is for.
    const { mind, said } = guardianSaying(SEED,
      { patience: 99, feintFraction: 0, shovesInside: false, ...over });
    const fixture = fixtureOf(golem.view);
    warmUp(fixture, mind);
    atGap(fixture, Math.max(0.1, mind.reading.strike - 0.10));
    theirArm(fixture, { extension: 0.88 });
    drive(fixture, mind, 0.20);
    fixture.opponent.reach = 1.78;
    theirArm(fixture, { extension: 0.62 });
    theirTipVelocity(fixture, { z: -1.5 });
    drive(fixture, mind, 0.25, { closing: 1.5 });
    const mark = said.length;
    theirArm(fixture, { extension: 0.88 });
    theirTipVelocity(fixture, { x: 0, y: 0, z: 0 });
    drive(fixture, mind, 0.30);
    return said.slice(mark).filter((ask) => ask.theirs === "recover");
  };

  // What ships: the committed arc, which chambers for 0.32 s and still lands inside the 0.60 s
  // their recover and their cooldown leave open. The plan asked for the quick stroke and two
  // seeds of the Session 06 sweep took it back; the entry has both numbers.
  const committed = run({});
  assert.ok(committed.length > 0, "the arm going back out was never read as a recover");
  assert.equal(committed[0].option, "cut",
    `the first ask of their recover was answered with ${committed[0].option}`);

  // The row exists so this is a command line and not an argument: on, the same opening is taken
  // off the guard with the quick stroke instead, which is the plan's own frozen choice.
  const quick = run({ ripostesQuick: true });
  assert.ok(quick.length > 0, "the control never read a recover either");
  assert.equal(quick[0].option, "strike",
    `with \`ripostesQuick\` on the riposte was ${quick[0].option}`);
});

/** Anything inside the inner radius is shoved off, and `shovesInside` is how that is unsaid. */
test("the_guardian_shoves_what_gets_inside_it_and_the_switch_takes_that_back", async (t) => {
  const golem = await standAGolem(t);
  const run = (over) => {
    const { mind, said } = guardianSaying(SEED, { patience: 99, ...over });
    const fixture = fixtureOf(golem.view);
    warmUp(fixture, mind);
    atGap(fixture, Math.max(0.1, mind.reading.near));
    theirArm(fixture, { extension: 0.88 });
    const mark = said.length;
    drive(fixture, mind, 0.60);
    return said.slice(mark);
  };

  const shoving = run({});
  assert.ok(shoving.length > 0, "the director was never asked from inside the near radius");
  assert.ok(shoving.every((ask) => ask.offered.includes("shove")),
    "a shove was not on offer from inside the inner radius, so this proves nothing");
  assert.ok(shoving.some((ask) => ask.option === "shove"),
    `inside its own near radius the guardian named ${[...new Set(shoving.map((a) => a.option))].join(", ")}`);

  const holding = run({ shovesInside: false });
  assert.ok(holding.every((ask) => ask.option !== "shove"),
    "the guardian shoved with `shovesInside` off");
});

/**
 * A body with no spare cover has two answers and the height of their point picks between them.
 *
 * The paired maul is the case: `mirror` writes the acting hand over the other one, so there is no
 * spare to send anywhere and `parry` is never offered however the chamber reads. `duck` is
 * offered by the executor only for a point above my shoulder, so the two branches of `answer` are
 * selected by exactly the condition the plan names for them.
 */
test("with_no_spare_cover_a_high_point_is_ducked_and_a_low_one_is_stepped_off", async (t) => {
  const golem = await standAGolem(t, setupWith({ primary: MAUL, secondary: MAUL }));
  const run = (lift) => {
    const { mind, said } = guardianSaying(SEED, { patience: 99 });
    const fixture = fixtureOf(golem.view);
    warmUp(fixture, mind);
    theirChamber(fixture, mind, 0.28, { lift });
    return said.filter((ask) => ask.theirs === "chamber");
  };

  const high = run(0.30);
  assert.ok(high.length > 0, "the drawing arm was never read as a chamber on the paired body");
  assert.ok(high.every((ask) => !ask.offered.includes("parry")),
    "a paired grip was offered a parry, and it has no spare hand to make one with");
  assert.ok(high.every((ask) => ask.option === "duck"),
    `a point above the shoulder was answered with ${[...new Set(high.map((a) => a.option))].join(", ")}`);

  const low = run(-0.40);
  assert.ok(low.length > 0, "the low case never read a chamber");
  assert.ok(low.every((ask) => !ask.offered.includes("duck")),
    "a duck was offered under a point below the shoulder");
  assert.ok(low.every((ask) => ask.option === "void"),
    `a point below the shoulder was answered with ${[...new Set(low.map((a) => a.option))].join(", ")}`);
});

test("golem_guardian_stays_inside_the_envelope_and_is_deterministic_under_a_seed", async (t) => {
  for (const [label, setup] of [
    ["the default golem", defaultGolemSetup()],
    ["two blades", setupWith({ secondary: { chain: "wrist", terminal: "blade" } })],
    ["the maul", setupWith({ primary: MAUL, secondary: MAUL })],
    ["fists", setupWith({ primary: { chain: "wrist", terminal: "fist" }, secondary: { chain: "pitch", terminal: "fist" } })],
    ["the ram head", setupWith({ head: "head.ram",
      primary: { chain: "none", terminal: "none" }, secondary: { chain: "none", terminal: "none" } })],
  ]) {
    const golem = await standAGolem(t, setup);
    const fixture = fixtureOf(golem.view);
    sweepPlaces(fixture, golemGuardian(SEED), label, 0.35);
  }
  const golem = await standAGolem(t);
  const trace = (seed) => {
    const fixture = fixtureOf(golem.view);
    const mind = golemGuardian(seed);
    const out = [];
    // Five seconds a place, because this style's only seeded numbers are the patience jitter and
    // the feint roll and its patience is 3.0 -- the longest in the set. A trace shorter than the
    // top of that bracket never opens an exchange, so it never reads either number and would be
    // the same trace under every seed for a reason that has nothing to do with determinism.
    for (const z of [3.5, 1.6, 1.2]) {
      place(fixture, { x: 0.3, z });
      drive(fixture, mind, 5.0, {
        each: (intent) => out.push(`${intent.primary.pointerX.toFixed(6)},${intent.primary.pointerY.toFixed(6)},` +
          `${intent.secondary.reach.toFixed(6)},${intent.secondary.guard ? 1 : 0},` +
          `${intent.forward.toFixed(6)},${intent.strafe.toFixed(6)},${mind.stance}`),
      });
    }
    return out.join("|");
  };
  assert.equal(trace(SEED), trace(SEED), "one seed, one bout");
  assert.notEqual(trace(SEED), trace(SEED + 1), "two seeds, two bouts");
});

/**
 * The whole thing on a real body: `golem-guardian` against `golem-fencer` for fourteen seconds.
 *
 * What is asserted is the one thing this style claims that no other does -- that the spare hand
 * is *sent somewhere* on purpose, often, and before their point is closing. The count is of asks
 * answered `parry` while their arm reads as a chamber, which is the rule the whole style is built
 * around and which the form cannot produce at all: with `wallOnChamber` off there is no intercept
 * to solve against an arm drawing back, so the option is never even on offer.
 *
 * Whether that is worth anything is not a question a fourteen-second bout can answer, and this
 * test does not try. Session 04 measured a solved parry buying five blocks a bout on top of the
 * 226 a body books by standing still; the Session 06 entry in `docs/measurements.md` is where the
 * wall is put to the same question.
 */
test("golem_guardian_meets_a_real_fencers_chamber_and_the_form_never_gets_the_chance", async () => {
  const setup = defaultGolemSetup();
  const physics = await freshHavok();
  const count = (make, name) => {
    const walls = { asks: 0, onChamber: 0 };
    const mind = make((available, reading, view, option) => {
      walls.asks += 1;
      if (option === "parry" && reading.theirs === "chamber") walls.onChamber += 1;
    });
    return {
      walls,
      mind: { name, styled: mind, decide: (view, dt) => mind.decide(view, dt) },
    };
  };
  const run = (make, name) => {
    const side = count(make, name);
    const blows = { left: 0, right: 0 };
    const result = runBout({
      left: name, right: "golem-fencer",
      leftUnit: "golem", rightUnit: "golem",
      leftGolem: setup, rightGolem: setup,
      locomotionMode: "supported",
      seeds: [SEED, SEED + 17],
      maxSeconds: 14,
      physics,
      leftMind: side.mind,
      rightMind: golemFencer(SEED + 17),
      onEvent: (event) => { blows[event.side] += 1; },
    });
    return { ...side.walls, seconds: result.seconds, blows };
  };

  const guarding = run((hook) => golemGuardian(SEED, GUARDIAN, hook), "golem-guardian");
  assert.ok(guarding.seconds > 13, `the bout ran ${guarding.seconds.toFixed(1)} s of fourteen`);
  assert.ok(guarding.asks > 0, "the guardian was never asked anything in fourteen seconds");
  assert.ok(guarding.onChamber > 0,
    `the guardian answered ${guarding.asks} asks and met a chamber on none of them`);
  assert.ok(guarding.blows.left > 0, "golem-guardian landed nothing at all in fourteen seconds");

  const forming = run((hook) => golemForm(SEED, FORM, hook), "golem-form");
  assert.equal(forming.onChamber, 0,
    `the form parried ${forming.onChamber} chambers, and \`wallOnChamber\` is off for it`);
});

// ---------------------------------------------------------------------------------------
// The fourth style: `golem-brawler`, Session 07 of the style set. The inside direction.
// ---------------------------------------------------------------------------------------

/** The brawler, with a hook that writes down every ask: `guardianSaying` for the fourth style. */
function brawlerSaying(seed, over = {}) {
  const said = [];
  const mind = golemBrawler(seed, { ...BRAWLER, ...over },
    (available, reading, view, option) => said.push({
      clock: view.clock, option, theirs: reading.theirs, gap: reading.gap,
      near: reading.near, slack: reading.slack, theirReach: reading.theirReach,
      offered: [...available],
    }));
  return { mind, said };
}

/**
 * The rule that is really the absence of two rules: this style has no way of going backwards.
 *
 * Asked from every distance a bout offers -- well outside their point, at the strike band, at its
 * own inner radius and inside it -- with their arm drawing in and going back out at each. Both
 * ways back are on offer at every one of those asks, which is what makes the assertion worth
 * making: nothing is stopping this style leaving but the director.
 */
test("the_brawler_never_names_a_step_backwards_and_walks_in_from_outside", async (t) => {
  const golem = await standAGolem(t);
  const { mind, said } = brawlerSaying(SEED);
  const fixture = fixtureOf(golem.view);
  for (const gap of [4.0, 2.4, 1.6, 1.2, 0.8, 0.5]) {
    for (const extension of [0.88, 0.60, 0.88]) {
      atGap(fixture, gap);
      theirArm(fixture, { extension });
      drive(fixture, mind, 0.40);
    }
  }
  assert.ok(said.length > 20, `only ${said.length} asks over six distances`);
  assert.ok(said.every((ask) => ask.offered.includes("withdraw") && ask.offered.includes("retreat")),
    "a step backwards was not on offer at every ask, so refusing it proves nothing");
  const back = said.filter((ask) => ask.option === "withdraw" || ask.option === "retreat");
  assert.deepEqual(back, [], `the brawler named a step backwards ${back.length} times`);

  // And the positive half: from outside its own hold it walks in, at every ask, with no roll.
  const far = said.filter((ask) => ask.gap > ask.near + ask.slack && ask.theirs !== "commit");
  assert.ok(far.length > 0, "no ask landed outside the inner radius");
  assert.deepEqual([...new Set(far.map((ask) => ask.option))], ["close"],
    "outside its hold the brawler named something other than the walk in");

  // The one evasion, and its condition: their point driving in while there is still ground behind
  // me to step into. This is the only reason `far` above has to be filtered at all.
  const stepped = said.filter((ask) => ask.option === "void");
  assert.ok(stepped.length > 0, "their point never drove at me, so the void rule was never asked");
  assert.ok(stepped.every((ask) => ask.theirs === "commit" && ask.gap > ask.theirReach),
    "the brawler stepped off the line from inside their reach, where there is nothing to step to");
});

/**
 * Inside the inner radius it shoves; in the slack band just outside it, it strikes.
 *
 * The two are one rule read at two distances, and where the boundary is *not* is the point. The
 * executor offers a shove out to `near + 0.15 * reach` and this style deliberately does not take
 * it that far, because outside the radius the arm still has room to swing and a swing is worth
 * more than a push. Both cases assert the offer as well as the answer, so a rule that stopped
 * firing because the option stopped being offered would fail with the reason on the line.
 */
test("the_brawler_shoves_inside_its_radius_and_strikes_in_the_band_outside_it", async (t) => {
  const golem = await standAGolem(t);
  const at = (fraction) => {
    const { mind, said } = brawlerSaying(SEED);
    const fixture = fixtureOf(golem.view);
    atGap(fixture, 2.0);
    theirArm(fixture, { extension: 0.88, toward: false });
    drive(fixture, mind, 1.2);
    const near = mind.reading.near;
    atGap(fixture, near * fraction);
    theirArm(fixture, { extension: 0.88, toward: false });
    const mark = said.length;
    drive(fixture, mind, 1.2);
    return said.slice(mark).filter((ask) => ask.theirs !== "commit");
  };

  const inside = at(0.85);
  assert.ok(inside.length > 0, "the director was never asked from inside the inner radius");
  assert.ok(inside.every((ask) => ask.gap <= ask.near), "the inside case was not actually inside");
  const shoving = inside.filter((ask) => ask.offered.includes("shove"));
  assert.ok(shoving.length > 0, "a shove was never on offer from inside the radius");
  assert.deepEqual([...new Set(shoving.map((ask) => ask.option))], ["shove"],
    "inside its own radius, with the shove open, the brawler named something else");

  const band = at(1.04);
  assert.ok(band.length > 0, "the director was never asked from the slack band");
  assert.ok(band.every((ask) => ask.gap > ask.near && ask.gap <= ask.near + ask.slack),
    "the band case did not land between the inner radius and the slack outside it");
  const armed = band.filter((ask) => ask.offered.includes("shove"));
  assert.ok(armed.length > 0, "the hand was never armed in the slack band");
  assert.ok(armed.every((ask) => ask.offered.includes("strike")),
    "a strike was not open where a shove was, and this band is well inside both offers");
  assert.deepEqual([...new Set(armed.map((ask) => ask.option))], ["strike"],
    "in the slack band, with both open, the brawler named something other than the stroke");

  // What it does with the asks in between, which are the ones where the hand is still cooling:
  // it walks in. A style with no rule for waiting has none for standing still either, and `hold`
  // is a word this director says only if `closesAlways` is turned off.
  const cooling = [...inside, ...band].filter((ask) => !ask.offered.includes("shove"));
  assert.ok(cooling.length > 0, "no ask landed on a cooling hand, and the shove sets a cooldown");
  assert.deepEqual([...new Set(cooling.map((ask) => ask.option))], ["close"],
    "with nothing open to throw the brawler named something other than the walk in");
});

/**
 * `strikeBite` on an inside stroke: which way it points, and the range at which it stops pointing.
 *
 * The plan asked for 0.80 and glossed it "the arm stays drawn". `reachForDistance` subtracts
 * `overhang * (1 - bite)` from the distance to the mark before spanning it into the anchor axis,
 * so a *larger* bite subtracts less and asks the anchor for *more*. The first half of this test is
 * that direction, driven through the executor rather than read off the formula.
 *
 * The second half is the thing that decides how the Session 07 sweep can be read at all. The
 * anchor axis clamps, and it clamps at `reachMax + overhang * (1 - bite)` metres -- which for
 * every bite in the sweep is *inside* this style's own strike band. So at the range the brawler
 * actually strikes from the row is inert: three different bites command the same fully extended
 * anchor to the digit, and a sweep row that moves is a row that moved for some other reason.
 */
test("a_larger_strike_bite_asks_for_more_anchor_and_the_axis_is_saturated_where_this_style_strikes", async (t) => {
  const golem = await standAGolem(t);
  // A director that names one thing, which is how every test of this executor is written: a rule
  // that had to fire to produce the command could not tell a wrong command from a trigger that
  // never went off. Here it also gets a strike from inside the radius, where this style shoves.
  const commanded = (bite, gap) => {
    const mind = golemStyled(SEED, { ...BRAWLER, strikeBite: bite }, () => "strike");
    const fixture = fixtureOf(golem.view);
    atGap(fixture, 2.0);
    theirArm(fixture, { extension: 0.88, toward: false });
    drive(fixture, mind, 1.2);
    atGap(fixture, gap);
    theirArm(fixture, { extension: 0.88, toward: false });
    let last = null;
    // The end of the arc and not its start: the anchor runs from the shape's own `chamberReach`
    // to the computed one over the sweep, so the first committed step is -0.70 whatever the bite.
    drive(fixture, mind, 1.2, {
      each: (intent) => { if (mind.stance === "commit") last = intent.primary.reach; },
    });
    assert.ok(last !== null, `no stroke was committed at bite ${bite} and gap ${gap.toFixed(2)}`);
    return last;
  };

  const fixture = fixtureOf(golem.view);
  const cap = fixture.self.capabilities.effectors.primary;
  const reach = fixture.self.hands.primary.reach;
  const near = innerReach(reach, cap);
  const overhang = reach - cap.reachable.reachMax;

  // Where the row is live: a mark close enough that neither bite has run the anchor to its stop.
  const close = cap.reachable.reachMax + overhang * 0.2 - 0.30;
  assert.ok(close < near, "the live band is not inside the inner radius, and this test assumes it is");
  const drawn = commanded(0.66, close);
  const extended = commanded(0.80, close);
  assert.ok(drawn > -1 && extended < 1, `the axis was saturated at ${close.toFixed(2)} m after all`);
  assert.ok(extended > drawn,
    `bite 0.80 asked the anchor for ${extended.toFixed(4)} and 0.66 asked for ${drawn.toFixed(4)}`);

  // Where this style actually strikes from, which is the slack band just outside the radius.
  const band = near * 1.04;
  const swept = [0.66, 0.80, 0.90].map((bite) => commanded(bite, band));
  assert.deepEqual(swept, [1, 1, 1],
    `at ${band.toFixed(2)} m the three swept bites asked for ${swept.join(", ")}`);
  assert.equal(BRAWLER.strikeBite, 0.80, "the plan's number ships, and the sweep is where it is argued");
});

/**
 * The sever-hunter, and the half of it the executor had to be taught.
 *
 * With `targetByHealth` on and `targetMargin` 0, a strike goes at the least-healthy reachable
 * slot -- that much v2 has always done, and Session 04 carried it into v3 unchanged. A *thrust*
 * did not: `enterExchange` aimed every thrust at the trunk whatever the table said, so the plan's
 * rule "thrust at the head when the head is the weakest slot" had nowhere to land until
 * `thrustByHealth` was added beside it. The control at the end is the same body, the same health
 * and the same option with the row off, which is the whole of the row's claim.
 */
test("the_brawler_puts_its_point_where_the_health_is_lowest_and_the_row_takes_that_back", async (t) => {
  const golem = await standAGolem(t);
  const whole = {
    "x.golem.trunk.core": 1, "x.golem.trunk.waist": 1, "x.golem.head.head": 1, "x.golem.head.neck": 1,
    "x.golem.primary.upperArm": 1, "x.golem.primary.forearm": 1, "x.golem.secondary.upperArm": 1,
    "x.golem.legs.thighL": 1,
  };
  const run = (health, over = {}) => {
    const { mind, said } = brawlerSaying(SEED, over);
    const fixture = fixtureOf(golem.view);
    atGap(fixture, 2.0);
    theirArm(fixture, { extension: 0.88, toward: false });
    drive(fixture, mind, 1.2);
    atGap(fixture, mind.reading.near * 1.04);
    theirArm(fixture, { extension: 0.88, toward: false });
    fixture.opponent.health = health;
    const mark = said.length;
    const marks = new Set();
    // The first committed step, where the arc's own lift offset is the same whatever the mark is,
    // so what is left between two runs is where the aim was pointed.
    let lift = null;
    drive(fixture, mind, 1.6, {
      each: (intent) => {
        if (mind.stance === "chamber" || mind.stance === "commit") marks.add(mind.target);
        if (mind.stance === "commit" && lift === null) lift = intent.primary.pointerY;
      },
    });
    const opened = said.slice(mark).filter((ask) => ask.offered.includes("strike"));
    assert.ok(opened.length > 0, "the hand was never armed inside the strike band");
    return { named: new Set(opened.map((ask) => ask.option)), marks: [...marks], lift };
  };

  const head = run({ ...whole, "x.golem.head.neck": 0.3 });
  assert.deepEqual([...head.named], ["thrust"],
    "with the head the softest slot the brawler named something other than the point");
  assert.deepEqual(head.marks, ["head"], "the point did not go at the head");

  const arm = run({ ...whole, "x.golem.primary.forearm": 0.4 });
  assert.deepEqual([...arm.named], ["strike"], "a worn arm drew something other than the stroke");
  assert.deepEqual(arm.marks, ["primary"], "the stroke did not go at the softest slot");

  const off = run({ ...whole, "x.golem.head.neck": 0.3 }, { thrustByHealth: false });
  assert.deepEqual([...off.named], ["thrust"], "the control never thrust, so it is not a control");
  assert.deepEqual(off.marks, ["trunk"], "with `thrustByHealth` off the point still left the trunk");

  // And the point actually went there. The slot is chosen in one place and the mark is built in
  // another, and until Session 07 the second of the two never read the first: a thrust's mark was
  // the trunk's vital height in a branch that did not look at the chosen slot, so this row could
  // be swept on and off over 512 bouts and produce a byte-identical log. A head mark sits at the
  // midpoint of crown and shoulder and a trunk thrust at 0.82 of the shoulder, so the aim is the
  // assertion: same body, same option, same step of the arc, higher point.
  assert.ok(head.lift !== null && off.lift !== null, "no thrust was committed in one of the two runs");
  assert.ok(head.lift > off.lift + 1e-6,
    `the head thrust was aimed at ${head.lift.toFixed(4)} and the trunk thrust at ${off.lift.toFixed(4)}`);
  assert.equal(GOLEM_TACTICS_V3.thrustByHealth, false,
    "the row ships off, so the three older styles and the four v2 minds are unmoved by it");
});

test("golem_brawler_stays_inside_the_envelope_and_is_deterministic_under_a_seed", async (t) => {
  for (const [label, setup] of [
    ["the default golem", defaultGolemSetup()],
    ["two blades", setupWith({ secondary: { chain: "wrist", terminal: "blade" } })],
    ["the maul", setupWith({ primary: MAUL, secondary: MAUL })],
    ["fists", setupWith({ primary: { chain: "wrist", terminal: "fist" }, secondary: { chain: "pitch", terminal: "fist" } })],
    ["the ram head", setupWith({ head: "head.ram",
      primary: { chain: "none", terminal: "none" }, secondary: { chain: "none", terminal: "none" } })],
  ]) {
    const golem = await standAGolem(t, setup);
    const fixture = fixtureOf(golem.view);
    sweepPlaces(fixture, golemBrawler(SEED), label, 0.35);
  }
  const golem = await standAGolem(t);
  const trace = (seed) => {
    const fixture = fixtureOf(golem.view);
    const mind = golemBrawler(seed);
    const out = [];
    // The trace starts inside the band this style throws from, and that ordering is the test.
    // This director draws no numbers of its own -- it is the only one of the four that does not --
    // so the one thing two seeds can move is the offset on the opening cooldown, and a trace that
    // spent its first seconds walking in from 2.4 m would have spent that offset before it did
    // anything, and would then be the same trace under every seed for no good reason.
    for (const gap of [1.10, 0.90, 2.40]) {
      atGap(fixture, gap);
      theirArm(fixture, { extension: 0.88, toward: false });
      drive(fixture, mind, 3.0, {
        each: (intent) => out.push(`${intent.primary.pointerX.toFixed(6)},${intent.primary.pointerY.toFixed(6)},` +
          `${intent.secondary.reach.toFixed(6)},${intent.secondary.guard ? 1 : 0},` +
          `${intent.forward.toFixed(6)},${intent.strafe.toFixed(6)},${mind.stance}`),
      });
    }
    return out.join("|");
  };
  assert.equal(trace(SEED), trace(SEED), "one seed, one bout");
  assert.notEqual(trace(SEED), trace(SEED + 1), "two seeds, two bouts");
});

/**
 * The whole thing on three real bodies: the default golem, the paired maul and the ram head.
 *
 * What is asserted is the signature the plan names and nothing more -- it gets inside and shoves,
 * it lands something, and a body whose only weapon is its head charges. Whether any of that is
 * worth a point on the bar is the Session 07 entry's question and not a fourteen-second bout's.
 * The paired maul is here because it is the build every style in this set has to have an answer
 * for: no spare hand to cover with, both channels mirrored, and no combination stroke.
 */
test("golem_brawler_gets_inside_three_real_bodies_and_the_ram_head_charges", async () => {
  const physics = await freshHavok();
  const run = (setup, label) => {
    const asks = { total: 0, ram: 0, shove: 0, close: 0 };
    const styled = golemBrawler(SEED, BRAWLER, (available, reading, view, option) => {
      asks.total += 1;
      if (option === "ram") asks.ram += 1;
      if (option === "shove") asks.shove += 1;
      if (option === "close") asks.close += 1;
    });
    const blows = { left: 0, right: 0 };
    const result = runBout({
      left: "golem-brawler", right: "golem-fencer",
      leftUnit: "golem", rightUnit: "golem",
      leftGolem: setup, rightGolem: defaultGolemSetup(),
      locomotionMode: "supported",
      seeds: [SEED, SEED + 17],
      maxSeconds: 14,
      physics,
      leftMind: { name: "golem-brawler", styled, decide: (view, dt) => styled.decide(view, dt) },
      rightMind: golemFencer(SEED + 17),
      onEvent: (event) => { blows[event.side] += 1; },
    });
    assert.ok(asks.total > 0, `${label}: the brawler was never asked anything in fourteen seconds`);
    return { ...asks, seconds: result.seconds, blows };
  };

  const plain = run(defaultGolemSetup(), "the default golem");
  assert.ok(plain.close > 0, "the brawler never walked in, which is the only thing it does at range");
  assert.ok(plain.shove > 0, `the brawler answered ${plain.total} asks and shoved on none of them`);
  assert.ok(plain.blows.left > 0, "golem-brawler landed nothing at all in fourteen seconds");

  const maul = run(setupWith({ primary: MAUL, secondary: MAUL }), "the paired maul");
  assert.ok(maul.blows.left > 0, "a paired maul landed nothing at all in fourteen seconds");

  const ram = run(setupWith({ head: "head.ram",
    primary: { chain: "none", terminal: "none" }, secondary: { chain: "none", terminal: "none" } }),
  "the ram head");
  assert.ok(ram.ram > 0, `a body whose only weapon is its head charged on none of ${ram.total} asks`);
});
