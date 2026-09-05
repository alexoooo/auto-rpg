// The assembled golem, in the arena, under real Havok.
//
// **Every threshold in this file is provisional.** They are pinned from the 2026-09-04 Node arena
// run and are to be re-taken after the owner's gate. They are *not* regression floors: this plan
// set exists because three body experiments each cleared a scalar proxy while the owner's
// judgement stayed red, and a number that has never been checked against a person's eye can only
// say "this did not change", never "this is right". Sessions 02 to 07 marked theirs the same way.
//
// The harness is `scripts/measure.mjs` used as a library -- the same `NullEngine` arena, the same
// real Havok, the same `stepPair` loop the page runs, with the render half taken out -- plus
// `scripts/golem-headless-arena.mjs` for the two lifecycle tests that need a bare scene. Nothing
// here may be compared with a page reading or with a figure from `scripts/golem-bench.mjs`: the
// two harnesses in this directory that have been compared agree on converged behaviour and
// disagree by about 9 % on the Warrior's peak transient with identical code, and putting two of
// them in one column has already produced a regression report about a build where nothing had
// changed.
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
import { attachPhysics, COLLIDES, LAYER, collisionFilterIsExact, golemLayersFor } from "../src/physics.ts";
import { unitDefinition } from "../src/units.ts";
import { vitality } from "../src/bout.ts";
import { GOLEM_ASSEMBLY } from "../src/golem/config.ts";
import {
  GOLEM_EFFECTORS,
  GOLEM_LOCOMOTION,
  defaultGolemDimensions,
  defaultGolemSetup,
  golemEffectorPlan,
  golemSetupRefusal,
  golemTerminalOptions,
  unresolvedGolemModules,
} from "../src/golem/build.ts";
import { GOLEM_MODULES } from "../src/golem/registry.ts";

process.env.SWORD_MEASURE_LIBRARY = "1";
const { freshHavok, runBout } = await import("../scripts/measure.mjs");

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const FIXED = 1 / CONFIG.world.physicsHz;
const FRAME_MS = 1000 / 60;

const blankIntent = () => ({
  forward: 0, strafe: 0, turn: 0, actingHand: "primary",
  natural: { thrust: false, guard: false },
  posture: { trunkLean: 0, trunkTwist: 0, crouch: 0 },
  primary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false },
  secondary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false },
});

/** A mind that hands back one command it owns, so a test can drive a golem field by field. */
const scripted = (name, intent) => ({ name, decide: () => intent });

// ---------------------------------------------------------------------------------------
// The registry seam: what an assembly may build from, and what it refuses.
// ---------------------------------------------------------------------------------------

/**
 * The gate that keeps the assembly's slot tables from silently lagging the registry.
 *
 * `src/golem/build.ts` walks `GOLEM_MODULES` and resolves each registered id to the definition
 * that produced it, because the *list* of options must have exactly one home. What it cannot get
 * from a `GolemBenchOption` is a locomotion module's own surface -- the port, the root, the two
 * halves of a substep -- so that one slot names definitions directly, and this is what says so out
 * loud when a new one appears. Session 06's wheel and multileg each need one line in
 * `GOLEM_LOCOMOTION`; this test is what names it if they do not get one.
 */
test("every_registered_golem_module_is_a_module_an_assembly_can_actually_build", () => {
  const missing = unresolvedGolemModules();
  assert.deepEqual([...missing], [],
    `registered but not assemblable -- add each to src/golem/build.ts: ${missing.join(", ")}`);
  const locomotionIds = GOLEM_MODULES.filter((option) => option.mode === "locomotion")
    .map((option) => option.id).sort();
  assert.deepEqual(GOLEM_LOCOMOTION.map((definition) => definition.id).sort(), locomotionIds);
  // And the other direction for the effectors, which are derived rather than named: every pair the
  // registry offers is offered by the assembly, in the registry's own order.
  const effectorIds = GOLEM_MODULES.filter((option) => option.mode === "effector")
    .map((option) => option.id);
  assert.deepEqual(GOLEM_EFFECTORS.map((option) => option.id), effectorIds);
});

/**
 * How sockets are allocated, and how a mace claims both.
 *
 * A golem has exactly two effector sockets. Every terminal but the mace claims one; the mace is a
 * rigid bar between two arms and claims both, which is the same shape as the club taking two
 * hands. The assembly expresses that as **one module built into the primary socket with the
 * secondary handed over as its `companion`** -- so `plan.secondary` is null and nothing is built
 * there -- and a build asking for a mace beside anything else is refused by name rather than
 * quietly given three sockets.
 */
test("a_two_socket_terminal_claims_both_effector_sockets_and_a_third_is_refused_by_name", () => {
  const mace = GOLEM_EFFECTORS.find((option) => option.terminal === "mace");
  assert.ok(mace, "the mace is registered on at least one chain");
  assert.equal(mace.sockets, 2);
  for (const option of GOLEM_EFFECTORS) {
    assert.equal(option.sockets, option.terminal === "mace" ? 2 : 1, option.id);
  }

  const both = {
    ...defaultGolemSetup(),
    primary: { chain: mace.chain, terminal: "mace" },
    secondary: { chain: mace.chain, terminal: "mace" },
  };
  assert.equal(golemSetupRefusal(both), null);
  const plan = golemEffectorPlan(both);
  assert.equal(plan.primary.id, mace.id);
  assert.equal(plan.secondary, null, "a mace is one module, so the second socket builds nothing");

  const mismatched = { ...both, secondary: { chain: mace.chain, terminal: "blade" } };
  const refusal = golemSetupRefusal(mismatched);
  assert.match(refusal ?? "", /three effector sockets/);
  assert.match(refusal ?? "", /mace/);
});

test("a_build_naming_a_pair_the_registry_does_not_have_is_refused_by_name", () => {
  const missing = { ...defaultGolemSetup(), primary: { chain: "none", terminal: "blade" } };
  assert.match(golemSetupRefusal(missing) ?? "", /no golem effector "none" \+ "blade"/);
  assert.match(golemSetupRefusal({ ...defaultGolemSetup(), torso: "torso.marzipan" }) ?? "",
    /no golem torso module "torso.marzipan"/);
  // And the picker's own list is the registry's: a chain is offered only the terminals it has.
  for (const option of GOLEM_EFFECTORS) {
    const offered = golemTerminalOptions(option.chain).map((entry) => entry.id);
    assert.ok(offered.includes(option.terminal ?? "none"),
      `${option.chain} is not offered ${option.terminal ?? "its own cap"}`);
  }
});

// ---------------------------------------------------------------------------------------
// One assembled body: geometry, layers, vitality, and who owns the waist.
// ---------------------------------------------------------------------------------------

/** One golem in a bare arena, driven by hand, with nothing to fight. */
async function standAGolem(t, { setup = defaultGolemSetup(), side = "left" } = {}) {
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

  const intent = blankIntent();
  const golem = unitDefinition("golem").build({
    scene, side, origin: Vector3.Zero(), facing: 0, golem: setup,
    mind: scripted("bench", intent), materials,
  });
  t.after(() => { golem.dispose(); scene.dispose(); engine.dispose(); });

  let clock = 0;
  const control = () => {
    // The production order with the pair half absent, which is what a lone body has: the golem's
    // own `observe` refreshes the root sample, the driver commands, the solo carrier resolves, and
    // `afterLocomotion` runs the gait and every upper module's step.
    golem.observe(golem, clock);
    golem.locomotion.beginControlStep();
    golem.control.driver.step(FIXED);
    const proposal = golem.locomotion.proposal(FIXED);
    const fraction = golem.locomotion.registry.allowedFraction(
      proposal.prior, proposal.next, proposal.footprint, proposal.ownerPartIds);
    golem.locomotion.commitPhysical(proposal, Object.freeze({
      x: proposal.displacement.x * fraction,
      z: proposal.displacement.z * fraction,
      yaw: proposal.displacement.yaw,
    }), FIXED);
    golem.afterLocomotion(FIXED);
    clock += FIXED;
  };
  scene.onBeforePhysicsObservable.add(control);
  const run = (seconds) => {
    for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
      scene._renderId += 1;
      scene._advancePhysicsEngineStep(FRAME_MS);
    }
  };
  return { scene, golem, intent, run, get clock() { return clock; } };
}

/**
 * The frozen collision rule, asked of every leaf rather than promised in prose.
 *
 * A golem's own parts never collide with each other, and that is true **by construction**: a
 * structural link is on the side's `arm` layer, whose collide mask contains neither that layer nor
 * the trunk's, and a terminal is on the side's `sword` layer with the same shape. So this asks two
 * things of every part -- that its filter is one of exactly those two rows, and that it is written
 * on the leaf. Havok filters at leaves and a container's own mask is a write nothing consults that
 * reads back garbage: a shape set to 8 came back as 383476, and every weapon in this directory
 * collided with everything for its whole life because of it.
 */
test("every_golem_part_is_filtered_on_its_own_leaf_onto_one_of_the_two_golem_rows", async (t) => {
  const stand = await standAGolem(t);
  const layers = golemLayersFor("left");
  let structural = 0;
  let strikes = 0;
  for (const limb of stand.golem.limbs) {
    const leaf = limb.part.shape;
    const body = collisionFilterIsExact(leaf, [leaf], layers.body, layers.bodyCollidesWith);
    const strike = collisionFilterIsExact(leaf, [leaf], layers.strike, layers.strikeCollidesWith);
    assert.ok(body || strike,
      `${limb.key} is on membership ${leaf.filterMembershipMask} colliding ${leaf.filterCollideMask}`);
    if (body) structural += 1; else strikes += 1;
  }
  assert.ok(structural > 0 && strikes > 0, "a golem has anatomy and something that hits");
  // The half a filter cannot state: neither row admits the other side's own bits, so no pair of a
  // golem's parts is ever offered to the narrowphase.
  assert.equal(layers.bodyCollidesWith & layers.body, 0);
  assert.equal(layers.strikeCollidesWith & layers.strike, 0);
  assert.equal(layers.bodyCollidesWith & layers.strike, 0);
});

/**
 * The registry's four dimensions against the body they claim to describe.
 *
 * `defaultGolemDimensions` is a second statement of arithmetic the modules already do, which is
 * the defect this directory keeps paying for -- so it comes with this. The authority is the
 * assembled body's published `BodyView`; the registry row is an approximation of it and this is
 * what stops the two drifting.
 */
test("the_registrys_golem_dimensions_agree_with_an_assembled_default_golems_own_view", async (t) => {
  const stand = await standAGolem(t);
  stand.run(0.5);
  const view = stand.golem.view.self;
  const claimed = defaultGolemDimensions();
  const close = (a, b, band, what) =>
    assert.ok(Math.abs(a - b) <= band, `${what}: registry ${a.toFixed(3)} vs body ${b.toFixed(3)}`);
  close(claimed.reach, view.reach, 0.001, "reach");
  close(claimed.crownHeight, view.crownHeight, 0.001, "crownHeight");
  close(claimed.vitalHeight, view.vitalHeight, 0.02, "vitalHeight");
  close(claimed.collisionRadius, view.collisionRadius, 0.001, "collisionRadius");
});

/**
 * A golem's parts carry their own vitality weights, and the assembled body's bar is its own body.
 *
 * The bout's weight table throws on an unknown key by design -- it is a Warrior's anatomy -- so a
 * golem part that arrived without a weight would take the whole bout down rather than read as
 * unhurt. And because a module cannot know what it is bolted to, the declared points are scaled at
 * assembly so the whole body sums to `GOLEM_ASSEMBLY.vitalityTotal`; the argument for that number
 * is beside it in `src/golem/config.ts`.
 */
test("an_assembled_golems_weights_are_its_own_and_a_wholly_ruined_body_reaches_zero", async (t) => {
  const stand = await standAGolem(t);
  const limbs = stand.golem.limbs;
  assert.ok(limbs.length > 0);
  let sum = 0;
  for (const limb of limbs) {
    assert.equal(typeof limb.vitalityWeight, "number", `${limb.key} declares no vitality weight`);
    assert.ok(limb.vitalityWeight > 0, `${limb.key} weighs nothing`);
    sum += limb.vitalityWeight;
  }
  assert.ok(Math.abs(sum - GOLEM_ASSEMBLY.vitalityTotal) < 1e-9,
    `weights sum to ${sum} rather than ${GOLEM_ASSEMBLY.vitalityTotal}`);
  assert.equal(vitality(limbs), 1);
  // The claim the sum is actually about, made against the same pure rule the bout uses.
  const ruined = limbs.map((limb) => ({ ...limb, health: 0 }));
  assert.equal(vitality(ruined), 0);
  // And the two fatal parts are declared, because a golem that could only be exhausted would be a
  // golem no blow ever finishes.
  const fatal = limbs.filter((limb) => limb.fatal === true).map((limb) => limb.key);
  assert.equal(fatal.length, 2, `fatal parts: ${fatal.join(", ")}`);
});

/**
 * **Who owns the waist**, answered by driving it rather than by counting constraints.
 *
 * Session 05 stated the question and left it open: the biped builds a waist whenever its mount is
 * `DYNAMIC` and Session 07's torso builds one unconditionally, and two owners is two motors on one
 * joint. The assembly settles it -- the torso owns the waist, and the biped's own rule yields it
 * because an assembly hands the root an `ANIMATED` base frame -- and the check that the settlement
 * took is behavioural: a second motor holding the trunk at zero would keep a commanded full lean
 * from ever arriving, which is exactly the symptom two motors on one joint produce and is
 * invisible to a constraint census.
 */
test("the_torso_owns_the_waist_so_a_commanded_lean_actually_arrives", async (t) => {
  const stand = await standAGolem(t);
  stand.run(1.0);
  const upright = stand.golem.view.self.trunkLean;
  assert.ok(Math.abs(upright) < 0.12, `a golem asked for nothing leaned ${upright.toFixed(3)}`);
  stand.intent.posture.trunkLean = 1;
  stand.run(2.0);
  const leaned = stand.golem.view.self.trunkLean;
  assert.ok(leaned > 0.55,
    `a full commanded lean reached ${leaned.toFixed(3)} of the trunk's own envelope`);
  stand.intent.posture.trunkLean = 0;
  stand.run(2.0);
  assert.ok(Math.abs(stand.golem.view.self.trunkLean) < 0.20,
    `the trunk did not come back: ${stand.golem.view.self.trunkLean.toFixed(3)}`);
});

/**
 * **Does the golem's arms lag its body when it walks.**
 *
 * The reading `AGENTS.md` says to take first: a driven limb that is not within a few millimetres
 * of its own anchor is not posed wrongly, it is stuck on something. Here it caught something else
 * -- `arm-core.ts` built its commanded point on `GolemSocket.world`, which is by contract the
 * socket's position *at construction*, so a walking golem drove its arms at the place its
 * shoulders used to be. The fix is a live socket world recomputed from the mount's own
 * `mesh.position` and `mesh.rotationQuaternion`, exactly as Session 07's torso and head already
 * did, and `docs/measurements.md` carries the before and after.
 */
test("a_walking_golems_effector_stays_on_its_own_anchor", async (t) => {
  const stand = await standAGolem(t);
  // The first 0.6 s is the build-pose settle every reading in this directory excludes: an anchor
  // keyframes onto its commanded pose on the first control step, which is a snap and not a walk.
  stand.run(0.6);
  stand.intent.forward = 1;
  let peakStray = 0;
  let peakShoulderLag = 0;
  const observer = stand.scene.onBeforePhysicsObservable.add(() => {
    const effector = stand.golem.effectorView("primary");
    if (effector && effector.anchorStray !== null) {
      peakStray = Math.max(peakStray, effector.anchorStray);
    }
    // The second half of the same question, and the one the defect actually showed up in: how far
    // the published shoulder is from the body it is bolted to. A socket frozen at build time
    // leaves this growing without bound as the golem walks away from where it was made.
    const view = stand.golem.view.self;
    peakShoulderLag = Math.max(peakShoulderLag,
      Math.hypot(view.hands.primary.shoulder.x - view.ground.x,
        view.hands.primary.shoulder.z - view.ground.z));
  });
  stand.run(6.0);
  stand.scene.onBeforePhysicsObservable.remove(observer);
  const travelled = Math.hypot(stand.golem.view.self.ground.x, stand.golem.view.self.ground.z);
  assert.ok(travelled > 1.5, `the golem only walked ${travelled.toFixed(2)} m`);
  assert.ok(peakStray < 0.120,
    `peak primary anchor stray while walking was ${(peakStray * 1000).toFixed(1)} mm`);
  assert.ok(peakShoulderLag < 0.45,
    `the primary shoulder ran ${(peakShoulderLag * 1000).toFixed(0)} mm out from its own feet`);
});

// ---------------------------------------------------------------------------------------
// Severing: what comes off, what is left, and what it leaves on the floor.
// ---------------------------------------------------------------------------------------

const moduleLimbs = (golem, suffix) =>
  golem.limbs.filter((limb) => limb.key.startsWith(`${golem.side}.golem.${suffix}.`));

/**
 * Severing a module is breaking its socket joint, and the module is the severable unit.
 *
 * Cutting through any piece of an arm takes the whole arm off at the socket, which is the
 * Warrior's own rule for a body whose arm is a module rather than three bones. What is left on the
 * floor is real: every part of it re-layers onto `DEBRIS` on its own leaf shape, and its terminal
 * stops scoring so a blade lying on the ground cuts nobody. And the body goes on: the secondary
 * effector still tracks its own anchor, the golem still walks, and it is still alive.
 */
test("a_severed_effector_becomes_debris_and_the_golem_fights_on_with_the_other_one", async (t) => {
  const stand = await standAGolem(t);
  stand.run(1.0);
  const arm = moduleLimbs(stand.golem, "primary");
  assert.ok(arm.length >= 3, `the primary effector has ${arm.length} parts`);
  const before = stand.golem.strikers.length;

  stand.golem.sever(arm[arm.length - 1], new Vector3(1, 0.2, 0));
  for (const limb of arm) {
    assert.equal(limb.severed, true, `${limb.key} stayed attached`);
    assert.equal(limb.health, 0, limb.key);
    assert.equal(limb.part.shape.filterMembershipMask, LAYER.DEBRIS, limb.key);
    assert.equal(limb.part.shape.filterCollideMask, COLLIDES.DEBRIS, limb.key);
  }
  // Debris does not score. `Striking.spent` is what `Combat` asks before it files anything, and a
  // terminal that went on scoring from the floor is the shape of defect that let 62 of an archer's
  // "hits" be the same handful of spent shafts.
  assert.equal(before, stand.golem.strikers.length, "the striker list is fixed at build");
  for (const striker of stand.golem.strikers) {
    if (striker.effectorId.includes(".primary.")) {
      assert.equal(striker.spent, true, `${striker.effectorId} still scores`);
    }
  }
  assert.equal(stand.golem.alive, true, "an arm off is a golem with a problem, not a dead golem");
  // One control step, because the view is republished by `observe` and a sever is not a
  // publication: reading it in the same breath would be reading the frame before the blow.
  stand.run(0.05);
  assert.equal(stand.golem.view.self.hands.primary.lost, true);
  assert.equal(stand.golem.view.self.hands.secondary.lost, false);

  // And it fights on. The secondary is commanded across the window and stays on its own anchor,
  // which is the reading that says a limb is driven rather than dragged.
  stand.intent.forward = 1;
  stand.intent.secondary.pointerX = 0.8;
  stand.intent.secondary.pointerY = 0.6;
  let peak = 0;
  const observer = stand.scene.onBeforePhysicsObservable.add(() => {
    const view = stand.golem.effectorView("secondary");
    if (view && view.anchorStray !== null) peak = Math.max(peak, view.anchorStray);
  });
  stand.run(3.0);
  stand.scene.onBeforePhysicsObservable.remove(observer);
  assert.ok(peak < 0.120,
    `the surviving effector strayed ${(peak * 1000).toFixed(1)} mm from its own anchor`);
  assert.ok(Math.hypot(stand.golem.view.self.ground.x, stand.golem.view.self.ground.z) > 1.0,
    "a golem with one arm still walks");
});

/**
 * A decapitated golem is dead, and the bout's own rule is what says so.
 *
 * The head module declares its head part fatal and the locomotion module declares its pelvis
 * fatal, so `beaten()` reads the same two flags a `Fighter`'s head and torso set. This asserts
 * both halves: the body stops being driven, and the pure rule agrees.
 */
test("a_decapitated_golem_is_dead_and_the_bouts_own_rule_agrees", async (t) => {
  const stand = await standAGolem(t);
  stand.run(1.0);
  const head = moduleLimbs(stand.golem, "head");
  const fatal = head.find((limb) => limb.fatal === true);
  assert.ok(fatal, `the head module declares no fatal part: ${head.map((l) => l.key).join(", ")}`);
  assert.equal(stand.golem.alive, true);
  stand.golem.sever(fatal, new Vector3(0, 1, 0));
  assert.equal(stand.golem.alive, false);
  const { beaten } = await import("../src/bout.ts");
  assert.equal(beaten(stand.golem.limbs), true);
  // The carrier is gone with it: a stone body does not crumple, it comes apart, so the root is an
  // ordinary dynamic body from here and the legs' drives have let go.
  stand.intent.forward = 1;
  // `.clone()`, never a spread: a Babylon `Vector3` keeps `_x/_y/_z` behind prototype accessors,
  // so `{ ...point }` reads `undefined` from every `.x` and every comparison against it is NaN --
  // which passes an `assert.ok` written the other way round and fails this one for the wrong
  // reason. `tests/fixtures/view.mjs` carries the same warning about cloning a live view.
  const before = stand.golem.view.self.ground.clone();
  stand.run(1.5);
  const after = stand.golem.view.self.ground;
  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 0.5,
    `a dead golem walked ${Math.hypot(after.x - before.x, after.z - before.z).toFixed(2)} m`);
});

// ---------------------------------------------------------------------------------------
// The bout, and the lifecycle.
// ---------------------------------------------------------------------------------------

/**
 * The whole thing: a golem against a Warrior duelist, both corners, to a verdict.
 *
 * The golem is on `idle` because `idle` is the only policy its registry row admits -- the scripted
 * policies in `src/policies.ts` are written for a Warrior's arm and their ranges are a weapon's
 * length in disguise, so pointing one at a golem would be measuring a policy against a body it has
 * never seen. Session 09 is the golem's mind. What this asserts is therefore the *bout*, not the
 * fight: both bodies build, step for a full capped bout on either side of the ring, and reach a
 * verdict without a thrown error. What the duelist actually manages against a golem is a
 * measurement and it is in `docs/measurements.md`.
 */
test("a_golem_and_a_warrior_duelist_reach_a_verdict_from_either_corner", async () => {
  for (const golemLeft of [true, false]) {
    const result = runBout({
      left: golemLeft ? "idle" : "duelist",
      right: golemLeft ? "duelist" : "idle",
      leftUnit: golemLeft ? "golem" : "warrior",
      rightUnit: golemLeft ? "warrior" : "golem",
      leftLoadout: golemLeft ? undefined : { primary: "sword", secondary: "empty" },
      rightLoadout: golemLeft ? { primary: "sword", secondary: "empty" } : undefined,
      // The pair is atomic: a golem's locomotion *is* the physical supported port, and
      // `stepControlledPair` throws by name if only one side of a pair has one.
      locomotionMode: "supported",
      seeds: [0x60130001, 0x60130002],
      maxSeconds: 12,
      physics: await freshHavok(),
    });
    assert.ok(["exhausted", "time"].includes(result.ending), result.text);
    assert.ok(result.seconds > 0);
    const duelist = golemLeft ? result.right : result.left;
    assert.ok(duelist.hits > 0,
      `the duelist never reached the golem from the ${golemLeft ? "right" : "left"} corner`);
  }
});

/**
 * Twenty-five rebuilds leak nothing the arena audit can see.
 *
 * The same census `tests/integration.test.mjs` takes of a pair of Warriors, over a body with five
 * modules, a carrier port, a collision-observer per part and a base frame. Two things it is shaped
 * by: Havok's `disposeConstraint` does not remove its own debug entry, so live constraints are
 * counted by balancing the plugin's own calls; and Babylon removes an observer *asynchronously*,
 * marking it and splicing it on a zero-delay timer, so a census taken synchronously after disposal
 * has to count active observers rather than backing-array length or every correct removal reads as
 * a leak.
 */
test("twenty_five_golem_rebuilds_return_every_counted_resource_to_baseline", async (t) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => engine.dispose());
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  plugin._golemLiveConstraints = 0;
  const initConstraint = plugin.initConstraint.bind(plugin);
  plugin.initConstraint = (...args) => {
    const constraint = args[0];
    const before = constraint._pluginData?.length ?? 0;
    initConstraint(...args);
    plugin._golemLiveConstraints += (constraint._pluginData?.length ?? 0) - before;
  };
  const disposeConstraint = plugin.disposeConstraint.bind(plugin);
  plugin.disposeConstraint = (constraint) => {
    plugin._golemLiveConstraints -= constraint._pluginData?.length ?? 0;
    disposeConstraint(constraint);
  };
  scene.getPhysicsEngine().setSubTimeStep(1000 / CONFIG.world.physicsHz);
  const mat = (name) => new StandardMaterial(name, scene);
  const materials = {
    flesh: mat("flesh"), cloth: mat("cloth"), steel: mat("steel"), leather: mat("leather"),
    brass: mat("brass"), hide: mat("hide"), wood: mat("wood"), arrowAccent: mat("arrow"),
  };
  const ground = MeshBuilder.CreateBox("golem.ground", { width: 60, height: 1, depth: 60 }, scene);
  ground.position.y = -0.5;
  const slab = new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);
  slab.shape.filterMembershipMask = LAYER.WORLD;
  slab.shape.filterCollideMask = COLLIDES.WORLD;
  // Babylon installs one engine-owned observer lazily on the first physics advance. Warm that up
  // before calling anything a rebuild leak.
  scene._renderId += 1; scene._advancePhysicsEngineStep(FRAME_MS);

  const census = () => ({
    meshes: scene.meshes.length,
    materials: scene.materials.length,
    textures: scene.textures.length,
    bodies: scene.getPhysicsEngine().getBodies().length,
    constraints: plugin._golemLiveConstraints ?? 0,
    beforePhysicsObservers: scene.onBeforePhysicsObservable.observers
      .filter((observer) => !observer._willBeUnregistered).length,
    beforeRenderObservers: scene.onBeforeRenderObservable.observers
      .filter((observer) => !observer._willBeUnregistered).length,
  });

  // Every build shape the picker can reach, cycled: the default, a mace claiming both sockets, a
  // whip, a plated trunk and a ram head. A rebuild census over one build would not see a module
  // that leaks only when it is fitted.
  const base = defaultGolemSetup();
  const builds = [
    base,
    { ...base, torso: "torso.plated", head: "head.ram" },
    { ...base, primary: { chain: "wrist", terminal: "mace" },
      secondary: { chain: "wrist", terminal: "mace" } },
    { ...base, primary: { chain: "wrist", terminal: "whip" } },
    { ...base, primary: { chain: "pitch", terminal: "blade" },
      secondary: { chain: "pitch", terminal: "plate" } },
  ];
  const rebuild = (index) => {
    const setup = builds[index % builds.length];
    assert.equal(golemSetupRefusal(setup), null, `build ${index}`);
    const golem = unitDefinition("golem").build({
      scene, side: index % 2 === 0 ? "left" : "right",
      origin: new Vector3(0, 0, index % 2 === 0 ? 0 : 3),
      facing: 0, golem: setup, mind: scripted("idle", blankIntent()), materials,
    });
    let clock = 0;
    const control = () => {
      golem.observe(golem, clock);
      golem.locomotion.beginControlStep();
      golem.control.driver.step(FIXED);
      const proposal = golem.locomotion.proposal(FIXED);
      golem.locomotion.commitPhysical(proposal, proposal.displacement, FIXED);
      golem.afterLocomotion(FIXED);
      clock += FIXED;
    };
    scene.onBeforePhysicsObservable.add(control);
    scene._renderId += 1; scene._advancePhysicsEngineStep(FRAME_MS);
    scene.onBeforePhysicsObservable.removeCallback(control);
    golem.dispose();
  };
  // The first build makes Havok install one persistent engine-side observer; it belongs to the
  // warmed scene rather than to a golem, so the baseline is taken after it.
  rebuild(0);
  const baseline = census();
  for (let index = 1; index <= 25; index += 1) {
    rebuild(index);
    assert.deepEqual(census(), baseline, `golem rebuild ${index} returned every counted resource`);
  }
});
