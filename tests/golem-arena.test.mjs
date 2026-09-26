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
import { beaten, vitality } from "../src/bout.ts";
import { GOLEM_ASSEMBLY, GOLEM_RUIN, TERMINAL_MAUL } from "../src/golem/config.ts";

/** The maul's one azimuth, as the terminal declares it; the test reads it back off the body. */
const GOLEM_MAUL_SWING = TERMINAL_MAUL.limits.swingMin;
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
import { SKELETAL_REACH } from "../src/golem/skeleton/body.ts";
import { skeletonSetup } from "../src/golem/skeleton/presets.ts";
import { HAND_REACH } from "../src/hands.ts";
import { STROKE_INERTIA, strokeTimeScale } from "../src/golem/tactics.ts";
import { ATTRIBUTES, ATTRIBUTE_IDS } from "../src/golem/attributes.ts";

process.env.SWORD_MEASURE_LIBRARY = "1";
const { freshHavok, runBout } = await import("./harness/bout-runner.mjs");

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const FIXED = 1 / CONFIG.world.physicsHz;
const FRAME_MS = 1000 / 60;

/**
 * A hand slot's neutral reach, from the mouse adapter rather than written out.
 *
 * The blank below is a hand-written `Intent` and `tsc` never sees it, which is
 * the trap this directory has its own rule about -- and it went off on the day
 * Session 12 gave `HandIntent` a third positional axis. A blank with no `reach`
 * hands the chain `undefined`, `spanned` answers `NaN`, and the anchor is driven
 * at a target that is not a place: `a_walking_golems_effector_stays_on_its_own
 * _anchor` read **6031.7 mm** of stray, which is the arm having left. Taking the
 * value from `HAND_REACH` in `src/hands.ts` rather than typing 1/7 is the same
 * argument the bench script makes: a fixture that hard-codes the number would go
 * on passing after the constant it is standing in for had changed. `hands.ts`
 * imports nothing, so no test's import graph grows a scene by reading it.
 */
const blankIntent = () => ({
  forward: 0, strafe: 0, turn: 0, actingHand: "primary",
  natural: { thrust: false, guard: false },
  posture: { trunkLean: 0, trunkTwist: 0, crouch: 0 },
  primary: {
    pointerX: 0, pointerY: 0, reach: HAND_REACH.neutral,
    roll: 0, wristBend: 0, thrust: false, guard: false,
  },
  secondary: {
    pointerX: 0, pointerY: 0, reach: HAND_REACH.neutral,
    roll: 0, wristBend: 0, thrust: false, guard: false,
  },
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
 * How sockets are allocated, and how a maul claims both.
 *
 * A golem has exactly two effector sockets. Every terminal but the maul claims one; the maul is a
 * long bar with both hands on one grip and claims both, which is the same shape as the club
 * taking two hands. The assembly expresses that as **one module built into the primary socket
 * with the secondary handed over as its `companion`** -- so `plan.secondary` is null and nothing
 * is built there -- and a build asking for a maul beside anything else is refused by name rather
 * than quietly given three sockets. The mace was the two-socket terminal until the matchup set's
 * Session 02 made it one-handed; it is the control here now.
 */
test("a_two_socket_terminal_claims_both_effector_sockets_and_a_third_is_refused_by_name", () => {
  const maul = GOLEM_EFFECTORS.find((option) => option.terminal === "maul");
  assert.ok(maul, "the maul is registered on at least one chain");
  assert.equal(maul.sockets, 2);
  for (const option of GOLEM_EFFECTORS) {
    assert.equal(option.sockets, option.terminal === "maul" ? 2 : 1, option.id);
  }

  const both = {
    ...defaultGolemSetup(),
    primary: { chain: maul.chain, terminal: "maul" },
    secondary: { chain: maul.chain, terminal: "maul" },
  };
  assert.equal(golemSetupRefusal(both), null);
  const plan = golemEffectorPlan(both);
  assert.equal(plan.primary.id, maul.id);
  assert.equal(plan.secondary, null, "a maul is one module, so the second socket builds nothing");

  const mismatched = { ...both, secondary: { chain: maul.chain, terminal: "blade" } };
  const refusal = golemSetupRefusal(mismatched);
  assert.match(refusal ?? "", /three effector sockets/);
  assert.match(refusal ?? "", /maul/);

  // The control: a mace beside a blade is two one-socket modules and builds both.
  const mace = GOLEM_EFFECTORS.find((option) => option.terminal === "mace");
  assert.ok(mace && mace.sockets === 1, "the mace is one-handed");
  const pair = { ...both, primary: { chain: mace.chain, terminal: "mace" },
    secondary: { chain: mace.chain, terminal: "blade" } };
  assert.equal(golemSetupRefusal(pair), null);
  assert.ok(golemEffectorPlan(pair).secondary, "a mace leaves the second socket to be built");
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
 *
 * **A shield is the one part that must weigh nothing**, and it is asked for here through the same
 * door the narrowphase uses rather than by reading a key: a part `parriedBy` answers for is a
 * part no wound can land on, and one that carried a share of the bar would be a share of the bar
 * that nothing could ever move. The owner asked for "an indestructible damage sink"; a golem 22 %
 * of which cannot be killed is a different thing, and this is the assertion that keeps them apart.
 */
test("an_assembled_golems_weights_are_its_own_and_a_wholly_ruined_body_reaches_zero", async (t) => {
  const stand = await standAGolem(t);
  const limbs = stand.golem.limbs;
  assert.ok(limbs.length > 0);
  let sum = 0;
  const parriers = [];
  for (const limb of limbs) {
    assert.equal(typeof limb.vitalityWeight, "number", `${limb.key} declares no vitality weight`);
    const parry = stand.golem.parriedBy(limb.part.body);
    if (parry !== null) {
      parriers.push(parry.kind);
      assert.equal(limb.vitalityWeight, 0, `${limb.key} stops blows and still carries bar`);
      continue;
    }
    assert.ok(limb.vitalityWeight > 0, `${limb.key} weighs nothing`);
    sum += limb.vitalityWeight;
  }
  // The plate and, since 2026-09-23, the blade: a held weapon is equipment and wounds nothing.
  assert.deepEqual(parriers.sort(), ["shield", "sword"],
    `the default golem's plate and blade are its parriers, and these answered: ${parriers.join(", ")}`);
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

/**
 * **A maul pins the swing, and the assembled body's published envelope says so.**
 *
 * Session 04 left this owed in as many words for the mace, and the matchup set's Session 02
 * moved it to the maul: `TERMINAL_MAUL.limits` sets `swingMin = swingMax`, so a golem carrying
 * one cannot turn its weapon with its arm and has to turn with the torso or the carrier's yaw,
 * and the mind reads that rather than discovers it. The terminal declares it, the chain folds it
 * into its own limits before it publishes anything, and this asks the *assembled* body -- which
 * is the only place the two halves meet.
 *
 * The blade and the one-handed mace beside it are the controls, and they are what make this test
 * say something: an envelope that reported one azimuth for every build would pass the maul half
 * on its own.
 */
test("a_maul_pins_the_swing_on_the_envelope_the_assembled_golem_publishes", async (t) => {
  const base = defaultGolemSetup();
  const blade = await standAGolem(t);
  const wide = blade.golem.effectorEnvelope("primary")?.reachable;
  assert.ok(wide, "a blade on the top chain publishes a reachable set");
  assert.ok(wide.swingMax - wide.swingMin > 0.5,
    `the control's swing spans ${(wide.swingMax - wide.swingMin).toFixed(3)} rad`);

  const maul = await standAGolem(t, {
    setup: {
      ...base,
      primary: { chain: "wrist", terminal: "maul" },
      secondary: { chain: "wrist", terminal: "maul" },
    },
  });
  const pinned = maul.golem.effectorEnvelope("primary")?.reachable;
  assert.ok(pinned, "a maul publishes a reachable set too");
  // `Math.abs`, because `ReachEnvelope.swing` is outboard-signed: the maul's one azimuth is
  // inboard of the socket by half a radian, and which sign that arrives with is the socket's
  // business. Asserting the magnitude and the zero span says the thing meant -- there is one
  // azimuth here, and it is not straight ahead.
  assert.equal(Math.abs(pinned.swingMin), Math.abs(GOLEM_MAUL_SWING));
  assert.equal(pinned.swingMax - pinned.swingMin, 0);
  // Both sockets answer, because one module fills both, and both answer the same span --
  // which is the honest description of one bar held in two hands.
  const other = maul.golem.effectorEnvelope("secondary")?.reachable;
  assert.ok(other);
  assert.equal(other.swingMax - other.swingMin, 0);
  assert.equal(other.reachMax, pinned.reachMax);
  // The roll goes with it: a maul has no edge, so there is nothing for a wrist to point, and the
  // wrist could not hold 48 kg bent anyway.
  const roll = maul.golem.effectorEnvelope("primary")?.axes.find((axis) => axis.id === "roll");
  assert.ok(roll, "rung 3 publishes a roll axis whatever is on the end of it");
  assert.equal(Math.abs(roll.min), 0);
  assert.equal(Math.abs(roll.max), 0);

  // The second control: a one-handed mace on the same chain swings and rolls with it.
  const mace = await standAGolem(t, {
    setup: { ...base, primary: { chain: "wrist", terminal: "mace" } },
  });
  const free = mace.golem.effectorEnvelope("primary")?.reachable;
  assert.ok(free && free.swingMax - free.swingMin > 0.5, "a one-handed mace swings with its arm");
  const maceRoll = mace.golem.effectorEnvelope("primary")?.axes.find((axis) => axis.id === "roll");
  assert.ok(maceRoll && maceRoll.max > 0, "a one-handed mace rolls with its wrist");
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
    // Only the piece the blow destroyed is spent. The rest of the arm leaves with its health
    // intact, because what losing an arm costs is the weapon, the reach and the guard -- not a
    // share of the vitality bar sized to the whole module. See `Golem.sever`.
    if (limb === arm[arm.length - 1]) assert.equal(limb.health, 0, limb.key);
    else assert.ok(limb.health > 0, `${limb.key} was zeroed at ${limb.health}`);
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
 * A plate that has been cut off stops blocking, which is the one line a shield needed of its own.
 *
 * A shield is refused by `limbFor`, so a contact with one never reaches the line in
 * `Combat.onContact` that drops a blow on a severed part -- and a severed arm re-layers onto
 * `DEBRIS`, which blades still collide with. Without this the golem would go on parrying with an
 * arm somebody had cut off and left on the floor. Asserted at the seam rather than through a
 * bout, because what is being checked is one predicate with a before and an after.
 */
test("a_severed_plate_is_debris_and_stops_answering_for_the_golem", async (t) => {
  const stand = await standAGolem(t);
  stand.run(1.0);
  const arm = moduleLimbs(stand.golem, "secondary");
  const plate = arm.find((limb) => stand.golem.parriedBy(limb.part.body) !== null);
  assert.ok(plate !== undefined, `the secondary arm carries no shield: ${arm.map((l) => l.key).join(", ")}`);
  assert.deepEqual(stand.golem.parriedBy(plate.part.body), { kind: "shield" });
  assert.equal(stand.golem.limbFor(plate.part.body), undefined, "a shield is addressable as a limb");

  stand.golem.sever(arm[arm.length - 1], new Vector3(-1, 0.2, 0));
  assert.equal(plate.severed, true, "the plate stayed on an arm that came off");
  assert.equal(stand.golem.parriedBy(plate.part.body), null,
    "a plate lying on the floor still parried for the body it fell off");
  // And it is still not a limb, so the contact is dropped rather than resolved as a wound: both
  // doors have to be shut or a blade would start scoring on debris.
  assert.equal(stand.golem.limbFor(plate.part.body), undefined);
  assert.equal(stand.golem.alive, true, "an arm off is a golem with a problem, not a dead golem");
});

/**
 * A whip is a weapon the golem holds, not a body it is made of: every bead parries as the lash and
 * none can be wounded or carry any of the bar. The owner, 2026-09-22: "its parts should not count
 * as body parts, these are segments of a weapon."
 *
 * Every bead rather than the business end, because a lash is eight bodies and a blow finds
 * whichever one is in the way; and the arm that holds it is asserted to stay flesh, because the
 * rule is about the weapon and a whip that made its arm a parry would be an arm nothing can hurt.
 */
test("a_whips_beads_are_equipment_that_parries_and_its_arm_is_still_flesh", async (t) => {
  const stand = await standAGolem(t, {
    setup: { ...defaultGolemSetup(), primary: { chain: "wrist", terminal: "whip" } },
  });
  const arm = moduleLimbs(stand.golem, "primary");
  const beads = arm.filter((limb) => limb.key.includes(".whip."));
  assert.equal(beads.length, 9, `the whip has ${beads.length} beads and weight: ${arm.map((l) => l.key).join(", ")}`);
  assert.ok(beads.some((limb) => limb.key.endsWith(".whip.weight")), "the whip has no weight on its end");
  for (const bead of beads) {
    assert.deepEqual(stand.golem.parriedBy(bead.part.body), { kind: "whip" }, `${bead.key} does not parry`);
    assert.equal(stand.golem.limbFor(bead.part.body), undefined, `${bead.key} can be wounded`);
    assert.equal(bead.vitalityWeight, 0, `${bead.key} carries a share of the bar`);
  }
  const flesh = arm.filter((limb) => !beads.includes(limb));
  assert.ok(flesh.length > 0, "the whip arm has no links of its own");
  for (const link of flesh) {
    assert.equal(stand.golem.limbFor(link.part.body), link, `${link.key} cannot be wounded`);
    assert.ok(link.vitalityWeight > 0, `${link.key} weighs nothing`);
  }
});

/**
 * What an arm costs is the arm, not the fight.
 *
 * `Golem.sever` used to zero every part of the module, so a blade cut off at the wrist booked the
 * whole arm's vitality weight -- 0.854 against a bar of 1 -- and one good cut was the fight. It
 * destroys only the piece the blow found now, and the rest of the module detaches still carrying
 * its health. What losing the arm takes instead is the weapon on the end of it, its reach and its
 * guard, all of which the same loop takes by putting the module on `DEBRIS`.
 *
 * The bar is a third, stated generously on purpose: the exact figure depends on which piece of
 * which chain the blow found, and what this pins is that no single sever is most of a body.
 */
test("a_severed_arm_costs_capability_rather_than_most_of_the_vitality_bar", async (t) => {
  const stand = await standAGolem(t);
  stand.run(1.0);
  const arm = moduleLimbs(stand.golem, "primary");
  const struck = arm[arm.length - 1];
  const before = vitality(stand.golem.limbs);
  assert.equal(before, 1, `an untouched golem reads ${before}`);

  stand.golem.sever(struck, new Vector3(1, 0.2, 0));
  const after = vitality(stand.golem.limbs);
  assert.ok(after > 2 / 3,
    `a severed arm should cost under a third of the bar, and cost ${(before - after).toFixed(3)}`);
  assert.equal(stand.golem.alive, true, "and the golem is still in the fight");
});

/**
 * **A ruined arm hangs.** A piece of an arm at zero health is still attached, and until 2026-09-22
 * it went on swinging at full authority. Now the whole arm lets go of its motors and stops
 * answering its command -- and it stays on the golem, which is the difference from a sever.
 *
 * The secondary arm is the control, commanded identically throughout: the test is that the
 * ruined arm falls **and the whole one does not**, so a golem that sagged for some other reason,
 * or a raise that never arrived, reads red rather than green. Health is written directly rather
 * than through a blow, because the rule reads a level and must not care what emptied it -- the
 * overtime drain writes it just the same way.
 */
test("a_ruined_arm_hangs_limp_and_stays_on_while_the_whole_one_holds_its_raise", async (t) => {
  const stand = await standAGolem(t);
  for (const hand of ["primary", "secondary"]) stand.intent[hand].pointerY = 0.9;
  stand.run(2.0);
  const tipY = (hand) => stand.golem.effectorView(hand).tip.y;
  const raised = { primary: tipY("primary"), secondary: tipY("secondary") };

  const forearm = moduleLimbs(stand.golem, "primary").find((limb) => limb.key.endsWith(".forearm"));
  assert.ok(forearm, "the default primary arm has a forearm");
  forearm.health = 0;
  // And it is still commanded: a limp arm is one that does not answer, not one nobody asked.
  stand.intent.primary.pointerX = 0.8;
  stand.run(2.0);

  const drop = { primary: raised.primary - tipY("primary"), secondary: raised.secondary - tipY("secondary") };
  assert.ok(drop.primary > 0.4,
    `the ruined arm's tip fell only ${(drop.primary * 1000).toFixed(0)} mm from ${raised.primary.toFixed(2)} m`);
  assert.ok(Math.abs(drop.secondary) < 0.1,
    `the whole arm's tip moved ${(drop.secondary * 1000).toFixed(0)} mm, so the drop is not the ruin's`);
  assert.equal(forearm.severed, false, "a ruined arm is not a severed one");
  assert.equal(stand.golem.alive, true);
});

/**
 * **A ruined leg hobbles.** The carrier moves a golem and the legs only sell it, so slack joints
 * alone would change nothing about how fast it walks; what a ruined leg takes is the carrier's
 * share of the command (`hobble` in `src/golem/locomotion.ts`). Measured as walking speed over
 * the same stretch of the same walk either side of the ruin, so the golem is its own control.
 * Short windows, because the stand's floor authority stops a walker 12.66 m out.
 */
test("a_ruined_leg_slows_the_walk_by_its_share_and_a_whole_one_does_not", async (t) => {
  const stand = await standAGolem(t);
  stand.intent.forward = 1;
  stand.run(1.0);
  const ground = () => ({ x: stand.golem.view.self.ground.x, z: stand.golem.view.self.ground.z });
  const pace = (seconds) => {
    const from = ground();
    stand.run(seconds);
    const to = ground();
    return Math.hypot(to.x - from.x, to.z - from.z) / seconds;
  };
  const whole = pace(1.0);
  const shin = moduleLimbs(stand.golem, "legs").find((limb) => limb.key.endsWith(".shinL"));
  assert.ok(shin, "the default golem has a left shin");
  shin.health = 0;
  stand.run(0.5);
  const hobbled = pace(1.0);
  const expected = 1 - (1 - GOLEM_RUIN.strippedMobility) / 2;
  assert.ok(whole > 0.5, `the whole golem walked at ${whole.toFixed(2)} m/s`);
  assert.ok(Math.abs(hobbled / whole - expected) < 0.1,
    `one ruined leg left ${(hobbled / whole).toFixed(3)} of the pace, against ${expected}`);
  assert.equal(stand.golem.alive, true);
});

/**
 * A decapitated stone golem is dead, and the bout's own rule is what says so.
 *
 * The stone head module declares its head part fatal and the locomotion module declares its pelvis
 * fatal, so `beaten()` reads the same two flags a `Fighter`'s head and torso set. This asserts
 * both halves: the body stops being driven, and the pure rule agrees. The skeleton, whose skull is
 * not fatal, is `a_decapitated_skeleton_is_not_beaten` below.
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
// The skeleton: the same assembly in bone.
// ---------------------------------------------------------------------------------------

/** The summed mass of the named modules' bodies, read back from Havok. */
const massOf = (golem, slots) => slots.flatMap((slot) => moduleLimbs(golem, slot))
  .reduce((sum, limb) => sum + limb.part.body.getMassProperties().mass, 0);

/** What \`Golem.applyDamage\` lets through of a blow of 10 of each armoured kind, health restored. */
function damageByKind(golem, limb) {
  const health = limb.health;
  const applied = {};
  for (const kind of ["cut", "thrust", "slap", "crush"]) {
    applied[kind] = Math.round(golem.applyDamage(limb, 10, kind) * 1e6) / 1e6;
    limb.health = health;
  }
  return applied;
}

/**
 * A skeleton is light, and the lightness is in the collider and not only in the shell.
 *
 * The arms are left out whole: each holds the same terminal in both bodies, which would blur the
 * comparison. Legs, trunk and head weigh 21.3 kg against stone's 75.0, or 0.28, so the bound is not
 * tight. The forearm's collider is read back from Havok, which stores float32 -- hence a part in a
 * million -- because a table radius that never reached the collider is a thin bone drawn around a
 * stone one.
 */
test("a_skeleton_trunk_and_legs_weigh_under_a_third_of_stone", async (t) => {
  const bone = await standAGolem(t, { setup: skeletonSetup() });
  const stone = await standAGolem(t);
  const body = ["legs", "trunk", "head"];
  const ratio = massOf(bone.golem, body) / massOf(stone.golem, body);
  assert.ok(ratio < 1 / 3, `a skeleton's legs, trunk and head weigh ${ratio.toFixed(3)} of stone's`);

  const fore = moduleLimbs(bone.golem, "primary").find((limb) => limb.key.endsWith(".forearm"));
  assert.ok(fore, "the skeletal arm has no forearm");
  const extent = fore.part.shape.getBoundingBox().extendSize;
  assert.ok(Math.abs(extent.x - SKELETAL_REACH.foreRadius) < 1e-6
    && Math.abs(extent.z - SKELETAL_REACH.foreRadius) < 1e-6,
    `the forearm's collider is ${extent.x} by ${extent.z} across`);
});

/**
 * Fatality is each module's own declaration: a skeleton's ribcage ends it and its skull does not.
 * Stone is asserted beside it, so the two bodies cannot drift to the same answer unnoticed.
 */
test("the_ribcage_is_fatal_and_the_skull_is_not", async (t) => {
  for (const [label, setup, expected] of [
    ["skeleton", skeletonSetup(), ["legs.pelvis", "trunk.core"]],
    ["stone", defaultGolemSetup(), ["legs.pelvis", "head.head"]],
  ]) {
    const { golem } = await standAGolem(t, { setup });
    const fatal = golem.limbs.filter((limb) => limb.fatal === true).map((limb) => limb.key);
    assert.deepEqual(fatal, expected.map((id) => `${golem.side}.golem.${id}`), label);
  }
});

/**
 * Every piece of a skeleton is bone, and bone turns an edge and not a club.
 *
 * The whole table is compared per part rather than two of its kinds. The plate is left out
 * because `limbFor` refuses a shield, so no blow reaches it as a wound; the blade is the same steel
 * stone carries and takes every kind in full.
 */
test("every_skeleton_part_is_bone_armoured", async (t) => {
  const { golem } = await standAGolem(t, { setup: skeletonSetup() });
  const blade = `${golem.side}.golem.primary.blade`;
  const plate = `${golem.side}.golem.secondary.plate`;
  const body = golem.limbs.filter((limb) => limb.key !== blade && limb.key !== plate);
  assert.equal(body.length, golem.limbs.length - 2, "the skeleton carries no blade and plate");
  for (const limb of body) {
    assert.deepEqual(damageByKind(golem, limb), { cut: 5, thrust: 4, slap: 10, crush: 10 }, limb.key);
  }
  assert.deepEqual(damageByKind(golem, golem.limbs.find((limb) => limb.key === blade)),
    { cut: 10, thrust: 10, slap: 10, crush: 10 }, "the blade is steel, not bone");
});

/**
 * Bone takes a club better than a blade, at the body's own seam.
 *
 * This is the test that catches `Golem.applyDamage` passing a constant kind -- the mutation
 * session 02 could not reach, because until a part answered two kinds differently a constant kind
 * read exactly like the right one. Stone's forearm is the control: one fraction for every blow.
 */
test("bone_takes_a_club_better_than_a_blade", async (t) => {
  for (const [label, setup, ratio] of [["skeleton", skeletonSetup(), 2], ["stone", defaultGolemSetup(), 1]]) {
    const { golem } = await standAGolem(t, { setup });
    const fore = moduleLimbs(golem, "primary").find((limb) => limb.key.endsWith(".forearm"));
    const { cut, crush } = damageByKind(golem, fore);
    assert.ok(cut > 0, `a ${label} forearm takes nothing from a cut`);
    assert.equal(crush / cut, ratio, `a ${label} forearm takes ${crush} from a club and ${cut} from a blade`);
  }
});

/**
 * A decapitated skeleton is not beaten, and walks on.
 *
 * The stone half is `a_decapitated_golem_is_dead_and_the_bouts_own_rule_agrees` above, so each
 * direction fails on its own name. Severing the neck takes the whole head module off, and neither
 * of its parts is fatal on a skeleton; what it costs is the neck's share of the bar.
 */
test("a_decapitated_skeleton_is_not_beaten", async (t) => {
  const stand = await standAGolem(t, { setup: skeletonSetup() });
  stand.run(1.0);
  const head = moduleLimbs(stand.golem, "head");
  assert.ok(head.length > 0, "the skeleton has no head module");
  assert.ok(head.every((limb) => limb.fatal !== true), "a skull or neck is declared fatal");
  stand.golem.sever(head[0], new Vector3(0, 1, 0));
  assert.ok(head.every((limb) => limb.severed), "the head module stayed on");
  assert.equal(stand.golem.alive, true);
  assert.equal(beaten(stand.golem.limbs), false);
  const left = vitality(stand.golem.limbs);
  assert.ok(left > 0.8, `a skeleton without its head reads ${left.toFixed(3)} of its bar`);

  stand.intent.forward = 1;
  // `.clone()`, never a spread: see the stone test above.
  const before = stand.golem.view.self.ground.clone();
  stand.run(1.5);
  const after = stand.golem.view.self.ground;
  const walked = Math.hypot(after.x - before.x, after.z - before.z);
  assert.ok(walked > 0.2, `a headless skeleton walked ${walked.toFixed(2)} m`);
});

/**
 * Cutting a skeleton's spine ends it, although the spine is not itself fatal.
 *
 * Severing is module-level: a cut through the waist takes the whole trunk module off at its
 * socket, ribcage included, and the ribcage is fatal. This pins that consequence, so a change that
 * severs only the piece struck has to change this test and decide what a skeleton cut in half is.
 */
test("severing_the_spine_ends_a_skeleton", async (t) => {
  const stand = await standAGolem(t, { setup: skeletonSetup() });
  stand.run(1.0);
  const waist = moduleLimbs(stand.golem, "trunk").find((limb) => limb.key.endsWith(".waist"));
  assert.ok(waist, "the skeleton's trunk has no waist");
  assert.notEqual(waist.fatal, true, "the spine is declared fatal on its own");
  stand.golem.sever(waist, new Vector3(1, 0.2, 0));
  assert.equal(stand.golem.alive, false);
  assert.equal(beaten(stand.golem.limbs), true);
});

/**
 * A skeleton's arm costs under a third of the bar, its skull less than a stone head, and a leg
 * ends it.
 *
 * `Golem.sever` zeroes only the piece the blow found, so what a sever costs is that piece's share
 * of the bar. The arm is severed through its dearest piece, which is the most one arm sever can
 * cost, and it must cost under a third: the rule
 * `a_severed_arm_costs_capability_rather_than_most_of_the_vitality_bar` states for stone. It is not
 * asserted to cost less than stone's arm, because it does not: the skull and neck carry less of
 * the bar than stone's head, `Golem.scaleVitality` spreads the difference over every other piece,
 * and on 2026-09-22 the upper arm was the dearest in both bodies at 0.288 of a skeleton's bar
 * against 0.266 of stone's. The head is severed through the skull, the dearer of its two pieces,
 * and must cost less than a stone head's sever (0.144 against 0.443 that day), measured here on a
 * stone stand rather than written as a bound, because the weights are what gets tuned. A leg
 * belongs to the locomotion module, which carries the fatal pelvis, so it ends the fight: the
 * owner's rule, which they may revisit. Each on a fresh stand.
 */
test("a_skeleton_arm_costs_under_a_third_its_skull_less_than_a_stone_head_and_a_leg_ends_it", async (t) => {
  const sever = async (setup, module, pick) => {
    const stand = await standAGolem(t, { setup });
    stand.run(1.0);
    const struck = pick(moduleLimbs(stand.golem, module));
    assert.ok(struck, `no piece to sever in ${module}`);
    const before = vitality(stand.golem.limbs);
    stand.golem.sever(struck, new Vector3(1, 0.2, 0));
    return { golem: stand.golem, struck, cost: before - vitality(stand.golem.limbs) };
  };
  const dearest = (limbs) => limbs.reduce((a, b) => (b.vitalityWeight > a.vitalityWeight ? b : a));

  const arm = await sever(skeletonSetup(), "primary", dearest);
  assert.ok(arm.cost < 1 / 3, `severing the skeleton's arm at ${arm.struck.key} cost ${arm.cost.toFixed(3)}`);
  assert.equal(arm.golem.alive, true);

  const skull = await sever(skeletonSetup(), "head", (limbs) => limbs.find((limb) => limb.key.endsWith(".head")));
  const stone = await sever(defaultGolemSetup(), "head", (limbs) => limbs.find((limb) => limb.fatal === true));
  assert.ok(skull.cost < stone.cost,
    `a skull costs ${skull.cost.toFixed(3)} of the bar and a stone head ${stone.cost.toFixed(3)}`);
  assert.equal(skull.golem.alive, true);
  assert.equal(beaten(skull.golem.limbs), false);

  const leg = await sever(skeletonSetup(), "legs", (limbs) => limbs.find((limb) => limb.key.endsWith(".thighL")));
  assert.equal(leg.golem.alive, false, "a skeleton stood on after losing a leg");
  assert.equal(beaten(leg.golem.limbs), true);
});

/**
 * A headless skeleton is aimed at from its neck socket; a headless stone golem is a corpse whose
 * published crown stays where it was built.
 *
 * `crownHeight` is fixed at build, and tactics v2 to v4 aim halfway between it and the shoulder,
 * so on a skeleton fighting on without its head the build-time number is the air where the skull
 * was. The stone half is the `alive` guard. `describe` is called into the golem's own view record
 * rather than read off a perception step, because a dead body's step may never publish again and
 * an unchanged number would then be an unrefreshed one.
 */
test("a_headless_skeleton_publishes_its_neck_as_its_crown", async (t) => {
  for (const [family, setup] of [["skeleton", skeletonSetup()], ["stone", defaultGolemSetup()]]) {
    const stand = await standAGolem(t, { setup });
    stand.run(0.5);
    const view = stand.golem.view.self;
    stand.golem.describe(view);
    const crown = view.crownHeight;
    const head = moduleLimbs(stand.golem, "head");
    const headReach = stand.golem.headModule.envelope().reach;
    assert.ok(headReach > 0.05, `${family}: the head reaches ${headReach} m`);
    stand.golem.sever(head[0], new Vector3(0, 1, 0));
    assert.ok(head.every((limb) => limb.severed), `${family}: the head module stayed on`);
    stand.golem.describe(view);
    if (family === "skeleton") {
      assert.equal(stand.golem.alive, true);
      assert.ok(Math.abs(crown - view.crownHeight - headReach) <= 1e-9,
        `the crown went from ${crown} to ${view.crownHeight} for a head reaching ${headReach}`);
    } else {
      assert.equal(stand.golem.alive, false);
      assert.equal(view.crownHeight, crown, "a dead stone golem's crown moved");
    }
  }
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
test("a_golem_reaches_a_verdict_against_a_live_opponent_from_either_corner", async () => {
  for (const golemLeft of [true, false]) {
    const result = runBout({
      left: golemLeft ? "idle" : "golem-duelist",
      right: golemLeft ? "golem-duelist" : "idle",
      leftUnit: "golem", rightUnit: "golem",
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

// Who wins is session 08's business; this asserts that the fight happens from either corner.
test("a_skeleton_reaches_a_verdict_from_either_corner", async () => {
  for (const skeletonLeft of [true, false]) {
    const corner = skeletonLeft ? "left" : "right";
    const result = runBout({
      left: skeletonLeft ? "skeleton-duelist" : "golem-duelist",
      right: skeletonLeft ? "golem-duelist" : "skeleton-duelist",
      leftUnit: "golem", rightUnit: "golem",
      leftGolem: skeletonLeft ? skeletonSetup() : defaultGolemSetup(),
      rightGolem: skeletonLeft ? defaultGolemSetup() : skeletonSetup(),
      locomotionMode: "supported",
      seeds: [0x60130003, 0x60130004],
      maxSeconds: 12,
      physics: await freshHavok(),
    });
    assert.ok(["exhausted", "time"].includes(result.ending), `skeleton on the ${corner}: ${result.text}`);
    assert.ok(result.seconds > 0);
    assert.ok(result.left.hits > 0 && result.right.hits > 0,
      `skeleton on the ${corner}: hits ${result.left.hits} to ${result.right.hits}, ${result.text}`);
  }
});

/**
 * Session 01 of the style set's two contact rules, read off one real golem-versus-golem bout.
 *
 * **The rake is what this is against.** Before the rule, a blade that swept through a torso was
 * billed once every `hitCooldown` -- 0.09 s -- for as long as the two bodies stayed in contact,
 * so one pass of one weapon scored 6.6 to 7.2 times and the owner's "flail around" was, in the
 * numbers, a scoring system that paid for it (Session 00's baseline, in `docs/measurements.md`).
 * A golem striker now claims a part for `strokeClaimSeconds`; the Warrior's weapons do not set the
 * flag, which is why `scoring.test.mjs` and every pinned Warrior cell are unmoved.
 *
 * The half that is easy to overdo is asserted beside it: a rule that let a stroke bill *one* part
 * would have replaced a rake with a poke, and a sword swept across a body should reach an arm and
 * then a chest. So the claim is per part, and a stroke here still bills 2.29 of them.
 *
 * **A plate is a shield and nothing can wound it**, at the owner's word, 2026-09-06: "the shield
 * is an indestructible damage sink". The mechanism is not a large health number, and this is why
 * the hundred blows the plan asked for are not counted out one by one -- the plate is not
 * addressable as a limb at all. `Golem.limbFor` refuses its body, so `Combat.onContact` finds
 * nothing to wound and takes the parry path that a Warrior's shield has always taken; the 53
 * blows this fixture happens to land on it and ten thousand more would leave the same 35 points.
 * Its vitality weight is zero for the other half of the same sentence: a part no blow can reach
 * that still carried a share of the bar would be a share of the bar nothing could ever move.
 *
 * **A held blade parries exactly as the plate does, since 2026-09-23.** It used to be a parry
 * that cost the blade, and a blade beaten to nothing took its arm off; the owner asked that a held
 * weapon take no damage, so it is equipment and a blow on it is a `block:sword` report worth
 * nothing. An arm link is still the other kind of block: booked as one and wounded all the same.
 * The accounting is asserted as an identity rather than a threshold -- every block either body
 * books is either a parry by the plate or the blade or a blow that found an arm, with no fourth
 * source and nothing counted twice.
 */
test("a_golem_stroke_claims_each_part_once_and_a_plate_only_ever_blocks", async () => {
  const setup = defaultGolemSetup();
  const events = [];
  const snapshot = {};
  // Read the bodies while they are still alive. `runBout` disposes both at the verdict and a
  // golem's `dispose` empties its own limb list, so a body asked afterwards reads as no body.
  //
  // **Accumulated over the bout rather than read at the end of it, since 2026-09-19.** The last
  // sample was fine while the shield arm always survived twelve seconds, and at the re-derived
  // `healthScale` it does not always: a plate whose arm has been cut off answers `parriedBy` with
  // null, so the body read as carrying no shield and the test called that a missing plate. That
  // is the test asking a structural question at a moment that can have a severing in front of it.
  //
  // Everything asserted here is a property of the *build* -- one plate, weight zero, not
  // addressable as a limb -- and those are true from the first frame. The one claim that is about
  // the bout is that nothing ever wounds it, and a claim about "ever" wants every sample, not the
  // final one. So the plate is found once, and then watched.
  const read = (side, golem) => {
    // The plate alone: a held blade answers `parriedBy` too since 2026-09-23, as a sword.
    const shields = golem.limbs.filter((limb) => golem.shields.get(limb.part.body)?.kind === "shield")
      .map((limb) => ({
        key: limb.key, health: limb.health, maxHealth: limb.maxHealth,
        weight: limb.vitalityWeight, addressable: golem.limbFor(limb.part.body) !== undefined,
        severed: limb.severed, blocks: golem.parriedBy(limb.part.body) !== null,
      }));
    const held = golem.limbs
      .filter((limb) => limb.guarding === true && limb.health < limb.maxHealth - 1e-9)
      .map((limb) => limb.key);
    const had = snapshot[side];
    snapshot[side] = {
      shields,
      // The worst each plate ever read, which is what "never wounded" has to be measured against.
      worst: shields.map((plate, at) => Math.min(plate.health, had?.worst?.[at] ?? Infinity)),
      // Whether it stopped blocking at any point while still attached -- the failure the last
      // sample was standing in for, and which a severing is not.
      quietlyStopped: shields.some((plate, at) =>
        (!plate.blocks && !plate.severed) || (had?.quietlyStopped?.[at] ?? false)),
      woundedHeld: [...new Set([...(had?.woundedHeld ?? []), ...held])],
    };
  };
  // **Three bouts, because one stopped being a corpus.**
  //
  // Everything below is a rule about an individual event -- a stroke claims a part once, a plate
  // only ever blocks, a held weapon is booked and wounded -- and each needs a pile of events to be
  // a reading rather than an anecdote. The pile came from a single 12-second bout, and four
  // separate floors over it went red on 2026-09-18 in the space of one afternoon: 100 contacts
  // read 98, 25 plate blocks read 24, 20 second-blows read 9, and the blade that is meant to be
  // marked by parrying was not marked in that particular bout. The bout had not broken. It had got
  // shorter and cleaner, twice over -- the golems stopped flailing when the arm chains were
  // corrected for the sword they carry, and then fights started ending by exhaustion in eleven
  // seconds instead of running to the cap, which is the whole of what Phase 2 set out to do.
  //
  // Lowering a floor each time that happens is answering the wrong question. The claims are not
  // about how busy a bout is; they hold over any bout, so the honest repair is to give them more
  // bouts rather than a thinner one. Three seed pairs, accumulated. The floors below stay rates
  // over the total, because a rate is what stopped them being about the cap in the first place.
  const SEED_PAIRS = [
    [0x57010001, 0x57010002],
    [0x57010003, 0x57010004],
    [0x57010005, 0x57010006],
  ];
  const woundedHeld = { left: new Set(), right: new Set() };
  const plateKeys = new Set();
  let totalSeconds = 0;
  let blocksBooked = 0;
  for (const [bout, seeds] of SEED_PAIRS.entries()) {
    const result = runBout({
      left: "golem-fencer", right: "golem-duelist",
      leftUnit: "golem", rightUnit: "golem",
      leftGolem: setup, rightGolem: setup,
      locomotionMode: "supported",
      seeds,
      maxSeconds: 12,
      physics: await freshHavok(),
      onSample: ({ left, right }) => { read("left", left); read("right", right); },
      // Tagged with the bout, because `report.at` restarts at zero in each one: a claim key
      // that spanned two bouts read its second blow 7.45 s *before* its first.
      onEvent: (event) => events.push({ ...event, bout }),
    });
    totalSeconds += result.seconds;
    blocksBooked += result.left.blocks + result.right.blocks;
    // The plate's own claims are structural and are asserted per bout, because "it carries one
    // plate and the plate came out whole" is a statement about a body and not about a corpus.
    for (const side of ["left", "right"]) {
      for (const key of snapshot[side].woundedHeld) woundedHeld[side].add(key);
      assert.equal(snapshot[side].shields.length, 1,
        `${side} carried ${snapshot[side].shields.length} shields rather than its one plate`);
      const [plate] = snapshot[side].shields;
      plateKeys.add(plate.key);
      assert.equal(snapshot[side].worst[0], plate.maxHealth,
        `${plate.key} was wounded to ${snapshot[side].worst[0]} of ${plate.maxHealth} during the`
        + " bout, and a shield is an indestructible damage sink");
      assert.equal(snapshot[side].quietlyStopped, false,
        `${plate.key} stopped answering as a shield while it was still attached`);
      assert.equal(plate.weight, 0, `${plate.key} carries a share of a bar it can never lose`);
      assert.equal(plate.addressable, false, `${plate.key} is still addressable as a limb`);
    }
  }

  // A ram's lunge reports with no hand and is a control event rather than a contact; the default
  // build has none, and this is what says so instead of assuming it.
  const contacts = events.filter((event) => event.hand !== null);
  assert.equal(contacts.length, events.length, "a handless contact came off a build with no ram");
  // **The three corpus floors in this test are rates, and all three moved together on
  // 2026-09-18.** They exist so that the per-event claims below are made about something rather
  // than about an empty list, and they were written as counts over a 12-second bout: 100 contacts,
  // 25 plate blocks, 50 blows on a held part. Two of the three went red at once -- 98 and 24 --
  // and not because the bout stopped happening. The golems stopped flailing. Correcting the arm
  // chains for the sword they actually carry (the account is beside `CHAIN_PITCH.motorTorque`)
  // took a mirror from 2989 contacts to 2014 while the real blows in them held at 214 and 212, so
  // a third of what these were counting was a blade being leaned on. **A floor that goes red when
  // two fighters stop bumping into each other is measuring the bump**, which is the thing this
  // whole phase is trying to get rid of.
  //
  // So each is restated as a rate with room under the reading, because the failure they guard
  // against is a bout that did not happen and that failure is nowhere near any of them. Measured
  // here, 12.0 s: 98 contacts (8.2 a second), 24 plate blocks (2.0), and the held-part blows
  // likewise well clear. The floors are 5, 1 and 3 a second.
  const rate = (n) => n / totalSeconds;
  assert.ok(rate(contacts.length) > 5,
    `only ${contacts.length} contacts in ${totalSeconds.toFixed(1)} s, which is `
    + `${rate(contacts.length).toFixed(1)} a second`);
  const wounds = contacts.filter((event) => !event.blocked);
  const blocked = contacts.filter((event) => event.blocked);
  const shieldBlocks = blocked.filter((event) => event.report.key === "block:shield");
  const bladeParries = blocked.filter((event) => event.report.key === "block:sword");
  const guardedHits = contacts.filter((event) => event.guarded === true);

  // --- one claim per part per stroke ---------------------------------------------------------
  let tightest = Infinity;
  let repeats = 0;
  const lastAt = new Map();
  for (const event of wounds) {
    const claim = `${event.bout}${event.side}\u0000${event.effectorId}\u0000${event.report.key}`;
    const prior = lastAt.get(claim);
    if (prior !== undefined) { tightest = Math.min(tightest, event.report.at - prior); repeats += 1; }
    lastAt.set(claim, event.report.at);
  }
  // The fourth corpus floor in this test, restated as a rate on 2026-09-18 for the reason written
  // out at the first of them above. This one is a corpus for the assertion directly below it --
  // `tightest` is only a reading if there were second blows to read -- and it read `> 20` over a
  // bout that used to run twice as long. It is not measuring anything about the claim rule.
  assert.ok(rate(repeats) > 0.5,
    `only ${repeats} second blows on a part in ${totalSeconds.toFixed(1)} s, which is `
    + `${rate(repeats).toFixed(2)} a second and does not exercise the rule`);
  assert.ok(tightest >= CONFIG.combat.strokeClaimSeconds - 1e-9,
    `one striker billed one part twice ${tightest.toFixed(4)} s apart, inside the`
    + ` ${CONFIG.combat.strokeClaimSeconds} s claim`);

  // --- and a stroke still reaches more than one part ------------------------------------------
  const open = new Map();
  const strokes = [];
  for (const event of wounds) {
    const id = `${event.bout}${event.side}\u0000${event.effectorId}`;
    let stroke = open.get(id);
    if (stroke !== undefined && event.report.at - stroke.last >= CONFIG.combat.strokeClaimSeconds) {
      strokes.push(stroke);
      stroke = undefined;
    }
    if (stroke === undefined) { stroke = { parts: new Set(), last: event.report.at }; open.set(id, stroke); }
    stroke.parts.add(event.report.key);
    stroke.last = event.report.at;
  }
  for (const stroke of open.values()) strokes.push(stroke);
  const parts = strokes.reduce((sum, stroke) => sum + stroke.parts.size, 0) / strokes.length;
  // Stabilized sweeps bill 1.32 parts/stroke; still require genuine multi-part cuts.
  assert.ok(parts > 1.2,
    `a stroke billed ${parts.toFixed(2)} parts, which is a poke rather than a cut`);

  // --- the plate blocks, is never wounded, and is no part of the bar ---------------------------
  assert.ok(rate(shieldBlocks.length) > 1,
    `only ${shieldBlocks.length} blows were stopped by a plate in `
    + `${totalSeconds.toFixed(1)} s, which is ${rate(shieldBlocks.length).toFixed(1)} a second`);
  assert.equal(blocked.length, shieldBlocks.length + bladeParries.length,
    `a blocked contact reported something other than the plate or the blade: `
    + [...new Set(blocked.map((event) => event.report.key))].join(", "));
  for (const event of blocked) {
    assert.equal(event.report.damage, 0, `${event.report.key} charged the striker for stopping a blow`);
  }
  for (const key of plateKeys) {
    assert.ok(!wounds.some((event) => event.report.key === key),
      `a wound was filed against ${key}`);
  }

  // --- a held blade parries like the plate, and an arm is booked as a block and wounded ---------
  assert.equal(blocksBooked, blocked.length + guardedHits.length,
    "a block was booked that was neither a parry nor a blow on an arm");
  // The same quantity the floor was set on: every blow that found something held other than the
  // plate. Blows on the blade were half of it and are parries now, so it is counted across both.
  const heldBlows = guardedHits.length + bladeParries.length;
  assert.ok(rate(heldBlows) > 3,
    `only ${heldBlows} blows found an arm or a blade in ${totalSeconds.toFixed(1)} s, which `
    + `is ${rate(heldBlows).toFixed(1)} a second`);
  // The blade half, and it has a control: blades do meet blows, and none of them marks the blade.
  assert.ok(bladeParries.length > 0,
    `no blow met a blade in ${SEED_PAIRS.length} bouts, so "never wounded" below asserts nothing`);
  for (const side of ["left", "right"]) {
    const held = [...woundedHeld[side]];
    assert.ok(!held.some((key) => key.endsWith(".blade")),
      `${side}'s blade was wounded, and a held weapon is equipment: ${held.join(", ")}`);
    assert.ok(held.length > 0, `nothing ${side} holds was ever wounded, so the arm half is empty`);
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

  // Every build shape the picker can reach, cycled: the default, a maul claiming both sockets, a
  // one-handed mace, a whip, a fist on two chains, a plated trunk and a ram head. A rebuild census
  // over one build would not see a module that leaks only when it is fitted.
  const base = defaultGolemSetup();
  const builds = [
    base,
    { ...base, torso: "torso.plated", head: "head.ram" },
    { ...base, primary: { chain: "wrist", terminal: "maul" },
      secondary: { chain: "wrist", terminal: "maul" } },
    { ...base, primary: { chain: "wrist", terminal: "mace" },
      secondary: { chain: "reach", terminal: "plate" } },
    { ...base, primary: { chain: "wrist", terminal: "whip" } },
    { ...base, primary: { chain: "wrist", terminal: "fist" },
      secondary: { chain: "reach", terminal: "fist" } },
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

test("the_default_arms_swing_inertia_is_the_reference_every_stroke_is_timed_against", async (t) => {
  // `STROKE_INERTIA.ref` cannot be derived where it is written: `tactics.ts` imports no value but
  // `hands.ts` and `rng.ts`, which is the property that lets a whole bout be stepped with no
  // Babylon in the graph, and the chains that know this figure all import a scene. So it is a
  // literal, and this is the pin that stops it going stale: move a link's mass, a segment's length
  // or the blade's, and the default golem's own strokes would quietly retime by the ratio.
  const { golem } = await standAGolem(t);
  const cap = golem.view.self.capabilities.effectors.primary;
  assert.ok(cap.swingInertia > 0, "the default primary arm published no swing inertia");
  assert.equal(cap.swingInertia.toFixed(5), STROKE_INERTIA.ref.toFixed(5),
    `the default arm is ${cap.swingInertia} kg m2 and the reference every stroke is timed `
    + `against is ${STROKE_INERTIA.ref}`);
  // And the consequence that matters, stated separately because it is the one a reader wants:
  // the body the record was measured on keeps the arc it was measured with, to the last bit.
  assert.equal(strokeTimeScale(cap), 1,
    `the default arm's strokes scale by ${strokeTimeScale(cap)} rather than by 1`);
  // And a body carrying a load that is genuinely heavier, so the floor is not what is making the
  // line above pass.
  //
  // **This used to read the default body's own off hand, and that stopped saying anything on
  // 2026-09-18.** The off hand carries a plate, and the plate was 16.6 kg of stone against a
  // 1.30 kg blade. `SHIPPED_MASS_SCALE` took it to 2.30 kg -- correctly, because a plate is part
  // of the golem and `kg()` wraps it -- while `TERMINAL_BLADE.mass` is the one mass in
  // `golem/config.ts` that scale does not touch, being a real arming sword's own. So the two hands
  // are now a 2.30 kg slab held against the fist and a 1.30 kg blade held out at arm's length, and
  // an inertia weights a mass by the square of its distance: the plate arm publishes 3.8175 kg m2
  // against the blade arm's 3.7729, a difference of 1.2 %, and scales by 1.0059. That is not the
  // mechanism failing -- it is the plate no longer being a heavy thing to hold -- but a guard that
  // reads 1.0059 against a bar of 1.2 has stopped guarding, so it moves to a load that is heavy on
  // this body. Measured over every terminal the registry offers, wrist chain: fist 2.7151,
  // whip 3.0190, blade 3.7729, plate 3.8175, mace 6.9366, **maul 16.0810** -- scaling by 1, 1, 1,
  // 1.0059, 1.3559 and 2.0645. The maul is the one that could not pass on the floor by accident.
  const maul = defaultGolemSetup();
  const heavy = await standAGolem(t, {
    setup: { ...maul, primary: { chain: "wrist", terminal: "maul" },
      secondary: { chain: "wrist", terminal: "maul" } },
  });
  const load = heavy.golem.view.self.capabilities.effectors.primary;
  assert.ok(strokeTimeScale(load) > 1.5,
    `a maul arm is ${load.swingInertia} kg m2 and scales by `
    + `${strokeTimeScale(load)}, so nothing here is scaling`);
});

test("a_strokes_time_is_the_arms_own_rate_and_torque_against_its_load_and_not_its_load_alone", async (t) => {
  // Physical contact session 09. Timing a stroke by the load alone stretched a x2-weight arm by
  // 14 % and an all-max giant's by 68 %, while the arm that swings it had been given the torque
  // (weight x size^4) and the rate (arm speed / sqrt(size)) to swing it at least as fast. The
  // arm's own time scale is the slower of its rate against the shipped table's and its load
  // against the torque it has to move it, so each level is pinned on what its arm actually is.
  const at = async (attributes) => {
    const { golem } = await standAGolem(t, { setup: { ...defaultGolemSetup(), attributes } });
    return golem.view.self.capabilities.effectors.primary;
  };
  // Weight scales mass and torque together and leaves the rate alone: the load's time is the
  // shipped one, to rounding.
  const heavy = await at({ weight: 2 });
  assert.ok(heavy.torqueScale > 1.9 && heavy.rateScale === 1,
    `a x2-weight arm publishes torque x${heavy.torqueScale} and rate x${heavy.rateScale}`);
  assert.ok(Math.abs(strokeTimeScale(heavy) - 1) < 0.01,
    `a x2-weight arm is timed x${strokeTimeScale(heavy)}, not the shipped arm's own 1`);
  // Size slows the arm by the size itself, on the drive clock: its rate divides by the size, and
  // its load (size^5 over size^3) asks for the same factor.
  const tall = await at({ size: 1.1 });
  assert.ok(Math.abs(strokeTimeScale(tall) - 1.1) < 0.01,
    `a x1.1-size arm is timed x${strokeTimeScale(tall)}, not 1.1`);
  // Every stat at its ceiling is a faster arm than the shipped one, not a slower one.
  const giant = await at(Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, ATTRIBUTES[id].max])));
  assert.ok(strokeTimeScale(giant) < 1,
    `an all-max arm is timed x${strokeTimeScale(giant)} (rate x${giant.rateScale}, torque `
    + `x${giant.torqueScale}), which is no faster than the shipped arm`);
});

test("a_golem_publishes_what_its_stats_do_as_physical_quantities_a_mind_can_read", async (t) => {
  // Physical contact session 09. The body's supported mass, the impulse its weakest fall line
  // stands for, its arm's rate at the hand and the health a joule of a cut takes from its core --
  // each read off the running body, pinned at x1 to the figures measured on the Node arena
  // harness (2026-09-24), and moved by the stat that should move it.
  const shipped = await standAGolem(t);
  shipped.run(1);
  const x1 = shipped.golem.view.self;
  const near = (value, want, what) =>
    assert.ok(Math.abs(value / want - 1) < 0.02, `${what} publishes ${value}, not ${want}`);
  near(x1.massKg, 247.2, "massKg");
  near(x1.stabilityImpulseNs, 117.1, "stabilityImpulseNs");
  near(x1.armRate, 11.81, "armRate");
  near(x1.soak, 2.323e-3, "soak");
  const heavy = await standAGolem(t, { setup: { ...defaultGolemSetup(), attributes: { weight: 2 } } });
  heavy.run(1);
  const x2 = heavy.golem.view.self;
  assert.ok(x2.massKg > 1.5 * x1.massKg, `a x2-weight body publishes ${x2.massKg} kg against ${x1.massKg}`);
  assert.ok(x2.stabilityImpulseNs > 1.5 * x1.stabilityImpulseNs,
    `a x2-weight body takes ${x2.stabilityImpulseNs} N.s to fell against ${x1.stabilityImpulseNs}`);
  const fast = await standAGolem(t, { setup: { ...defaultGolemSetup(), attributes: { armSpeed: 1.5 } } });
  fast.run(1);
  near(fast.golem.view.self.armRate, 1.5 * x1.armRate, "a x1.5 arm-speed arm's rate");
  const tough = await standAGolem(t, { setup: { ...defaultGolemSetup(), attributes: { toughness: 2 } } });
  tough.run(1);
  near(tough.golem.view.self.soak, x1.soak / 2, "a x2-toughness core's soak");
});
