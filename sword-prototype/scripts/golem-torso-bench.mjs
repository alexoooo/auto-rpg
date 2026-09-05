/**
 * The golem torso and head bench's Node harness: a trunk on the stand with a head on it.
 *
 * **It is not the page bench and its numbers are not the page bench's**, and it is not
 * `scripts/golem-bench.mjs` either. Three harnesses now, and the rule has not changed: the page
 * and the headless bench agree on converged behaviour and disagree by about 9 % on the Warrior's
 * peak transient with identical code, and putting two of them in one column has already produced
 * a regression report about a build where nothing had changed. Every figure this prints says
 * which harness took it, on the first line, on purpose.
 *
 * It is a separate script from `golem-bench.mjs` rather than a mode inside it because what it
 * drives is a different thing: that one writes a `HandIntent` into one socket and reads one
 * module's view, and this one writes `posture` and `natural` into a whole `Intent`, stands two
 * modules on each other, and reads both. Sharing the file would have meant a flag in the middle
 * of a harness two other sessions are extending in parallel.
 *
 *     node scripts/golem-torso-bench.mjs
 *     node scripts/golem-torso-bench.mjs --torso torso.plated --head head.ram
 *     node scripts/golem-torso-bench.mjs --head head.ram --no-torso
 *     node scripts/golem-torso-bench.mjs --sweep leanTorque
 *     node scripts/golem-torso-bench.mjs --json
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { CONFIG } from "../src/config.ts";
import { slewTowards } from "../src/golem/anchor-drive.ts";
import { BENCH_READOUT, HEAD_NECK, HEAD_RAM, TORSO_WAIST } from "../src/golem/config.ts";
import { BenchReadout, blankSample, formatReadout } from "../src/golem/readout.ts";
import { GOLEM_MODULES, golemModule } from "../src/golem/registry.ts";
import { buildGolemStand, golemLayers } from "../src/golem/stand.ts";
import { createHeadlessArena } from "./golem-headless-arena.mjs";

export const HARNESS =
  "the Node torso bench (scripts/golem-torso-bench.mjs, NullEngine, real Havok, no rendering)";

const FRAME = 1 / 60;
const SUBSTEP = 1 / CONFIG.world.physicsHz;

/**
 * The shove, in newton-seconds, and where it is aimed.
 *
 * **An impulse, because a shove is an impulse.** No force may be applied from outside the solver;
 * `Combat` already delivers every blow in this directory as `applyImpulse`, and this is the same
 * call with a number chosen rather than scored.
 *
 * 84 N.s is the whole momentum of a ram plate at the lunge speed this same harness measures --
 * `HEAD_RAM.plateMass` of 21 kg at 4 m/s -- so the bench shove is "what one of this session's own
 * golems can actually hit you with" rather than a number picked to make a bob look good. Aimed
 * across and a little back, because a purely sagittal shove would exercise the pitch motor that
 * is already being measured and leave the neck's second axis untested; this one turns the head as
 * well as rocking it.
 */
export const BENCH_SHOVE = Object.freeze({
  newtonSeconds: 84,
  direction: Object.freeze([1, 0, -0.4]),
});

/**
 * The scripted sequence: settle, lean, twist, square up, take a shove, guard, lunge, recover.
 *
 * `lean` and `twist` are the **normalized** command a person's arrow keys produce, and they are
 * slewed here at `CONFIG.controls.postureSlewPerSecond` rather than stepped. That slew is
 * `src/input.ts`'s own and is restated here for the reason `applyButtonPose` exists at all:
 * `input.ts` cannot be loaded by Node -- the DOM is in its graph -- so a rule written there is a
 * rule no harness can reach. Restating it is what makes this a measurement of what a person
 * produces; stepping the command instead would measure the module's rate limiter, which does not
 * bind for a person and says so in `TORSO_WAIST.leanRate`.
 *
 * The first mark sits past the 0.6 s startup exclusion, so the noise floor it reports is a
 * reading of a settled harness rather than of a trunk arriving.
 */
export const TORSO_SEQUENCE = Object.freeze([
  { name: "settle", until: 1.20, lean: 0, twist: 0, guard: false, thrust: false },
  { name: "lean", until: 2.80, lean: 1, twist: 0, guard: false, thrust: false },
  { name: "square", until: 4.00, lean: 0, twist: 0, guard: false, thrust: false },
  { name: "twist", until: 5.40, lean: 0, twist: 1, guard: false, thrust: false },
  // **A settled body before the shove, which the first draft did not have.** The shove used to
  // land the instant the twist phase ended, so the ''bob'' it measured was mostly the trunk
  // returning from full twist -- 214 mm of it, against the 40-odd a shove actually produces.
  // A measurement taken while the thing is already moving is a measurement of the wrong motion.
  { name: "untwist", until: 6.80, lean: 0, twist: 0, guard: false, thrust: false },
  // The shove phase is 3.4 s long because that is how long the bob takes to die on a trunk. At
  // 1.8 s the meter reported "settled at 1.800 s" for every setting swept, which is a window
  // reporting its own length rather than a measurement -- the same defect as a peak with no
  // exclusion window, wearing the opposite sign.
  { name: "shove", until: 9.60, lean: 0, twist: 0, guard: false, thrust: false, shove: true },
  { name: "guard", until: 10.80, lean: 0, twist: 0, guard: true, thrust: false },
  { name: "unguard", until: 11.80, lean: 0, twist: 0, guard: false, thrust: false },
  { name: "lunge", until: 11.90, lean: 0, twist: 0, guard: false, thrust: true },
  { name: "recover", until: 13.60, lean: 0, twist: 0, guard: false, thrust: false },
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
 * How far a point has moved from where it was when the shove landed, and how long it took to come
 * back: the head bob, in millimetres and seconds.
 *
 * **It only means anything with `setActivationControl(body, 1)` set on every body**, which the
 * runner does before a single reading is believed: Havok deactivates a body at rest, and a
 * sleeping head reads a perfect zero however badly it would shake awake.
 */
class BobMeter {
  constructor(bandMm) {
    this.bandMm = bandMm;
    this.rest = null;
    this.peakMm = 0;
    this.lastOutsideAt = null;
    this.startedAt = null;
    this.closesAt = 0;
    this.history = [];
  }

  /**
   * Plant the reference the instant the impulse is applied, not a step later, and say when the
   * window shuts.
   *
   * **The window is the correction, and the first draft did not have one.** Without it the meter
   * ran to the end of the script and the "bob" it reported was the *guard* and the *lunge* that
   * come after the shove -- 490 mm of it, which is a head deliberately nodding half a metre and
   * not a head being knocked. A measurement that keeps reading after the thing it is measuring
   * has finished is the same defect as a peak with no exclusion window, which is why this file
   * already carries two of those.
   */
  arm(at, closesAt, x, y, z) {
    this.rest = { x, y, z };
    this.startedAt = at;
    this.closesAt = closesAt;
    this.peakMm = 0;
    this.history.length = 0;
  }

  sample(at, x, y, z) {
    if (!this.rest || at > this.closesAt) return;
    const mm = Math.hypot(x - this.rest.x, y - this.rest.y, z - this.rest.z) * 1000;
    if (mm > this.peakMm) this.peakMm = mm;
    this.history.push(at, mm);
  }

  /**
   * How long the knock took to decay to a tenth of itself, seconds.
   *
   * **A fraction of its own peak rather than a fixed band, and that is the second correction this
   * meter needed.** A fixed 8 mm band never closed at any setting swept, because it is *below the
   * standing noise floor of the thing being measured*: a trunk's own tip wanders about 20 mm at
   * rest and a head's about 30 mm, so "still outside 8 mm" was a statement about the floor rather
   * than about the shove, and every row reported the window's own length back as a settle time.
   * A tenth of the peak scales with the blow, which is what a decay time has to do, and is above
   * the floor for any shove worth measuring.
   *
   * Read retrospectively, which is why the samples are kept: the peak is not known until the
   * window closes.
   */
  state() {
    const bar = Math.max(this.bandMm, this.peakMm * 0.1);
    let lastOutside = this.startedAt;
    for (let index = 0; index < this.history.length; index += 2) {
      if (this.history[index + 1] > bar) lastOutside = this.history[index];
    }
    return {
      peakMm: this.peakMm,
      settleSeconds: this.startedAt === null ? null : lastOutside - this.startedAt,
      // How long the window was open, so a settle time equal to it is visibly a window and not a
      // measurement.
      windowSeconds: this.startedAt === null ? null : this.closesAt - this.startedAt,
      barMm: bar,
    };
  }
}

/**
 * How deep the lunge went, and how much of that depth the *follow* phase bought.
 *
 * **The reading that says whether a stroke is a velocity event or a pose sequence.** Rung 1's
 * `CHAIN_PITCH.chop` records the same measurement and what it caught: a drive long enough to run
 * the whole way to the joint stop leaves the follow phase nothing to carry, and the stroke becomes
 * a pose sequence with a bounce on the end of it. Two numbers settle it -- the pitch the drive
 * ended at, and the deepest pitch reached at any time -- and the gap between them is the
 * follow-through.
 */
class LungeMeter {
  constructor() {
    this.previousPhase = "idle";
    this.driveEndPitch = null;
    this.deepestPitch = null;
    this.running = false;
  }

  sample(phase, pitch) {
    if (phase === "drive" && this.previousPhase === "idle") {
      this.running = true;
      this.deepestPitch = pitch;
    }
    if (phase === "follow" && this.previousPhase === "drive") this.driveEndPitch = pitch;
    if (this.running && (this.deepestPitch === null || pitch > this.deepestPitch)) {
      this.deepestPitch = pitch;
    }
    this.previousPhase = phase;
  }

  state() {
    return {
      driveEndPitch: this.driveEndPitch,
      deepestPitch: this.deepestPitch,
      carriedPastDrive: this.driveEndPitch === null || this.deepestPitch === null
        ? null : this.deepestPitch - this.driveEndPitch,
    };
  }
}

/**
 * Run one torso, one head, or a head on a torso, through the scripted sequence.
 *
 * Exported so `tests/golem-torso-head.test.mjs` asserts against the same run this prints, rather
 * than against a second copy of the harness that could drift away from it.
 */
export async function runTorsoBench({
  torsoId = "torso.plain",
  headId = "head.ram",
  side = "left",
  sequence = TORSO_SEQUENCE,
  overrides = null,
  bobBandMm = 8,
} = {}) {
  const torsoOption = torsoId ? golemModule(torsoId) : null;
  const headOption = headId ? golemModule(headId) : null;
  if (torsoId && !torsoOption) throw new Error(`no registered golem module "${torsoId}"`);
  if (headId && !headOption) throw new Error(`no registered golem module "${headId}"`);
  if (!torsoOption && !headOption) throw new Error("a torso bench run needs a torso or a head");

  // Overrides before anything is built, because geometry and joint limits are read at
  // construction and a motor ceiling is written onto a native solver object there.
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
  const stand = buildGolemStand(scene, {
    side, ground: Vector3.Zero(), facing: Quaternion.Identity(),
  });
  const layers = golemLayers(side);

  let contacts = 0;
  let selfContacts = 0;
  const owned = new Set();
  const observers = [];
  const watch = (body) => {
    owned.add(body);
    body.setCollisionCallbackEnabled(true);
    observers.push([body, body.getCollisionObservable().add((event) => {
      contacts += 1;
      // A self-contact is a contact whose other side is also this golem's. Neither a torso nor a
      // head is on a layer that contains its own golem, so a non-zero count here is a filter set
      // wrongly rather than a body plan that touches itself -- and zero proves only that no pair
      // was admitted by accident, which is the honest half of that reading.
      if (owned.has(event.collidedAgainst)) selfContacts += 1;
    })]);
  };

  const torso = torsoOption ? torsoOption.build({
    scene, side, name: `golem.${side}.torso`, socket: stand.socket("torso"), layers,
    materials: stand.materials,
  }) : null;
  const neck = torso ? torso.socket?.("head") ?? null : stand.socket("head");
  const head = headOption && neck ? headOption.build({
    scene, side, name: `golem.${side}.head`, socket: neck, layers, materials: stand.materials,
  }) : null;

  watch(stand.block.body);
  for (const part of torso?.parts ?? []) watch(part.part.body);
  for (const part of head?.parts ?? []) watch(part.part.body);
  plugin.setActivationControl(stand.block.body, 1);
  for (const part of torso?.parts ?? []) plugin.setActivationControl(part.part.body, 1);
  for (const part of head?.parts ?? []) plugin.setActivationControl(part.part.body, 1);

  // **One instrument per axis, not per module**, and that is a correction rather than a
  // flourish. `BenchReadout` takes settle, arrival, overshoot and target error from whatever
  // single axis it is fed, so a trunk read only on its lean reported *identical* numbers across a
  // whole twist-torque sweep -- six rows of a column that was measuring the other axis. Feeding a
  // second copy the second axis costs one object and is the same instrument reading a different
  // number, rather than a second copy of the arithmetic that could drift from it. The tip columns
  // are the same tip in both, which is correct: there is one business end.
  const make = (module) => module
    ? {
      first: new BenchReadout({ settledBand: module.envelope().settledBand }),
      second: new BenchReadout({ settledBand: module.envelope().settledBand }),
      firstSample: blankSample(),
      secondSample: blankSample(),
    }
    : null;
  const torsoReadout = make(torso);
  const headReadout = make(head);
  const bob = new BobMeter(bobBandMm);
  const lunge = new LungeMeter();

  const intent = benchIntent();
  let t = 0;
  let shoveDone = false;

  const feedAxis = (module, readout, sample, axis) => {
    if (!module || !readout) return;
    const view = module.view();
    sample.t = t;
    sample.commanded = view && view.axes.length > axis ? view.axes[axis].commanded : 0;
    sample.achieved = view && view.axes.length > axis ? view.axes[axis].achieved : 0;
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
    }
    sample.contacts = contacts;
    sample.selfContacts = selfContacts;
    readout.sample(sample);
  };

  const feed = (module, pair) => {
    if (!module || !pair) return;
    feedAxis(module, pair.first, pair.firstSample, 0);
    feedAxis(module, pair.second, pair.secondSample, 1);
  };

  const control = scene.onBeforePhysicsObservable.add(() => {
    torso?.step(SUBSTEP);
    head?.step(SUBSTEP);
    feed(torso, torsoReadout);
    feed(head, headReadout);
    const tip = head?.view()?.tip ?? torso?.view()?.tip ?? null;
    if (tip) bob.sample(t, tip.x, tip.y, tip.z);
    const headView = head?.view() ?? null;
    if (headView) lunge.sample(headView.stroke, headView.axes[0].achieved);
    // Cleared once per control step, after both instruments have been given the same census --
    // clearing it per module would hand the second one a zero and hide every contact from it.
    contacts = 0;
    selfContacts = 0;
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

      // The arrow keys' own slew, in normalized units. See `TORSO_SEQUENCE`.
      const slew = CONFIG.controls.postureSlewPerSecond;
      intent.posture.trunkLean = slewTowards(intent.posture.trunkLean, step.lean, slew, FRAME);
      intent.posture.trunkTwist = slewTowards(intent.posture.trunkTwist, step.twist, slew, FRAME);
      // One press onto both, exactly as `applyButtonPose` puts it onto the acting hand and the
      // natural striker together. Nothing on this bench reads the hand, but writing only half of
      // what a press writes would be measuring a command a person cannot give.
      intent.natural.thrust = step.thrust;
      intent.natural.guard = step.guard;
      intent.primary.thrust = step.thrust;
      intent.primary.guard = step.guard;
      torso?.command(intent);
      head?.command(intent);

      if (step.shove && !shoveDone) {
        shoveDone = true;
        const target = head?.parts.find((part) => part.id.endsWith(".head"))
          ?? torso?.parts.find((part) => part.id.endsWith(".core"));
        if (target) {
          const [dx, dy, dz] = BENCH_SHOVE.direction;
          const unit = new Vector3(dx, dy, dz).normalize();
          const point = target.part.mesh.position.clone();
          const tip = head?.view()?.tip ?? torso?.view()?.tip ?? point;
          bob.arm(now, step.until, tip.x, tip.y, tip.z);
          target.part.body.applyImpulse(unit.scaleInPlace(BENCH_SHOVE.newtonSeconds), point);
        }
      }

      scene._renderId += 1;
      scene._advancePhysicsEngineStep(1000 * FRAME);

      const next = frame + 1;
      if (next * FRAME >= sequence[phase].until || next * FRAME >= total) {
        if (!marks.some((mark) => mark.phase === step.name)) {
          marks.push({
            phase: step.name,
            at: next * FRAME,
            torso: torsoReadout ? torsoReadout.first.state() : null,
            torsoTwist: torsoReadout ? torsoReadout.second.state() : null,
            head: headReadout ? headReadout.first.state() : null,
            headYaw: headReadout ? headReadout.second.state() : null,
          });
        }
      }
    }
    return {
      harness: HARNESS,
      torsoId: torsoOption?.id ?? null,
      headId: headOption?.id ?? null,
      massKg: (torsoOption?.massKg ?? 0) + (headOption?.massKg ?? 0),
      torsoEnvelope: torso ? torso.envelope() : null,
      headEnvelope: head ? head.envelope() : null,
      marks,
      torso: torsoReadout ? torsoReadout.first.state() : null,
      torsoTwist: torsoReadout ? torsoReadout.second.state() : null,
      head: headReadout ? headReadout.first.state() : null,
      headYaw: headReadout ? headReadout.second.state() : null,
      bob: bob.state(),
      lunge: lunge.state(),
    };
  } finally {
    scene.onBeforePhysicsObservable.remove(control);
    for (const [body, observer] of observers) body.getCollisionObservable().remove(observer);
    // The head before the torso: its neck joint is anchored into the torso's own core, and
    // `PhysicsBody.dispose` walks straight past whatever is constraining it.
    head?.dispose();
    torso?.dispose();
    stand.dispose();
    arena.dispose();
    for (const [block, key, value] of restore.reverse()) block[key] = value;
  }
}

/**
 * Every number that decides whether a trunk reads as heavy and a head reads as alive.
 *
 * Each is a *ceiling* rather than a stiffness, which is frozen rule 4. A sweep names the phase
 * mark it reads, because one settle time over a nine-phase run cannot say which move produced it.
 */
const SWEEPS = {
  leanTorque: { block: TORSO_WAIST, key: "leanTorque", values: [600, 900, 1500, 2200, 3200, 5000], mark: "lean", on: "torso" },
  twistTorque: { block: TORSO_WAIST, key: "twistTorque", values: [300, 600, 900, 1500, 2200, 3200], mark: "twist", on: "torsoTwist" },
  pitchTorque: { block: HEAD_NECK, key: "pitchTorque", values: [80, 160, 260, 420, 700, 1200], mark: "guard", on: "head" },
  yawTorque: { block: HEAD_NECK, key: "yawTorque", values: [15, 30, 60, 90, 200, 900], mark: "shove", on: "head" },
  pitchRate: { block: HEAD_NECK, key: "pitchRate", values: [0.8, 1.4, 2.2, 3.5, 6.0], mark: "guard", on: "head" },
  lungeRate: { block: HEAD_RAM.lunge, key: "driveRate", values: [4, 6, 9, 13, 18, 26], mark: "lunge" },
  lungeTorque: { block: HEAD_RAM.lunge, key: "driveTorque", values: [260, 500, 900, 1600, 2800], mark: "lunge" },
  lungeDrive: { block: HEAD_RAM.lunge, key: "driveSeconds", values: [0.03, 0.05, 0.07, 0.09, 0.14], mark: "lunge" },
  lungeFollow: { block: HEAD_RAM.lunge, key: "followSeconds", values: [0, 0.01, 0.02, 0.04, 0.08], mark: "lunge" },
  lungeFollowTorque: { block: HEAD_RAM.lunge, key: "followTorque", values: [0, 15, 35, 80, 200], mark: "lunge" },
};

function parseArgs(argv) {
  const args = { torso: "torso.plain", head: "head.ram", sweep: null, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--json") { args.json = true; continue; }
    if (flag === "--no-torso") { args.torso = null; continue; }
    if (flag === "--no-head") { args.head = null; continue; }
    const value = argv[index + 1];
    switch (flag) {
      case "--torso": args.torso = value; index += 1; break;
      case "--head": args.head = value; index += 1; break;
      case "--sweep": args.sweep = value; index += 1; break;
      default: throw new Error(`unknown flag ${flag}`);
    }
  }
  return args;
}

const fixed = (value, places) => (value === null || value === undefined ? "n/a" : value.toFixed(places));

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.sweep) {
    const sweep = SWEEPS[args.sweep];
    if (!sweep) throw new Error(`unknown sweep "${args.sweep}"; known: ${Object.keys(SWEEPS).join(", ")}`);
    const rows = [];
    for (const value of sweep.values) {
      const run = await runTorsoBench({
        torsoId: args.torso, headId: args.head,
        overrides: [[sweep.block, { [sweep.key]: value }]],
      });
      const at = run.marks.find((mark) => mark.phase === sweep.mark);
      const on = sweep.on ?? "head";
      rows.push({
        value,
        arrivalSeconds: at?.[on]?.arrivalSeconds ?? null,
        overshoot: at?.[on]?.overshoot ?? 0,
        peakAtMark: at?.[on]?.peakTipSpeedDriven ?? 0,
        peakTipSpeedDriven: (run[on] ?? {}).peakTipSpeedDriven ?? 0,
        peakTipErrorMm: (run[on] ?? {}).peakTipErrorMm ?? 0,
        tipWanderMm: (run[on] ?? {}).tipWanderMm ?? 0,
        stuckSteps: (run[on] ?? {}).stuckSteps ?? 0,
        bobPeakMm: run.bob.peakMm,
        bobSettleSeconds: run.bob.settleSeconds,
        // The neck's second axis, which nothing commands: its whole excursion is what a knock did
        // to it. Reported in the sweep because "a blow from the side turns the head" is a claim
        // and this is the number that either supports it or does not.
        yawPeakRad: run.headYaw ? run.headYaw.peakTargetError : 0,
        deepestPitch: run.lunge.deepestPitch,
        carriedPastDrive: run.lunge.carriedPastDrive,
        contacts: (run[on] ?? {}).contacts ?? 0,
        selfContacts: (run[on] ?? {}).selfContacts ?? 0,
      });
    }
    if (args.json) {
      process.stdout.write(`${JSON.stringify({ harness: HARNESS, sweep: args.sweep, rows }, null, 2)}\n`);
      return;
    }
    process.stdout.write(`harness: ${HARNESS}\n`);
    process.stdout.write(`torso ${args.torso ?? "none"}, head ${args.head ?? "none"};`
      + ` sweeping ${args.sweep} (${sweep.key}), read at the "${sweep.mark}" mark\n\n`);
    process.stdout.write("  value   arrival   overshoot   peak at mark   peak on run   lag mm   bob mm   bob settle   yaw rad   deepest   carried   stuck\n");
    for (const row of rows) {
      process.stdout.write(
        `  ${String(row.value).padStart(5)}  ${fixed(row.arrivalSeconds, 3).padStart(7)}s`
        + `   ${row.overshoot.toFixed(4).padStart(9)}`
        + `   ${row.peakAtMark.toFixed(2).padStart(12)}`
        + `   ${row.peakTipSpeedDriven.toFixed(2).padStart(11)}`
        + `   ${row.peakTipErrorMm.toFixed(1).padStart(6)}`
        + `   ${row.bobPeakMm.toFixed(1).padStart(6)}`
        + `   ${fixed(row.bobSettleSeconds, 3).padStart(9)}s`
        + `   ${row.yawPeakRad.toFixed(4).padStart(7)}`
        + `   ${fixed(row.deepestPitch, 4).padStart(7)}`
        + `   ${fixed(row.carriedPastDrive, 4).padStart(7)}`
        + `   ${String(row.stuckSteps).padStart(5)}\n`,
      );
    }
    return;
  }

  const run = await runTorsoBench({ torsoId: args.torso, headId: args.head });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
    return;
  }
  process.stdout.write(`harness: ${HARNESS}\n`);
  process.stdout.write(`torso ${run.torsoId ?? "none"}, head ${run.headId ?? "none"},`
    + ` ${run.massKg.toFixed(2)} kg together\n`);
  process.stdout.write(`exclusions: first ${BENCH_READOUT.startupExclusionSeconds} s,`
    + ` ${BENCH_READOUT.contactExclusionSeconds} s after any contact\n`);
  if (run.torsoEnvelope) {
    process.stdout.write(`waist: ${run.torsoEnvelope.axes.map((axis) =>
      `${axis.id} ${axis.min.toFixed(2)}..${axis.max.toFixed(2)} rad at <=${axis.rate} rad/s`).join(", ")}`
      + `, neck at ${run.torsoEnvelope.reach.toFixed(3)} m above the waist\n`);
  }
  if (run.headEnvelope) {
    process.stdout.write(`neck: ${run.headEnvelope.axes.map((axis) =>
      `${axis.id} ${axis.min.toFixed(2)}..${axis.max.toFixed(2)} rad at <=${axis.rate} rad/s`).join(", ")}`
      + `, tip at ${run.headEnvelope.reach.toFixed(3)} m above the neck socket`
      + `; strokes ${run.headEnvelope.strokes.join(", ") || "none"}\n`);
  }
  if (run.lunge.deepestPitch !== null) {
    process.stdout.write(`lunge: drive ended at ${fixed(run.lunge.driveEndPitch, 4)} rad,`
      + ` deepest ${fixed(run.lunge.deepestPitch, 4)} rad,`
      + ` carried ${fixed(run.lunge.carriedPastDrive, 4)} rad past the drive`
      + ` (the stop is at ${HEAD_NECK.pitchJointMax})\n`);
  }
  process.stdout.write(`shove: ${BENCH_SHOVE.newtonSeconds} N.s as an impulse,`
    + ` bob peak ${run.bob.peakMm.toFixed(2)} mm,`
    + ` decayed to ${run.bob.barMm.toFixed(1)} mm (a tenth of the peak)`
    + ` after ${fixed(run.bob.settleSeconds, 3)} s`
    + ` in a ${fixed(run.bob.windowSeconds, 2)} s window\n\n`);
  for (const mark of run.marks) {
    const parts = [];
    if (mark.torso) {
      parts.push(`lean arrival ${fixed(mark.torso.arrivalSeconds, 3)} s`
        + ` over ${mark.torso.overshoot.toFixed(4)} peak err ${mark.torso.peakTargetError.toFixed(4)}`
        + `; twist arrival ${fixed(mark.torsoTwist.arrivalSeconds, 3)} s`
        + ` over ${mark.torsoTwist.overshoot.toFixed(4)} peak err ${mark.torsoTwist.peakTargetError.toFixed(4)}`);
    }
    if (mark.head) {
      parts.push(`pitch arrival ${fixed(mark.head.arrivalSeconds, 3)} s,`
        + ` peak err ${mark.head.peakTargetError.toFixed(4)},`
        + ` yaw peak err ${mark.headYaw.peakTargetError.toFixed(4)},`
        + ` peak tip driven ${mark.head.peakTipSpeedDriven.toFixed(2)} m/s`);
    }
    process.stdout.write(`  after "${mark.phase}" at ${mark.at.toFixed(2)} s: ${parts.join("; ")}\n`);
  }
  if (run.torso) {
    process.stdout.write("\n  trunk (lean is the first axis)\n");
    for (const line of formatReadout(run.torso)) process.stdout.write(`    ${line}\n`);
    process.stdout.write(`    twist: peak error ${run.torsoTwist.peakTargetError.toFixed(4)} rad,`
      + ` arrival ${fixed(run.torsoTwist.arrivalSeconds, 3)} s,`
      + ` overshoot ${run.torsoTwist.overshoot.toFixed(4)} rad\n`);
  }
  if (run.head) {
    process.stdout.write("\n  head (pitch is the first axis)\n");
    for (const line of formatReadout(run.head)) process.stdout.write(`    ${line}\n`);
    process.stdout.write(`    yaw: peak error ${run.headYaw.peakTargetError.toFixed(4)} rad`
      + ` (nothing commands it; this is what the shove did)\n`);
  }
  if (GOLEM_MODULES.length === 0) throw new Error("nothing is registered");
}

if (process.argv[1] && process.argv[1].endsWith("golem-torso-bench.mjs")) {
  await main();
}
