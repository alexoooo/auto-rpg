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
import { BENCH_READOUT, CHAIN_PITCH } from "../src/golem/config.ts";
import { BenchReadout, blankSample, formatReadout } from "../src/golem/readout.ts";
import { GOLEM_MODULES, golemModule } from "../src/golem/registry.ts";
import { buildGolemStand, golemLayers } from "../src/golem/stand.ts";
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
export async function runGolemBench({
  moduleId,
  slot = "primary",
  side = "left",
  sequence = BENCH_SEQUENCE,
  overrides = null,
} = {}) {
  const option = golemModule(moduleId);
  if (!option) {
    throw new Error(`no registered golem module "${moduleId}"; known: ${GOLEM_MODULES.map((o) => o.id).join(", ")}`);
  }
  if (!option.slots.includes(slot)) {
    throw new Error(`module "${moduleId}" does not fit the ${slot} slot`);
  }

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

  const readout = new BenchReadout({ settledBand: CHAIN_PITCH.settledBand });
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
      sample.stroking = view.stroke !== "idle";
      sample.anchorStray = view.anchorStray;
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
    const total = sequence[sequence.length - 1].until;
    let phase = 0;
    for (let frame = 0; frame * FRAME < total; frame += 1) {
      const now = frame * FRAME;
      while (phase < sequence.length - 1 && now >= sequence[phase].until) phase += 1;
      const step = sequence[phase];
      const hand = intent[slot];
      hand.pointerY = step.pointerY;
      hand.guard = step.guard;
      hand.thrust = step.thrust;
      module.command(intent);

      scene._renderId += 1;
      scene._advancePhysicsEngineStep(1000 * FRAME);

      const next = frame + 1;
      if (next * FRAME >= sequence[phase].until || next * FRAME >= total) {
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

/** The three numbers that decide whether rung 1 reads as a limb, each with its own sweep. */
const SWEEPS = {
  rate: { block: CHAIN_PITCH, key: "targetRate", values: [2.5, 4, 6, 9, 14, 30] },
  torque: { block: CHAIN_PITCH, key: "motorTorque", values: [120, 200, 320, 500, 900] },
  chop: {
    block: CHAIN_PITCH.chop,
    key: "driveRate",
    values: [6, 9, 12, 16, 22],
  },
};

function parseArgs(argv) {
  const args = { chain: null, terminal: null, module: null, sweep: null, json: false, slot: "primary" };
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const moduleId = idFor(args);

  if (args.sweep) {
    const sweep = SWEEPS[args.sweep];
    if (!sweep) throw new Error(`unknown sweep "${args.sweep}"; known: ${Object.keys(SWEEPS).join(", ")}`);
    const rows = [];
    for (const value of sweep.values) {
      const run = await runGolemBench({
        moduleId, slot: args.slot, overrides: [[sweep.block, { [sweep.key]: value }]],
      });
      const guard = run.marks.find((mark) => mark.phase === "guard");
      rows.push({
        value,
        settleSeconds: guard ? guard.state.settleSeconds : null,
        arrivalSeconds: guard ? guard.state.arrivalSeconds : null,
        overshoot: guard ? guard.state.overshoot : 0,
        // Two peaks, because one would be the wrong one for two of the three sweeps. The guard
        // mark's peak is what the *command move* produced; the run's is the chop, which is far
        // larger and would swamp a torque or rate sweep entirely.
        peakGuard: guard ? guard.state.peakTipSpeedDriven : 0,
        peakTipSpeedDriven: run.state.peakTipSpeedDriven,
        tipWanderMm: run.state.tipWanderMm,
        stuckSteps: run.state.stuckSteps,
        selfContacts: run.state.selfContacts,
      });
    }
    if (args.json) {
      process.stdout.write(`${JSON.stringify({ harness: HARNESS, moduleId, sweep: args.sweep, rows }, null, 2)}\n`);
      return;
    }
    process.stdout.write(`harness: ${HARNESS}\n`);
    process.stdout.write(`module ${moduleId}, sweeping ${args.sweep} (${sweep.key})\n\n`);
    process.stdout.write("  value   settle  arrival   overshoot   peak tip on the step   peak tip on the chop   wander mm   stuck\n");
    for (const row of rows) {
      process.stdout.write(
        `  ${String(row.value).padStart(5)}   ${fixed(row.settleSeconds, 3).padStart(6)}s`
        + `  ${fixed(row.arrivalSeconds, 3).padStart(6)}s`
        + `   ${row.overshoot.toFixed(4).padStart(9)}`
        + `   ${row.peakGuard.toFixed(2).padStart(20)}`
        + `   ${row.peakTipSpeedDriven.toFixed(2).padStart(20)}`
        + `   ${row.tipWanderMm.toFixed(3).padStart(9)}`
        + `   ${String(row.stuckSteps).padStart(5)}\n`,
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
    + ` ${BENCH_READOUT.contactExclusionSeconds} s after any contact\n\n`);
  for (const mark of run.marks) {
    process.stdout.write(`  after "${mark.phase}" at ${mark.at.toFixed(2)} s:`
      + ` settle ${fixed(mark.state.settleSeconds, 3)} s,`
      + ` arrival ${fixed(mark.state.arrivalSeconds, 3)} s,`
      + ` overshoot ${mark.state.overshoot.toFixed(4)},`
      + ` wander ${mark.state.tipWanderMm.toFixed(3)} mm,`
      + ` peak tip driven ${mark.state.peakTipSpeedDriven.toFixed(2)} m/s\n`);
  }
  process.stdout.write("\n");
  for (const line of formatReadout(run.state)) process.stdout.write(`  ${line}\n`);
}

// `import.meta.main` is Node 22.13's spelling and this directory pins that engine floor.
if (process.argv[1] && process.argv[1].endsWith("golem-bench.mjs")) {
  await main();
}
