// The golem torso and head modules, under real Havok.
//
// **Every threshold in this file is provisional.** They are pinned from the 2026-09-04 Node torso
// bench run and are to be re-taken after the owner's gate. They are *not* regression floors:
// this plan set exists because three body experiments each cleared a scalar proxy while the
// owner's judgement stayed red, and a number that has never been checked against a person's eye
// can only say "this did not change", never "this is right". Sessions 02 and 03 marked theirs the
// same way and for the same reason.
//
// The harness is the Node torso bench (`scripts/golem-torso-bench.mjs`, `NullEngine`, real Havok,
// no rendering). Nothing here may be compared with a page reading or with a figure from
// `scripts/golem-bench.mjs`: the two harnesses in this directory that have been compared agree on
// converged behaviour and disagree by about 9 % on the Warrior's peak transient with identical
// code, and putting two of them in one column has already produced a regression report about a
// build where nothing had changed.
import test from "node:test";
import assert from "node:assert/strict";

import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";

import { PRIMARY, SECONDARY, applyButtonPose, poseFromButtons } from "../src/buttons.ts";
import { Combat } from "../src/combat.ts";
import { CONFIG } from "../src/config.ts";
import { COLLIDES, LAYER } from "../src/physics.ts";
import { boxPart } from "../src/rig.ts";
import { armouredDamage, scoreHit } from "../src/scoring.ts";
import {
  HEAD_NECK, HEAD_PLAIN, HEAD_RAM, TORSO_PLAIN, TORSO_PLATED, TORSO_WAIST,
} from "../src/golem/config.ts";
import { partArmour } from "../src/golem/module.ts";
import { RigidStrike } from "../src/golem/effectors/striker.ts";
import { GOLEM_MODULES, golemModule } from "../src/golem/registry.ts";
import { buildGolemStand, golemLayers } from "../src/golem/stand.ts";
import { createHeadlessArena } from "../scripts/golem-headless-arena.mjs";
import { runTorsoBench } from "../scripts/golem-torso-bench.mjs";

const FRAME = 1 / 60;
const SUBSTEP = 1 / CONFIG.world.physicsHz;
const TORSOS = ["torso.plain", "torso.plated"];
const HEADS = ["head.plain", "head.ram"];

const benchIntent = () => ({
  forward: 0, strafe: 0, turn: 0, actingHand: "primary",
  natural: { thrust: false, guard: false },
  posture: { trunkLean: 0, trunkTwist: 0, crouch: 0 },
  primary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false },
  secondary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false },
});

// ---------------------------------------------------------------------------------------
// The registry, which is the seam the bench reads and the only thing this session appends to.
// ---------------------------------------------------------------------------------------

test("the torso and head options are registered under the slots and modes they fill", () => {
  for (const id of TORSOS) {
    const option = golemModule(id);
    assert.ok(option, `${id} is not registered`);
    assert.equal(option.mode, "torso");
    assert.deepEqual([...option.slots], ["torso"], `${id} must fit the torso slot and no other`);
    assert.ok(option.massKg > 0);
  }
  for (const id of HEADS) {
    const option = golemModule(id);
    assert.ok(option, `${id} is not registered`);
    assert.equal(option.mode, "head");
    assert.deepEqual([...option.slots], ["head"], `${id} must fit the head slot and no other`);
    assert.ok(option.massKg > 0);
  }
  const ids = GOLEM_MODULES.map((option) => option.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate module ids: ${ids.join(", ")}`);
});

/**
 * The frozen choice this session can actually check: **an option that changes nothing physical is
 * a shell, not a module.**
 *
 * Asserted as a whole record rather than as one field, for the reason `AGENTS.md` gives about a
 * test that reads two of nineteen command leaves: a list of field names does not grow with the
 * thing it is about. Every number a `TorsoTuning` may carry is compared here, and each one is
 * required either to differ (mass, breadth, armour, socket placement, waist range) or to be the
 * same on purpose (`socketFront`, which is zero for both because neither torso holds its
 * effectors ahead of its own chest).
 */
test("the two torso options differ mechanically and in nothing else", () => {
  const differs = [
    "coreWidth", "coreHeight", "coreDepth", "coreMass", "coreHealth",
    "coreArmour", "socketSide", "socketHeight", "neckHeight", "leanMax", "twistMax",
  ];
  for (const key of differs) {
    assert.notEqual(TORSO_PLAIN[key], TORSO_PLATED[key],
      `${key} is identical in both torsos, so it is not one of the things they differ in`);
  }
  assert.equal(TORSO_PLAIN.socketFront, TORSO_PLATED.socketFront);
  // The direction of every difference, which is what makes them a trade rather than two dials.
  assert.ok(TORSO_PLATED.coreMass > TORSO_PLAIN.coreMass, "plated is the heavier trunk");
  assert.ok(TORSO_PLATED.coreArmour > TORSO_PLAIN.coreArmour, "plated is the armoured one");
  assert.ok(TORSO_PLATED.leanMax < TORSO_PLAIN.leanMax, "plated leans less");
  assert.ok(TORSO_PLATED.twistMax < TORSO_PLAIN.twistMax, "plated twists less");
  assert.ok(TORSO_PLATED.socketSide > TORSO_PLAIN.socketSide, "plated holds its effectors wider");
  assert.ok(TORSO_PLATED.socketHeight > TORSO_PLAIN.socketHeight, "and higher");
});

/**
 * The two head options differ by a plate and a lunge, and share the neck and the block.
 *
 * The control condition is only a control if it really is the same head: `HEAD_NECK` holds
 * everything shared, so this asserts that the shared block is where the shared numbers live and
 * that the ram's own block adds a striker and a stroke rather than a second neck.
 */
test("the two head options differ by a plate and a lunge and share the neck", () => {
  assert.equal(typeof HEAD_NECK.headMass, "number");
  assert.equal(typeof HEAD_NECK.headArmour, "number");
  assert.equal(HEAD_PLAIN.ram, undefined, "a plain head declares no plate of its own");
  assert.ok(HEAD_RAM.plateMass > 0, "a ram head does");
  assert.ok(HEAD_PLAIN.guardPitch > HEAD_RAM.guardPitch,
    "a head with nothing on its brow ducks further than one presenting a plate");
  for (const pitch of [HEAD_PLAIN.guardPitch, HEAD_RAM.guardPitch]) {
    assert.ok(pitch <= HEAD_NECK.pitchMax, "a guard is a pose inside the range, not a limit");
    assert.ok(pitch >= HEAD_NECK.pitchMin);
  }
});

// ---------------------------------------------------------------------------------------
// Build, publish and dispose.
// ---------------------------------------------------------------------------------------

for (const id of [...TORSOS, ...HEADS]) {
  test(`${id} builds, publishes a view and disposes without leaving a body behind`, async () => {
    const arena = await createHeadlessArena({ populateDefaultGeometry: false });
    const scene = arena.scene;
    const stand = buildGolemStand(scene, { side: "left" });
    const before = scene.meshes.length;
    const slot = id.startsWith("torso.") ? "torso" : "head";
    const module = golemModule(id).build({
      scene, side: "left", name: "census", socket: stand.socket(slot),
      layers: golemLayers("left"), materials: stand.materials,
    });
    try {
      assert.ok(module.parts.length >= 2, "a module with no parts is a module with no body");
      const view = module.view();
      assert.ok(view, "a torso and a head both publish a view; the readout is built from it");
      assert.equal(view.slot, slot);
      assert.equal(view.stroke, "idle");
      // Neither drives an anchor and neither has an edge. Both are real answers rather than
      // missing ones: an alignment reported for something with no edge is a number that means
      // nothing, and the readout prints "n/a" rather than a figure.
      assert.equal(view.anchor, null);
      assert.equal(view.anchorStray, null);
      assert.equal(view.edge, null);
      assert.equal(view.axes.length, 2, "both modules publish exactly two axes");
      assert.ok(module.envelope().reach > 0);

      // The fatal flag is the body plan: a head ends the golem and a trunk does not.
      const fatal = module.parts.filter((part) => part.fatal);
      assert.equal(fatal.length, slot === "head" ? 1 : 0,
        `${id} declares ${fatal.length} fatal parts`);

      // The filter on the **leaf**, read back. Setting a mask on a `PhysicsShapeContainer` writes
      // to a shape nothing consults and reads back garbage -- a shape set to 8 returned 383476 --
      // and every weapon in this directory collided with everything for its whole life because of
      // that. Reading the value back is the only check that catches it.
      for (const part of module.parts) {
        const membership = part.part.shape.filterMembershipMask;
        assert.ok(membership === LAYER.LEFT_ARM || membership === LAYER.LEFT_SWORD,
          `${part.id} is on membership ${membership}, which is neither anatomy nor striker`);
        const collides = part.part.shape.filterCollideMask;
        assert.equal(collides & LAYER.LEFT_ARM, 0, `${part.id} collides with its own anatomy`);
        assert.equal(collides & LAYER.LEFT_TRUNK, 0, `${part.id} collides with its own trunk`);
        assert.equal(collides & LAYER.LEFT_SWORD, 0, `${part.id} collides with its own striker`);
      }
    } finally {
      module.dispose();
      stand.dispose();
    }
    assert.equal(scene.meshes.length, before - 1,
      "dispose left meshes behind (the stand's own block is the one that goes with the stand)");
    arena.dispose();
  });
}

test("a plain head carries no striker and a ram head carries exactly one", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const stand = buildGolemStand(arena.scene, { side: "left" });
  const build = (id) => golemModule(id).build({
    scene: arena.scene, side: "left", name: `strikers.${id}`, socket: stand.socket("head"),
    layers: golemLayers("left"), materials: stand.materials,
  });
  const plain = build("head.plain");
  const ram = build("head.ram");
  try {
    assert.equal(plain.strikers.length, 0, "a plain head cannot attack, and that is the option");
    assert.equal(ram.strikers.length, 1);
    const striker = ram.strikers[0];
    // `hand` null and a stable `effectorId`, which the recorder already routes to the
    // body-neutral channel. A head is not a hand, and the centipede's surviving `hand` alias is
    // the thing this deliberately does not copy.
    assert.equal(striker.hand, null, "a head is not a hand");
    assert.ok(striker.effectorId.endsWith(".ram"), striker.effectorId);
    assert.equal(striker.kind, "ram", "a ram plate hurts somebody with mass and no edge");
    assert.equal(striker.spent, false);
    // What each may be asked for, published so a mind picks by capability rather than by id.
    assert.deepEqual([...plain.envelope().strokes], ["cover"]);
    assert.deepEqual([...ram.envelope().strokes], ["thrust", "cover"]);
  } finally {
    ram.dispose();
    plain.dispose();
    stand.dispose();
    arena.dispose();
  }
});

test("severing a ram head makes its plate debris on its own leaf and stops it scoring", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const stand = buildGolemStand(arena.scene, { side: "left" });
  const head = golemModule("head.ram").build({
    scene: arena.scene, side: "left", name: "sever", socket: stand.socket("head"),
    layers: golemLayers("left"), materials: stand.materials,
  });
  try {
    assert.equal(head.strikers[0].spent, false);
    head.sever();
    assert.equal(head.strikers[0].spent, true, "a severed head must stop scoring");
    const plate = head.parts.find((part) => part.id.endsWith(".ram"));
    assert.equal(plate.part.shape.filterMembershipMask, LAYER.DEBRIS);
    assert.equal(plate.part.shape.filterCollideMask, COLLIDES.DEBRIS);
  } finally {
    head.dispose();
    stand.dispose();
    arena.dispose();
  }
});

// ---------------------------------------------------------------------------------------
// The sockets a torso carries, which is what Session 08 mounts on.
// ---------------------------------------------------------------------------------------

test("a torso hands out three sockets and refuses every other slot", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const stand = buildGolemStand(arena.scene, { side: "left" });
  const torso = golemModule("torso.plain").build({
    scene: arena.scene, side: "left", name: "sockets", socket: stand.socket("torso"),
    layers: golemLayers("left"), materials: stand.materials,
  });
  try {
    const primary = torso.socket("primary");
    const secondary = torso.socket("secondary");
    const neck = torso.socket("head");
    assert.equal(primary.outboard, 1, "primary is on the golem's own right, which is +X");
    assert.equal(secondary.outboard, -1);
    // Mirrored about the centreline, and mounted on the core rather than on whatever the trunk
    // itself hangs from -- which is what makes an effector move when the trunk leans.
    assert.equal(primary.local.x, -secondary.local.x);
    assert.equal(primary.local.y, secondary.local.y);
    assert.equal(primary.mount, torso.parts.find((part) => part.id.endsWith(".core")).part);
    assert.equal(neck.mount, primary.mount);
    assert.ok(Math.abs(neck.local.x) < 1e-9, "a neck is on the centreline");
    assert.ok(neck.local.y > primary.local.y, "and above the shoulder line");
    // The same object every time, so a module built into a socket and a reader asking about it
    // later are talking about one frame.
    assert.equal(torso.socket("head"), neck);
    for (const slot of ["locomotion", "torso"]) {
      assert.throws(() => torso.socket(slot), /carries primary, secondary and head/);
    }
  } finally {
    torso.dispose();
    stand.dispose();
    arena.dispose();
  }
});

test("a head built on a torso's neck starts where the neck socket says it is", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const scene = arena.scene;
  const stand = buildGolemStand(scene, { side: "left" });
  const torso = golemModule("torso.plated").build({
    scene, side: "left", name: "stack.torso", socket: stand.socket("torso"),
    layers: golemLayers("left"), materials: stand.materials,
  });
  const neck = torso.socket("head");
  const head = golemModule("head.ram").build({
    scene, side: "left", name: "stack.head", socket: neck,
    layers: golemLayers("left"), materials: stand.materials,
  });
  try {
    const column = head.parts.find((part) => part.id.endsWith(".neck"));
    // Built half a neck above the socket it was handed, in the socket's own frame. A body built
    // anywhere else would put the joint's two frames at odds at construction, which is a
    // violation the solver clears by flinging the thing.
    const expected = neck.world.add(new Vector3(0, HEAD_NECK.neckLength / 2, 0));
    assert.ok(Vector3.Distance(column.part.mesh.position, expected) < 1e-6,
      `${column.part.mesh.position} is not half a neck above ${neck.world}`);
    // And the whole stack really is a stack: the head sits above the plated torso's own top face.
    const stackHeight = head.view().tip.y - stand.socket("torso").world.y;
    assert.ok(stackHeight > TORSO_PLATED.coreHeight,
      `a head on a trunk should stand taller than the trunk, got ${stackHeight.toFixed(3)} m`);
  } finally {
    head.dispose();
    torso.dispose();
    stand.dispose();
    arena.dispose();
  }
});

// ---------------------------------------------------------------------------------------
// The build pose, against every joint stop it is built inside.
// ---------------------------------------------------------------------------------------

/**
 * **A stop that does not admit its own build pose is a violation the solver clears on step one.**
 *
 * Session 02 measured a blade tip thrown at 9.95 m/s from a motionless stand because a chain was
 * constructed 0.10 rad outside its own floor, and it was an assertion rather than looking that
 * found it. Both modules here are built at joint angle exactly zero on every hinge, so this is
 * the arithmetic half; the physical half is the frame below.
 */
test("every waist and neck stop admits the pose its module is built in", () => {
  for (const torso of [TORSO_PLAIN, TORSO_PLATED]) {
    for (const range of [torso.leanMax, torso.twistMax]) {
      assert.ok(range > 0);
      assert.ok(range + TORSO_WAIST.jointMargin > 0, "the build pose is zero and must be inside");
    }
  }
  assert.ok(HEAD_NECK.pitchJointMin < 0, "the neck's build pose is pitch 0");
  assert.ok(HEAD_NECK.pitchJointMax > 0);
  assert.ok(HEAD_NECK.yawJointMin < 0, "and yaw 0");
  assert.ok(HEAD_NECK.yawJointMax > 0);
  // The stop is not the envelope: every commanded value has somewhere to overshoot into.
  assert.ok(HEAD_NECK.pitchJointMin < HEAD_NECK.pitchMin);
  assert.ok(HEAD_NECK.pitchJointMax > HEAD_NECK.pitchMax);
  assert.ok(HEAD_NECK.pitchJointMax > HEAD_PLAIN.guardPitch);
  assert.ok(HEAD_NECK.pitchJointMax > HEAD_RAM.guardPitch);
});

for (const [torsoId, headId] of [["torso.plain", "head.ram"], ["torso.plated", "head.plain"]]) {
  test(`${torsoId} carrying ${headId} is not flung on the first solver step`, async () => {
    const arena = await createHeadlessArena({ populateDefaultGeometry: false });
    const scene = arena.scene;
    const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
    const stand = buildGolemStand(scene, { side: "left" });
    const torso = golemModule(torsoId).build({
      scene, side: "left", name: "fling.torso", socket: stand.socket("torso"),
      layers: golemLayers("left"), materials: stand.materials,
    });
    const head = golemModule(headId).build({
      scene, side: "left", name: "fling.head", socket: torso.socket("head"),
      layers: golemLayers("left"), materials: stand.materials,
    });
    try {
      // Forced activation before a single reading is believed: Havok deactivates a body at rest,
      // and a sleeping body reads a perfect zero however badly it would move awake.
      for (const part of [...torso.parts, ...head.parts]) {
        plugin.setActivationControl(part.part.body, 1);
      }
      const before = head.view().tip.clone();
      scene._renderId += 1;
      scene._advancePhysicsEngineStep(1000 * FRAME);
      const speed = Vector3.Distance(head.view().tip, before) / FRAME;
      // Provisional, pinned from the 2026-09-04 Node torso bench run. A weld or a stop that
      // disagrees with its own build pose reads 48.3 m/s on this directory's own weapons and
      // 9.95 m/s on a joint limit; a correct build leaves the head being carried and nothing else.
      assert.ok(speed < 0.5,
        `the head moved at ${speed.toFixed(3)} m/s on the first step from a motionless stand`);
    } finally {
      head.dispose();
      torso.dispose();
      stand.dispose();
      arena.dispose();
    }
  });
}

// ---------------------------------------------------------------------------------------
// The waist under a shove.
// ---------------------------------------------------------------------------------------

for (const torsoId of TORSOS) {
  test(`${torsoId} holds its waist through the scripted lean, twist and shove`, async () => {
    const run = await runTorsoBench({ torsoId, headId: "head.ram" });
    const lean = run.marks.find((mark) => mark.phase === "lean");
    const twist = run.marks.find((mark) => mark.phase === "twist");
    const option = torsoId === "torso.plain" ? TORSO_PLAIN : TORSO_PLATED;

    assert.equal(run.torso.stuckSteps, 0,
      "a waist that cannot reach its own commanded lean sits against the error and does not move");
    assert.equal(run.torso.selfContacts, 0,
      "no pair of this golem's own bodies may be admitted by the filters");
    assert.equal(run.torso.contacts, 0, "nothing on the bench is close enough to touch");

    // **The overshoot must not reach the joint stop.** A limb arriving at its own stop is a motor
    // and a limit pushing at each other, which is the buzz `arm.ts`'s wrist was rewritten to get
    // rid of -- and at `leanTorque` 900 the plain trunk's overshoot of 0.2025 rad landed it
    // exactly on its own 0.62 stop, which is what took the setting to 1500.
    assert.ok(lean.torso.overshoot < TORSO_WAIST.jointMargin,
      `the lean carried ${lean.torso.overshoot.toFixed(4)} rad past its target,`
      + ` which reaches the stop ${TORSO_WAIST.jointMargin} rad outside the range`);
    assert.ok(twist.torsoTwist.overshoot < TORSO_WAIST.jointMargin);
    // And it must arrive: a trunk that never gets to where it was sent is not heavy, it is stuck.
    assert.ok(lean.torso.arrivalSeconds !== null && lean.torso.arrivalSeconds < 1.2,
      `the lean took ${lean.torso.arrivalSeconds} s to arrive`);
    assert.ok(twist.torsoTwist.arrivalSeconds !== null && twist.torsoTwist.arrivalSeconds < 1.2);
    assert.ok(lean.torso.peakTargetError < option.leanMax,
      "a trunk that is a whole lean behind its own command is not tracking it");

    // The shove: an impulse, and the head has to come back from it. `runTorsoBench` forces
    // activation on every body first, because a sleeping body reads a perfect zero.
    assert.ok(run.bob.peakMm > 5, `the shove moved the head ${run.bob.peakMm.toFixed(2)} mm,`
      + " which is a body that did not notice being hit");
    assert.ok(run.bob.settleSeconds < run.bob.windowSeconds,
      `the knock had not decayed to a tenth of itself when the ${run.bob.windowSeconds} s window`
      + " closed, so this is a reading of the window rather than of the body");
  });
}

// ---------------------------------------------------------------------------------------
// The armour rule.
// ---------------------------------------------------------------------------------------

test("the armour rule is a fraction absorbed, and refuses anything that is not one", () => {
  assert.equal(armouredDamage(10, 0), 10, "bare stone pays the whole blow");
  assert.equal(armouredDamage(10, 0.25), 7.5);
  assert.equal(armouredDamage(0, 0.9), 0);
  assert.equal(armouredDamage(-3, 0.5), 0, "a blow worth nothing is worth nothing armoured");
  // A piece that takes no damage at all is a bug wearing a setting's clothes: there is no
  // sequence of blows that ends it, so a bout against one cannot be won.
  assert.throws(() => armouredDamage(10, 1), /fraction absorbed/);
  assert.throws(() => armouredDamage(10, -0.1), /fraction absorbed/);
  assert.throws(() => armouredDamage(10, Number.NaN), /finite/);
  assert.throws(() => armouredDamage(Number.POSITIVE_INFINITY, 0.2), /finite/);
});

test("the module contract answers armour once, so no caller keeps its own default", () => {
  assert.equal(partArmour({ armour: 0.4 }), 0.4);
  assert.equal(partArmour({}), 0, "absent means bare stone, and it means it in exactly one place");
});

/**
 * **The load-bearing assertion of this session**, and it is physical rather than arithmetic.
 *
 * One hammer, one speed, one frame, driven into each torso's core through the real `Combat` --
 * so the blow is scored by `src/scoring.ts` exactly as a blow in the arena is, and the armour is
 * spent at `Combatant.applyDamage`, which is the seam a body already had for turning raw scoring
 * damage into applied damage. There is no branch anywhere that knows which torso it is looking at.
 *
 * The hammer is `ANIMATED` and driven at a fixed velocity, which is what makes "the same scored
 * contact" true rather than approximately true: an animated body is infinitely heavy to the
 * solver, so the plated core's extra 97 kg cannot slow it down and the contact velocity is the
 * same number in both runs. That the *pre-armour* damage comes out identical is asserted, because
 * without it "the plated one took less" could be a measurement of two different blows.
 *
 * Watched red under two mutations on 2026-09-04: `armouredDamage` returning `raw` regardless of
 * its armour argument, and `TORSO_PLAIN.coreArmour` and `TORSO_PLATED.coreArmour` exchanged.
 */
async function hammerBlow(torsoId) {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const scene = arena.scene;
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  const stand = buildGolemStand(scene, { side: "left" });
  const torso = golemModule(torsoId).build({
    scene, side: "left", name: "armour.torso", socket: stand.socket("torso"),
    layers: golemLayers("left"), materials: stand.materials,
  });
  const core = torso.parts.find((part) => part.id.endsWith(".core"));

  // The hammer, on the far side's striker layer so the layer table lets it find this golem's
  // anatomy and nothing else. Its own +X is the edge, turned to point along the way it travels,
  // so the blow arrives square: `scoreHit` then reports a cut of quality 1 and the only thing
  // left that can differ between the two runs is the armour.
  const travel = new Vector3(0, 0, -1);
  const hammer = boxPart(scene, {
    name: "armour.hammer",
    position: core.part.mesh.position.add(new Vector3(0, 0, 1.2)),
    rotation: Quaternion.RotationAxis(new Vector3(0, 1, 0), Math.PI / 2),
    size: new Vector3(0.06, 0.50, 0.06),
    // **`ANIMATED`, and that is what makes "the same scored contact" true rather than nearly
    // true.** A dynamic hammer is stopped by what it hits, and `Striking.velocityAt` reads the
    // body's velocity when the contact callback runs -- which is *after* the solver has resolved
    // it. Measured here: a 4 kg dynamic hammer thrown at 8 m/s into the core reported **0.784
    // m/s** and scored `weak` for zero damage, which is the same shape of defect `AGENTS.md`
    // records for an arrow (linear velocity 38.4 against a true 48.0). An animated body is
    // infinitely heavy to the solver, so it arrives at exactly the speed it was given and the
    // plated core's extra 97 kg cannot slow it down.
    mass: 0,
    motionType: PhysicsMotionType.ANIMATED,
    layer: LAYER.RIGHT_SWORD,
    collidesWith: COLLIDES.RIGHT_SWORD,
  });
  const striker = new RigidStrike(hammer, {
    kind: "sword", effectorId: "armour.hammer", hand: null, tipAlong: 0.25,
  });

  const limb = {
    key: "core", label: "Core", part: core.part, attachment: null,
    health: 1e6, maxHealth: 1e6, severed: false, lastHitAt: -999,
    vitalityWeight: core.vitalityWeight, fatal: core.fatal,
  };
  const applied = [];
  // A `Combatant`-shaped target, and the shape is not invented for the test: this is what
  // Session 08's golem does. It looks the part up by body, asks the shared rule what the armour
  // takes off, and subtracts the answer itself -- `Combat` leaves the subtraction to a body that
  // implements `applyDamage`.
  const target = {
    limbFor: (body) => (body === core.part.body ? limb : undefined),
    parriedBy: () => null,
    sever: () => { limb.severed = true; },
    applyDamage: (hit, rawDamage) => {
      const damage = armouredDamage(rawDamage, partArmour(core));
      hit.health -= damage;
      applied.push({ raw: rawDamage, damage });
      return damage;
    },
  };
  const reports = [];
  const combat = new Combat("right", [striker], (event) => reports.push(event.report));
  combat.attach(target);

  try {
    plugin.setActivationControl(stand.block.body, 1);
    for (const part of torso.parts) plugin.setActivationControl(part.part.body, 1);
    const speed = 8;
    const upright = benchIntent();
    for (let frame = 0; frame < 40 && reports.length === 0; frame += 1) {
      // A whole `Intent`, because a registered option adapts the command rather than being handed
      // one: the trunk reads `posture` out of it and nothing here has to know that it does.
      torso.command(upright);
      // Re-asserted every frame: an animated body keeps whatever velocity it was last given, and
      // what this fixture needs is a blow that arrives at exactly one speed in both runs.
      hammer.body.setLinearVelocity(travel.scale(speed));
      scene._renderId += 1;
      scene._advancePhysicsEngineStep(1000 * FRAME);
      combat.advance(FRAME);
      torso.step(SUBSTEP);
    }
    return { reports, applied, armour: partArmour(core), health: limb.health };
  } finally {
    combat.dispose();
    hammer.body.dispose();
    hammer.shape.dispose();
    hammer.mesh.dispose(false, false);
    torso.dispose();
    stand.dispose();
    arena.dispose();
  }
}

test("the plated torso takes less of the same scored blow than the plain one", async () => {
  const plain = await hammerBlow("torso.plain");
  const plated = await hammerBlow("torso.plated");

  assert.ok(plain.reports.length > 0, "the hammer never reached the plain core");
  assert.ok(plated.reports.length > 0, "the hammer never reached the plated core");
  const a = plain.reports[0];
  const b = plated.reports[0];
  assert.equal(a.kind, "cut");
  assert.equal(b.kind, "cut");

  // One blow, scored twice. If these differ, the two runs are not comparable and nothing below
  // means anything -- which is the failure mode a "the plated one took less" assertion has by
  // construction, and the reason this line is here rather than only the one after it.
  assert.ok(Math.abs(a.preArmourDamage - b.preArmourDamage) < 1e-9,
    `the two runs scored different blows: ${a.preArmourDamage} against ${b.preArmourDamage}`);
  assert.ok(a.preArmourDamage > 0, "a square cut at 8 m/s has to be worth something");

  // The rule, applied: each core paid its own fraction, and the plated one paid less.
  assert.ok(Math.abs(a.postArmourDamage - a.preArmourDamage * (1 - TORSO_PLAIN.coreArmour)) < 1e-9);
  assert.ok(Math.abs(b.postArmourDamage - b.preArmourDamage * (1 - TORSO_PLATED.coreArmour)) < 1e-9);
  assert.ok(b.postArmourDamage < a.postArmourDamage,
    `the plated core took ${b.postArmourDamage} and the plain one ${a.postArmourDamage}`);

  // And the same blow through `src/scoring.ts` on its own, with no physics anywhere, agrees --
  // so what the arena does and what the pure rule says are one thing.
  const contact = { speed: a.speed, edgeAlignment: 1, bladeAlignment: 0, nearTip: false };
  const raw = scoreHit(contact, "sword").damage;
  // A part in ten million, which is the width of the arena's own answer rather than a slack
  // bound: `HitReport.speed` is a float32 round trip through the solver, so 8 m/s comes back as
  // 8.0000004 and the two damages differ in the seventh decimal. Tighter than this is a test of
  // Havok's float width; looser is a test of nothing.
  assert.ok(Math.abs(raw - a.preArmourDamage) < 1e-6,
    `the pure scorer says ${raw} and the arena says ${a.preArmourDamage}`);
  assert.ok(armouredDamage(raw, TORSO_PLATED.coreArmour) < armouredDamage(raw, TORSO_PLAIN.coreArmour));
});

// ---------------------------------------------------------------------------------------
// The ram's lunge, and the plain head's silence.
// ---------------------------------------------------------------------------------------

/**
 * A head on the stand, a free-standing post in front of it, and the real `Combat` watching
 * whatever the head has to hit with.
 *
 * **The target goes down rather than across, because a lunge does.** Measured on this geometry, a
 * nod carries the ram's plate about 35 mm further *forward* and 460 mm further *down*: the plate
 * traces an arc about a hinge that is already behind and below it, so what a ram does to
 * something in front of it is come down on top of it. A vertical slab placed where the plate
 * could reach turned out to be a slab the plate was already resting against, and a stroke that
 * begins in contact cannot accelerate -- measured, 1.23 m/s and no wound.
 *
 * **And the post is dynamic, which is not a detail.** `Striking.velocityAt` reads the striker's
 * velocity when the contact callback runs, and that is *after* the solver has resolved it, so a
 * blow against an immovable target reports the speed it left with rather than the speed it
 * arrived at: the same post at mass 0 reported 0.49 m/s where a 12 kg one reports 1.78. That is
 * the same family as `AGENTS.md`'s arrow reading -- linear velocity 38.4 against a true 48.0 --
 * and the fixture is chosen so the number the arena scores is the number the blow had.
 *
 * `top` is a parameter because the two heads reach different depths and that difference *is* the
 * option. At 1.44 m the ram's plate clears the post by 260 mm at rest and comes down onto it at
 * the fast end of the stroke; at 1.72 m the post is up where a plain head's own guard puts its
 * brow, which is what lets "a plain head scores nothing" be checked against a plain head that is
 * definitely touching something.
 *
 * Nothing is built touching it. A body built overlapping another on a layer that forbids the
 * overlap deadlocks the chain driving it, and the symptom is a pose rather than an error.
 */
async function lungeAtPost(headId, top) {
  const arena = await createHeadlessArena();
  const scene = arena.scene;
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  const stand = buildGolemStand(scene, { side: "left" });
  const head = golemModule(headId).build({
    scene, side: "left", name: "post.head", socket: stand.socket("head"),
    layers: golemLayers("left"), materials: stand.materials,
  });
  // The far side's trunk layer, which is what both a golem's anatomy and its striker collide
  // with. It stands on the arena's own floor at z 0.24, clear of the bench block's 0.20 front
  // face, so the stand and the target are never in contact with each other.
  const depth = 0.34;
  const post = boxPart(scene, {
    name: "post",
    position: new Vector3(0, top / 2, 0.24 + depth / 2),
    size: new Vector3(0.40, top, depth),
    mass: 12,
    layer: LAYER.RIGHT_TRUNK,
    collidesWith: COLLIDES.RIGHT_TRUNK,
  });
  const limb = {
    key: "post", label: "Post", part: post, attachment: null,
    health: 1e6, maxHealth: 1e6, severed: false, lastHitAt: -999,
    vitalityWeight: 1, fatal: false,
  };
  const target = {
    limbFor: (body) => (body === post.body ? limb : undefined),
    parriedBy: () => null,
    sever: () => {},
  };
  const reports = [];
  const combat = new Combat("left", head.strikers, (event) => reports.push(event.report));
  combat.attach(target);

  // The head's own bodies watched for contacts, so "it scored nothing" can be told apart from
  // "it never touched anything" -- the difference between a control and a fixture that cannot
  // exhibit the defect.
  let contacts = 0;
  const observers = [];
  for (const part of head.parts) {
    part.part.body.setCollisionCallbackEnabled(true);
    observers.push([part.part.body, part.part.body.getCollisionObservable().add((event) => {
      if (event.collidedAgainst === post.body) contacts += 1;
    })]);
  }

  const intent = benchIntent();
  try {
    for (const part of head.parts) plugin.setActivationControl(part.part.body, 1);
    const control = scene.onBeforePhysicsObservable.add(() => head.step(SUBSTEP));
    for (let frame = 0; frame * FRAME < 3.6; frame += 1) {
      const now = frame * FRAME;
      // **Driven exactly as a person drives it**, through the function that owns the mapping:
      // one press onto the acting hand and the natural striker together. Setting
      // `intent.natural.thrust` by hand here would be testing a channel a person cannot reach,
      // which is the defect this whole channel was rebuilt to stop. The right button holds a
      // guard, the left fires once.
      const buttons = now >= 0.8 && now < 1.6 ? SECONDARY : now >= 2.2 && now < 2.3 ? PRIMARY : 0;
      applyButtonPose(intent, "primary", poseFromButtons(buttons, 0));
      head.command(intent);
      scene._renderId += 1;
      scene._advancePhysicsEngineStep(1000 * FRAME);
      combat.advance(FRAME);
    }
    scene.onBeforePhysicsObservable.remove(control);
    return { reports, contacts };
  } finally {
    for (const [body, observer] of observers) body.getCollisionObservable().remove(observer);
    combat.dispose();
    post.body.dispose();
    post.shape.dispose();
    post.mesh.dispose(false, false);
    head.dispose();
    stand.dispose();
    arena.dispose();
  }
}

test("the ram's lunge scores on a post and the plain head scores nothing on the same one", async () => {
  const ram = await lungeAtPost("head.ram", 1.44);
  const plain = await lungeAtPost("head.plain", 1.44);

  // The control is the fixture: one post, one script, and the only thing that changed is which
  // head is on the neck. If the post were out of reach the ram would score nothing either and
  // this test would fail rather than pass quietly, which is what makes the comparison worth
  // making.
  assert.ok(ram.contacts > 0, "the ram never reached the post; the fixture is out of range");
  const wounds = ram.reports.filter((report) => report.damage > 0);
  assert.ok(wounds.length > 0, "the ram lunged and scored nothing");
  const best = wounds.reduce((a, b) => (b.damage > a.damage ? b : a));
  // Its own row in `src/scoring.ts`, not the club's, and not because a ram is special: the club's
  // floor is a statement about 3.4 kg on the end of an arm, and a head on a hinge arrives slower
  // and far heavier. `CONFIG.combat.ramMinSpeed` carries that arithmetic.
  assert.equal(best.weapon, "ram", "a ram plate bites with mass, on its own two speeds");
  assert.equal(best.kind, "crush");
  assert.equal(best.key, "post");
  assert.equal(best.severed, false, "a head-butt does not take a limb off");
  assert.ok(best.speed >= CONFIG.combat.ramMinSpeed,
    `the scoring blow arrived at ${best.speed.toFixed(2)} m/s, under the ram's own floor`);

  assert.deepEqual(plain.reports, [],
    "a plain head has no striker, so `Combat` watches nothing and files nothing");
});

test("a plain head touching a post throughout still scores nothing on it", async () => {
  // **The anti-vacuous half, and it needs its own post height.** A plain head cannot reach the
  // one the ram comes down on, and that is the option rather than a hole in the fixture: its brow
  // traces a 0.241 m arc about a hinge 0.16 m below the head's centre and cannot get below about
  // 1.45 m, where a ram's plate reaches 1.32. So the post is raised into the plain head's own
  // guard, and what is asserted is that a head genuinely and repeatedly in contact with something
  // still files nothing -- because it has nothing to file with.
  const plain = await lungeAtPost("head.plain", 1.72);
  assert.ok(plain.contacts > 0,
    "the raised post is meant to be inside the plain head's own guard and was not touched");
  assert.deepEqual(plain.reports, []);
});

test("a person's press is what fires the lunge, through the mapping the mouse uses", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const stand = buildGolemStand(arena.scene, { side: "left" });
  // Through the **registered option**, so the registry's own adapter is in the path: a head that
  // read the right channel while nothing routed a command to it would pass a test that built the
  // module directly, and that is exactly the shape of the defect this channel already had once.
  const head = golemModule("head.ram").build({
    scene: arena.scene, side: "left", name: "press", socket: stand.socket("head"),
    layers: golemLayers("left"), materials: stand.materials,
  });
  try {
    const intent = benchIntent();
    // Nothing held: no stroke.
    applyButtonPose(intent, "primary", poseFromButtons(0, 0));
    head.command(intent);
    head.step(SUBSTEP);
    assert.equal(head.view().stroke, "idle");

    // The left button, which is the same press that thrusts a blade. `applyButtonPose` writes it
    // onto the acting hand and the natural striker together, and this module reads the second.
    applyButtonPose(intent, "primary", poseFromButtons(PRIMARY, 0));
    assert.equal(intent.natural.thrust, true, "the press has to reach the natural channel at all");
    assert.equal(intent.primary.thrust, true, "and the acting hand, unconditionally");
    head.command(intent);
    head.step(SUBSTEP);
    assert.equal(head.view().stroke, "drive", "the left button is what fires a ram lunge");

    // A stroke is an edge, not a level: holding it does not chain lunges.
    for (let step = 0; step < 3; step += 1) {
      head.command(intent);
      head.step(SUBSTEP);
    }
    assert.notEqual(head.view().stroke, "idle");

    // The right button is a level, and it is the guard rather than a stroke.
    const fresh = benchIntent();
    applyButtonPose(fresh, "primary", poseFromButtons(SECONDARY, 0));
    assert.equal(fresh.natural.guard, true);
    assert.equal(fresh.natural.thrust, false);
  } finally {
    head.dispose();
    stand.dispose();
    arena.dispose();
  }
});

test("a plain head does nothing whatever with the same press", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const stand = buildGolemStand(arena.scene, { side: "left" });
  const head = golemModule("head.plain").build({
    scene: arena.scene, side: "left", name: "inert", socket: stand.socket("head"),
    layers: golemLayers("left"), materials: stand.materials,
  });
  try {
    const intent = benchIntent();
    applyButtonPose(intent, "primary", poseFromButtons(PRIMARY, 0));
    for (let step = 0; step < 60; step += 1) {
      head.command(intent);
      head.step(SUBSTEP);
      assert.equal(head.view().stroke, "idle",
        "`plain` cannot attack, so a press on the natural channel is inert exactly as a hand slot"
        + " is inert on a body with no hands");
    }
  } finally {
    head.dispose();
    stand.dispose();
    arena.dispose();
  }
});

// ---------------------------------------------------------------------------------------
// The lunge as a velocity event.
// ---------------------------------------------------------------------------------------

test("the ram's lunge carries past where its drive left it and stops short of its own stop", async () => {
  const run = await runTorsoBench({ torsoId: "torso.plain", headId: "head.ram" });
  const lunge = run.lunge;
  assert.ok(lunge.driveEndPitch !== null, "the lunge never ran");
  // **A velocity event, not a pose sequence.** A pose sequence stops where the pose says; this
  // carries past on its own momentum, and the gap between the two numbers is the follow-through.
  assert.ok(lunge.carriedPastDrive > 0.5,
    `the head carried only ${lunge.carriedPastDrive.toFixed(4)} rad past its drive`);
  // And it must not *arrive* at the joint stop: a limb slamming into its own limit is a motor and
  // a limit pushing at each other. The table beside `HEAD_RAM.lunge` is what found the settings
  // where it does -- every drive longer than 0.05 s reaches it.
  assert.ok(lunge.deepestPitch < HEAD_NECK.pitchJointMax,
    `the lunge reached ${lunge.deepestPitch.toFixed(4)} rad against a stop at`
    + ` ${HEAD_NECK.pitchJointMax}`);
  assert.equal(run.head.selfContacts, 0);
  assert.equal(run.head.contacts, 0, "nothing on the bench is close enough to touch");
  // Provisional, pinned from the 2026-09-04 Node torso bench run, with both mandatory exclusion
  // windows applied by `BenchReadout`: the first 0.6 s, and 0.25 s after any contact.
  assert.ok(run.head.peakTipSpeedDriven > 2.5,
    `the lunge peaked at ${run.head.peakTipSpeedDriven.toFixed(2)} m/s`);
});

test("a plain head runs no stroke at all through the whole scripted sequence", async () => {
  const run = await runTorsoBench({ torsoId: "torso.plain", headId: "head.plain" });
  assert.equal(run.lunge.deepestPitch, null, "a plain head has no stroke to measure");
  assert.equal(run.head.selfContacts, 0);
  assert.equal(run.head.contacts, 0);
  // It still holds its head up and still bobs when hit, which is the half both options share.
  assert.ok(run.bob.peakMm > 5);
  assert.ok(run.bob.settleSeconds < run.bob.windowSeconds);
});
