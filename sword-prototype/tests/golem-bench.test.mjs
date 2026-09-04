// The golem effector bench, under real Havok.
//
// **Every threshold in this file is provisional.** They are pinned from the 2026-09-04 Node
// bench run and are to be re-taken after the owner's gate. They are *not* regression floors:
// this plan set exists because three body experiments each cleared a scalar proxy while the
// owner's judgement stayed red, and a number that has never been checked against a person's
// eye is a number that can only say "this did not change", never "this is right". The point of
// having them at all is the first of those two, which is worth having.
//
// The harness is the Node bench (`scripts/golem-bench.mjs`, `NullEngine`, real Havok, no
// rendering). Nothing here may be compared with a page reading: the two harnesses in this
// directory agree on converged behaviour and disagree by about 9 % on the Warrior's peak
// transient with identical code, and putting both in one column has already produced a
// regression report about a build where nothing had changed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsConstraintAxis } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";

import { CONFIG } from "../src/config.ts";
import { COLLIDES, LAYER } from "../src/physics.ts";
import { capsulePart } from "../src/rig.ts";
import { AnchorDrive, slewTowards } from "../src/golem/anchor-drive.ts";
import {
  ANCHOR_DRIVE, BENCH_READOUT, CHAIN_PITCH, CHAIN_REACH, CHAIN_WRIST,
} from "../src/golem/config.ts";
import { BenchReadout, blankSample } from "../src/golem/readout.ts";
import {
  EFFECTOR_CHAINS,
  EFFECTOR_TERMINALS,
  GOLEM_MODULES,
  benchModeLabel,
  golemModule,
} from "../src/golem/registry.ts";
import { buildGolemStand, golemLayers } from "../src/golem/stand.ts";
import { createHeadlessArena } from "../scripts/golem-headless-arena.mjs";
import { runGolemBench } from "../scripts/golem-bench.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUBSTEP = 1 / CONFIG.world.physicsHz;
const FRAME = 1 / 60;

const benchIntent = () => ({
  forward: 0, strafe: 0, turn: 0, actingHand: "primary",
  natural: { thrust: false, guard: false },
  posture: { trunkLean: 0, trunkTwist: 0, crouch: 0 },
  primary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false },
  secondary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false },
});

// ---------------------------------------------------------------------------------------
// The registry, which is the seam every later session extends.
// ---------------------------------------------------------------------------------------

test("every registered module id is unique and composes from its own definitions", () => {
  const ids = GOLEM_MODULES.map((option) => option.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate module ids: ${ids.join(", ")}`);

  // The half a type cannot state. `EFFECTOR_CHAINS` and `EFFECTOR_TERMINALS` are checked at
  // compile time to be filed under their own ids; what is checked here is that the *option*
  // ids are composed from those definitions rather than written out by hand, so a session that
  // appends a registration cannot give it a name that names a chain or terminal that is not
  // the one it built.
  const legal = new Set();
  for (const chain of Object.values(EFFECTOR_CHAINS)) {
    legal.add(`effector.${chain.id}`);
    for (const terminal of Object.values(EFFECTOR_TERMINALS)) {
      legal.add(`effector.${chain.id}.${terminal.id}`);
    }
  }
  for (const option of GOLEM_MODULES) {
    if (option.mode !== "effector") continue;
    assert.ok(legal.has(option.id), `${option.id} names no built chain-terminal pair`);
  }
});

test("every registered module declares a slot it can be built into and a labelled mode", () => {
  for (const option of GOLEM_MODULES) {
    assert.ok(option.slots.length > 0, `${option.id} fits no slot`);
    assert.ok(option.massKg > 0, `${option.id} weighs nothing`);
    // A `never` default in `benchModeLabel` makes an unlabelled mode a compile error; this is
    // the runtime half, which catches a mode string smuggled in through a cast.
    assert.equal(typeof benchModeLabel(option.mode), "string");
  }
  assert.equal(golemModule("effector.pitch.blade")?.slots.includes("secondary"), true);
  assert.equal(golemModule("no such module"), null);
});

test("the pair builder refuses a chain that carries its own terminal", async () => {
  const { effectorModule } = await import("../src/golem/effectors/effector.ts");
  const arena = await createHeadlessArena();
  const stand = buildGolemStand(arena.scene, { side: "left" });
  try {
    // Rung 0 hands out no weld, so pairing it with a blade is a refusal and not a silent
    // substitution -- which is the shield-that-shipped-as-a-club lesson applied to pairs.
    const illegal = effectorModule(EFFECTOR_CHAINS.none, EFFECTOR_TERMINALS.blade);
    assert.throws(() => illegal.build({
      scene: arena.scene, side: "left", name: "illegal",
      socket: stand.socket("primary"), layers: golemLayers("left"), materials: stand.materials,
    }), /carries its own terminal/);
  } finally {
    stand.dispose();
    arena.dispose();
  }
});

// ---------------------------------------------------------------------------------------
// Build, publish and dispose.
// ---------------------------------------------------------------------------------------

const ANCHORED = new Set(["effector.reach.blade", "effector.wrist.blade"]);

for (const id of [
  "effector.none", "effector.pitch.blade", "effector.reach.blade", "effector.wrist.blade",
]) {
  test(`${id} builds, publishes a view and disposes without leaving a body behind`, async () => {
    const arena = await createHeadlessArena({ populateDefaultGeometry: false });
    const scene = arena.scene;
    const stand = buildGolemStand(scene, { side: "left" });
    const before = scene.meshes.length;
    const module = golemModule(id).build({
      scene, side: "left", name: "census", socket: stand.socket("primary"),
      layers: golemLayers("left"), materials: stand.materials,
    });
    try {
      assert.ok(module.parts.length > 0, "a module with no parts is a module with no body");
      assert.equal(module.strikers.length, 1, "an effector offers exactly one striker");
      const view = module.view();
      assert.ok(view, "an effector publishes a view");
      assert.equal(view.slot, "primary");
      assert.equal(view.stroke, "idle");
      if (ANCHORED.has(id)) {
        // The anchor as a **field on the view**, which is what Session 02 asked for rather than
        // an overlay reaching into a chain. Rungs 2 and 3 are the first with one to publish.
        assert.ok(view.anchor, `${id} drives an anchor and must publish where it is`);
        assert.ok(view.anchorStray !== null && view.anchorStray < 0.01,
          `${id} was built ${view.anchorStray} m from its own anchor`);
      } else {
        assert.equal(view.anchorStray, null, "neither Session 02 chain has an anchor");
        assert.equal(view.anchor, null);
      }
      // An edge to report is the *terminal's* answer: rung 0's cap bites with mass, so an edge
      // alignment taken off it would be a number that means nothing and the readout says n/a.
      assert.equal(view.edge === null, id === "effector.none");
      assert.ok(module.envelope().reach > 0);

      // The filter on the **leaf**, read back. Setting a mask on a `PhysicsShapeContainer`
      // writes to a shape nothing consults and reads back garbage -- a shape set to 8 returned
      // 383476 -- and every weapon in this directory collided with everything for its whole
      // life because of that. Reading the value back is the only check that catches it.
      for (const part of module.parts) {
        const membership = part.part.shape.filterMembershipMask;
        assert.ok(membership === LAYER.LEFT_ARM || membership === LAYER.LEFT_SWORD,
          `${part.id} is on membership ${membership}, which is neither arm nor sword`);
        const collides = part.part.shape.filterCollideMask;
        assert.equal(collides & LAYER.LEFT_ARM, 0, `${part.id} collides with its own arm layer`);
        assert.equal(collides & LAYER.LEFT_TRUNK, 0, `${part.id} collides with its own trunk`);
        assert.equal(collides & LAYER.LEFT_SWORD, 0, `${part.id} collides with its own blade`);
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

test("severing a terminal makes it debris on its own leaf and stops it scoring", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const stand = buildGolemStand(arena.scene, { side: "left" });
  const module = golemModule("effector.pitch.blade").build({
    scene: arena.scene, side: "left", name: "sever", socket: stand.socket("primary"),
    layers: golemLayers("left"), materials: stand.materials,
  });
  try {
    const striker = module.strikers[0];
    assert.equal(striker.spent, false);
    module.sever();
    assert.equal(striker.spent, true, "a severed terminal must stop scoring");
    const blade = module.parts.find((part) => part.id.endsWith(".blade"));
    assert.equal(blade.part.shape.filterMembershipMask, LAYER.DEBRIS);
    assert.equal(blade.part.shape.filterCollideMask, COLLIDES.DEBRIS);
  } finally {
    module.dispose();
    stand.dispose();
    arena.dispose();
  }
});

// ---------------------------------------------------------------------------------------
// The weld frame.
// ---------------------------------------------------------------------------------------

test("the blade's weld does not fling it on the first solver step", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const scene = arena.scene;
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  const stand = buildGolemStand(scene, { side: "left" });
  const module = golemModule("effector.pitch.blade").build({
    scene, side: "left", name: "weld", socket: stand.socket("primary"),
    layers: golemLayers("left"), materials: stand.materials,
  });
  try {
    for (const part of module.parts) plugin.setActivationControl(part.part.body, 1);
    const before = module.view().tip.clone();
    scene._renderId += 1;
    scene._advancePhysicsEngineStep(1000 * FRAME);
    const speed = Vector3.Distance(module.view().tip, before) / FRAME;
    // A weld whose two frames disagree at construction is a violation the solver clears by
    // flinging the thing: measured on this directory's own weapons at **48.3 m/s** for a sword
    // and **80.4 m/s** for a club, on a fighter standing perfectly still. A correct weld leaves
    // the blade being carried by its link and nothing else.
    //
    // Provisional, pinned from the 2026-09-04 Node bench run, to be re-taken after the owner's
    // gate. Watched go red against a sign flip in `LINK_MOUNT.perp`.
    assert.ok(speed < 3, `the blade left the weld at ${speed.toFixed(2)} m/s on step one`);
  } finally {
    module.dispose();
    stand.dispose();
    arena.dispose();
  }
});

// ---------------------------------------------------------------------------------------
// The scripted sequence, per chain.
// ---------------------------------------------------------------------------------------

test("rung 0 reads a noise floor of nothing, with activation forced", async () => {
  const run = await runGolemBench({ moduleId: "effector.none" });
  const state = run.state;

  assert.equal(state.selfContacts, 0, "a golem's own parts must never collide with each other");
  assert.equal(state.contacts, 0, "rung 0 touches nothing at all on the stand");
  assert.equal(state.stuckSteps, 0);
  assert.equal(state.peakTargetError, 0,
    "rung 0 has no target and no drive, so its target error is exactly zero");

  // **Tip wander at rest reads zero on something that cannot move**, and the measurement is
  // only real because `scripts/golem-bench.mjs` forces `setActivationControl(body, 1)` on every
  // body first: Havok deactivates a body at rest, and a sleeping body reads a perfect zero
  // however badly it shakes when awake.
  //
  // "Zero" is 1.5e-5 mm measured -- fifteen nanometres, which is solver float noise on a rigid
  // weld to a keyframed block. The bound below is provisional, pinned from the 2026-09-04 Node
  // bench run, to be re-taken after the owner's gate.
  assert.ok(state.tipWanderMm < 0.001,
    `rung 0 wandered ${state.tipWanderMm} mm, which is not a noise floor`);
  assert.ok(state.peakTipSpeedRaw < 0.001,
    `rung 0's tip moved at ${state.peakTipSpeedRaw} m/s and nothing is driving it`);
});

test("rung 1 tracks its command, strokes and never touches itself", async () => {
  const run = await runGolemBench({ moduleId: "effector.pitch.blade" });
  const state = run.state;
  const guard = run.marks.find((mark) => mark.phase === "guard");

  assert.equal(state.selfContacts, 0, "a golem's own parts must never collide with each other");
  // Zero contacts of any kind is also the floor-clearance check: 0.34 m of link plus a 0.80 m
  // blade off a 1.42 m socket leaves 0.28 m under the tip at the bottom of the range, and a
  // blade that reached the floor would open a 0.25 s tip-speed exclusion window on every chop.
  assert.equal(state.contacts, 0, "nothing on the stand should reach the floor or the walls");
  assert.equal(state.stuckSteps, 0, "a limb whose error stops converging is stuck on something");

  // **Settle within the budget written in the chain file.** `CHAIN_PITCH.settledBand` is the
  // band and the budget is a fifth of a second, which is what the torque sweep beside
  // `motorTorque` was read against. Provisional, pinned from the 2026-09-04 Node bench run
  // (0.1625 s on the guard step, 0.1792 s on the return), to be re-taken after the owner's gate.
  assert.ok(guard, "the scripted sequence must contain a guard step");
  assert.ok(guard.state.settleSeconds !== null, "the guard step must be detected as a step");
  assert.ok(guard.state.settleSeconds < 0.25,
    `the guard step settled in ${guard.state.settleSeconds} s`);
  assert.ok(state.targetError < CHAIN_PITCH.settledBand,
    `the limb finished ${state.targetError} rad off its command`);

  // **The stroke's peak tip speed, inside the excluded windows.** Both exclusions are mandatory
  // for any tip-speed reading in this directory, and a peak that does not say which it is
  // outside means nothing. 144 startup steps is exactly 0.6 s at 240 Hz less the first sample,
  // which has no previous position to be differenced against; 0 contact steps because nothing
  // was struck.
  const startupSteps = Math.round(BENCH_READOUT.startupExclusionSeconds * CONFIG.world.physicsHz);
  // Within a step of 0.6 s worth, not exactly: the bench accumulates its clock as `t += 1/240`,
  // so the 144th sample lands at 0.5999999999999 rather than at 0.6 and falls inside the window
  // that the readout's own synthetic-sample test, which computes `t` by multiplication, sees
  // fall outside it. One step either way is the honest tolerance for a census taken off an
  // accumulated float clock, and pinning it exactly would be pinning the accumulation.
  assert.ok(Math.abs(state.excludedStartupSteps - startupSteps) <= 1,
    `${state.excludedStartupSteps} startup steps excluded, expected about ${startupSteps}`);
  assert.equal(state.excludedContactSteps, 0);
  assert.ok(state.peakTipSpeedDriven > 12 && state.peakTipSpeedDriven < 18,
    `the chop peaked at ${state.peakTipSpeedDriven} m/s outside both exclusion windows`);
  // **The raw peak is not larger than the driven one**, which says the fastest thing this limb
  // ever did was the stroke -- nothing inside either exclusion window beat it. That is the
  // property the two windows exist to protect, and it is worth asserting rather than merely
  // excluding: the whole reason a peak has to name its window is that a limb keyframing onto a
  // commanded pose is worth 77 m/s in a Warrior that never swings.
  //
  // It is **not** what pins the command starting at the build pose -- the assertion on the
  // first mark below is. Measured: with the command started at the cursor instead, the raw peak
  // is still 15.07 m/s, because the torque cap limits the lift whatever the command does. The
  // reading that moves is the first mark's, not this one.
  assert.ok(state.peakTipSpeedRaw <= state.peakTipSpeedDriven * 1.02,
    `the limb's fastest moment was ${state.peakTipSpeedRaw} m/s inside an exclusion window,`
    + ` against ${state.peakTipSpeedDriven} m/s for the stroke itself`);

  // **The limb lifts out of its build pose under a rate-limited command**, which is a detected
  // step in the first phase of the sequence. Started at the cursor instead, the command never
  // moves at all, no step is detected, and this reads null -- which is the mutation that turns
  // this red. A Warrior's anchor is teleported to the cursor on the first control step and this
  // is the golem's refusal of that.
  const rest = run.marks.find((mark) => mark.phase === "rest");
  assert.ok(rest?.state.settleSeconds !== null && rest?.state.settleSeconds !== undefined,
    "the limb did not lift out of its build pose; the command began where the cursor was");

  // Wander at rest, against rung 0's floor of 1.5e-5 mm. 2.876 mm measured; provisional, pinned
  // from the 2026-09-04 Node bench run, to be re-taken after the owner's gate.
  assert.ok(state.tipWanderMm < 6, `rung 1 wandered ${state.tipWanderMm} mm at rest`);
});

test("rung 1's chop is a velocity event, not a pose sequence", async () => {
  // The distinction the whole rung turns on, and the only way to see it is to watch the stroke
  // rather than its endpoints: a pose sequence stops where the pose says, and a velocity event
  // carries past its own target and comes back. So this drives the limb by hand and records
  // what the achieved angle was at the end of each stroke phase, and how deep the whole stroke
  // actually went -- **sampled on the physics clock**, because the phases are 0.05 s and 0.04 s
  // long and a per-frame sample at 60 Hz would step straight over one of them.
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const scene = arena.scene;
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  const stand = buildGolemStand(scene, { side: "left" });
  const module = golemModule("effector.pitch.blade").build({
    scene, side: "left", name: "stroke", socket: stand.socket("primary"),
    layers: golemLayers("left"), materials: stand.materials,
  });

  const seen = { idle: null, drive: null, follow: null };
  let previousPhase = "idle";
  let strokes = 0;
  let deepest = Infinity;
  const control = scene.onBeforePhysicsObservable.add(() => {
    module.step(SUBSTEP);
    const view = module.view();
    if (view.stroke === "drive" && previousPhase !== "drive") strokes += 1;
    previousPhase = view.stroke;
    seen[view.stroke] = view.axes[0].achieved;
    deepest = Math.min(deepest, view.axes[0].achieved);
  });

  try {
    for (const part of module.parts) plugin.setActivationControl(part.part.body, 1);
    const intent = benchIntent();
    const step = (frames) => {
      for (let frame = 0; frame < frames; frame += 1) {
        module.command(intent);
        scene._renderId += 1;
        scene._advancePhysicsEngineStep(1000 * FRAME);
      }
    };

    step(90);
    const settled = seen.idle;
    assert.ok(Math.abs(settled - CHAIN_PITCH.restPitch) < CHAIN_PITCH.settledBand,
      `the limb rested at ${settled} instead of ${CHAIN_PITCH.restPitch}`);
    deepest = Infinity;

    intent.primary.thrust = true;
    step(1);
    intent.primary.thrust = false;
    // Past the drive and the follow together: 0.05 + 0.04 s is under six frames at 60 Hz, and
    // the per-substep capture above has already recorded the last sample of each phase.
    step(6);
    const endOfDrive = seen.drive;
    const endOfFollow = seen.follow;
    // Then let the position motor arrest it. The deepest point of the stroke is reached *after*
    // the follow ends, which is the whole of what follow-through means.
    step(30);
    const deepestOfStroke = deepest;

    assert.equal(strokes, 1, "a thrust must run exactly one drive phase");
    assert.ok(endOfDrive !== null && endOfFollow !== null,
      "a stroke without both phases has no follow-through");
    assert.ok(endOfDrive < settled - 0.2,
      `the chop moved the limb from ${settled} to ${endOfDrive}, which is not a chop`);
    assert.ok(endOfFollow < endOfDrive,
      `the limb stopped at ${endOfDrive} instead of carrying through past it to ${endOfFollow}`);
    // **The follow-through proper.** The limb goes on past the end of the stroke, against a
    // position motor that is by then pulling it back at full torque. A pose sequence cannot do
    // this, and neither can a velocity event whose drive already used up the range.
    // Measured 0.808 rad past the drive's end with `followSeconds` at 0.04, against 0.385 with
    // the follow phase removed entirely -- the table beside `CHAIN_PITCH.chop` carries all four
    // rows. Bounding it at 0.6 is what makes this an assertion about the follow-through rather
    // than about a stroke happening at all. Provisional, pinned from the 2026-09-04 Node bench
    // run, to be re-taken after the owner's gate.
    assert.ok(endOfDrive - deepestOfStroke > 0.6,
      `the drive ended at ${endOfDrive} and the stroke carried only to ${deepestOfStroke}`);
    assert.ok(deepestOfStroke < endOfFollow - 0.2,
      `the stroke ended at ${endOfFollow} and carried only to ${deepestOfStroke}`);
    // **And it must not arrive at its own joint stop.** A limb slamming into a limit is a motor
    // and a limit pushing at each other, which is the buzz the Warrior's wrist was rewritten to
    // remove. The first draft's 0.14 s drive reached the stop with the drive alone and rebounded
    // off it, which is what the two tables beside `CHAIN_PITCH.chop` now record.
    assert.ok(deepestOfStroke > CHAIN_PITCH.jointMin + 0.05,
      `the stroke reached ${deepestOfStroke}, against a hard stop at ${CHAIN_PITCH.jointMin}`);

    step(180);
    assert.ok(Math.abs(seen.idle - settled) < CHAIN_PITCH.settledBand,
      `the limb finished the stroke at ${seen.idle} instead of returning to ${settled}`);

    // Held, not repeated. A stroke is an edge and holding the button must not chain chops --
    // the same rule `src/buttons.ts` states for every action a press pays for once.
    intent.primary.thrust = true;
    step(240);
    assert.equal(strokes, 2, "the first press of a held button must still chop");
    step(240);
    assert.equal(strokes, 2, "holding thrust chained a second chop; a stroke is an edge");
  } finally {
    scene.onBeforePhysicsObservable.remove(control);
    module.dispose();
    stand.dispose();
    arena.dispose();
  }
});

// ---------------------------------------------------------------------------------------
// Rungs 2 and 3: unique pose, the envelope, the mirror and the strokes.
// ---------------------------------------------------------------------------------------

/**
 * Build a chain on a stand and hand back everything a rung-2 or rung-3 test needs.
 *
 * A helper rather than six copies, because the interesting part of each of these tests is the
 * *command sequence* and the assertion, and a fixture repeated six times is a fixture that will
 * differ in one of them.
 */
async function onStand(id, slot = "primary") {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const scene = arena.scene;
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  const stand = buildGolemStand(scene, { side: "left" });
  const socket = stand.socket(slot);
  const module = golemModule(id).build({
    scene, side: "left", name: `t.${slot}`, socket,
    layers: golemLayers("left"), materials: stand.materials,
  });
  for (const part of module.parts) plugin.setActivationControl(part.part.body, 1);
  plugin.setActivationControl(stand.block.body, 1);
  const control = scene.onBeforePhysicsObservable.add(() => module.step(SUBSTEP));
  const intent = benchIntent();
  const hand = intent[slot];
  const run = (frames) => {
    for (let frame = 0; frame < frames; frame += 1) {
      module.command(intent);
      scene._renderId += 1;
      scene._advancePhysicsEngineStep(1000 * FRAME);
    }
  };
  const partAt = (suffix) => module.parts.find((part) => part.id.endsWith(suffix)).part;
  // The **hand**, which is the forearm's far end and is what the anchor pins and what the carry
  // rule is stated about. Not the tip: a blade reaches 0.80 m past the hand and crossing the
  // golem's own centreline with the steel is what a blade is for.
  const handPoint = () => {
    const fore = partAt(".forearm");
    const out = new Vector3(0, -CHAIN_REACH.foreLength / 2, 0);
    out.rotateByQuaternionToRef(fore.mesh.rotationQuaternion ?? Quaternion.Identity(), out);
    return out.addInPlace(fore.mesh.position);
  };
  // The elbow is the far end of the upper arm, read the way everything in a golem reads a world
  // transform: `mesh.position` and `mesh.rotationQuaternion` and nothing else.
  const elbow = () => {
    const upper = partAt(".upperArm");
    const out = new Vector3(0, -CHAIN_REACH.upperLength / 2, 0);
    out.rotateByQuaternionToRef(upper.mesh.rotationQuaternion ?? Quaternion.Identity(), out);
    return out.addInPlace(upper.mesh.position);
  };
  const dispose = () => {
    scene.onBeforePhysicsObservable.remove(control);
    module.dispose();
    stand.dispose();
    arena.dispose();
  };
  return { arena, scene, stand, socket, module, intent, hand, run, elbow, handPoint, dispose };
}

test("rung 2's elbow is a single-valued function of the hand target", async () => {
  // **The load-bearing test of this session.** Frozen rule 2 says a module has no more driven
  // axes than its target specifies, and the whole reason rungs 2 and 3 exist is that the recorded
  // Warrior defects -- an elbow that wrapped around the back, a shield hand that swung behind the
  // trunk -- are the overview's candidate explanation of a seven-axis chain asked for a six-axis
  // pose. A spare axis means the elbow can swivel about the shoulder-to-hand line without moving
  // the hand at all, so where it ends up depends on where it came *from*.
  //
  // So this visits a grid of the envelope twice, in opposite orders, and asserts that the elbow
  // lands in the same place both times for the same hand target. A history-dependent elbow fails
  // it; a chain with three driven axes against a three-dimensional target cannot be.
  //
  // **Watched go red against a mutation, as the green-test-that-asserts-nothing rule demands.**
  // Adding a free twist axis to the shoulder's pitch hinge in `arm-core.ts` --
  // `swing: { x: {...}, y: { min: -1.2, max: 1.2 } }` -- gives the upper arm a rotation about its
  // own long axis, which moves the elbow's hinge plane without moving the elbow's *distance* from
  // the shoulder, and is exactly the spare axis the Warrior has. The recorded result is in
  // `docs/measurements.md`.
  const rig = await onStand("effector.reach.blade");
  try {
    const R = CHAIN_REACH;
    // A grid inside the envelope, stated as cursor positions and reach presets so that nothing
    // here reaches past `Intent` to pose the chain -- the same seam a person drives.
    const grid = [];
    for (const pointerX of [-0.8, -0.2, 0.4, 1.0]) {
      for (const pointerY of [-0.7, 0, 0.6]) {
        for (const guard of [false, true]) grid.push({ pointerX, pointerY, guard });
      }
    }
    const visit = (order) => {
      const seen = new Map();
      for (const cell of order) {
        rig.hand.pointerX = cell.pointerX;
        rig.hand.pointerY = cell.pointerY;
        rig.hand.guard = cell.guard;
        // Long enough to converge from anywhere in the envelope: the rate limit is 1.2 m/s and
        // the envelope is under 1.5 m across, so a second and a half is a full traverse plus a
        // settle. A shorter hold would measure the approach rather than the pose.
        rig.run(90);
        const view = rig.module.view();
        seen.set(`${cell.pointerX}|${cell.pointerY}|${cell.guard}`, {
          hand: view.axes.map((axis) => axis.achieved),
          elbow: rig.elbow().clone(),
        });
      }
      return seen;
    };
    const forward = visit(grid);
    const backward = visit([...grid].reverse());

    let worstHand = 0;
    let worstElbow = 0;
    for (const [key, first] of forward) {
      const second = backward.get(key);
      const handApart = Math.hypot(
        first.hand[0] - second.hand[0], first.hand[1] - second.hand[1],
        first.hand[2] - second.hand[2],
      );
      const elbowApart = Vector3.Distance(first.elbow, second.elbow);
      worstHand = Math.max(worstHand, handApart);
      worstElbow = Math.max(worstElbow, elbowApart);
    }
    // The hands must agree first, or the elbow comparison is between two different targets and
    // says nothing -- the "fixture that cannot exhibit the defect" shape, pointed the other way.
    assert.ok(worstHand < 0.01,
      `the two passes did not reach the same hand targets (worst ${worstHand} in axis units)`);
    // **Measured both ways**, which is the only thing that makes this an assertion rather than a
    // hope: 0.34 mm over the whole grid as the chain stands, and **17.08 mm** with the shoulder
    // opened to three axes -- a fiftyfold move, and the bound below sits five times above the
    // clean figure and five times under the mutated one. Note what the mutation had to be: adding
    // a *twist* axis alone did **not** move the number at all, because a position-only anchor
    // exerts no torque about the upper arm's own axis and nothing excites the spare degree of
    // freedom. The Warrior's rope elbow needs a six-axis pin to drive it, which is a finding in
    // its own right and is recorded in `docs/measurements.md`.
    //
    // Provisional, pinned from the 2026-09-04 Node bench run, to be re-taken after the owner's
    // gate.
    assert.ok(worstElbow < 0.003,
      `the same hand target put the elbow ${(worstElbow * 1000).toFixed(1)} mm apart`
      + " depending on which direction it was approached from; that is a spare axis");
    assert.equal(grid.length, forward.size);
  } finally {
    rig.dispose();
  }
});

test("rung 2 clamps a cross-body command into the envelope instead of refusing it", async () => {
  // Frozen rule 3, as a phase rather than as a paragraph: the mapping clamps **before the anchor
  // is ever handed a target**, so there is no refusal branch anywhere and nothing downstream has
  // to know the rule exists. The Warrior does the opposite -- `Arm.aim` reads
  // `signedShieldAzimuth < -0.60` and substitutes -- and that substitution is a controller
  // arguing with a command.
  const rig = await onStand("effector.reach.blade");
  try {
    const R = CHAIN_REACH;
    const socket = rig.socket;
    const outboard = socket.outboard;
    // Measured on the **hand** and against the golem's own centreline, which is what `carryMin`
    // is stated about. The stand is built at the origin facing +Z, so the centreline is x = 0.
    const lateral = () => outboard * rig.handPoint().x;

    // Fully inboard at guard reach: short, so the carry rule does not bite and the limb goes
    // where it is told. This is the control -- without it, the assertion below is satisfied by a
    // chain that simply cannot swing inboard at all.
    rig.hand.pointerX = -1;
    rig.hand.pointerY = 0;
    rig.hand.guard = true;
    rig.run(150);
    const guarded = rig.module.view().axes[1].achieved;
    assert.ok(guarded < -0.4,
      `a short cross-body guard reached only ${guarded} rad of swing, so nothing was clamped`);

    // The same cursor at thrust reach, which is outside the envelope: the carry floor at
    // `reachThrust` is `asin(carryMin / (reachThrust * cos lift))`, well above `swingMin`.
    rig.hand.guard = false;
    rig.hand.thrust = true;
    rig.run(240);
    const reached = rig.module.view().axes[1].achieved;
    const floor = Math.asin(R.carryMin / R.reachThrust);
    assert.ok(reached > floor - 0.08,
      `the clamp let the hand to ${reached} rad of swing against a floor of ${floor}`);
    assert.ok(reached < R.swingMax,
      "the clamp pushed the hand past the far side of its own envelope");
    // And the point of the rule: the hand never crosses its own golem's centreline.
    assert.ok(lateral() > 0,
      `the hand finished ${lateral()} m inboard of the golem's own centreline`);
  } finally {
    rig.dispose();
  }
});

test("the two sockets are mirror images under one command", async () => {
  // **The mirroring trap, taken out at the root.** The stroke geometry in `policies.ts` is
  // written for a right arm and has to be mirrored for the other, and a sign got backwards there
  // does not look like a hand held wrong -- it looks like an arm coming apart, 504 mm of
  // hand-to-anchor stray, because the shoulder cone refuses the twist and the solver pays for the
  // orientation out of the position.
  //
  // Rungs 2 and 3 mirror in exactly two places and this asserts both: `swing` is outboard-signed
  // so the mapping needs no mirror at all, and `roll` is multiplied by the socket's outboard sign
  // because the mirror image of a rotation about the limb's own axis is its negative. The bend is
  // deliberately **not** mirrored -- a rotation about the arm plane's lateral is a motion inside
  // that plane, and mirroring it would flex one wrist backwards -- and a wrong answer there shows
  // up here as the two tips failing to be reflections.
  const left = await onStand("effector.wrist.blade", "primary");
  const right = await onStand("effector.wrist.blade", "secondary");
  try {
    // **The cursor is mirrored and the wrist inputs are not**, and that asymmetry is the subject.
    // `pointerX` is a screen position and there is only one of it, so a cursor to the right sends
    // *both* hands to the right -- the Warrior's `azimuthOf` has the same property. So the pose
    // that mirrors a primary at `pointerX = +0.55` is a secondary at `-0.55`. `roll` is the other
    // way round: the module multiplies it by the socket's outboard sign, so the *same* input
    // already produces mirrored rolls, and mirroring the input too would undo it. `wristBend`
    // takes no sign at all, because a bend is a motion inside the arm's own plane.
    for (const [rig, pointerX] of [[left, 0.55], [right, -0.55]]) {
      for (const channel of ["primary", "secondary"]) {
        Object.assign(rig.intent[channel], {
          pointerX, pointerY: 0.3, roll: 0.9, wristBend: 0.6, thrust: false, guard: false,
        });
      }
      rig.run(240);
    }
    const a = left.module.view();
    const b = right.module.view();
    const mirrored = new Vector3(-b.tip.x, b.tip.y, b.tip.z);
    const apart = Vector3.Distance(a.tip, mirrored);
    // Provisional, pinned from the 2026-09-04 Node bench run. The two chains are separately
    // simulated so they do not converge bit-identically; what is asserted is that they are the
    // same pose, not the same floats.
    assert.ok(apart < 0.02,
      `the two sockets settled ${(apart * 1000).toFixed(1)} mm from being mirror images`);
    // And the edge, which is the half the roll sign decides. Reflecting a direction about the
    // x = 0 plane negates its x, so a correctly mirrored roll puts the two edges here.
    const edge = new Vector3(-b.edge.x, b.edge.y, b.edge.z);
    const edgeApart = Vector3.Distance(a.edge, edge);
    assert.ok(edgeApart < 0.05,
      `the two blades' edges are ${edgeApart} apart from being mirror images; the roll sign is`
      + " wrong on one side");
  } finally {
    left.dispose();
    right.dispose();
  }
});

test("rung 3's wrist owns orientation and the anchor never pays for it", async () => {
  // **Split by axis, not doubled.** The anchor drives three linear axes and no angular ones; the
  // wrist drives two angular axes and no linear ones. The Warrior's failure was the other shape
  // -- its grip motor owned orientation *and* position, so a roll it could not reach was paid for
  // out of the position, 504 mm of it. Here a roll the wrist cannot reach can only be a roll the
  // wrist did not reach, and the reading that says so is the anchor stray staying small while the
  // roll goes to its limit and past it.
  const rig = await onStand("effector.wrist.blade");
  try {
    const W = CHAIN_WRIST;
    rig.hand.pointerX = 0.4;
    rig.hand.pointerY = 0.2;
    rig.run(180);
    const settledStray = rig.module.view().anchorStray;

    // Demand a roll well past the stop, and a full bend with it.
    rig.hand.roll = 4;
    rig.hand.wristBend = 1;
    rig.run(240);
    const view = rig.module.view();
    const roll = view.axes.find((axis) => axis.id === "roll");
    const bend = view.axes.find((axis) => axis.id === "bend");
    assert.ok(Math.abs(roll.commanded - W.rollMax) < 1e-9,
      `a roll of 4 rad was commanded as ${roll.commanded} instead of being clamped to the stop`);
    assert.ok(Math.abs(roll.achieved - roll.commanded) < 0.05,
      `the wrist rolled to ${roll.achieved} against a command of ${roll.commanded}`);
    assert.ok(Math.abs(bend.achieved - bend.commanded) < 0.05,
      `the wrist bent to ${bend.achieved} against a command of ${bend.commanded}`);
    // The whole claim, in one number: an impossible orientation demand costs the *position*
    // nothing, because the two drives share no axis. Provisional, pinned from the 2026-09-04 Node
    // bench run (0.03 mm settled, 0.04 mm at full roll).
    assert.ok(view.anchorStray < 0.005,
      `the hand strayed ${(view.anchorStray * 1000).toFixed(2)} mm from its anchor while the`
      + ` wrist was being asked for an orientation it cannot reach (${settledStray * 1000} mm`
      + " before the demand)");
  } finally {
    rig.dispose();
  }
});

test("rung 2's thrust is a velocity event, not a pose sequence", async () => {
  // The same distinction rung 1's chop test makes, in the units an anchor works in: a pose
  // sequence stops where the pose says, and a velocity event carries past its own command and
  // comes back. The anchor's analogue of switching a motor to VELOCITY is dropping its *force*
  // ceiling while the command holds, so the limb decelerates against gravity rather than against
  // the drive.
  const rig = await onStand("effector.reach.blade");
  try {
    const R = CHAIN_REACH;
    rig.hand.pointerX = 0.4;
    rig.hand.pointerY = 0.2;
    rig.run(180);

    let atDriveEnd = null;
    let furthest = 0;
    let phases = 0;
    let previous = "idle";
    const watch = rig.scene.onBeforePhysicsObservable.add(() => {
      const view = rig.module.view();
      if (view.stroke === "drive" && previous !== "drive") phases += 1;
      if (previous === "drive" && view.stroke !== "drive") atDriveEnd = view.axes[0].achieved;
      previous = view.stroke;
      furthest = Math.max(furthest, view.axes[0].achieved);
    });
    rig.hand.thrust = true;
    rig.run(1);
    rig.hand.thrust = false;
    rig.run(90);
    rig.scene.onBeforePhysicsObservable.remove(watch);

    assert.equal(phases, 1, "a thrust must run exactly one drive phase");
    assert.ok(atDriveEnd !== null, "a stroke without a drive phase has no follow-through");
    // **The follow-through proper**, measured as the reach the hand carries to past where the
    // drive left it. Measured 47.1 mm with `followSeconds` at 0.06 against 13.6 mm with the
    // follow phase removed entirely; the table beside `CHAIN_REACH.thrust` carries all five rows.
    // Provisional, pinned from the 2026-09-04 Node bench run.
    assert.ok(furthest - atDriveEnd > 0.025,
      `the drive ended at ${atDriveEnd} m and the stroke carried only to ${furthest} m`);
    // **And it must not arrive at the arm's own extension.** A limb slamming into its own stop is
    // a motor and a limit pushing at each other, which is the buzz `arm.ts`'s wrist was rewritten
    // to get rid of -- and driving the stroke to `reachMax` instead of `reachThrust` did exactly
    // that, 0.7812 m against a full extension of 0.780.
    assert.ok(furthest < R.upperLength + R.foreLength - 0.03,
      `the stroke carried the hand to ${furthest} m against a full extension of`
      + ` ${R.upperLength + R.foreLength} m`);

    // Held, not repeated: a stroke is an edge and holding the button must not chain them.
    rig.hand.thrust = true;
    rig.run(240);
    rig.run(240);
    assert.equal(phases, 1, "the watcher was removed, so this is a control on the count above");
  } finally {
    rig.dispose();
  }
});

test("rungs 2 and 3 track their commands with zero contacts over the scripted sequence", async () => {
  for (const id of ["effector.reach.blade", "effector.wrist.blade"]) {
    const run = await runGolemBench({ moduleId: id });
    const state = run.state;
    assert.equal(state.selfContacts, 0, `${id}: a golem's own parts must never collide`);
    // Zero contacts of any kind is also the floor-clearance check: `liftMin` and `reachMax`
    // together put the blade's point 0.436 m off the floor at the bottom of the envelope, and a
    // contact would open a 0.25 s tip-speed exclusion window on every stroke.
    assert.equal(state.contacts, 0, `${id}: nothing should reach the floor or the walls`);
    assert.equal(state.stuckSteps, 0, `${id}: an error that stops converging is stuck on something`);

    // **The reading `AGENTS.md` says to take first.** A driven limb that is not within a few
    // millimetres of its own anchor while nothing is asking it to be anywhere else is not posed
    // wrongly, it is stuck on something. Measured 3.73 mm on rung 2 and 4.64 mm on rung 3 against
    // a Warrior's 242.88 mm over its own sweep. Provisional, pinned from the 2026-09-04 Node
    // bench run.
    assert.ok(state.idleAnchorStrayMm !== null && state.idleAnchorStrayMm < 20,
      `${id} strayed ${state.idleAnchorStrayMm} mm from its own anchor outside every stroke`);
    // The strokes are the other half, and they stray by design -- a follow-through is the limb
    // leaving its anchor. That number is recorded rather than bounded tightly.
    assert.ok(state.peakAnchorStrayMm > state.idleAnchorStrayMm,
      `${id}'s strokes did not leave its anchor at all, so nothing carried through`);

    assert.ok(state.envelopeStrokes === undefined);
    assert.deepEqual([...run.envelope.strokes], ["thrust", "cut", "cover"]);
    assert.ok(run.envelope.reachable, `${id} commands a point and must publish its reachable set`);
    assert.equal(run.envelope.reachable.carryMin, CHAIN_REACH.carryMin);
    assert.equal(run.envelope.settledBand, CHAIN_REACH.settledBand);
  }
});

// ---------------------------------------------------------------------------------------
// The anchor drive, which has no page-side reader until Session 03.
// ---------------------------------------------------------------------------------------

test("the anchor drive rate-limits its target and its force cap is finite", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const scene = arena.scene;
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  const layers = golemLayers("left");

  const freeBody = (name, at) => capsulePart(scene, {
    name, position: at, rotation: Quaternion.Identity(),
    height: 0.3, radius: 0.05, mass: 5,
    layer: layers.body, collidesWith: layers.bodyCollidesWith,
  });

  const start = new Vector3(0, 2, 0);
  const strong = freeBody("anchor.strong", start);
  const weak = freeBody("anchor.weak", new Vector3(2, 2, 0));
  const drives = [
    new AnchorDrive(scene, {
      name: "strong", target: strong, position: start.clone(),
      rotation: Quaternion.Identity(), parameters: { ...ANCHOR_DRIVE_AXES() },
    }),
    new AnchorDrive(scene, {
      name: "weak", target: weak, position: new Vector3(2, 2, 0),
      rotation: Quaternion.Identity(),
      // One newton against a 5 kg body under gravity: the cap is what decides, so this body
      // must fall out from under its anchor.
      parameters: { ...ANCHOR_DRIVE_AXES(), linearForce: 1, angularForce: 1 },
    }),
  ];
  const wanted = [new Vector3(0, 2, 3), new Vector3(2, 2, 0)];
  const control = scene.onBeforePhysicsObservable.add(() => {
    for (let index = 0; index < drives.length; index += 1) {
      drives[index].drive(SUBSTEP, wanted[index], Quaternion.Identity());
    }
  });
  try {
    for (const part of [strong, weak]) plugin.setActivationControl(part.body, 1);
    const seconds = 0.25;
    for (let frame = 0; frame * FRAME < seconds; frame += 1) {
      scene._renderId += 1;
      scene._advancePhysicsEngineStep(1000 * FRAME);
    }
    const elapsed = Math.ceil(seconds / FRAME) * FRAME;

    // **The rate limit.** The target is 3 m away; the anchor may not have gone further than
    // `linearRate` metres a second however far away it was told to be. That is the whole
    // difference from `Arm`'s anchor, which is teleported and therefore keyframes onto its
    // commanded pose on the first control step -- 77 m/s of tip speed in a fighter that never
    // swings. Mutating `slewTowards` to return `wanted` turns this red.
    const travelled = Vector3.Distance(drives[0].anchor.mesh.position, start);
    assert.ok(travelled <= ANCHOR_DRIVE.linearRate * elapsed + 1e-6,
      `the anchor moved ${travelled} m in ${elapsed} s at a limit of ${ANCHOR_DRIVE.linearRate} m/s`);
    assert.ok(travelled > 0.5 * ANCHOR_DRIVE.linearRate * elapsed,
      "the anchor did not move at anything like its own rate limit");

    // **The force cap.** A body whose anchor is commanded to hold still, with a 1 N ceiling,
    // falls: the drive is a finite force budget and not a constraint.
    assert.ok(drives[1].stray() > 0.05,
      `a 1 N motor held a 5 kg body to ${drives[1].stray()} m of its anchor under gravity`);
    // And the strong one does not, which is the control: without it the assertion above is
    // satisfied by an anchor drive that does nothing at all.
    assert.ok(drives[0].stray() < 0.25,
      `the full-force anchor let its body stray ${drives[0].stray()} m`);
  } finally {
    scene.onBeforePhysicsObservable.remove(control);
    for (const drive of drives) drive.dispose();
    for (const part of [strong, weak]) {
      part.body.dispose();
      part.shape.dispose();
      part.mesh.dispose(false, false);
    }
    arena.dispose();
  }
});

const ANCHOR_DRIVE_AXES = () => ({
  linear: [
    PhysicsConstraintAxis.LINEAR_X, PhysicsConstraintAxis.LINEAR_Y, PhysicsConstraintAxis.LINEAR_Z,
  ],
  angular: [
    PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxis.ANGULAR_Y, PhysicsConstraintAxis.ANGULAR_Z,
  ],
  linearForce: ANCHOR_DRIVE.linearForce,
  angularForce: ANCHOR_DRIVE.angularForce,
  linearRate: ANCHOR_DRIVE.linearRate,
  angularRate: ANCHOR_DRIVE.angularRate,
});

test("slewTowards is a ceiling on speed and not an exponential response", () => {
  // The distinction matters enough to be its own assertion: `1 - exp(-k*dt)` moves fastest when
  // the error is largest and never arrives, and a rate limit moves at the same speed whether
  // the command jumped a millimetre or a metre. The second one is what makes a flicked cursor
  // read as a sweep.
  assert.equal(slewTowards(0, 100, 2, 0.5), 1);
  assert.equal(slewTowards(0, 0.1, 2, 0.5), 0.1);
  assert.equal(slewTowards(0, -100, 2, 0.5), -1);
  assert.equal(slewTowards(5, 5, 2, 0.5), 5);
});

// ---------------------------------------------------------------------------------------
// The instrument itself.
// ---------------------------------------------------------------------------------------

test("the readout calls a slowly ramping command moving, not still", () => {
  // The defect this was written against: the first spelling compared the command against a
  // baseline the same test refreshed, so a command ramping slowly enough never registered as
  // motion -- and at a target rate of 2.5 rad/s the limb travelled through most of its range
  // while the instrument reported 796 mm of "wander at rest". A green instrument that measures
  // nothing is the same defect as a green test that asserts nothing.
  const readout = new BenchReadout({ settledBand: 0.02 });
  const sample = blankSample();
  const rate = 2.5;
  for (let step = 0; step < 480; step += 1) {
    sample.t = step * SUBSTEP;
    sample.commanded = rate * sample.t;
    sample.achieved = sample.commanded;
    // A tip a metre out on the swing, so a moving command is a moving tip.
    sample.tipX = Math.sin(sample.commanded);
    sample.tipY = Math.cos(sample.commanded);
    sample.tipZ = 0;
    readout.sample(sample);
  }
  assert.equal(readout.state().tipWanderMm, 0,
    "a command ramping at 2.5 per second was counted as a limb at rest");
});

test("the readout separates settle from arrival, and excludes both mandatory windows", () => {
  const readout = new BenchReadout({ settledBand: 0.02 });
  const sample = blankSample();
  // A command that steps once, at 1 s, and an axis that tracks it exactly one tenth of a second
  // later. Settle and arrival are then both 0.1 s, and the exclusion census is exact.
  for (let step = 0; step < 720; step += 1) {
    sample.t = step * SUBSTEP;
    sample.commanded = sample.t >= 1 ? 1 : 0;
    sample.achieved = sample.t >= 1.1 ? 1 : 0;
    sample.tipX = sample.achieved;
    readout.sample(sample);
  }
  const state = readout.state();
  assert.ok(Math.abs(state.settleSeconds - 0.1) < 2 * SUBSTEP,
    `settle read ${state.settleSeconds}`);
  assert.ok(Math.abs(state.arrivalSeconds - 0.1) < 2 * SUBSTEP,
    `arrival read ${state.arrivalSeconds}`);
  const startup = Math.round(BENCH_READOUT.startupExclusionSeconds * CONFIG.world.physicsHz);
  assert.equal(state.excludedStartupSteps, startup - 1);
  assert.equal(state.excludedContactSteps, 0);

  // And with a contact, the second window opens for exactly 0.25 s.
  const second = new BenchReadout({ settledBand: 0.02 });
  const hit = blankSample();
  for (let step = 0; step < 720; step += 1) {
    hit.t = step * SUBSTEP;
    hit.contacts = hit.t >= 2 && hit.t < 2 + SUBSTEP / 2 ? 1 : 0;
    second.sample(hit);
  }
  const window = Math.round(BENCH_READOUT.contactExclusionSeconds * CONFIG.world.physicsHz);
  assert.equal(second.state().excludedContactSteps, window);
  assert.equal(second.state().contacts, 1);
});

// ---------------------------------------------------------------------------------------
// The publication rule, checked in the source rather than in a scene.
// ---------------------------------------------------------------------------------------

test("nothing a golem publishes reaches the world transform through a world matrix", () => {
  // `getWorldMatrix()` short-circuits on the render id, and *reading* it stamps that id as a
  // side effect -- silently converting every later reader in the frame, including a person
  // measuring from the console, into a reader of the first sample. It cost this directory a
  // clean nine per cent phantom regression in a build where the physics was provably
  // bit-identical. `Fighter.observe` therefore reads `mesh.position` and
  // `mesh.rotationQuaternion` and nothing else, and `tests/view.test.mjs` pins that; this is
  // the golem half of the same rule, read out of the source because there is no cheap way to
  // catch it in a scene.
  const banned = /\.getWorldMatrix\(|\.absolutePosition|\.absoluteRotationQuaternion|computeWorldMatrix\(/;
  const roots = [
    path.join(ROOT, "src", "golem"),
    path.join(ROOT, "src", "bench"),
  ];
  const offenders = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith(".ts")) continue;
      const source = fs.readFileSync(full, "utf8");
      for (const [index, line] of source.split("\n").entries()) {
        // Comments are where the rule is *explained*, so they are not offences.
        const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
        if (banned.test(code)) offenders.push(`${path.relative(ROOT, full)}:${index + 1}`);
      }
    }
  };
  for (const root of roots) walk(root);
  assert.deepEqual(offenders, [],
    "a golem reader reached the world transform through a matrix that stamps the render id");
});
