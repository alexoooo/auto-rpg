/**
 * The golem effector bench's Node harness: the same modules, on the same stand, without a page.
 *
 * **It is not the page bench and its numbers are not the page bench's.** The two harnesses in
 * this directory agree on converged behaviour and disagree by about 9 % on the Warrior's peak
 * transient with identical code, and why has never been established. Every figure this prints
 * is a figure from *this* harness, and putting one of them in a column with a page reading has
 * already produced a regression report about a build where nothing had changed. The output
 * says so on its first line, on purpose.
 *
 * The headless recipe is `AGENTS.md`'s and is not obvious: `NullEngine`, a `Scene`,
 * `attachPhysics`, Havok's wasm handed over **as bytes** because its emscripten glue calls
 * `fetch()` and Node cannot fetch a `file://` URL, `scene._advancePhysicsEngineStep(1000/60)`
 * to run Babylon's fixed sub-step accumulator, and `scene._renderId += 1` once per simulated
 * frame or every matrix a reader touches freezes at its first sample.
 *
 *     node scripts/golem-bench.mjs --chain pitch --terminal blade
 *     node scripts/golem-bench.mjs --module effector.none
 *     node scripts/golem-bench.mjs --chain pitch --terminal blade --sweep torque
 *     node scripts/golem-bench.mjs --chain pitch --terminal blade --json
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { CONFIG } from "../src/config.ts";
import {
  BENCH_READOUT, BENCH_STAND_LOCOMOTION, CHAIN_PITCH, CHAIN_REACH, CHAIN_WRIST, LOCOMOTION_BIPED,
} from "../src/golem/config.ts";
import { formatLocomotion, locomotionCommand } from "../src/golem/locomotion.ts";
import { bipedModule } from "../src/golem/locomotion/biped.ts";
import { buildLocomotionCourse, registerLocomotionCourse } from "../src/golem/locomotion/course.ts";
import { BenchReadout, blankSample, formatReadout } from "../src/golem/readout.ts";
import { GOLEM_MODULES, golemModule } from "../src/golem/registry.ts";
import { buildGolemStand, golemLayers } from "../src/golem/stand.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { createHeadlessArena } from "./golem-headless-arena.mjs";

export const HARNESS = "the Node bench (scripts/golem-bench.mjs, NullEngine, real Havok, no rendering)";

const FRAME = 1 / 60;
const SUBSTEP = 1 / CONFIG.world.physicsHz;

/**
 * The scripted command sequence: rest, step to guard, back to rest, chop, rest.
 *
 * Four phases with a mark at the end of each, because one settle time and one peak reported
 * over a whole run cannot say which move produced them. `rest` is the cursor in the middle of
 * the window, which is the middle of the pitch range.
 *
 * The first mark sits at 1.0 s, comfortably past the 0.6 s startup exclusion, so the noise
 * floor it reports is a reading of the settled harness rather than of the limb arriving.
 */
export const BENCH_SEQUENCE = Object.freeze([
  { name: "rest", until: 1.00, pointerY: 0, guard: false, thrust: false },
  { name: "guard", until: 2.20, pointerY: 0, guard: true, thrust: false },
  { name: "return", until: 3.20, pointerY: 0, guard: false, thrust: false },
  { name: "chop", until: 3.25, pointerY: 0, guard: false, thrust: true },
  { name: "recover", until: 5.00, pointerY: 0, guard: false, thrust: false },
]);

/**
 * The scripted sequence for a chain whose command is a point rather than an angle.
 *
 * Rungs 2 and 3 read `pointerX`, `roll` and `wristBend`, none of which `BENCH_SEQUENCE` moves, so
 * running them through it would exercise one axis of three or of five and report a chain that had
 * never been asked to do the thing it exists for. Seven phases, and the last three are the ones
 * the session plan names:
 *
 * - **`across`** sweeps the cursor to the inboard edge at neutral reach, which is inside the
 *   envelope and must simply be reached.
 * - **`clamp`** demands the same inboard edge *at thrust reach*, which is outside the envelope --
 *   the minimum outboard carry couples the swing to the reach -- so the mapping must clamp it and
 *   the limb must sit where the envelope stops rather than anywhere near where it was asked.
 *   That is frozen rule 3 in one phase: there is no refusal branch anywhere for it to take.
 * - **`cut`** presses thrust while guard is held, which is the sweep across the envelope.
 *
 * A sweep and not a jump, wherever a phase is about the wobble: the cursor moves over the phase
 * rather than teleporting, because a teleported cursor gives the limb no momentum to carry and
 * turns "ten direction changes over 0.68 s" into a clean monotonic settle that says nothing.
 */
export const REACH_SEQUENCE = Object.freeze([
  { name: "rest", until: 1.20, pointerX: 0, pointerY: 0, guard: false, thrust: false },
  { name: "guard", until: 2.40, pointerX: 0, pointerY: 0, guard: true, thrust: false },
  { name: "sweep", until: 3.60, pointerX: 1, pointerY: 0.5, guard: false, thrust: false,
    from: { pointerX: 0, pointerY: 0 } },
  { name: "thrust", until: 3.70, pointerX: 1, pointerY: 0.5, guard: false, thrust: true },
  { name: "across", until: 5.20, pointerX: -1, pointerY: 0, guard: false, thrust: false,
    from: { pointerX: 1, pointerY: 0.5 } },
  { name: "clamp", until: 6.20, pointerX: -1, pointerY: 0, guard: false, thrust: true },
  { name: "chamber", until: 7.20, pointerX: 0.6, pointerY: 0.4, guard: true, thrust: false,
    from: { pointerX: -1, pointerY: 0 } },
  { name: "cut", until: 7.30, pointerX: 0.6, pointerY: 0.4, guard: true, thrust: true },
  { name: "settle", until: 8.30, pointerX: 0.4, pointerY: 0.2, guard: false, thrust: false },
  // A quarter-second flick and then a hold, which is what a key press through `src/input.ts`'s
  // own slew actually produces -- and it is deliberately faster than `CHAIN_WRIST.rollRate`, so
  // that the rate limiter is the thing being measured rather than the script.
  { name: "roll", until: 8.55, pointerX: 0.4, pointerY: 0.2, guard: false, thrust: false,
    roll: 1.1, wristBend: 0.7, from: { roll: 0, wristBend: 0 } },
  { name: "recover", until: 10.00, pointerX: 0.4, pointerY: 0.2, guard: false, thrust: false,
    roll: 1.1, wristBend: 0.7 },
]);

/** Which scripted sequence a module wants: a point-commanded chain gets the longer one. */
export const sequenceFor = (moduleId) =>
  moduleId.startsWith("effector.reach.") || moduleId.startsWith("effector.wrist.")
    ? REACH_SEQUENCE
    : BENCH_SEQUENCE;

/** A whole `Intent`, because a bench option adapts the command rather than being handed one. */
const benchIntent = () => ({
  forward: 0, strafe: 0, turn: 0, actingHand: "primary",
  natural: { thrust: false, guard: false },
  posture: { trunkLean: 0, trunkTwist: 0, crouch: 0 },
  primary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false },
  secondary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false },
});

/**
 * Run one module through the scripted sequence and hand back the readout.
 *
 * Exported so `tests/golem-bench.test.mjs` asserts against the same run this prints, rather
 * than against a second copy of the harness that could drift away from it.
 */
/**
 * One phase's commanded hand state, blended from `from` where the phase declares one.
 *
 * A phase with no `from` is a hold and a phase with one is a **sweep**, which matters: teleporting
 * the cursor and watching the limb converge shows a clean monotonic settle with no overshoot and
 * tells you nothing, because a teleport gives the blade no momentum to carry. Sweeping and then
 * holding is what a player does, and it is what turned one Warrior reading from "no ringing at
 * all" into ten direction changes over 0.68 s.
 */
function applyStep(hand, step, phaseStart, now) {
  const span = Math.max(1e-9, step.until - phaseStart);
  const t = Math.max(0, Math.min(1, (now - phaseStart) / span));
  const blend = (key) => {
    const to = step[key] ?? 0;
    if (!step.from || step.from[key] === undefined) return to;
    return step.from[key] + (to - step.from[key]) * t;
  };
  hand.pointerX = blend("pointerX");
  hand.pointerY = blend("pointerY");
  hand.roll = blend("roll");
  hand.wristBend = blend("wristBend");
  hand.guard = step.guard;
  hand.thrust = step.thrust;
}

export async function runGolemBench({
  moduleId,
  slot = "primary",
  side = "left",
  sequence = null,
  overrides = null,
} = {}) {
  const option = golemModule(moduleId);
  if (!option) {
    throw new Error(`no registered golem module "${moduleId}"; known: ${GOLEM_MODULES.map((o) => o.id).join(", ")}`);
  }
  if (!option.slots.includes(slot)) {
    throw new Error(`module "${moduleId}" does not fit the ${slot} slot`);
  }
  const script = sequence ?? sequenceFor(moduleId);

  // Overrides are applied before the module is built, because geometry and joint limits are
  // read at construction and a motor ceiling is written onto a native solver object there.
  // Changing one afterwards is exactly the "needs applyTuning to push it across" case the
  // house rules describe, and a sweep must not have to know which numbers are which.
  const restore = [];
  if (overrides) {
    for (const [block, values] of overrides) {
      for (const [key, value] of Object.entries(values)) {
        restore.push([block, key, block[key]]);
        block[key] = value;
      }
    }
  }

  const arena = await createHeadlessArena();
  const scene = arena.scene;
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  const stand = buildGolemStand(scene, { side, ground: Vector3.Zero(), facing: Quaternion.Identity() });

  let contacts = 0;
  let selfContacts = 0;
  const owned = new Set();
  const observers = [];
  const watch = (body) => {
    owned.add(body);
    body.setCollisionCallbackEnabled(true);
    observers.push([body, body.getCollisionObservable().add((event) => {
      contacts += 1;
      // A self-contact is a contact whose other side is also this golem's. The layer table is
      // built so that no such pair is ever admitted, so a non-zero count here is a filter that
      // was set wrongly rather than a body plan that touches itself.
      if (owned.has(event.collidedAgainst)) selfContacts += 1;
    })]);
  };

  const module = option.build({
    scene,
    side,
    name: `golem.${side}.${slot}`,
    socket: stand.socket(slot),
    layers: golemLayers(side),
    materials: stand.materials,
  });

  watch(stand.block.body);
  for (const part of module.parts) watch(part.part.body);
  // Forced activation, on every body, before a single reading is believed. Havok deactivates a
  // body at rest and a sleeping body reads a perfect zero however badly it shakes when awake --
  // which would make the rung-0 noise floor a measurement of Havok's sleep threshold.
  plugin.setActivationControl(stand.block.body, 1);
  for (const part of module.parts) plugin.setActivationControl(part.part.body, 1);

  // The band comes from the module rather than from a chain this run may not even be about: rung
  // 1's first axis is an angle and rungs 2 and 3's is a distance, so one shared constant would be
  // a number whose unit depends on what happens to be on the stand.
  const readout = new BenchReadout({ settledBand: module.envelope().settledBand });
  const sample = blankSample();
  const intent = benchIntent();
  let t = 0;

  const control = scene.onBeforePhysicsObservable.add(() => {
    module.step(SUBSTEP);
    const view = module.view();
    sample.t = t;
    sample.commanded = view && view.axes.length > 0 ? view.axes[0].commanded : 0;
    sample.achieved = view && view.axes.length > 0 ? view.axes[0].achieved : 0;
    if (view) {
      sample.tipX = view.tip.x;
      sample.tipY = view.tip.y;
      sample.tipZ = view.tip.z;
      sample.cmdX = view.commandedTip.x;
      sample.cmdY = view.commandedTip.y;
      sample.cmdZ = view.commandedTip.z;
      sample.stroking = view.stroke !== "idle";
      sample.anchorStray = view.anchorStray;
      sample.hasEdge = view.edge !== null;
      if (view.edge) {
        sample.edgeX = view.edge.x;
        sample.edgeY = view.edge.y;
        sample.edgeZ = view.edge.z;
      }
    }
    sample.contacts = contacts;
    sample.selfContacts = selfContacts;
    contacts = 0;
    selfContacts = 0;
    readout.sample(sample);
    t += SUBSTEP;
  });

  const marks = [];
  try {
    const total = script[script.length - 1].until;
    let phase = 0;
    for (let frame = 0; frame * FRAME < total; frame += 1) {
      const now = frame * FRAME;
      while (phase < script.length - 1 && now >= script[phase].until) phase += 1;
      const step = script[phase];
      applyStep(intent[slot], step, phase === 0 ? 0 : script[phase - 1].until, now);
      module.command(intent);

      scene._renderId += 1;
      scene._advancePhysicsEngineStep(1000 * FRAME);

      const next = frame + 1;
      if (next * FRAME >= script[phase].until || next * FRAME >= total) {
        const already = marks.findIndex((mark) => mark.phase === step.name);
        if (already < 0) marks.push({ phase: step.name, at: next * FRAME, state: readout.state() });
      }
    }
    return {
      harness: HARNESS,
      moduleId,
      slot,
      label: option.label,
      massKg: option.massKg,
      envelope: module.envelope(),
      marks,
      state: readout.state(),
    };
  } finally {
    scene.onBeforePhysicsObservable.remove(control);
    for (const [body, observer] of observers) body.getCollisionObservable().remove(observer);
    module.dispose();
    stand.dispose();
    arena.dispose();
    for (const [block, key, value] of restore.reverse()) block[key] = value;
  }
}

// ------------------------------------------------------------------- the locomotion harness

/**
 * The scripted locomotion sequence the session plan names, phase for phase.
 *
 * Stand, walk forward two seconds, strafe, turn, crouch and walk, a shove above the fall
 * threshold, recover. Every phase is a whole-body command through the same `Intent` a person's
 * keyboard produces -- `forward`, `strafe`, `turn` and `posture.crouch` -- because a locomotion
 * module reads exactly those and nothing else.
 *
 * **`recover` is not a phase field.** It is derived in `locomotionCommand` from whether the
 * person is asking to move at all, which is `fighterRequestsRising`'s existing rule; the `down`
 * phase therefore commands nothing so the fallen dwell can elapse, and `recover` walks forward,
 * which is both the request to get up and the thing to do once up.
 */
export const LOCOMOTION_SEQUENCE = Object.freeze([
  { name: "stand", until: 1.00, forward: 0, strafe: 0, turn: 0, crouch: 0 },
  { name: "walk", until: 3.00, forward: 1, strafe: 0, turn: 0, crouch: 0 },
  { name: "strafe", until: 4.50, forward: 0, strafe: 1, turn: 0, crouch: 0 },
  { name: "turn", until: 6.00, forward: 0, strafe: 0, turn: 1, crouch: 0 },
  { name: "crouchwalk", until: 8.00, forward: 1, strafe: 0, turn: 0, crouch: 1 },
  { name: "settle", until: 9.00, forward: 0, strafe: 0, turn: 0, crouch: 0 },
  // One frame long: a shove is an edge and an impulse, and a phase that held it would be a force.
  { name: "shove", until: 9.02, forward: 0, strafe: 0, turn: 0, crouch: 0, shove: true },
  { name: "down", until: 9.70, forward: 0, strafe: 0, turn: 0, crouch: 0 },
  { name: "recover", until: 12.00, forward: 1, strafe: 0, turn: 0, crouch: 0 },
]);

/**
 * A walk and nothing else, for sweeping a gait number.
 *
 * The full sequence above ends in a knockdown, and a gait column read over it is a column with a
 * ragdoll in the middle of it. Eight seconds of flat ground: a second standing so the noise floor
 * is a reading of the settled harness, six walking, a second stopping.
 */
export const WALK_SEQUENCE = Object.freeze([
  { name: "stand", until: 1.00, forward: 0, strafe: 0, turn: 0, crouch: 0 },
  { name: "walk", until: 7.00, forward: 1, strafe: 0, turn: 0, crouch: 0 },
  { name: "stop", until: 8.00, forward: 0, strafe: 0, turn: 0, crouch: 0 },
]);

/**
 * The locomotion modules this harness can drive.
 *
 * Looked up by definition rather than through `golemModule`, because what a locomotion run needs
 * is the module's own surface -- its readout, its live evidence and its shove -- and `BenchModule`
 * deliberately publishes none of those: it publishes what the *page* needs. `runGolemLocomotion`
 * asserts that whatever it drives is also registered, so a module benched here and missing from
 * the picker is a failure rather than a divergence.
 */
export const LOCOMOTION_MODULES = { biped: bipedModule };

/** A whole `Intent` again, with the movement axes this time. */
const locomotionIntent = () => benchIntent();

/**
 * Drive one locomotion module through a scripted sequence.
 *
 * **`course` is off by default and that is a measurement decision.** The page bench always has
 * the step, the curb and the row of posts in front of the stand, because a person driving it for
 * a couple of minutes has to have something to walk into. A *gait* number must not be taken
 * through them: measured, a straight two-second walk from the stand puts a foot on the 0.12 m
 * step about a second in, the leg jams, and the joint lag reads 1.549 rad -- which is a true
 * reading of a leg on a step and a false one of a walk. The obstacle cells turn it on and say so.
 */
export async function runGolemLocomotion({
  moduleId = "biped",
  side = "left",
  sequence = LOCOMOTION_SEQUENCE,
  overrides = null,
  populateFixture = null,
  course: withCourse = false,
  /** Called with the live scene and world-query registry before the module is built. */
  prepare = null,
  /** Called once per rendered frame with the live module, for a cell that measures its own thing. */
  watch = null,
} = {}) {
  const definition = LOCOMOTION_MODULES[moduleId];
  if (!definition) {
    throw new Error(`no locomotion module "${moduleId}"; known: ${Object.keys(LOCOMOTION_MODULES).join(", ")}`);
  }
  if (!golemModule(definition.id)) {
    throw new Error(`locomotion module "${definition.id}" is not registered in GOLEM_MODULES`);
  }

  const restore = [];
  if (overrides) {
    for (const [block, values] of overrides) {
      for (const [key, value] of Object.entries(values)) {
        restore.push([block, key, block[key]]);
        block[key] = value;
      }
    }
  }

  const arena = await createHeadlessArena({ populateFixture });
  const scene = arena.scene;
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  const world = flatSupportedWorldRegistry();
  const course = withCourse ? buildLocomotionCourse(scene) : null;
  if (withCourse) registerLocomotionCourse(world);
  const stand = buildGolemStand(scene, {
    side, ground: Vector3.Zero(), facing: Quaternion.Identity(), slot: "locomotion",
  });
  const prepared = prepare ? prepare({ scene, world, stand }) : null;
  const module = definition.build({
    scene, side, name: `golem.${side}.locomotion`, socket: stand.socket("locomotion"),
    layers: golemLayers(side), materials: stand.materials, world,
  });

  // Forced activation on every body before a single reading is believed: Havok deactivates a body
  // at rest and a sleeping one reads a perfect zero however badly it would shake awake, which for
  // a *standing* golem would make the whole idle interval a measurement of the sleep threshold.
  plugin.setActivationControl(stand.block.body, 1);
  for (const part of module.parts) plugin.setActivationControl(part.part.body, 1);

  // **Control runs on the physics clock**, exactly as the effector run above and the page do. The
  // accumulator takes four solver steps per rendered frame and notifies this before each; a
  // carrier stepped from the frame loop would resolve one safe boundary in four, and the state
  // machine would be reading a dt four times the one the solver used.
  const control = scene.onBeforePhysicsObservable.add(() => {
    module.step(SUBSTEP);
  });

  const intent = locomotionIntent();
  const marks = [];
  let shoved = null;
  try {
    const total = sequence[sequence.length - 1].until;
    let phase = 0;
    for (let frame = 0; frame * FRAME < total; frame += 1) {
      const now = frame * FRAME;
      while (phase < sequence.length - 1 && now >= sequence[phase].until) phase += 1;
      const step = sequence[phase];
      intent.forward = step.forward;
      intent.strafe = step.strafe;
      intent.turn = step.turn;
      intent.posture.crouch = step.crouch;
      module.command(locomotionCommand(intent));
      if (step.shove && shoved === null) {
        module.shove();
        shoved = now;
      }

      scene._renderId += 1;
      scene._advancePhysicsEngineStep(1000 * FRAME);
      if (watch) watch({ module, scene, world, stand, prepared, frame, now, phase: step.name });

      const next = frame + 1;
      if (next * FRAME >= sequence[phase].until || next * FRAME >= total) {
        if (!marks.some((mark) => mark.phase === step.name)) {
          marks.push({ phase: step.name, at: next * FRAME, state: module.readout() });
        }
      }
    }
    const evidence = module.evidence();
    return {
      harness: HARNESS,
      moduleId: definition.id,
      course: withCourse,
      label: definition.label,
      massKg: definition.massKg,
      supportedMassKg: definition.massKg + stand.block.body.getMassProperties().mass,
      heightRange: definition.heightRange,
      footprint: definition.footprint,
      shovedAt: shoved,
      prepared,
      marks,
      evidence: { ...evidence },
      state: module.readout(),
    };
  } finally {
    scene.onBeforePhysicsObservable.remove(control);
    module.dispose();
    stand.dispose();
    course?.dispose();
    arena.dispose();
    for (const [block, key, value] of restore.reverse()) block[key] = value;
  }
}

/**
 * The locomotion numbers with a sweep behind them.
 *
 * Same shape as `SWEEPS` and a separate table for the same reason the instrument is separate: a
 * column named "peak tip speed" means nothing on a pair of legs, and a sweep that reported one
 * would be a number waiting to be quoted wrongly.
 */
const LOCOMOTION_SWEEPS = {
  footFriction: { block: LOCOMOTION_BIPED, key: "footFriction",
    values: [0.15, 0.35, 0.45, 0.55, 0.65, 0.80] },
  strideCadence: { block: LOCOMOTION_BIPED, key: "strideCadence",
    values: [3.0, 3.8, 4.2, 4.4, 4.8, 5.5] },
  strideSwing: { block: LOCOMOTION_BIPED, key: "strideSwing",
    values: [0.30, 0.40, 0.45, 0.50, 0.55, 0.65] },
  kneeLiftScale: { block: LOCOMOTION_BIPED, key: "kneeLiftScale",
    values: [1.0, 1.6, 2.0, 2.4, 2.8, 3.2] },
  kneeLiftPhase: { block: LOCOMOTION_BIPED, key: "kneeLiftPhase",
    values: [0.9, 1.2, 1.4, 1.5, 1.6, 1.9] },
  hipTorque: { block: LOCOMOTION_BIPED, key: "hipTorque",
    values: [300, 600, 800, 900, 1100, 1600, 3000] },
  kneeTorque: { block: LOCOMOTION_BIPED, key: "kneeTorque",
    values: [200, 350, 450, 500, 600, 900, 1800] },
  ankleTorque: { block: LOCOMOTION_BIPED, key: "ankleTorque",
    values: [60, 140, 220, 320, 600, 1200] },
  targetRate: { block: LOCOMOTION_BIPED, key: "targetRate", values: [2, 4, 6, 10, 20] },
  // These three are about a knockdown, so they are the only ones read over the whole sequence.
  waistTorque: { block: BENCH_STAND_LOCOMOTION, key: "waistTorque",
    values: [800, 2000, 5000, 12000], sequence: LOCOMOTION_SEQUENCE },
  shove: { block: LOCOMOTION_BIPED, key: "shoveImpulseNs",
    values: [10, 12, 200, 600, 1600], sequence: LOCOMOTION_SEQUENCE },
  fallenTorque: { block: LOCOMOTION_BIPED, key: "fallenTorqueScale",
    values: [1.0, 0.30, 0.08, 0.0], sequence: LOCOMOTION_SEQUENCE },
};

/**
 * Every number that decides whether a chain reads as a limb, each with its own sweep.
 *
 * The first three are rung 1's -- the torque cap, the target rate limit and the stroke shape --
 * and the rest are rungs 2 and 3's equivalents in the units an anchor and a wrist work in. What
 * they have in common is that each one is a *ceiling* rather than a stiffness, which is the whole
 * of frozen rule 4: weight comes from a finite budget against real mass.
 *
 * A sweep names the phase mark it reads, because one settle time reported over a whole run cannot
 * say which move produced it and the reach sequence has ten phases.
 */
const SWEEPS = {
  rate: { block: CHAIN_PITCH, key: "targetRate", values: [2.5, 4, 6, 9, 14, 30], mark: "guard" },
  torque: { block: CHAIN_PITCH, key: "motorTorque", values: [120, 200, 320, 500, 900], mark: "guard" },
  chop: { block: CHAIN_PITCH.chop, key: "driveRate", values: [6, 9, 12, 16, 22], mark: "guard" },
  force: {
    block: CHAIN_REACH, key: "anchorForce",
    values: [1400, 2400, 3900, 6000, 9000, 14000], mark: "guard",
  },
  reachRate: {
    block: CHAIN_REACH, key: "anchorRate",
    values: [1.0, 1.2, 1.5, 1.8, 2.2, 3.0], mark: "guard",
  },
  thrustFollow: {
    block: CHAIN_REACH.thrust, key: "followSeconds",
    values: [0, 0.02, 0.04, 0.06, 0.10], mark: "thrust",
  },
  thrustRate: {
    block: CHAIN_REACH.thrust, key: "strokeRate",
    values: [3, 5, 8, 12, 16], mark: "thrust",
  },
  cutRate: {
    block: CHAIN_REACH.cut, key: "strokeRate",
    values: [3, 5, 8, 12, 16], mark: "cut",
  },
  thrustDrive: {
    block: CHAIN_REACH.thrust, key: "driveSeconds",
    values: [0.03, 0.05, 0.07, 0.10, 0.16], mark: "thrust",
  },
  cutSweep: {
    block: CHAIN_REACH.cut, key: "swingRate",
    values: [4, 6, 9, 13, 18], mark: "cut",
  },
  wristTorque: {
    block: CHAIN_WRIST, key: "rollTorque",
    values: [20, 60, 120, 200, 320], mark: "roll",
  },
  wristRate: {
    block: CHAIN_WRIST, key: "rollRate",
    values: [1, 2, 4, 8, 16], mark: "recover",
  },
  wristBendTorque: {
    block: CHAIN_WRIST, key: "bendTorque",
    values: [20, 60, 120, 200, 320], mark: "roll",
  },
  wristDamping: {
    block: CHAIN_WRIST, key: "angularDamping",
    values: [3, 8, 16, 30, 60], mark: "recover",
  },
  wristMotorDamping: {
    block: CHAIN_WRIST, key: "motorDamping",
    values: [0, 1, 3, 6, 12, 30], mark: "roll",
  },
};

function parseArgs(argv) {
  const args = { chain: null, terminal: null, module: null, sweep: null, json: false,
    slot: "primary", locomotion: null, course: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--json") { args.json = true; continue; }
    const value = argv[index + 1];
    switch (flag) {
      case "--chain": args.chain = value; index += 1; break;
      case "--terminal": args.terminal = value; index += 1; break;
      case "--module": args.module = value; index += 1; break;
      case "--sweep": args.sweep = value; index += 1; break;
      case "--slot": args.slot = value; index += 1; break;
      case "--locomotion": args.locomotion = value ?? "biped"; index += 1; break;
      case "--course": args.course = true; break;
      default: throw new Error(`unknown flag ${flag}`);
    }
  }
  return args;
}

const idFor = (args) => {
  if (args.module) return args.module;
  if (!args.chain) return GOLEM_MODULES[0].id;
  return args.terminal ? `effector.${args.chain}.${args.terminal}` : `effector.${args.chain}`;
};

const fixed = (value, places) => (value === null ? "n/a" : value.toFixed(places));

function printLocomotion(run) {
  process.stdout.write(`harness: ${HARNESS}\n`);
  process.stdout.write(`module ${run.moduleId} -- ${run.label}, ${run.massKg.toFixed(2)} kg of module,`
    + ` ${run.supportedMassKg.toFixed(2)} kg supported\n`);
  process.stdout.write(`stands ${run.heightRange.standM.toFixed(3)} m,`
    + ` crouches to ${run.heightRange.crouchM.toFixed(3)} m,`
    + ` footprint r=${run.footprint.radiusM.toFixed(3)} m,`
    + ` step envelope ${run.footprint.stepHeightM.toFixed(3)} m,`
    + ` max slope ${run.footprint.maxSlopeDeg} deg\n`);
  process.stdout.write(`shoved at ${run.shovedAt === null ? "n/a" : `${run.shovedAt.toFixed(2)} s`}\n\n`);
  for (const mark of run.marks) {
    process.stdout.write(`  after "${mark.phase}" at ${mark.at.toFixed(2)} s:`
      + ` supported ${mark.state.supportedSteps}/${mark.state.steps},`
      + ` lag ${mark.state.peakCarrierLagMps.toFixed(3)} m/s,`
      + ` slip ${(mark.state.peakFootSlipMps * 1000).toFixed(1)} mm/s,`
      + ` joint lag ${mark.state.peakJointErrorRad.toFixed(4)} rad,`
      + ` height ${mark.state.minHeightM.toFixed(3)}..${mark.state.maxHeightM.toFixed(3)} m\n`);
  }
  process.stdout.write("\n");
  for (const line of formatLocomotion(run.state, run.evidence)) process.stdout.write(`  ${line}\n`);
}

async function mainLocomotion(args) {
  if (args.sweep) {
    const sweep = LOCOMOTION_SWEEPS[args.sweep];
    if (!sweep) {
      throw new Error(`unknown locomotion sweep "${args.sweep}";`
        + ` known: ${Object.keys(LOCOMOTION_SWEEPS).join(", ")}`);
    }
    const rows = [];
    for (const value of sweep.values) {
      const run = await runGolemLocomotion({
        moduleId: args.locomotion, course: args.course,
        sequence: sweep.sequence ?? WALK_SEQUENCE,
        overrides: [[sweep.block, { [sweep.key]: value }]],
      });
      rows.push({ value, ...run.state });
    }
    if (args.json) {
      process.stdout.write(`${JSON.stringify({ harness: HARNESS, sweep: args.sweep, rows }, null, 2)}\n`);
      return;
    }
    process.stdout.write(`harness: ${HARNESS}\n`);
    process.stdout.write(`locomotion.${args.locomotion}, sweeping ${args.sweep} (${sweep.key})\n\n`);
    process.stdout.write("   value   slip peak   slip mean   joint lag   sole lift   carrier lag"
      + "   lean up/all   min up     planted   gap s   height min   rise s   hits/self\n");
    for (const row of rows) {
      process.stdout.write(
        `  ${String(row.value).padStart(6)}`
        + `   ${(row.peakFootSlipMps * 1000).toFixed(1).padStart(9)}`
        + `   ${(row.meanFootSlipMps * 1000).toFixed(1).padStart(9)}`
        + `   ${row.peakJointErrorRad.toFixed(4).padStart(9)}`
        + `   ${(row.peakSoleLiftM * 1000).toFixed(1).padStart(9)}`
        + `   ${row.peakCarrierLagMps.toFixed(3).padStart(11)}`
        + `   ${row.peakUprightLeanRad.toFixed(4)}/${row.peakLeanRad.toFixed(4)}`
        + `   ${row.minUpDot.toFixed(3).padStart(6)}`
        + `   ${String(row.plantedSteps).padStart(5)}/${String(row.steps).padStart(4)}`
        + `   ${row.longestSupportGapSeconds.toFixed(3).padStart(5)}`
        + `   ${row.minHeightM.toFixed(3).padStart(10)}`
        + `   ${(row.riseSeconds === null ? "n/a" : row.riseSeconds.toFixed(3)).padStart(6)}`
        + `   ${String(row.contacts).padStart(5)}/${row.selfContacts}\n`,
      );
    }
    return;
  }
  const run = await runGolemLocomotion({ moduleId: args.locomotion, course: args.course });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
    return;
  }
  printLocomotion(run);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.locomotion) {
    await mainLocomotion(args);
    return;
  }
  const moduleId = idFor(args);

  if (args.sweep) {
    const sweep = SWEEPS[args.sweep];
    if (!sweep) throw new Error(`unknown sweep "${args.sweep}"; known: ${Object.keys(SWEEPS).join(", ")}`);
    const rows = [];
    for (const value of sweep.values) {
      const run = await runGolemBench({
        moduleId, slot: args.slot, overrides: [[sweep.block, { [sweep.key]: value }]],
      });
      const at = run.marks.find((mark) => mark.phase === sweep.mark);
      rows.push({
        value,
        settleSeconds: at ? at.state.settleSeconds : null,
        arrivalSeconds: at ? at.state.arrivalSeconds : null,
        overshoot: at ? at.state.overshoot : 0,
        // Two peaks, because one would be the wrong one for half the sweeps. The mark's peak is
        // what the *command move* produced; the run's is the stroke, which is far larger and
        // would swamp a torque or rate sweep entirely.
        peakAtMark: at ? at.state.peakTipSpeedDriven : 0,
        peakTipSpeedDriven: run.state.peakTipSpeedDriven,
        peakTipErrorMm: run.state.peakTipErrorMm,
        tipWanderMm: run.state.tipWanderMm,
        idleAnchorStrayMm: run.state.idleAnchorStrayMm,
        peakAnchorStrayMm: run.state.peakAnchorStrayMm,
        edgeLeadAtPeak: run.state.edgeLeadAtPeak,
        stuckSteps: run.state.stuckSteps,
        contacts: run.state.contacts,
        selfContacts: run.state.selfContacts,
      });
    }
    if (args.json) {
      process.stdout.write(`${JSON.stringify({ harness: HARNESS, moduleId, sweep: args.sweep, rows }, null, 2)}\n`);
      return;
    }
    process.stdout.write(`harness: ${HARNESS}\n`);
    process.stdout.write(`module ${moduleId}, sweeping ${args.sweep} (${sweep.key}), read at the "${sweep.mark}" mark\n\n`);
    process.stdout.write("  value   arrival   overshoot   peak at mark   peak on run   lag mm   wander mm   idle stray   stroke stray   stuck   hits\n");
    for (const row of rows) {
      process.stdout.write(
        `  ${String(row.value).padStart(5)}  ${fixed(row.arrivalSeconds, 3).padStart(7)}s`
        + `   ${row.overshoot.toFixed(4).padStart(9)}`
        + `   ${row.peakAtMark.toFixed(2).padStart(12)}`
        + `   ${row.peakTipSpeedDriven.toFixed(2).padStart(11)}`
        + `   ${row.peakTipErrorMm.toFixed(1).padStart(6)}`
        + `   ${row.tipWanderMm.toFixed(3).padStart(9)}`
        + `   ${fixed(row.idleAnchorStrayMm, 2).padStart(10)}`
        + `   ${fixed(row.peakAnchorStrayMm, 2).padStart(12)}`
        + `   ${String(row.stuckSteps).padStart(5)}`
        + `   ${String(row.contacts).padStart(4)}\n`,
      );
    }
    return;
  }

  const run = await runGolemBench({ moduleId, slot: args.slot });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
    return;
  }
  process.stdout.write(`harness: ${HARNESS}\n`);
  process.stdout.write(`module ${run.moduleId} -- ${run.label}, ${run.massKg.toFixed(2)} kg,`
    + ` reach ${run.envelope.reach.toFixed(3)} m\n`);
  process.stdout.write(`exclusions: first ${BENCH_READOUT.startupExclusionSeconds} s,`
    + ` ${BENCH_READOUT.contactExclusionSeconds} s after any contact\n`);
  process.stdout.write(`strokes: ${run.envelope.strokes.join(", ") || "none"}\n`);
  const reachable = run.envelope.reachable;
  if (reachable) {
    // The envelope, printed because it is the mechanism rather than a guard: a command that would
    // leave this shell is clamped into it before the anchor is ever handed a target.
    process.stdout.write(
      `envelope: reach ${reachable.reachMin.toFixed(2)}..${reachable.reachMax.toFixed(2)} m,`
      + ` swing ${reachable.swingMin.toFixed(2)}..${reachable.swingMax.toFixed(2)} rad (outboard-signed),`
      + ` lift ${reachable.liftMin.toFixed(2)}..${reachable.liftMax.toFixed(2)} rad,`
      + ` carry >= ${reachable.carryMin.toFixed(2)} m from the socket\n`,
    );
  }
  process.stdout.write("\n");
  for (const mark of run.marks) {
    process.stdout.write(`  after "${mark.phase}" at ${mark.at.toFixed(2)} s:`
      + ` settle ${fixed(mark.state.settleSeconds, 3)} s,`
      + ` arrival ${fixed(mark.state.arrivalSeconds, 3)} s,`
      + ` overshoot ${mark.state.overshoot.toFixed(4)},`
      + ` wander ${mark.state.tipWanderMm.toFixed(3)} mm,`
      + ` stray ${fixed(mark.state.peakAnchorStrayMm, 2)} mm,`
      + ` peak tip driven ${mark.state.peakTipSpeedDriven.toFixed(2)} m/s\n`);
  }
  process.stdout.write("\n");
  for (const line of formatReadout(run.state)) process.stdout.write(`  ${line}\n`);
}

// `import.meta.main` is Node 22.13's spelling and this directory pins that engine floor.
if (process.argv[1] && process.argv[1].endsWith("golem-bench.mjs")) {
  await main();
}
