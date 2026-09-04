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
import { ANCHOR_DRIVE, BENCH_READOUT, CHAIN_PITCH } from "../src/golem/config.ts";
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

for (const id of ["effector.none", "effector.pitch.blade"]) {
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
      assert.equal(view.anchorStray, null, "neither Session 02 chain has an anchor");
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
