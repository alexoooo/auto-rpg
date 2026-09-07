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
import { COLLIDES, LAYER, collisionFilterIsExact } from "../src/physics.ts";
import { capsulePart } from "../src/rig.ts";
import { AnchorDrive, slewTowards } from "../src/golem/anchor-drive.ts";
import {
  ANCHOR_DRIVE, BENCH_READOUT, BENCH_STAND, CHAIN_PITCH, CHAIN_REACH, CHAIN_WRIST,
  TERMINAL_MACE, TERMINAL_MAUL, TERMINAL_PLATE, TERMINAL_WHIP, TORSO_PLAIN, TORSO_PLATED,
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
import { BUTTON_REACH } from "../src/buttons.ts";
import { createHeadlessArena } from "../scripts/golem-headless-arena.mjs";
import {
  COMMITTED_SHAPE_CANDIDATES, PARRY_ACROSS_METRES, PARRY_ARRIVED_METRES, STROKE_GUARD_SECONDS,
  runGolemBench, runParryBench, runStrokeBench,
} from "../scripts/golem-bench.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUBSTEP = 1 / CONFIG.world.physicsHz;
const FRAME = 1 / 60;

const benchIntent = () => ({
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

/** Which chains drive an anchor, which is what decides whether the view publishes one. */
const anchored = (id) => id.startsWith("effector.reach.") || id.startsWith("effector.wrist.");

/**
 * Every effector the registry offers, taken from the registry.
 *
 * A list here would be a hand-maintained copy of `GOLEM_MODULES`, and `AGENTS.md` carries the
 * rule about those: it went stale for two sessions the last time one was written out. Session 04
 * took the shelf from four pairs to eleven, and every one of them has to build, publish, filter
 * on its own leaves and dispose clean without anybody adding a name here.
 */
const EFFECTOR_IDS = GOLEM_MODULES.filter((o) => o.mode === "effector").map((o) => o.id);

for (const id of EFFECTOR_IDS) {
  test(`${id} builds, publishes a view and disposes without leaving a body behind`, async () => {
    const arena = await createHeadlessArena({ populateDefaultGeometry: false });
    const scene = arena.scene;
    const stand = buildGolemStand(scene, { side: "left" });
    const before = scene.meshes.length;
    const module = golemModule(id).build({
      scene, side: "left", name: "census", socket: stand.socket("primary"),
      companion: stand.socket("secondary"),
      layers: golemLayers("left"), materials: stand.materials,
    });
    try {
      assert.ok(module.parts.length > 0, "a module with no parts is a module with no body");
      // **At least one, and a whip has four.** Session 02's "exactly one" was right for a rigid
      // terminal and wrong for a chain of bodies: a whip that scored only with its final bead
      // would mostly miss, and one that scored with all eight would bruise with its own handle.
      assert.ok(module.strikers.length >= 1, "a terminal that offers no striker scores nothing");
      assert.equal(module.strikers.length, id.endsWith(".whip") ? TERMINAL_WHIP.strikingSegments : 1);
      const view = module.view();
      assert.ok(view, "an effector publishes a view");
      assert.equal(view.slot, "primary");
      assert.equal(view.stroke, "idle");
      // A trailing grip's error is a two-socket terminal's reading and nobody else's, and null
      // for that one too at build: the maul takes its second grip when the second hand arrives,
      // and a reading of the distance to a grip nobody holds is not a stray. Null rather than
      // zero, which would read as a grip held perfectly by a limb that is not there.
      assert.equal(view.gripStray, null);
      if (anchored(id)) {
        // The anchor as a **field on the view**, which is what Session 02 asked for rather than
        // an overlay reaching into a chain. Rungs 2 and 3 are the first with one to publish.
        assert.ok(view.anchor, `${id} drives an anchor and must publish where it is`);
        assert.ok(view.anchorStray !== null && view.anchorStray < 0.01,
          `${id} was built ${view.anchorStray} m from its own anchor`);
      } else {
        assert.equal(view.anchorStray, null, "neither Session 02 chain has an anchor");
        assert.equal(view.anchor, null);
      }
      // An edge to report is the *terminal's* answer: rung 0's cap bites with mass and so do the
      // plate, the mace and the whip, so an edge alignment taken off any of them would be a
      // number that means nothing and the readout says n/a. Only the blade has one.
      assert.equal(view.edge !== null, id.endsWith(".blade"));
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
        // **And the filter-exactness helper the layer table already owns**, which is the check
        // the session plan asks for by name. Every golem part is a single leaf and never a
        // `PhysicsShapeContainer`, so the container and the leaf are the same shape and this
        // reads back true -- and it stops reading back true the moment somebody builds a
        // compound and sets the mask on the wrapper.
        assert.equal(
          collisionFilterIsExact(part.part.shape, [part.part.shape], membership, collides), true,
          `${part.id}'s filter did not read back as it was written`,
        );
        assert.equal(part.part.shape.numChildren ?? 0, 0,
          `${part.id} is a compound shape; its masks have to go on each child`);
      }
      // The plate is refused the shield bit deliberately -- see `golemLayersFor` in
      // `src/physics.ts`. Asserted rather than trusted, because taking it would import the one
      // pair frozen rule 5 forbids and nothing else in the suite would notice.
      for (const part of module.parts) {
        assert.notEqual(part.part.shape.filterMembershipMask, LAYER.LEFT_SHIELD,
          `${part.id} took the held shield's own layer, which collides with its owner's trunk`);
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
  // **What the peak is a reading of moved on 2026-09-05, and so did the number.** It used to be
  // `CHAIN_PITCH.chop.driveRate` -- a scripted 12 rad/s velocity event -- and read 12 to 18 m/s.
  // There is no script; the sequence's `chop` mark asks for the bottom of the range in 0.20 s,
  // which is 9.25 rad/s against a chain whose `targetRate` is 6, so what is measured is the
  // chain's own ceiling carried across its own reach and then whatever the link's momentum adds
  // on top. The floor is that ceiling exactly, which is the assertion that the limb reaches the
  // rate it is allowed; the ceiling on the reading is 1.6x it, which is the assertion that a
  // one-axis limb is not slamming its stop and rebounding. Measured 9.40 m/s against a 6.84 m/s
  // commanded ceiling, Node bench, 2026-09-05.
  const rateCeiling = CHAIN_PITCH.targetRate * run.envelope.reach;
  assert.ok(state.peakTipSpeedDriven > rateCeiling,
    `the chop peaked at ${state.peakTipSpeedDriven} m/s against a commanded ${rateCeiling} m/s`);
  assert.ok(state.peakTipSpeedDriven < rateCeiling * 1.6,
    `the chop peaked at ${state.peakTipSpeedDriven} m/s, well past the ${rateCeiling} m/s the`
    + " command can ask for, which is a limb rebounding off its own stop");
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

test("rung 1 follows its command at a rate limit, and its buttons do nothing at all", async () => {
  // **This test used to be called "rung 1's chop is a velocity event, not a pose sequence", and
  // the thing it named no longer exists.** Session 12 took the scripted strokes out from under
  // every chain: `thrust` swapped this hinge to VELOCITY for 0.09 s, drove it at a fixed
  // 12 rad/s and swapped it back, and the whole time the commanded pitch went on slewing and
  // went on being ignored. That is a chain deciding, on a button, that it would rather move at
  // its own speed than at its commander's -- which is the one thing the owner ruled out: free
  // control of the limb, limited only by the physics, and no hard-coded scripting underneath it.
  //
  // So what is asserted is what rung 1 now *is*, and it is the stronger statement of the two: a
  // pure rate-limited position follower, whose only input is where the cursor is and whose speed
  // is the ceiling in `CHAIN_PITCH.targetRate` against the torque cap. The old test's subject --
  // the follow-through -- has not gone away, it has moved to where it belongs: the limb still
  // lags a moving command and still carries past a stopped one, and the last two assertions here
  // are the same reading the deleted ones took, off a command instead of off a script.
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const scene = arena.scene;
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  const stand = buildGolemStand(scene, { side: "left" });
  const module = golemModule("effector.pitch.blade").build({
    scene, side: "left", name: "stroke", socket: stand.socket("primary"),
    layers: golemLayers("left"), materials: stand.materials,
  });

  // Sampled on the physics clock and not per frame: the rate ceiling is a statement about the
  // step the commander actually takes, and a 60 Hz sample of a 240 Hz slew would average four
  // of them together and could not see a single one that was too big.
  const phases = new Set();
  let previousCommanded = null;
  let worstRate = 0;
  let deepest = Infinity;
  let watching = false;
  const control = scene.onBeforePhysicsObservable.add(() => {
    module.step(SUBSTEP);
    const view = module.view();
    phases.add(view.stroke);
    const command = view.axes[0].commanded;
    if (watching && previousCommanded !== null) {
      worstRate = Math.max(worstRate, Math.abs(command - previousCommanded) / SUBSTEP);
    }
    previousCommanded = command;
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
    const achieved = () => module.view().axes[0].achieved;
    const commanded = () => module.view().axes[0].commanded;

    step(90);
    const settled = achieved();
    assert.ok(Math.abs(settled - CHAIN_PITCH.restPitch) < CHAIN_PITCH.settledBand,
      `the limb rested at ${settled} instead of ${CHAIN_PITCH.restPitch}`);

    // **Both buttons, held, for two seconds, and nothing may move.** This is the assertion the
    // deleted one inverted: it checked that a held `thrust` chopped once and did not chain a
    // second chop, and the rule it was enforcing -- a press pays for one thing -- is now
    // enforced by there being nothing to pay for. `thrust` and `guard` are driver-side inputs
    // that a mind writes and a *chain with somewhere to put them* reads; this rung has one
    // degree of freedom and `pointerY` is it, so both are a no-op here by construction, and this
    // is what construction looks like from outside.
    intent.primary.thrust = true;
    intent.primary.guard = true;
    step(120);
    assert.ok(Math.abs(achieved() - settled) < CHAIN_PITCH.settledBand,
      `holding both buttons moved the limb from ${settled} to ${achieved()}`);

    // And now the sweep, with the buttons still held down for the whole of it, so that the
    // cursor is provably the only thing moving this limb.
    watching = true;
    intent.primary.pointerY = 1;
    step(60);
    assert.ok(Math.abs(commanded() - CHAIN_PITCH.pitchMax) < 1e-6,
      `the cursor at the top of the window asked for ${commanded()}, not ${CHAIN_PITCH.pitchMax}`);
    deepest = Infinity;

    // **The rate limit, timed rather than inspected.** The command is flicked from the top of
    // the window to the bottom in one frame -- a mouse can do that and a stone arm cannot -- and
    // what is measured is how long the commanded angle takes to get there. The span is 1.85 rad
    // and the ceiling is 6 rad/s, so it may not arrive before 0.308 s however hard it is asked.
    // Measured 19 frames, 0.3167 s, which is the first 60 Hz frame boundary past that floor, at a
    // worst single-substep rate of 6.000 rad/s exactly. 2026-09-05, the Node bench.
    intent.primary.pointerY = -1;
    let frames = 0;
    while (commanded() > CHAIN_PITCH.pitchMin + 1e-9 && frames < 120) {
      step(1);
      frames += 1;
    }
    const span = CHAIN_PITCH.pitchMax - CHAIN_PITCH.pitchMin;
    const floorSeconds = span / CHAIN_PITCH.targetRate;
    assert.ok(frames * FRAME >= floorSeconds,
      `the command crossed the whole ${span} rad span in ${frames * FRAME} s, against a`
      + ` ${CHAIN_PITCH.targetRate} rad/s ceiling that needs ${floorSeconds} s`);
    // The other side of it: a limit that is never reached is a limit nothing is measuring. The
    // command is asking for the far end on every step of this, so it must be moving at the
    // ceiling on every step of it too, and arrive within a frame or two of the floor.
    assert.ok(frames * FRAME < floorSeconds + 3 * FRAME,
      `the command took ${frames * FRAME} s to cross a span the ceiling crosses in`
      + ` ${floorSeconds} s; something other than the rate limit is slowing it`);
    assert.ok(worstRate <= CHAIN_PITCH.targetRate * 1.001,
      `the commanded angle moved at ${worstRate} rad/s against a ${CHAIN_PITCH.targetRate} ceiling`);

    // **The limb carries past the stopped command and comes back**, which is the follow-through
    // the deleted test was about, read here off the only thing that now produces it: a finite
    // torque cap against real mass. A position motor stiff enough to move stone would stop dead
    // on the last commanded angle and this would be red.
    //
    // **And it must not arrive at its own joint stop.** A motor and a limit pushing at each
    // other is the buzz the Warrior's wrist was rewritten to remove, and it is why the
    // commandable span stops short of the hinge's: `pointerY` at -1 asks for 0.30 rad and the
    // stop is at -0.05, so the 0.35 rad between them is the room the limb has to overshoot in.
    // Measured: deepest 0.240 rad, which is 0.060 past the command and 0.290 clear of the stop.
    step(30);
    assert.ok(deepest > CHAIN_PITCH.jointMin + 0.05,
      `the limb reached ${deepest}, against a hard stop at ${CHAIN_PITCH.jointMin}`);
    assert.ok(deepest < CHAIN_PITCH.pitchMin,
      `the limb stopped at ${deepest} without carrying past the ${CHAIN_PITCH.pitchMin} it was`
      + " asked for; a limb that never overshoots a stopped command is a limb with no momentum");

    intent.primary.pointerY = 0;
    intent.primary.thrust = false;
    intent.primary.guard = false;
    step(180);
    assert.ok(Math.abs(achieved() - settled) < CHAIN_PITCH.settledBand,
      `the limb finished at ${achieved()} instead of returning to ${settled}`);

    // Every sample of all of that, and there is one phase in the set.
    assert.deepEqual([...phases], ["idle"],
      "rung 1 published a stroke phase; it runs no scripted event and is never inside one");
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
    companion: stand.socket(slot === "primary" ? "secondary" : "primary"),
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
    // opened to three angular axes -- a fiftyfold move, and the bound below sits five times above
    // the clean figure and five times under the mutated one.
    //
    // **And it has a known blind spot, stated here rather than discovered later.** Opening only
    // the shoulder's *twist* -- the upper arm free about its own long axis, which is exactly the
    // spare axis a seven-axis Warrior arm has -- leaves the chain inside this bound, so this test
    // stays green against a genuinely redundant chain. A position-only anchor exerts no torque
    // about that axis, so nothing excites it. The Warrior's rope elbow needs a six-axis pin to
    // drive it; `docs/measurements.md` carries the account.
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

    // **The two reaches used to be the two buttons, and on 2026-09-05 they stopped being
    // anything.** This drove the short pose with `guard` and the long one with `thrust`, and
    // Session 12 deleted both preset distances in favour of a continuous `reach` on `HandIntent`
    // -- so both poses became the same pose, and `R.reachThrust` became `undefined`, which made
    // the floor below `NaN` and every comparison against it false. A clamp test that cannot tell
    // its two poses apart and compares against a non-number is the "green instrument measuring
    // nothing" shape twice over.
    //
    // What replaces them is what the rule was always about: the *distance*, commanded directly.
    // `reach` at -1 is `reachMin` and at +1 is `reachMax`, and the coupling under test is that
    // the same inboard cursor is given a pose at one and clamped out of it at the other.

    // Fully inboard, drawn all the way in: short, so the carry rule does not bite and the limb
    // goes where it is told. This is the control -- without it, the assertion below is satisfied
    // by a chain that simply cannot swing inboard at all. At `reachMin` the floor is
    // `asin(-0.24 / 0.30)` = -0.93 rad, outside `swingMin` entirely.
    rig.hand.pointerX = -1;
    rig.hand.pointerY = 0;
    rig.hand.reach = -1;
    rig.run(150);
    const drawn = rig.module.view().axes[1].achieved;
    assert.ok(drawn < -0.4,
      `a short cross-body command reached only ${drawn} rad of swing, so nothing was clamped`);

    // The same cursor at full extension, which is outside the envelope: the carry floor at
    // `reachMax` is `asin(carryMin / (reachMax * cos lift))`, well above `swingMin`.
    rig.hand.reach = 1;
    rig.run(240);
    const reached = rig.module.view().axes[1].achieved;
    const floor = Math.asin(R.carryMin / R.reachMax);
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

test("rung 2 follows its command at a rate limit, and its buttons do nothing at all", async () => {
  // **The same rewrite as rung 1's, in the units an anchor works in.** This was "rung 2's thrust
  // is a velocity event, not a pose sequence": `thrust` dropped the anchor's force ceiling for
  // `followSeconds` so the hand coasted past its own command, and Session 12 deleted the whole
  // machine. What is left is the thing that made it a limb in the first place -- a point that is
  // rate-limited in metres per second, hauled by a finite force against real mass -- and it is
  // what this now measures.
  //
  // `reach` is the axis to measure it on: with the cursor held still the commanded point moves
  // radially, so the anchor's ceiling in metres per second and the reach axis in metres per
  // second are the same number, and no projection has to be trusted to read one off the other.
  const rig = await onStand("effector.reach.blade");
  try {
    const R = CHAIN_REACH;
    // Off the centreline and slightly lifted, so that the carry floor tested above is not what is
    // being measured here, and drawn all the way in to start.
    rig.hand.pointerX = 0.4;
    rig.hand.pointerY = 0.2;
    rig.hand.reach = -1;
    rig.run(180);

    // Sampled on the physics clock and not per frame, for the reason rung 1's test states: a
    // 60 Hz sample of a 240 Hz slew averages four steps together and cannot see a single bad one.
    const phases = new Set();
    let previousCommanded = null;
    let worstRate = 0;
    let furthest = 0;
    let watching = false;
    const watch = rig.scene.onBeforePhysicsObservable.add(() => {
      const view = rig.module.view();
      phases.add(view.stroke);
      const command = view.axes[0].commanded;
      if (watching && previousCommanded !== null) {
        worstRate = Math.max(worstRate, Math.abs(command - previousCommanded) / SUBSTEP);
      }
      previousCommanded = command;
      furthest = Math.max(furthest, view.axes[0].achieved);
    });

    try {
      const settled = rig.module.view().axes[0].achieved;
      assert.ok(Math.abs(settled - R.reachMin) < R.settledBand,
        `the hand drew in to ${settled} m instead of ${R.reachMin} m`);

      // **Both buttons, held, for two seconds, and nothing may move.** This replaces the deleted
      // "held, not repeated" control, and it is the same rule stated from the other side: a press
      // used to pay for one chop, and now there is nothing for it to pay for. A mind writes
      // `thrust` and `guard` for whatever reads them; this chain has a continuous `reach` and no
      // use for either, which is the frozen rule "a chain that has no use for a field ignores it".
      rig.hand.thrust = true;
      rig.hand.guard = true;
      rig.run(120);
      const held = rig.module.view().axes[0].achieved;
      assert.ok(Math.abs(held - settled) < R.settledBand,
        `holding both buttons moved the hand from ${settled} m to ${held} m`);

      // **The rate limit, timed rather than inspected**, with the buttons still held down for the
      // whole of it so the reach channel is provably the only thing moving this hand. The span is
      // 0.42 m and the ceiling is 5 m/s, so the command may not arrive before 0.084 s however
      // hard it is asked.
      //
      // **Writing that down is what found the componentwise limiter.** The first draft of this
      // read 0.0667 s and 8.39 m/s, because `AnchorDrive` slewed x, y and z separately -- a box
      // and not a ball, whose corner is sqrt(3) times its edge, and whose axes are the *world's*,
      // so a golem's arm was faster for facing diagonally. `AnchorDrive.linearRate` carries the
      // account. Measured after the fix: 6 frames, 0.100 s, 5.000 m/s.
      watching = true;
      furthest = 0;
      rig.hand.reach = 1;
      let frames = 0;
      while (rig.module.view().axes[0].commanded < R.reachMax - 1e-9 && frames < 120) {
        rig.run(1);
        frames += 1;
      }
      const span = R.reachMax - R.reachMin;
      const floorSeconds = span / R.anchorRate;
      assert.ok(frames * FRAME >= floorSeconds,
        `the command crossed the whole ${span} m span in ${frames * FRAME} s, against a`
        + ` ${R.anchorRate} m/s ceiling that needs ${floorSeconds} s`);
      assert.ok(frames * FRAME < floorSeconds + 3 * FRAME,
        `the command took ${frames * FRAME} s to cross a span the ceiling crosses in`
        + ` ${floorSeconds} s; something other than the rate limit is slowing it`);
      assert.ok(worstRate <= R.anchorRate * 1.001,
        `the commanded point moved at ${worstRate} m/s against a ${R.anchorRate} m/s ceiling`);

      rig.run(90);

      // **The hand carries past the stopped command and comes back**, which is the follow-through
      // the deleted test was about, read off the only thing that now produces it: a finite force
      // ceiling against real mass. An anchor stiff enough to move stone would stop dead on
      // `reachMax` and this would be red.
      assert.ok(furthest > R.reachMax,
        `the hand stopped at ${furthest} m without carrying past the ${R.reachMax} m it was asked`
        + " for; a limb that never overshoots a stopped command is a limb with no momentum");
      // **And it must not arrive at the arm's own extension.** A limb slamming into its own stop
      // is a motor and a limit pushing at each other, which is the buzz `arm.ts`'s wrist was
      // rewritten to get rid of -- and the deleted stroke driving to `reachMax` instead of the
      // old `reachThrust` did exactly that, 0.7812 m against a full extension of 0.780. This is
      // the worst case the chain has: the whole span, commanded in one frame, at the ceiling.
      // Measured 0.7505 m, which is 30.5 mm past the command and 29.5 mm short of the stop.
      assert.ok(furthest < R.upperLength + R.foreLength - 0.02,
        `the hand carried to ${furthest} m against a full extension of`
        + ` ${R.upperLength + R.foreLength} m`);

      assert.deepEqual([...phases], ["idle"],
        "rung 2 published a stroke phase; it runs no scripted event and is never inside one");
    } finally {
      rig.scene.onBeforePhysicsObservable.remove(watch);
    }
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
    // wrongly, it is stuck on something. Measured 6.96 mm on rung 2 and 2.17 mm on rung 3 against
    // a Warrior's 242.88 mm over its own sweep. Provisional, re-taken on the 2026-09-05 Node
    // bench: the sequence these run under is continuous reach rather than two buttons now, so the
    // 3.73 and 4.64 the block used to quote were read over a command this bench can no longer
    // send. Rung 2's figure roughly doubled and rung 3's roughly halved, and neither is near the
    // bound.
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

// ---------------------------------------------------------------------------------------
// Session 04's terminals -- the plate, the mace and the whip -- and the matchup set's maul.
// ---------------------------------------------------------------------------------------

test("a two-socket terminal refuses a build that offers it one socket", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const stand = buildGolemStand(arena.scene, { side: "left" });
  const ctx = {
    scene: arena.scene, side: "left", name: "one-socket", socket: stand.socket("primary"),
    layers: golemLayers("left"), materials: stand.materials,
  };
  try {
    // A refusal and not a fallback. A maul that quietly built a one-handed bar when handed one
    // socket is the shield-that-shipped-as-a-club failure with the sockets swapped: it would
    // compile, pass `tsc`, pass the build, and put a 48 kg bar on one arm with the second grip
    // constraining nothing.
    assert.throws(() => golemModule("effector.reach.maul").build(ctx),
      /claims both effector sockets/);
    // And the same socket handed over twice, which is the shape a caller reaches for by accident.
    assert.throws(() => golemModule("effector.reach.maul").build({
      ...ctx, companion: stand.socket("primary"),
    }), /handed over twice/);
    // The control: with a real second socket it builds. Without this the two refusals above are
    // satisfied by a maul that cannot be built at all.
    const built = golemModule("effector.reach.maul").build({
      ...ctx, companion: stand.socket("secondary"),
    });
    assert.ok(built.parts.some((part) => part.id.includes(".trailing.")),
      "a maul has to put a limb in the second socket, not just a constraint");
    built.dispose();
    // And the one-socket mace beside it is the control the other way: one weld, one arm, and a
    // companion handed to it is simply not read.
    const mace = golemModule("effector.reach.mace").build(ctx);
    assert.ok(!mace.parts.some((part) => part.id.includes(".trailing.")),
      "a one-handed mace built a second limb");
    mace.dispose();
  } finally {
    stand.dispose();
    arena.dispose();
  }
});

test("a chain that cannot bring its hand to a point cannot share a grip", async () => {
  // The pitch chain has one axis and no anchor, so there is no point it can be sent to; the
  // registry does not offer it a maul, and this is the refusal underneath that, for the caller
  // who builds the pair by hand. The wording is the frozen one `effector.ts` gives.
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const stand = buildGolemStand(arena.scene, { side: "left" });
  try {
    const { effectorModule } = await import("../src/golem/effectors/effector.ts");
    assert.throws(() => effectorModule(EFFECTOR_CHAINS.pitch, EFFECTOR_TERMINALS.maul).build({
      scene: arena.scene, side: "left", name: "pitch-maul", socket: stand.socket("primary"),
      companion: stand.socket("secondary"), layers: golemLayers("left"), materials: stand.materials,
    }), /cannot bring its hand to a point/);
  } finally {
    stand.dispose();
    arena.dispose();
  }
});

test("the maul's second hand arrives, takes the grip, and holds it as a constraint does", async () => {
  // **Two motors, one point.** The driven chain is commanded and the trailing chain is sent to
  // the driven chain's commanded weld, so the two do not fight; the grip is taken when the second
  // hand gets there, and from then on it is a solved ball joint. A constraint is solved and a
  // force-capped motor lags, so the grip's error sits far below the driven anchor's -- a run
  // where it does not is a run where the trailing arm has started pushing back.
  //
  // Measured in the Node bench, 2026-09-06: the grip taken at 0.246 s on the reach chain and
  // 0.462 s on the wrist chain, 0.043 and 0.085 mm of grip stray against 206 and 230 mm at the
  // driven anchor. The bounds below are provisional and are to be re-taken after the owner's gate.
  for (const id of ["effector.reach.maul", "effector.wrist.maul"]) {
    const run = await runGolemBench({ moduleId: id });
    assert.ok(run.gripTakenAt !== null && run.gripTakenAt < 2,
      `${id}: the second hand took ${run.gripTakenAt} s to reach the grip`);
    assert.ok(run.peakGripStrayMm !== null, `${id} published no trailing grip error`);
    assert.ok(run.state.peakAnchorStrayMm !== null, `${id} drives an anchor and must publish it`);
    assert.ok(run.peakGripStrayMm < run.state.peakAnchorStrayMm,
      `${id}: the grip strayed ${run.peakGripStrayMm} mm against ${run.state.peakAnchorStrayMm}`
      + " mm at the driven anchor, which is the wrong way round for a solved joint");
    assert.ok(run.peakGripStrayMm < 1,
      `${id}: a solved constraint held its grip to ${run.peakGripStrayMm} mm`);
    assert.equal(run.state.selfContacts, 0, `${id}: a golem's own parts must never collide`);
    assert.equal(run.state.contacts, 0, `${id}: nothing should reach the floor or the walls`);
    assert.equal(run.state.stuckSteps, 0, `${id}: an error that stops converging is stuck`);
  }
});

test("the maul narrows the chain it is on, the mace does not, and the chain publishes both", async () => {
  // Frozen rule 3 with a second author: two hands on one grip can only meet where both arms
  // reach, so the terminal states what it takes and the chain clamps to it before the anchor is
  // ever handed a target. The arithmetic that produced the numbers is beside
  // `TERMINAL_MAUL.limits`.
  const withMaul = await runGolemBench({ moduleId: "effector.reach.maul" });
  const withMace = await runGolemBench({ moduleId: "effector.reach.mace" });
  const withBlade = await runGolemBench({ moduleId: "effector.reach.blade" });

  const M = TERMINAL_MAUL.limits;
  assert.equal(withMaul.envelope.reachable.swingMax - withMaul.envelope.reachable.swingMin, 0,
    "a maul has one azimuth");
  assert.equal(Math.abs(withMaul.envelope.reachable.swingMin), Math.abs(M.swingMin));
  assert.equal(withMaul.envelope.reachable.reachMax, M.reachMax);
  assert.equal(withMaul.envelope.reachable.liftMax, M.liftMax);
  // The controls, and they are the half that makes this an assertion rather than a restatement
  // of the config: the same chain with a one-socket terminal on it publishes its own full
  // envelope -- and since the matchup set's Session 02 the mace is one of those. What it takes
  // from a chain is the wrist's bend and nothing the reach chain has.
  for (const [label, run] of [["blade", withBlade], ["mace", withMace]]) {
    assert.equal(run.envelope.reachable.swingMin, CHAIN_REACH.swingMin, label);
    assert.equal(run.envelope.reachable.swingMax, CHAIN_REACH.swingMax, label);
    assert.equal(run.envelope.reachable.reachMax, CHAIN_REACH.reachMax, label);
    assert.equal(run.envelope.reachable.liftMin, CHAIN_REACH.liftMin, label);
    assert.equal(run.envelope.reachable.liftMax, CHAIN_REACH.liftMax, label);
  }

  // On a wrist chain the maul takes the roll and the bend too, for the wrist's reason beside
  // `TERMINAL_MAUL.limits`; the mace keeps its roll and loses its bend, for the reason beside
  // `TERMINAL_MACE.limits`.
  const axis = (run, id) => run.envelope.axes.find((entry) => entry.id === id);
  const wristMaul = await runGolemBench({ moduleId: "effector.wrist.maul" });
  // `===` rather than `assert.equal`, which compares with `Object.is` and would call a
  // published -0 a failure: the roll's floor is written as the negative of a limit that a maul
  // pins at zero, and -0 and 0 are the same commanded roll.
  assert.ok(axis(wristMaul, "roll").min === 0 && axis(wristMaul, "roll").max === 0,
    `a maul published a roll of ${axis(wristMaul, "roll").min}..${axis(wristMaul, "roll").max}`);
  assert.ok(axis(wristMaul, "bend").max === 0,
    `a maul published a bend of up to ${axis(wristMaul, "bend").max}`);
  const wristMace = await runGolemBench({ moduleId: "effector.wrist.mace" });
  assert.equal(axis(wristMace, "roll").max, CHAIN_WRIST.rollMax, "a mace rolls with its wrist");
  assert.equal(axis(wristMace, "bend").max, TERMINAL_MACE.limits.bendMax);
  assert.ok(axis(wristMace, "bend").max === 0, "a mace is swung straight off the forearm");
  const wristBlade = await runGolemBench({ moduleId: "effector.wrist.blade" });
  assert.equal(axis(wristBlade, "roll").max, CHAIN_WRIST.rollMax);
  assert.equal(axis(wristBlade, "bend").max, CHAIN_WRIST.bendMax);
});

test("a wrist is cast to the load it carries, and a blade's is what the config says", async () => {
  // `CHAIN_WRIST.carryRatio`'s whole reason: an 18 kg bar on a 1.8 kg ring is a mass ratio the
  // solver does not hold, and the cure is the ring's mass. Read back off the built parts rather
  // than the config, because the rule lives in `wrist.ts` and a config with the number in it
  // and a chain that ignored it would pass a test that read the config.
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const stand = buildGolemStand(arena.scene, { side: "left" });
  const ctx = {
    scene: arena.scene, side: "left", name: "cast", socket: stand.socket("primary"),
    companion: stand.socket("secondary"), layers: golemLayers("left"), materials: stand.materials,
  };
  const massOf = (module, suffix) =>
    module.parts.find((part) => part.id.endsWith(suffix)).part.body.getMassProperties().mass;
  try {
    const blade = golemModule("effector.wrist.blade").build(ctx);
    // Havok stores mass as float32, so the config's 1.8 comes back as 1.7999999523.
    assert.ok(Math.abs(massOf(blade, ".rollRing") - CHAIN_WRIST.ringMass) < 1e-6);
    assert.ok(Math.abs(massOf(blade, ".wrist") - CHAIN_WRIST.wristMass) < 1e-6);
    blade.dispose();
    const mace = golemModule("effector.wrist.mace").build(ctx);
    const cast = CHAIN_WRIST.carryRatio * TERMINAL_MACE.mass;
    assert.ok(cast > CHAIN_WRIST.ringMass, "the mace is over the floor, or this test says nothing");
    assert.ok(Math.abs(massOf(mace, ".rollRing") - cast) < 1e-6);
    assert.ok(Math.abs(massOf(mace, ".wrist") - cast) < 1e-6);
    mace.dispose();
  } finally {
    stand.dispose();
    arena.dispose();
  }
});

test("a one-handed mace on the wrist chain tracks its command", async () => {
  // The number the whole of `carryRatio` and the mace's bend pin were bought with: before them
  // the tip stood 552 mm from its command on average with the ring folded 36 degrees off the
  // forearm; after, 51 mm. Measured 2026-09-06; the bound is loose because the mass is real and
  // the anchor's force budget is frozen rule 4. Zero contacts is the bar not reaching the floor.
  const run = await runGolemBench({ moduleId: "effector.wrist.mace" });
  assert.ok(run.state.tipErrorMm < 120,
    `the mace's tip stood ${run.state.tipErrorMm} mm from its command on average`);
  assert.equal(run.state.contacts, 0);
  assert.equal(run.state.selfContacts, 0);
});

test("the whip's lash outruns the wrist that flicks it, outside both exclusion windows", async () => {
  const run = await runGolemBench({ moduleId: "effector.wrist.whip" });
  const state = run.state;

  // **Zero contacts is the load-bearing one here**, and it is not a tidiness check. The lash
  // hangs, so a whip longer than the room under the socket lies on the floor at rest, and a
  // contact opens a 0.25 s tip-speed exclusion window -- one every step, which would make every
  // reading of a whip excluded and the terminal unmeasurable. The length and the elevation limit
  // beside `TERMINAL_WHIP` were chosen against this number.
  assert.equal(state.contacts, 0, "the lash reached the floor; see TERMINAL_WHIP.segments");
  assert.equal(state.selfContacts, 0, "a golem's own parts must never collide with each other");
  assert.equal(state.excludedContactSteps, 0);
  assert.equal(state.stuckSteps, 0);

  // The lash carries after the wrist has stopped, which is the whole of what a whip is, and the
  // peak is outside both mandatory windows. Measured 27.27 m/s in the Node bench, 2026-09-04,
  // against the same chain's blade at 26.75 m/s -- and the blade's peak is a *driven* stroke
  // while this one is beads carrying through. Re-taken 2026-09-06 with the lash at eight beads
  // of 0.16 m: 19.55 m/s, slower because the rope is twice as long and heavy and the same wrist
  // flicks it. Provisional, to be re-taken after the owner's gate.
  assert.ok(state.peakTipSpeedDriven > 15,
    `the lash peaked at ${state.peakTipSpeedDriven} m/s, which is a rope being carried rather than cracked`);
  // The raw peak is allowed to stand above the driven one by what the startup window hides and
  // nothing more: the lash is built straight, 1.28 m out along the limb, and drops in the first
  // 0.6 s at 21.49 m/s against the 19.55 m/s driven peak (2026-09-06). With zero post-contact
  // steps asserted above, the startup window is the only one there is, so a raw peak far above
  // the driven one would be a stroke being hidden rather than a rope being dropped.
  assert.ok(state.peakTipSpeedRaw <= state.peakTipSpeedDriven * 1.2,
    `the lash's fastest moment was ${state.peakTipSpeedRaw} m/s inside an exclusion window`);

  // **The chain underneath is pulled by what is hanging off it, and by how much is the reading.**
  // Measured 17.27 mm on the 2026-09-05 bench against the same chain's 2.17 mm with a 1.30 kg
  // blade on it -- eight times as far, and the claim this block used to make, that the two were of
  // the same order at 1.08 against 4.64, is not true of the command sequence the bench sends now.
  // 13.77 mm on 2026-09-06 with the longer lash, which hangs lower and swings less.
  // It is still what a rope should do rather than a tracking failure: the beads go on swinging
  // after the wrist has settled, and a settled wrist being tugged 17 mm by a rope that is still
  // moving is the mass being real. The 20 mm bound below is now a thin margin rather than a
  // comfortable one, so a change that crosses it wants reading before it is re-pinned.
  assert.ok(state.idleAnchorStrayMm !== null && state.idleAnchorStrayMm < 20,
    `the whip pulled its own chain ${state.idleAnchorStrayMm} mm off its anchor`);
  // And the reading that is *not* a tracking error, asserted as what it is so nobody quotes it as
  // one: `commandedEnd` answers for a rigid extension of the arm and a lash is not one, so "tip
  // to command" is the droop. It is large by construction and that is the terminal working.
  assert.ok(state.peakTipErrorMm > 300,
    "a lash that tracked a rigid extension of the arm would be a stick, not a whip");
});

test("the multi-body whip disposes without leaving a body, a constraint or a live observer", async () => {
  // Six bodies, six constraints and six shells against a blade's one of each, so this is where a
  // disposal order that works by accident stops working. **Active observers rather than array
  // length**: Babylon marks an observer `_willBeUnregistered` immediately and splices it on a
  // zero-delay timer, so a census taken synchronously after disposal sees every correct removal as
  // a leak unless it filters -- which `tests/integration.test.mjs` learned while auditing 25
  // rebuilds.
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const scene = arena.scene;
  const stand = buildGolemStand(scene, { side: "left" });
  const census = () => ({
    meshes: scene.meshes.length,
    bodies: scene.getPhysicsEngine().getBodies().length,
    beforePhysicsObservers: scene.onBeforePhysicsObservable.observers
      .filter((observer) => !observer._willBeUnregistered).length,
  });
  try {
    const baseline = census();
    for (let round = 0; round < 3; round += 1) {
      const module = golemModule("effector.wrist.whip").build({
        scene, side: "left", name: `whip.${round}`, socket: stand.socket("primary"),
        companion: stand.socket("secondary"),
        layers: golemLayers("left"), materials: stand.materials,
      });
      assert.equal(
        module.parts.filter((part) => part.id.includes('.whip.')).length, TERMINAL_WHIP.segments,
        "a whip's beads are parts like any other, and each is severable");
      const control = scene.onBeforePhysicsObservable.add(() => module.step(SUBSTEP));
      scene._renderId += 1;
      scene._advancePhysicsEngineStep(1000 * FRAME);
      scene.onBeforePhysicsObservable.remove(control);
      module.dispose();
      assert.deepEqual(census(), baseline,
        `round ${round}: disposing the whip left meshes, bodies or a live observer behind`);
    }
  } finally {
    stand.dispose();
    arena.dispose();
  }
});

test("every terminal on every chain runs its own scripted sequence touching nothing", async () => {
  // The blanket check the session plan asks for, over the registry rather than over a list. Every
  // pair on the shelf, each through the sequence its own terminal wants, and the two numbers that
  // say the layer table and the envelope are both doing their jobs.
  for (const id of EFFECTOR_IDS) {
    const run = await runGolemBench({ moduleId: id });
    assert.equal(run.state.selfContacts, 0, `${id}: a golem's own parts must never collide`);
    assert.equal(run.state.contacts, 0, `${id}: nothing on the stand should reach the floor`);
    assert.equal(run.state.stuckSteps, 0, `${id}: an error that stops converging is stuck`);
    // A striker per pair, and the whip's three, offered to `Combat` rather than merely built.
    assert.ok(run.envelope.reach > 0, `${id} publishes no reach`);
  }
});

test("a plate keeps clear of its own stand and of a real torso in its own envelope", async () => {
  // **Frozen rule 5 has no self-collision pair for the plate, so this is what stands in for
  // one.** The held shield collided with its owner's trunk because a redundant seven-axis arm
  // could be commanded into it; a low-axis chain with a published envelope cannot, and the
  // session plan says plainly that a plate seen through its own torso is an envelope fault to be
  // fixed in the chain. Nothing in the solver will ever report it -- the layers forbid the pair --
  // so the only way to know is to measure the geometry.
  //
  // Corners from `mesh.position` and `mesh.rotationQuaternion` and nothing else, which is the
  // same rule everything else here reads a world transform by.
  //
  // **The stand is not the body, and measuring only the stand is how a clip shipped.** This test
  // checked `BENCH_STAND` alone until 2026-09-05: 0.44 m wide, socket at 0.34, so the shoulder
  // stands 0.12 m clear of the block's own face. A plain torso is 0.62 m wide with the *same*
  // 0.34 socket, which leaves 0.03 m -- the bench block is 90 mm narrower on each side and is not
  // a conservative stand-in laterally, however conservative it is below the socket, where it is
  // the taller box. A `TERMINAL_PLATE.outboardOffset` of 0.12 read 48 mm clear of the block on the
  // wrist chain, which is the chain `defaultGolemSetup` actually hangs the shield on, and 2 mm
  // clear of a plain chest and 8 mm *inside* a plated one. The board was narrowed to 0.28 to buy
  // that back; this test is here so the next such change cannot be graded against the wrong box.
  //
  // So all three boxes, every chain, one sign each.
  const S = BENCH_STAND;
  const P = TERMINAL_PLATE;
  const half = new Vector3(P.height / 2, P.thickness / 2, P.width / 2);

  // The bench block sits where `buildGolemStand` puts it. The torsos are placed *relative to the
  // socket the stand built*, which is the honest way round: a golem's shoulder is wherever its
  // trunk's `socketSide`/`socketHeight`/`socketFront` put it, so inverting those from the socket
  // this module is actually hanging from lands the chest exactly where it would be in a game.
  const boxesFor = (socketWorld) => {
    const sign = Math.sign(socketWorld.x) || 1;
    const boxes = [{
      name: "bench stand",
      centre: new Vector3(0, S.centreHeight, 0),
      half: new Vector3(S.width / 2, S.height / 2, S.depth / 2),
    }];
    for (const [name, T] of [["plain torso", TORSO_PLAIN], ["plated torso", TORSO_PLATED]]) {
      boxes.push({
        name,
        centre: new Vector3(
          socketWorld.x - sign * T.socketSide,
          socketWorld.y - T.socketHeight,
          socketWorld.z - T.socketFront,
        ),
        half: new Vector3(T.coreWidth / 2, T.coreHeight / 2, T.coreDepth / 2),
      });
    }
    return boxes;
  };

  // All three rungs, where this used to check two. Rung 1 was the omission that mattered: it has
  // no swing and no reach, so `TERMINAL_PLATE.outboardOffset` is the only thing standing between
  // its board and the block, and it is therefore the chain that decides how far that offset can
  // come down. It is also the only one of the three no narrowing can help.
  for (const id of ["effector.pitch.plate", "effector.reach.plate", "effector.wrist.plate"]) {
    const rig = await onStand(id);
    try {
      const board = rig.module.parts.find((part) => part.id.endsWith(".plate")).part;
      const boxes = boxesFor(rig.socket.world);
      const deepest = boxes.map(() => -Infinity);
      const worst = boxes.map(() => null);
      const corner = new Vector3();
      const at = new Vector3();
      const sample = () => {
        for (const sx of [-1, 0, 1]) {
          for (const sy of [-1, 1]) {
            for (const sz of [-1, -0.5, 0, 0.5, 1]) {
              corner.set(sx * half.x, sy * half.y, sz * half.z);
              corner.rotateByQuaternionToRef(
                board.mesh.rotationQuaternion ?? Quaternion.Identity(), corner,
              );
              corner.addInPlace(board.mesh.position);
              for (let b = 0; b < boxes.length; b += 1) {
                corner.subtractToRef(boxes[b].centre, at);
                const inside = Math.min(
                  boxes[b].half.x - Math.abs(at.x),
                  boxes[b].half.y - Math.abs(at.y),
                  boxes[b].half.z - Math.abs(at.z),
                );
                if (inside > deepest[b]) {
                  deepest[b] = inside;
                  worst[b] = [...rig.module.view().axes.map((axis) => axis.commanded.toFixed(2))];
                }
              }
            }
          }
        }
      };
      const watch = rig.scene.onBeforePhysicsObservable.add(sample);
      // The corners of the envelope, held long enough to arrive, and swept between rather than
      // teleported -- the transit is where a board swings back under the block, and a grid of
      // held poses would step straight over it.
      //
      // **The outer two loops used to be one loop over `guard`, and that is how the envelope hole
      // this test now catches stayed hidden for a day.** A button set the reach and the flexion
      // *together* -- `guard` meant short-and-bent and its absence meant long-and-straight -- so
      // half of the grid below was not a pose the command surface could express, and the corner
      // that is 188 mm inside the block lives in that half. `reach` and `wristBend` are separate
      // continuous channels now and they are swept separately, which is the whole reason the
      // vocabulary was changed and a fair statement of what it bought.
      for (const reach of [-1, 0, 1]) {
        for (const bend of [0, 0.5, 1]) {
          for (const pointerY of [-1, -0.4, 0.4, 1]) {
            for (const pointerX of [-1, -0.3, 0.4, 1]) {
              rig.hand.pointerX = pointerX;
              rig.hand.pointerY = pointerY;
              rig.hand.reach = reach;
              rig.hand.roll = pointerX;
              rig.hand.wristBend = bend;
              rig.run(40);
            }
          }
        }
      }
      rig.scene.onBeforePhysicsObservable.remove(watch);
      // Measured in the Node bench, 2026-09-05, over the widened sweep above, in mm of clearance
      // at the deepest approach of the whole envelope:
      //
      //     chain   bench stand   plain torso   plated torso
      //     pitch        91             5              1
      //     reach        80           110            100
      //     wrist        41            72             52
      //
      // **The margin that binds is rung 1 against a plated chest: 1 mm.** It is a real margin and
      // not a rounding, but it is thin enough that any change to `TERMINAL_PLATE`, `CHAIN_PITCH`
      // or `TORSO_PLATED` should expect to be the thing that breaks this. Two things take the edge
      // off it: no build in the game hangs a plate on rung 1 -- `defaultGolemSetup` picks the
      // wrist chain for both hands -- and rung 1 has one hinge and no swing, so it is also the one
      // chain where the *only* lever is the board's own geometry. The in-game row is the wrist's,
      // and it has 41 mm in hand on the block and 52 on the worst torso.
      //
      // Watched go red four ways at the width this was tuned at -- against `TERMINAL_PLATE.limits`
      // with any one of its three floors taken out (-8, 0 and -85 mm on the block), and against an
      // `outboardOffset` of 0.08 (-80 mm) -- and, on the torsos, by the shipped 0.12 x 0.32 that
      // this test could not see. Provisional as figures and to be re-taken after the owner's gate;
      // what is not provisional is the sign, which is the thing the frozen rule is about.
      for (let b = 0; b < boxes.length; b += 1) {
        assert.ok(deepest[b] < 0,
          `${id}: a plate corner reached ${(deepest[b] * 1000).toFixed(1)} mm inside the`
          + ` ${boxes[b].name} at command ${worst[b]}; the envelope is wrong, and it is fixed in`
          + ` the chain`);
      }
    } finally {
      rig.dispose();
    }
  }
});

/**
 * The stroke probe reads the mark once, and the shipped cut reaches it after its arc is over.
 *
 * Two claims and a correction. The claims: the swept phase crosses the mark's bearing exactly
 * once, which is what makes "the mark reading" a single reading rather than the first of several;
 * and the grid's chosen shape brings the blade inside a tenth of a metre of the mark, which is
 * what `COMMITTED_SHAPE_CANDIDATES` is a claim about and is checked here so that lifting it into
 * Session 03 is lifting something measured.
 *
 * The correction, dated 2026-09-06: the plan froze the probe as "the tip's mark-plane crossing",
 * and on the shipped cut the crossing and the closest approach are **not the same instant**. The
 * commanded point crosses the mark's bearing 7 ms into a 150 ms arc, the achieved point about
 * 100 ms in, and the weapon is nearest the mark later still -- past the end of the arc, in the
 * follow-through, because the arm is still extending when the azimuth has finished sweeping. So
 * the crossing is counted and the closest approach is measured, and the two are asserted apart.
 */
test("the stroke probe reads the mark once, and the shipped cut arrives after its own arc", async () => {
  const shipped = await runStrokeBench({ moduleId: "effector.wrist.blade" });
  assert.equal(shipped.crossings, 1,
    `the blade crossed the mark's bearing ${shipped.crossings} times inside one arc`);
  assert.ok(shipped.crossedAt !== null && shipped.markAt !== null, "the probe read no mark at all");
  const strokeEnds = STROKE_GUARD_SECONDS + shipped.shape.chamberSeconds + shipped.shape.strokeSeconds;
  assert.ok(shipped.crossedAt < strokeEnds,
    `the bearing was crossed at ${shipped.crossedAt.toFixed(3)} s, after the arc ended at ${strokeEnds.toFixed(3)}`);
  assert.ok(shipped.markAt > shipped.crossedAt,
    "the weapon was nearest the mark before it crossed its bearing, which is not a swing");
  // Provisional, pinned from the 2026-09-06 Node bench: the shipped cut misses by 0.63 m and
  // arrives 17 ms after its arc has finished. It is a defect and not a floor; Session 03 is
  // where it is meant to move, and this assertion is what will say that it did.
  assert.ok(shipped.missMetres > 0.4,
    `the shipped cut now comes within ${shipped.missMetres.toFixed(3)} m of its mark; re-take the entry`);
  assert.ok(shipped.markAt > strokeEnds,
    `the shipped cut now arrives at ${shipped.markAt.toFixed(3)} s, inside its arc; re-take the entry`);

  // What the grid chose, which is the row `COMMITTED_SHAPE_CANDIDATES` carries.
  const chosen = COMMITTED_SHAPE_CANDIDATES.sword;
  const best = await runStrokeBench({ moduleId: "effector.wrist.blade", shape: chosen });
  assert.ok(best.missMetres < 0.10,
    `the chosen cut misses by ${best.missMetres.toFixed(3)} m, and the candidate row claims`
    + ` ${chosen.bench.missMetres}`);
  assert.ok(best.speedAtMark > 15,
    `the chosen cut arrives at ${best.speedAtMark.toFixed(2)} m/s against a claimed ${chosen.bench.speedAtMark}`);
  assert.ok(best.peakAnchorStrayMm < 50,
    `the chosen cut strayed ${best.peakAnchorStrayMm.toFixed(0)} mm from its own anchor`);

  // A maul publishes one azimuth, so `canSwing` is false and the *commanded* arc is not swept at
  // all: what runs is the reach half of the stroke and nothing else. Its crossings are the
  // achieved point wandering across a bearing the command never moved -- one, on this run -- so
  // the crossing count means nothing for it, which is the second half of why the closest approach
  // is measured beside it rather than instead of it.
  const maul = await runStrokeBench({ moduleId: "effector.wrist.maul" });
  assert.equal(maul.sweeps, false, "a maul swept an azimuth it publishes one value of");
  assert.equal(shipped.sweeps, true, "a blade did not sweep, so the column says nothing");
  assert.ok(maul.markAt !== null, "the probe read nothing at all for a chain that cannot swing");
  assert.ok(maul.missMetres > 0.5,
    `a maul now comes within ${maul.missMetres.toFixed(3)} m of its mark without an arc at all`);
});

/**
 * The parry is not an intercept, and the cover does not rest where it was sent.
 *
 * Session 05's guardian branches on the first number: a cover that arrives inside about a tenth of
 * a second can be solved against the incoming point and refined while their arm commits, and one
 * that does not has to be a wall pre-positioned off the chamber read. Measured 2026-09-06, the
 * fastest cover on the bench -- a blade, the lightest thing a hand can put in the way -- takes
 * 0.59 s to settle over 0.30 m, and a plate 0.89 s over 0.40 m. There is no intercept here.
 *
 * The second number is why the arrival is read against the tip's own resting place rather than
 * against `commandedTip`: a plate held on a *static* cover command sits about 0.12 m off it and
 * stays there, so a 50 mm arrival measured against the command never happens, for any command,
 * however long the hold. `settleRippleMm` is what keeps that reading honest -- a cover still
 * wobbling by more than the tolerance at the end of the hold has not settled, and its arrival is
 * not to be believed.
 */
test("no cover on the bench arrives in time to be an intercept", async () => {
  const blade = await runParryBench({ moduleId: "effector.wrist.blade" });
  const plate = await runParryBench({ moduleId: "effector.wrist.plate" });
  for (const [label, run] of [["a blade", blade], ["a plate", plate]]) {
    assert.ok(Number.isFinite(run.arrivedSeconds),
      `${label} never settled inside ${PARRY_ARRIVED_METRES} m of where it ended up`);
    assert.ok(run.settleRippleMm < PARRY_ARRIVED_METRES * 1000,
      `${label} was still wobbling ${run.settleRippleMm.toFixed(1)} mm at the end of the hold,`
      + " so its arrival is a reading of a cover that had not stopped");
    assert.ok(run.travelMetres > PARRY_ACROSS_METRES * 0.8,
      `${label} moved ${run.travelMetres.toFixed(3)} m for a command of ${PARRY_ACROSS_METRES} m across`);
    // Provisional and the point of the test: 0.10 s is the plan's gate for a true intercept.
    assert.ok(run.arrivedSeconds > 0.10,
      `${label} arrived in ${run.arrivedSeconds.toFixed(3)} s, which is an intercept;`
      + " the guardian's branch is the other way and the entry is stale");
  }
  assert.ok(plate.standingOffsetMetres > PARRY_ARRIVED_METRES,
    `a plate now rests ${plate.standingOffsetMetres.toFixed(3)} m from its own command, inside the`
    + " arrival tolerance, so the arrival could be read against the command again");
  assert.ok(blade.standingOffsetMetres < PARRY_ARRIVED_METRES,
    "a blade no longer reaches its own cover command either, which is a chain fault and not a shape");
});
