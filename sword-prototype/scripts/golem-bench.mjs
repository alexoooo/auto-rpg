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
 *     node scripts/golem-bench.mjs --stroke
 *     node scripts/golem-bench.mjs --stroke --sweep stroke --json
 *     node scripts/golem-bench.mjs --parry
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { BUTTON_REACH, reachFromButtons } from "../src/buttons.ts";
import { CONFIG } from "../src/config.ts";
import { GOLEM_EFFECTORS } from "../src/golem/build.ts";
import {
  BENCH_READOUT, BENCH_STAND_LOCOMOTION, CHAIN_PITCH, CHAIN_REACH, CHAIN_WRIST, LOCOMOTION_BIPED,
  LOCOMOTION_MULTILEG, LOCOMOTION_WHEEL,
} from "../src/golem/config.ts";
import { formatLocomotion, locomotionCommand } from "../src/golem/locomotion.ts";
import { bipedModule } from "../src/golem/locomotion/biped.ts";
import { multilegModule } from "../src/golem/locomotion/multileg.ts";
import { wheelModule } from "../src/golem/locomotion/wheel.ts";
import { buildLocomotionCourse, registerLocomotionCourse } from "../src/golem/locomotion/course.ts";
import { BenchReadout, blankSample, formatReadout } from "../src/golem/readout.ts";
import { GOLEM_MODULES, golemModule } from "../src/golem/registry.ts";
import { buildGolemStand, golemLayers } from "../src/golem/stand.ts";
import {
  GOLEM_TACTICS, STROKE_SHAPES, aimAt, canCover, canSwing, distance, reachForDistance,
  tacticalRanges, writeAim,
} from "../src/golem/tactics.ts";
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
  // **Every step of this used to hold `pointerY` at 0 and move the limb with the two buttons**, and
  // on 2026-09-05 that stopped moving it at all: `guard` was `CHAIN_PITCH.guardPitch` and `thrust`
  // was the chop, and Session 12 deleted both. The sequence went on running, reported settle,
  // overshoot and wander for every mark, and read a peak driven tip speed of **0.00007 m/s** on a
  // limb that never left its build pose. A bench whose whole table is green about a limb that did
  // nothing is the "green instrument that measures nothing" this directory has recorded twice.
  //
  // So the marks keep their names and their clocks up to 3.20 s -- `rest`, `guard` and `return` are
  // the two settles every rung 1 table in `docs/measurements.md` is read off, and they are the same
  // two poses -- but the axis moved is the one rung 1 actually has. 0.784 is where `guardPitch`'s
  // 1.95 rad sits on the published 0.30..2.15 span, so the `guard` mark is the same pose it always
  // was, asked for through the channel a mind now has.
  { name: "rest", until: 1.00, pointerY: 0, guard: false, thrust: false },
  { name: "guard", until: 2.20, pointerY: 0.784, guard: true, thrust: false },
  { name: "return", until: 3.20, pointerY: 0, guard: false, thrust: false },
  // And the chop, which is now a *command* and not an event: chambered at the top of the range and
  // then asked for the bottom of it in 0.20 s, which is 9.25 rad/s against a chain whose
  // `targetRate` is 6. Asking for more than the chain can give on purpose is what makes this a
  // reading of the chain's own ceiling rather than of the number in the script -- the same property
  // `REACH_SEQUENCE.extend` has, and the reason rung 1's peak tip speed is now a measurement of
  // `targetRate * reach` and nothing else.
  { name: "chamber", until: 4.00, pointerY: 1, guard: false, thrust: false,
    from: { pointerY: 0 } },
  { name: "chop", until: 4.20, pointerY: -1, guard: false, thrust: true,
    from: { pointerY: 1 } },
  { name: "recover", until: 6.20, pointerY: 0, guard: false, thrust: false },
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
  // **The axis Session 12 added, swept rather than stepped.** Every phase above takes its reach
  // from the two buttons, which is what a person's mouse does and is right for the phases those
  // names describe -- but it can only ever visit three of the 0.42 m the shell is deep. This
  // phase names `reach` itself and sweeps it from the inboard stop to the outboard one over
  // 1.2 s, which is the only phase in this file that asks the third positional degree of freedom
  // to do anything a policy could ask it to do.
  //
  // Appended at the end rather than inserted, deliberately: every mark above it keeps the clock
  // it has always had, so no table in `docs/measurements.md` moves because a phase was added.
  { name: "extend", until: 11.20, pointerX: 0.4, pointerY: 0.2, guard: false, thrust: false,
    roll: 1.1, wristBend: 0.7, reach: 1, from: { reach: -1 } },
  { name: "hold", until: 12.20, pointerX: 0.4, pointerY: 0.2, guard: false, thrust: false,
    roll: 1.1, wristBend: 0.7, reach: 1 },
]);

/**
 * The plate's sequence: cover the centre line, turn the face away, and bash.
 *
 * A plate is judged on where its *face* points, which no other terminal has an opinion about, so
 * the two phases the session plan names are the two this sequence exists for. `cover` takes the
 * cursor to the inboard edge with `guard` held, which is a plate asked to stand in front of its
 * owner -- and the mapping clamps it to the plate's own narrowed swing rather than refusing it,
 * which is frozen rule 3 doing its job with a second author. `turn` then rolls and bends, which
 * on a wrist chain is the pair that points the face and on the other rungs is ignored, and `away`
 * sweeps to the far side with the roll reversed.
 *
 * `bash` is the plate's whole offensive vocabulary: one `thrust` press, scored as a mass bite at
 * fist weight.
 */
export const PLATE_SEQUENCE = Object.freeze([
  { name: "rest", until: 1.20, pointerX: 0, pointerY: 0, guard: false, thrust: false },
  { name: "cover", until: 2.80, pointerX: -1, pointerY: 0.3, guard: true, thrust: false,
    from: { pointerX: 0, pointerY: 0 } },
  { name: "hold", until: 3.80, pointerX: -1, pointerY: 0.3, guard: true, thrust: false },
  { name: "turn", until: 4.60, pointerX: -1, pointerY: 0.3, guard: true, thrust: false,
    roll: 1.2, wristBend: 0.8, from: { roll: 0, wristBend: 0 } },
  { name: "away", until: 6.00, pointerX: 1, pointerY: -0.2, guard: false, thrust: false,
    roll: -1.2, wristBend: 0.2,
    from: { pointerX: -1, pointerY: 0.3, roll: 1.2, wristBend: 0.8 } },
  { name: "bash", until: 6.10, pointerX: 1, pointerY: -0.2, guard: false, thrust: true,
    roll: -1.2, wristBend: 0.2 },
  { name: "recover", until: 8.00, pointerX: 0.3, pointerY: 0, guard: false, thrust: false,
    roll: 0, wristBend: 0 },
]);

/**
 * The one-handed mace's sequence: the blade's, because a mace since the matchup set's Session 02
 * takes nothing from the chain and is judged on the same strokes at twenty times the mass. What
 * the bench reports for it beside the blade -- tip speed, stray, contacts -- is the cost of the
 * mass and nothing else.
 */
export const MACE_SEQUENCE = REACH_SEQUENCE;

/**
 * The maul's sequence: raise, hold, smash, and shove, with the swing left where it has to be.
 *
 * **Nothing here moves `pointerX`, and that is the sequence telling the truth about the
 * terminal rather than avoiding a problem.** A maul pins the chain's yaw inboard -- the
 * arithmetic is beside `TERMINAL_MAUL.limits` -- so a script that swept the cursor sideways would
 * be measuring the clamp rather than the weapon. What is left is what a two-handed maul actually
 * does: it goes up, it comes down, and it is pushed out.
 *
 * `rest` is long, and the length is the measurement: the trailing hand starts a socket apart from
 * the grip and the grip is taken when it arrives, so the time `gripTakenAt` reports is the
 * seam's own first number. `smash` is `thrust` pressed while `guard` is held, which is the arm
 * core's cut; with the swing clamped it degenerates into a pure downward sweep. `shove` is the
 * plain thrust.
 */
export const MAUL_SEQUENCE = Object.freeze([
  { name: "rest", until: 1.60, pointerX: 0, pointerY: 0, guard: false, thrust: false },
  { name: "raise", until: 2.80, pointerX: 0, pointerY: 0.9, guard: false, thrust: false,
    from: { pointerY: 0 } },
  { name: "chamber", until: 3.80, pointerX: 0, pointerY: 0.9, guard: true, thrust: false },
  { name: "smash", until: 4.00, pointerX: 0, pointerY: -0.8, guard: true, thrust: true,
    from: { pointerY: 0.9 } },
  { name: "settle", until: 5.40, pointerX: 0, pointerY: 0.2, guard: false, thrust: false },
  { name: "shove", until: 5.50, pointerX: 0, pointerY: 0.2, guard: false, thrust: true },
  { name: "recover", until: 7.20, pointerX: 0, pointerY: 0, guard: false, thrust: false },
]);

/** What the two-socket bar this replaced ran; kept as a name so an old readout can be reread. */
export const MACE_TWO_SOCKET_SEQUENCE = Object.freeze([
  { name: "rest", until: 1.20, pointerX: 0, pointerY: 0, guard: false, thrust: false },
  { name: "raise", until: 2.60, pointerX: 0, pointerY: 1, guard: false, thrust: false,
    from: { pointerY: 0 } },
  { name: "chamber", until: 3.60, pointerX: 0, pointerY: 0.8, guard: true, thrust: false },
  { name: "chop", until: 3.75, pointerX: 0, pointerY: 0.8, guard: true, thrust: true },
  { name: "settle", until: 5.20, pointerX: 0, pointerY: 0.2, guard: false, thrust: false },
  { name: "shove", until: 5.30, pointerX: 0, pointerY: 0.2, guard: false, thrust: true },
  { name: "recover", until: 7.00, pointerX: 0, pointerY: 0, guard: false, thrust: false },
]);

/**
 * The whip's sequence: chamber high and inboard, then lash across with the roll reversing.
 *
 * A lash is the one terminal whose interesting number is produced by *nothing the chain did* --
 * the beads carry through after the wrist has stopped -- so the sequence is built round one hard
 * flick rather than round a settle. `chamber` sweeps the cursor high and across with the roll
 * wound the other way; `lash` reverses the roll inside a sixth of a second while the cut runs,
 * which is what cracks it; `carry` holds still and lets the beads do the rest, which is where the
 * peak lives.
 *
 * A sweep and not a jump, wherever a phase is about the wobble: a teleported cursor gives the lash
 * no momentum to carry, which is the reading that says nothing.
 */
export const WHIP_SEQUENCE = Object.freeze([
  { name: "rest", until: 1.40, pointerX: 0.2, pointerY: -0.2, guard: false, thrust: false },
  { name: "chamber", until: 2.60, pointerX: -0.6, pointerY: 0.8, guard: true, thrust: false,
    roll: -1.2, from: { pointerX: 0.2, pointerY: -0.2, roll: 0 } },
  { name: "lash", until: 2.75, pointerX: 0.9, pointerY: -0.4, guard: true, thrust: true,
    roll: 1.2, from: { pointerX: -0.6, pointerY: 0.8, roll: -1.2 } },
  { name: "carry", until: 4.20, pointerX: 0.9, pointerY: -0.4, guard: false, thrust: false,
    roll: 1.2 },
  { name: "recover", until: 6.50, pointerX: 0.2, pointerY: -0.2, guard: false, thrust: false,
    roll: 0 },
]);

/**
 * Which scripted sequence a module wants.
 *
 * **The terminal is asked first and the chain second**, which is a change Session 04 made and is
 * worth a sentence: Session 02's rule was that a terminal changes mass but not the command, so one
 * sequence per chain was right. That stopped being true the moment a terminal could narrow the
 * chain's envelope -- a mace with the yaw pinned run through `REACH_SEQUENCE` would spend half its
 * phases against a clamp, and the marks would report the clamp. A plate and a whip need their own
 * for the opposite reason: each is judged on something (a face, a lash) the blade sequence never
 * asks for.
 */
export const sequenceFor = (moduleId) => {
  if (moduleId.endsWith(".mace")) return MACE_SEQUENCE;
  if (moduleId.endsWith(".maul")) return MAUL_SEQUENCE;
  if (moduleId.endsWith(".whip")) return WHIP_SEQUENCE;
  if (moduleId.endsWith(".plate")) return PLATE_SEQUENCE;
  return moduleId.startsWith("effector.reach.") || moduleId.startsWith("effector.wrist.")
    ? REACH_SEQUENCE
    : BENCH_SEQUENCE;
};

/** A whole `Intent`, because a bench option adapts the command rather than being handed one. */
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
  // **A phase that writes itself, for a sequence whose commands are not a blend.** Every scripted
  // sequence above names two poses and sweeps between them, which is what a hand-written cursor
  // path is. Session 02's stroke sequence is not one: its arc goes through `writeAim`, which
  // clamps into the published shell, so a phase interpolated between two clamped endpoints would
  // be a straight line exactly where the mind's own command has a corner. A `write` phase is
  // handed the same normalised `t` and computes the command itself, which is what makes the
  // stroke bench a transcription of `driveStroke` rather than an imitation of it.
  if (step.write) { step.write(hand, t); return; }
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
  // **The reach, from the buttons, through the same adapter a person's mouse goes through.**
  // Session 12 took reach off the two booleans inside the chain and put it on the command, so a
  // script that set only `guard` and `thrust` would now hold every phase at one distance and
  // every table taken over this sequence would be about an arm that never extended. Deriving it
  // here with `reachFromButtons` keeps each phase meaning what its name has always meant -- a
  // `guard` phase draws in, a `thrust` phase extends -- and keeps the bench driving the module
  // through exactly the mapping the page drives it through, which is the property that makes a
  // bench number a claim about the game.
  //
  // A phase may name `reach` itself, and a phase that does gets the axis swept continuously
  // rather than stepped between presets. That is the only way to measure the new channel, and
  // `REACH_SEQUENCE.extend` below is where it is used.
  hand.reach = step.reach === undefined && (!step.from || step.from.reach === undefined)
    ? reachFromButtons(step)
    : blend("reach");
}

export async function runGolemBench({
  moduleId,
  slot = "primary",
  side = "left",
  sequence = null,
  overrides = null,
  /**
   * A reading the readout does not take, called once per physics step with `{ t, view, module }`.
   * For a harness that wants one number off a live module -- the whip's lash reach is measured
   * this way -- rather than a column every other option would carry as null.
   */
  probe = null,
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

  // The other socket, handed over whether or not the option wants it. A one-socket terminal
  // ignores it; a mace refuses to build without it, by name, in `effector.ts`.
  const companionSlot = slot === "primary" ? "secondary" : "primary";
  const module = option.build({
    scene,
    side,
    name: `golem.${side}.${slot}`,
    socket: stand.socket(slot),
    companion: stand.socket(companionSlot),
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
  // **The script, resolved now and not sooner.** A `sequence` may be a function of the module on
  // the stand rather than a table, because Session 02's stroke sequence is computed against the
  // module's own envelope, its own socket and the capability record a mind would read off it --
  // none of which exists until the thing is built. Resolved here, before the control observer is
  // installed, so a factory that also builds a probe has filled it before any sample arrives.
  const script = typeof sequence === "function"
    ? sequence({ module, socket: stand.socket(slot), envelope: module.envelope() })
    : (sequence ?? sequenceFor(moduleId));

  const readout = new BenchReadout({ settledBand: module.envelope().settledBand });
  const sample = blankSample();
  const intent = benchIntent();
  let t = 0;
  // **A trailing grip's own error, kept beside the readout rather than inside it.** It is a
  // two-socket terminal's number and nothing else has one, so putting it in `BenchReadout` would
  // give every other option a column that is permanently null. What it is *for* is the comparison
  // in `tests/golem-bench.test.mjs`: a constraint is solved and a force-capped motor lags, so the
  // passive grip's error must stay under the driven grip's, and a run where it does not is a run
  // where the trailing arm has started pushing back.
  let peakGripStrayMm = null;
  /** When a two-socket terminal's second grip was first held: the seam's own first number. */
  let gripTakenAt = null;

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
      // Outside the startup window, for the reason every other peak here excludes it: a limb
      // lifting out of its build pose is not the thing being measured.
      if (view.gripStray !== null) {
        if (gripTakenAt === null) gripTakenAt = t;
        // Outside the join, too: the step the grip is taken is the one step its error is the
        // join distance rather than the solver's.
        if (t >= BENCH_READOUT.startupExclusionSeconds && t > gripTakenAt) {
          const mm = view.gripStray * 1000;
          peakGripStrayMm = peakGripStrayMm === null ? mm : Math.max(peakGripStrayMm, mm);
        }
      }
    }
    sample.contacts = contacts;
    sample.selfContacts = selfContacts;
    contacts = 0;
    selfContacts = 0;
    readout.sample(sample);
    probe?.({ t, view, module });
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
      /** Null for every one-socket terminal, which is every one but the maul, and null for the
       *  maul until its second hand arrives. */
      peakGripStrayMm,
      /** Seconds into the run at which the second grip was first held; null if it never was. */
      gripTakenAt,
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

// ------------------------------------------------------------------------ the stroke bench

/**
 * The mind's own capability record, built from a bench module's published envelope.
 *
 * `Golem.golemCapabilities` writes these same four fields off the same envelope, and this is a
 * second copy of three lines rather than an import because that method is private to an assembled
 * golem and there is no golem on the stand. What keeps the copy honest is that every field is a
 * read of something the module publishes: nothing here is a bench-only number, so a module whose
 * envelope changes changes both readers together.
 */
export const capabilityOf = (module) => {
  const envelope = module.envelope();
  const ceiling = (id) => Math.max(0, envelope.axes.find((axis) => axis.id === id)?.max ?? 0);
  return Object.freeze({
    strokes: envelope.strokes,
    reachable: envelope.reachable,
    rollMax: ceiling("roll"),
    bendMax: ceiling("bend"),
  });
};

/** What a mind reads off the hand for a bench module, from the registry rather than a second table. */
export const weaponOf = (moduleId) =>
  GOLEM_EFFECTORS.find((option) => option.id === moduleId)?.weapon ?? "empty";

/**
 * How long the guard is held before the chamber, seconds.
 *
 * Long enough that the arm has arrived and stopped before the stroke starts, which is the one
 * thing the bench has to buy that a bout gets for free: a fighter's guard has been up for as long
 * as the last recover, and a stroke measured out of a limb still settling from its build pose
 * would be measuring the settle.
 */
export const STROKE_GUARD_SECONDS = 0.5;

const clampTo = (value, low, high) => (value < low ? low : value > high ? high : value);

/**
 * The commands one stroke emits, phase by phase, as a bench script.
 *
 * **This is `driveStroke` and the fencer's `holdGuard` written out against a stand instead of
 * against an opponent**, and it is written out rather than called because the mind's copy is a
 * closure over a whole `FighterView`. Every line below has a line in `src/golem/tactics-v2.ts`
 * it is a transcription of, the arithmetic goes through the same `aimAt`, `writeAim` and
 * `reachForDistance` the mind uses, and `tests/golem-bench.test.mjs` steps a real fencer on a
 * fixture and asserts the two agree to the digit. That test is what makes a number off this
 * bench a claim about the game rather than about the bench.
 *
 * What is deliberately *not* here is the step-in and the trunk lean. `StrokeShape.stepIn` adds to
 * `Intent.forward` and the commit writes the posture, and the stand has neither feet nor a trunk
 * -- so a bench row is the arm's own contribution, and the carrier's is swept in the arena
 * through the contact-speed column instead.
 */
export function strokeSequence({
  shape,
  cap,
  socket,
  mark,
  reach,
  outboard = 1,
  heading = 0,
  guardMark = null,
  guardReach = GOLEM_TACTICS.guardReach,
  guardSeconds = STROKE_GUARD_SECONDS,
}) {
  const T = GOLEM_TACTICS;
  const aim = aimAt(socket, mark, heading, outboard, { swing: 0, lift: 0, horizontal: 0 });
  const cover = aimAt(socket, guardMark ?? mark, heading, outboard,
    { swing: 0, lift: 0, horizontal: 0 });
  const swept = canSwing(cap) ? 1 : 0;
  const strikeReach = reachForDistance(distance(socket, mark), reach, cap, T.strikeBite);

  const holdGuard = (hand) => {
    hand.guard = canCover(cap);
    hand.thrust = false;
    writeAim(hand, cap, cover, outboard, 0, T.coverLift, 1, guardReach);
    hand.roll = cap.rollMax > 0 ? clampTo(shape.roll, -cap.rollMax, cap.rollMax) : 0;
    hand.wristBend = cap.bendMax > 0 ? T.coverBend : 0;
  };
  const chamber = (hand) => {
    hand.guard = false;
    hand.thrust = false;
    writeAim(hand, cap, aim, outboard,
      swept * shape.chamberSwing, shape.chamberLift, 1, shape.chamberReach);
    hand.roll = cap.rollMax > 0 ? clampTo(shape.windRoll, -cap.rollMax, cap.rollMax) : 0;
    hand.wristBend = cap.bendMax > 0 ? T.cutBend : 0;
  };
  const arc = (hand, t) => {
    hand.guard = false;
    hand.thrust = true;
    writeAim(hand, cap, aim, outboard,
      swept * (shape.chamberSwing - t * (shape.chamberSwing + shape.followSwing)),
      shape.chamberLift - t * (shape.chamberLift + shape.followLift),
      0,
      shape.chamberReach + t * (strikeReach - shape.chamberReach));
    hand.roll = cap.rollMax > 0 ? clampTo(shape.roll, -cap.rollMax, cap.rollMax) : 0;
    hand.wristBend = cap.bendMax > 0 ? T.cutBend : 0;
  };

  // The commit runs until the arc has been swept *and* the follow-through has been held, which is
  // `commitEnds` in the mind's own commit stance. A shape whose stroke is shorter than
  // `commitSeconds` therefore holds the end of its arc for the difference, exactly as it does in
  // a bout, and the mark crossing is inside the swept phase either way.
  const commitEnds = Math.max(T.commitSeconds, shape.strokeSeconds + T.followSeconds);
  const chamberEnds = guardSeconds + shape.chamberSeconds;
  const strokeEnds = chamberEnds + shape.strokeSeconds;
  const followEnds = chamberEnds + commitEnds;
  return Object.freeze([
    Object.freeze({ name: "guard", until: guardSeconds, write: holdGuard }),
    Object.freeze({ name: "chamber", until: chamberEnds, write: chamber }),
    Object.freeze({ name: "stroke", until: strokeEnds, write: arc }),
    Object.freeze({ name: "follow", until: followEnds, write: (hand) => arc(hand, 1) }),
    Object.freeze({ name: "recover", until: followEnds + T.recoverSeconds, write: holdGuard }),
  ]);
}

/**
 * The probe that reads the mark, and the one place this session corrected its own plan.
 *
 * The session plan froze the reading as "the step where the tip's swing angle about the socket
 * passes the mark's bearing". *Corrected on implementation, 2026-09-06, for two reasons.* The
 * first is that a bearing crossing does not exist for two of the five weapons the grid is over:
 * `canSwing` is false for a chain carrying a two-socket terminal -- the maul publishes a swing
 * range of exactly zero -- and for rung 1, which has no reachable set at all, so `driveStroke`
 * multiplies the whole azimuth by zero and the tip never crosses any bearing however hard the arm
 * swings. The second is that **the tip is not what arrives at the mark**. `reachForDistance` is
 * called with `strikeBite` 0.5, which deliberately puts the mark about a third of the way down
 * the blade from the point, so a bench that reported the tip's distance to the mark reported
 * 0.63 m for a stroke that was landing exactly where the mind aimed it.
 *
 * So the reading is the **weapon's** closest approach: the step of the swept phase at which the
 * segment from the chain's own anchor to the business end passes nearest the mark, and the speed
 * of the point of that segment which is there. It exists for every weapon, it is one step per
 * stroke by construction, and it is the number a contact would be scored on. The tip's own speed
 * at the same step is reported beside it -- always the larger, and the one a peak column would
 * have flattered -- along with how far back from the point the mark fell and how close the weapon
 * actually came. The frozen bearing crossing is still counted, so the correction is visible on
 * the row rather than assumed.
 *
 * Speeds are the published points differenced across one physics step. `EffectorView` publishes
 * no velocity, and the terminal's own body velocity is not a point's on it -- a point on the end
 * of a swinging limb carries the angular part too -- so the difference is the honest reading, and
 * it is taken at `CONFIG.world.physicsHz` rather than at the frame rate.
 */
export function strokeProbe({ socket, mark, outboard = 1, heading = 0, from = 0, to = Infinity }) {
  const markAim = aimAt(socket, mark, heading, outboard, { swing: 0, lift: 0, horizontal: 0 });
  const aim = { swing: 0, lift: 0, horizontal: 0 };
  const tipWas = new Vector3();
  const anchorWas = new Vector3();
  const along = new Vector3();
  const toMark = new Vector3();
  let have = false;
  let side = 0;
  let crossings = 0;
  let crossedAt = null;
  let nearest = null;
  let peakTipSpeed = 0;
  let peakStrayMm = null;

  const probe = ({ t, view }) => {
    if (!view) return;
    const tip = view.tip;
    const anchor = view.anchor ?? tip;
    const tipSpeed = have ? Vector3.Distance(tip, tipWas) / SUBSTEP : 0;
    const anchorSpeed = have ? Vector3.Distance(anchor, anchorWas) / SUBSTEP : 0;
    tipWas.copyFrom(tip);
    anchorWas.copyFrom(anchor);
    have = true;
    if (t < from || t > to) return;
    if (tipSpeed > peakTipSpeed) peakTipSpeed = tipSpeed;
    if (view.anchorStray !== null) {
      const mm = view.anchorStray * 1000;
      peakStrayMm = peakStrayMm === null ? mm : Math.max(peakStrayMm, mm);
    }
    // Where on the weapon the mark falls: the closest point of the segment from the chain's own
    // anchor to the business end, which is the weapon itself for every terminal that has length
    // and is the tip alone for a chain that publishes no anchor.
    tip.subtractToRef(anchor, along);
    const span = along.length();
    mark.subtractToRef(anchor, toMark);
    const u = span > 1e-9
      ? Math.max(0, Math.min(1, Vector3.Dot(toMark, along) / (span * span)))
      : 0;
    const px = anchor.x + along.x * u;
    const py = anchor.y + along.y * u;
    const pz = anchor.z + along.z * u;
    const miss = Math.hypot(px - mark.x, py - mark.y, pz - mark.z);
    if (nearest === null || miss < nearest.miss) {
      nearest = {
        miss,
        at: t,
        speed: anchorSpeed + (tipSpeed - anchorSpeed) * u,
        tipSpeed,
        alongMetres: span * (1 - u),
      };
    }
    aimAt(socket, tip, heading, outboard, aim);
    const now = Math.sign(aim.swing - markAim.swing);
    if (now !== 0) {
      if (side !== 0 && now !== side) { crossings += 1; if (crossedAt === null) crossedAt = t; }
      side = now;
    }
  };

  const read = () => Object.freeze({
    /** Metres a second of the point of the weapon that is at the mark. */
    speedAtMark: nearest ? nearest.speed : 0,
    /** Metres a second of the business end at the same step, which is always the larger. */
    tipSpeedAtMark: nearest ? nearest.tipSpeed : 0,
    /** How close the weapon actually came to the mark there, metres. */
    missMetres: nearest ? nearest.miss : null,
    /** How far back from the business end the mark fell, metres: where on the blade it landed. */
    alongMetres: nearest ? nearest.alongMetres : null,
    /** Seconds into the run at which that step fell. */
    markAt: nearest ? nearest.at : null,
    /** Bearing crossings inside the swept phase: zero for a chain that cannot swing. */
    crossings,
    crossedAt,
    peakTipSpeedDriven: peakTipSpeed,
    peakAnchorStrayMm: peakStrayMm,
  });

  return { probe, read };
}

/** How far across, and how far up, the parry command asks the cover to move. Metres. */
export const PARRY_ACROSS_METRES = 0.25;
export const PARRY_UP_METRES = 0.10;
/** How close the cover has to be to its resting place to count as arrived. Metres. */
export const PARRY_ARRIVED_METRES = 0.05;
/** How long the cover is held after the command moves: long enough to stop moving. Seconds. */
export const PARRY_HOLD_SECONDS = 2.0;

/**
 * The parry sequence: hold the cover, then ask for it a quarter of a metre across and a tenth up.
 *
 * The one number Session 05's guardian branches on. A parry that arrives inside about a tenth of
 * a second can be a **true intercept** -- solved against the incoming tip and refined while their
 * arm commits -- and one that does not has to be a **wall**, pre-positioned off the chamber read
 * and held. The step is a single frame's command and then a hold, because that is the shape of
 * the decision: a mind that has read a chamber writes one new cover point and lives with it.
 *
 * The hold runs two seconds rather than the sixth of a second a parry lasts, because the reading
 * wanted is *where the cover ends up*, and a cover that has not stopped moving has no such place.
 * What a mind gets in the sixth of a second it has is read off the arrival curve, not off the end.
 */
export function parrySequence({
  cap,
  socket,
  mark,
  outboard = 1,
  heading = 0,
  guardReach = GOLEM_TACTICS.shieldReach,
  coverSeconds = 0.6,
  holdSeconds = PARRY_HOLD_SECONDS,
  across = PARRY_ACROSS_METRES,
  up = PARRY_UP_METRES,
}) {
  const T = GOLEM_TACTICS;
  const here = aimAt(socket, mark, heading, outboard, { swing: 0, lift: 0, horizontal: 0 });
  // **The move is an angle, because the command is one.** A mind cannot ask a cover to go a
  // quarter of a metre sideways: it can ask for a new bearing at the same reach, and how far the
  // plate then travels is the cover's own radius times the angle. Moving the *mark* by 0.25 m
  // instead -- the obvious reading of the plan's sentence -- asks for 0.15 rad at a mark 1.6 m
  // away and moves a plate held at 0.4 m by 63 mm, which is not a parry and was measured being
  // one before this comment existed.
  const shell = cap.reachable;
  const radius = shell
    ? shell.reachMin + ((clampTo(guardReach, -1, 1) + 1) / 2) * (shell.reachMax - shell.reachMin)
    : Math.max(1e-3, here.horizontal);
  const hold = (swingOffset, liftOffset) => (hand) => {
    hand.guard = canCover(cap);
    hand.thrust = false;
    writeAim(hand, cap, here, outboard, swingOffset, T.coverLift + liftOffset, 1, guardReach);
    hand.roll = 0;
    hand.wristBend = cap.bendMax > 0 ? T.coverBend : 0;
  };
  return Object.freeze([
    Object.freeze({ name: "cover", until: coverSeconds, write: hold(0, 0) }),
    Object.freeze({
      name: "parry",
      until: coverSeconds + holdSeconds,
      write: hold(across / radius, up / radius),
    }),
  ]);
}

/**
 * The parry probe: arrival, the standing offset, peak speed and overshoot.
 *
 * **Arrival is measured against where the cover ends up, not where it was sent.** Measured
 * 2026-09-06: a plate held on a static cover command sits about 0.12 m off it and stays there,
 * because the anchor drive's force cap and the mass on the end reach an equilibrium short of the
 * commanded point; a 50 mm arrival read against `commandedTip` therefore never happens, for any
 * command, however long the hold. So the target is the tip's own resting place at the end of the
 * hold, `standingOffsetMetres` reports how far short of the command that is -- which is the number
 * that says a cover does not go where a mind sends it -- and the hold is long enough to settle.
 *
 * **And it is read backwards**, because the target is not known while it is being approached.
 * `ModuleAxisEnvelope.rate` caps how fast the *command* itself travels, so the commanded tip at
 * the first step of the parry is still most of the way back at the cover. The history of the hold
 * is scanned from the end for the first step after which the plate stays inside
 * `PARRY_ARRIVED_METRES` of where it finished, which is `BenchReadout`'s own rule for
 * `arrivalSeconds` in world space instead of axis space.
 *
 * `settleRippleMm` is what makes the reading self-checking: the largest excursion from the
 * resting place over the last quarter second. A run whose ripple is near the arrival tolerance is
 * a run whose hold was too short, and its arrival should not be believed.
 */
export function parryProbe({ from, settleSeconds = 0.25 }) {
  const commanded = new Vector3();
  const start = new Vector3();
  const previous = new Vector3();
  const toward = new Vector3();
  const history = [];
  let have = false;
  let opened = false;
  let peakSpeed = 0;

  const probe = ({ t, view }) => {
    if (!view) return;
    const tip = view.tip;
    const speed = have ? Vector3.Distance(tip, previous) / SUBSTEP : 0;
    previous.copyFrom(tip);
    have = true;
    if (t < from) return;
    if (!opened) { opened = true; start.copyFrom(tip); }
    else if (speed > peakSpeed) peakSpeed = speed;
    commanded.copyFrom(view.commandedTip);
    history.push([t, tip.x, tip.y, tip.z]);
  };

  const read = () => {
    if (!opened || history.length === 0) {
      return Object.freeze({
        arrivedSeconds: null, travelMetres: 0, standingOffsetMetres: null,
        peakSpeedMps: 0, overshootMm: 0, settleRippleMm: null,
      });
    }
    const [endAt, ex, ey, ez] = history[history.length - 1];
    const gapTo = (x, y, z) => Math.hypot(x - ex, y - ey, z - ez);
    let arrivedAt = null;
    let ripple = 0;
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const [t, x, y, z] = history[index];
      const gap = gapTo(x, y, z);
      if (t >= endAt - settleSeconds && gap > ripple) ripple = gap;
      if (gap > PARRY_ARRIVED_METRES) break;
      arrivedAt = t - from;
    }
    toward.set(ex - start.x, ey - start.y, ez - start.z);
    const travel = toward.length();
    if (travel > 1e-9) toward.scaleInPlace(1 / travel);
    let overshootMm = 0;
    for (const [, x, y, z] of history) {
      const past = (x - ex) * toward.x + (y - ey) * toward.y + (z - ez) * toward.z;
      if (past * 1000 > overshootMm) overshootMm = past * 1000;
    }
    return Object.freeze({
      /** Seconds from the command moving to the cover settling where it finally rests. */
      arrivedSeconds: arrivedAt,
      /** How far the cover actually went, metres: the distance the arrival is an arrival over. */
      travelMetres: travel,
      /** How far short of its own command the cover rests, metres. A plate's is not small. */
      standingOffsetMetres: Math.hypot(ex - commanded.x, ey - commanded.y, ez - commanded.z),
      peakSpeedMps: peakSpeed,
      /** The furthest it carried **past** its resting place along the way there, millimetres. */
      overshootMm,
      /** The largest wobble about the resting place over the last `settleSeconds`, millimetres. */
      settleRippleMm: ripple * 1000,
    });
  };

  return { probe, read };
}
/**
 * Where the mark goes when nothing names one: the mind's own strike range, level with the socket.
 *
 * `tacticalRanges` is what decides how far a fencer stands off, so a bench mark at any other
 * distance would be a stroke nobody throws. Level with the socket because the stand has no
 * opponent to take a height from, and `--mark-height` is how a run asks for a lower one.
 */
export const markFor = (socket, envelope, cap, { distance: at = null, height = 0 } = {}) =>
  new Vector3(socket.world.x, socket.world.y + height,
    socket.world.z + (at ?? tacticalRanges(envelope.reach, cap).strike));

/**
 * One stroke on the bench, with its mark reading.
 *
 * The sequence and the probe are both built inside the run, because both need the socket and the
 * capability and neither exists until the module has been put on the stand. `runGolemBench`
 * resolves a function-valued `sequence` at exactly that point and before it installs the probe
 * observer, so the holder below is filled before the first sample can arrive -- and the throw
 * at the end of the run is what says so out loud rather than returning a row of zeroes.
 */
export async function runStrokeBench({
  moduleId,
  slot = "primary",
  shape: shapeOverride = null,
  mark: markOptions = null,
  overrides = null,
  guardSeconds = STROKE_GUARD_SECONDS,
}) {
  const kind = weaponOf(moduleId);
  let reader = null;
  let plan = null;
  const run = await runGolemBench({
    moduleId,
    slot,
    overrides,
    probe: (payload) => reader?.probe(payload),
    sequence: ({ module, socket }) => {
      const cap = capabilityOf(module);
      const envelope = module.envelope();
      const shape = Object.freeze({ ...STROKE_SHAPES[kind], ...(shapeOverride ?? {}) });
      const mark = markFor(socket, envelope, cap, markOptions ?? {});
      const script = strokeSequence({
        shape, cap, socket: socket.world, mark, reach: envelope.reach,
        outboard: socket.outboard,
        guardReach: kind === "shield" || kind === "buckler"
          ? GOLEM_TACTICS.shieldReach : GOLEM_TACTICS.guardReach,
        guardSeconds,
      });
      const swept = script.find((phase) => phase.name === "stroke");
      const follow = script.find((phase) => phase.name === "follow");
      reader = strokeProbe({
        socket: socket.world, mark, outboard: socket.outboard,
        from: swept.until - shape.strokeSeconds, to: follow.until,
      });
      plan = {
        shape, mark, reach: envelope.reach, markMetres: distance(socket.world, mark),
        sweeps: canSwing(cap),
      };
      return script;
    },
  });
  if (!reader || !plan) throw new Error("the stroke bench's sequence never ran");
  return Object.freeze({
    harness: run.harness,
    moduleId,
    label: run.label,
    weapon: kind,
    massKg: run.massKg,
    reach: plan.reach,
    shape: plan.shape,
    markMetres: plan.markMetres,
    /**
     * Whether the arc swept at all: false for a chain whose azimuth has one value.
     *
     * `driveStroke` multiplies the whole swing by `canSwing(cap)`, so a two-socket terminal --
     * the maul publishes `swingMax === swingMin` -- runs the reach half of the stroke and none of
     * the arc. Its `crossings` are then the *achieved* point wandering across a bearing the
     * command never moved, which is not a stroke reading, and this column is what says so.
     */
    sweeps: plan.sweeps,
    ...reader.read(),
    state: run.state,
  });
}

/** One parry on the bench: the plate sent across the line and the time it took to get there. */
export async function runParryBench({
  moduleId,
  slot = "primary",
  mark: markOptions = null,
  overrides = null,
  across = PARRY_ACROSS_METRES,
  up = PARRY_UP_METRES,
  coverSeconds = 0.6,
  holdSeconds = PARRY_HOLD_SECONDS,
}) {
  let reader = null;
  let travel = null;
  const run = await runGolemBench({
    moduleId,
    slot,
    overrides,
    probe: (payload) => reader?.probe(payload),
    sequence: ({ module, socket }) => {
      const cap = capabilityOf(module);
      const envelope = module.envelope();
      const mark = markFor(socket, envelope, cap, markOptions ?? {});
      reader = parryProbe({ from: coverSeconds });
      travel = { across, up };
      return parrySequence({
        cap, socket: socket.world, mark, outboard: socket.outboard,
        guardReach: GOLEM_TACTICS.shieldReach, coverSeconds, holdSeconds, across, up,
      });
    },
  });
  if (!reader) throw new Error("the parry bench's sequence never ran");
  return Object.freeze({
    harness: run.harness,
    moduleId,
    label: run.label,
    massKg: run.massKg,
    commanded: travel,
    ...reader.read(),
    state: run.state,
  });
}

/**
 * The grid, exactly as the session plan names it.
 *
 * Four axes and 64 cells a weapon: where the arc starts outboard of the mark, how long the sweep
 * takes, how far in the chamber draws, and how long it is held. The prediction to check is that
 * speed at the mark rises with the arc until the anchor stray runs away, and that the best stroke
 * time lengthens as the arc does.
 */
export const STROKE_GRID = Object.freeze({
  chamberSwing: Object.freeze([0.05, 0.4, 0.8, 1.2]),
  strokeSeconds: Object.freeze([0.11, 0.15, 0.20, 0.28]),
  chamberReach: Object.freeze([-0.70, -0.20]),
  chamberSeconds: Object.freeze([0.22, 0.32]),
});

/**
 * What the grid chose, per weapon kind, with the bench row that chose it.
 *
 * Session 03's `COMMITTED_SHAPES` is meant to be lifted from here: these are the four axes of
 * `STROKE_GRID` at their best cell, laid over the kind's own `STROKE_SHAPES` entry, which keeps
 * `followSwing`, `followLift`, `stepIn` and both rolls as the shipped stroke has them. Read on
 * `missMetres` first and `speedAtMark` second, because a speed at a mark the weapon never reached
 * is a number about nothing -- and on the shipped shapes the blade misses by 0.63 m.
 *
 * The rows are the 2026-09-06 grid, `node scripts/golem-bench.mjs --stroke --sweep stroke`, 320
 * cells over the five wrist modules the arena fields. `club` has **no** entry, and that is the
 * session's finding rather than an omission: no cell of the grid brings a mace within 0.47 m of
 * its mark or a maul within 0.94 m, and the mace's anchor stray runs from 283 to 583 mm across
 * the grid, which is the chain losing the head rather than a shape being wrong. `CHAIN_REACH`
 * is the body's number and this set does not move it.
 */
export const COMMITTED_SHAPE_CANDIDATES = Object.freeze({
  sword: Object.freeze({
    chamberSwing: 1.20, strokeSeconds: 0.20, chamberReach: -0.20, chamberSeconds: 0.32,
    /** miss 0.070 m, 22.34 m/s at the mark, peak 23.42, anchor stray 8 mm, on `effector.wrist.blade`. */
    bench: Object.freeze({ missMetres: 0.070, speedAtMark: 22.34, peakAnchorStrayMm: 8 }),
  }),
  shield: Object.freeze({
    chamberSwing: 1.20, strokeSeconds: 0.15, chamberReach: -0.70, chamberSeconds: 0.32,
    /** miss 0.014 m, 11.10 m/s, stray 56 mm, on `effector.wrist.plate`: a third of the 0.22 s wind's stray for 4 mm. */
    bench: Object.freeze({ missMetres: 0.014, speedAtMark: 11.10, peakAnchorStrayMm: 56 }),
  }),
  empty: Object.freeze({
    chamberSwing: 1.20, strokeSeconds: 0.11, chamberReach: -0.20, chamberSeconds: 0.32,
    /** miss 0.031 m, 12.45 m/s, stray 182 mm, on `effector.wrist.fist`. */
    bench: Object.freeze({ missMetres: 0.031, speedAtMark: 12.45, peakAnchorStrayMm: 182 }),
  }),
});

/** The modules the grid is taken on: one chain per weapon, the one the arena actually fields. */
export const STROKE_BENCH_MODULES = Object.freeze([
  "effector.wrist.blade",
  "effector.wrist.mace",
  "effector.wrist.maul",
  "effector.wrist.fist",
  "effector.wrist.plate",
]);

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
 * The same walk, cut to three seconds, **because a wheel is fast enough to leave the arena**.
 *
 * `WALK_SEQUENCE` is six seconds of walking and the headless arena carries the page's own ring of
 * fourteen posts at a radius of 9.5 m. A biped covers 7.2 m in that and a multileg 4.8, both
 * comfortably inside it; the wheel covers **12 m** and rams a post -- and the post is a real Havok
 * body that the flat query registry knows nothing about, so the carrier drives the yoke straight
 * into it. Measured: the carried block finished the run leaning 1.539 rad off the root and the
 * axle read 1.409 rad out of its own fork, which is a true reading of a golem wrapped round a post
 * and a false one of a walk. Exactly the shape of the "leg on a step" artefact
 * `runGolemLocomotion`'s own `course` comment records.
 *
 * Three seconds is 6.0 m at the wheel's 2.0 m/s, which clears the posts with 3.5 m to spare. The
 * two sequences are therefore not the same length and a column from one is not a column from the
 * other -- which costs nothing, because no gait figure is compared *across* modules anyway: what
 * is compared across modules is the knockdown, and that is read over `LOCOMOTION_SEQUENCE`, which
 * every one of the three finishes well inside the ring.
 */
export const FAST_WALK_SEQUENCE = Object.freeze([
  { name: "stand", until: 1.00, forward: 0, strafe: 0, turn: 0, crouch: 0 },
  { name: "walk", until: 4.00, forward: 1, strafe: 0, turn: 0, crouch: 0 },
  { name: "stop", until: 5.00, forward: 0, strafe: 0, turn: 0, crouch: 0 },
]);

/** Which walk a gait number is read over. See `FAST_WALK_SEQUENCE` for why it is not one. */
export const walkSequenceFor = (moduleId) =>
  (moduleId === "wheel" ? FAST_WALK_SEQUENCE : WALK_SEQUENCE);

/**
 * The locomotion modules this harness can drive.
 *
 * Looked up by definition rather than through `golemModule`, because what a locomotion run needs
 * is the module's own surface -- its readout, its live evidence and its shove -- and `BenchModule`
 * deliberately publishes none of those: it publishes what the *page* needs. `runGolemLocomotion`
 * asserts that whatever it drives is also registered, so a module benched here and missing from
 * the picker is a failure rather than a divergence.
 */
export const LOCOMOTION_MODULES = {
  biped: bipedModule,
  wheel: wheelModule,
  multileg: multilegModule,
};

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
    // **The module decides where its own socket is, and the stand goes there.** Session 05 had one
    // locomotion option and could take the fixture's frozen 1.02; three of them stand at 1.02,
    // 1.16 and 0.64, and a module built to somebody else's height would either bury its feet in
    // the block or hang them above the floor. Taken from the definition rather than from a table
    // here, so the two cannot disagree.
    socketHeight: definition.heightRange.standM,
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
 * The locomotion numbers with a sweep behind them, **per module**.
 *
 * Same shape as `SWEEPS` and a separate table for the same reason the instrument is separate: a
 * column named "peak tip speed" means nothing on a pair of legs, and a sweep that reported one
 * would be a number waiting to be quoted wrongly.
 *
 * **Keyed by module, which Session 06 made it.** Session 05 wrote one flat table because there was
 * one locomotion option, and every entry in it names `LOCOMOTION_BIPED` explicitly -- so running
 * `--locomotion wheel --sweep footFriction` against that table would have swept the *biped's*
 * friction while benching a wheel and printed a column of identical rows. Three options that share
 * a name for a number they do not share (`footFriction`, `shove`, `fallenTorque`) is exactly the
 * shape of reading that is about something else. The biped's own entries are unchanged to the
 * value, so every table already recorded from them still reproduces.
 */
const LOCOMOTION_SWEEPS = {
  biped: {
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
  },
  wheel: {
    // A wheel has one contact and one motor, so it has two gait numbers rather than nine -- and
    // they are two halves of one question: whether the tread turns at the rate the ground passes
    // under it. Both are read as the mean *material* slip of the contact patch.
    wheelFriction: { block: LOCOMOTION_WHEEL, key: "wheelFriction",
      values: [0.35, 0.55, 0.70, 0.85, 1.20] },
    wheelSpinTorque: { block: LOCOMOTION_WHEEL, key: "wheelSpinTorque",
      values: [120, 352, 700, 1200, 2400] },
    waistTorque: { block: BENCH_STAND_LOCOMOTION, key: "waistTorque",
      values: [800, 2000, 5000, 12000], sequence: LOCOMOTION_SEQUENCE },
    // The bracket that matters, and its values straddle the biped's own 10/12 on purpose: the
    // comparison the session exists for is that the shove the biped survives puts this over.
    shove: { block: LOCOMOTION_WHEEL, key: "shoveImpulseNs",
      values: [4, 6, 8, 10, 12, 700], sequence: LOCOMOTION_SEQUENCE },
    // **Read at the biped's own "leaves it standing" impulse, which is what `with` is for.** At
    // this module's own 1600 N.s bench shove every row of this sweep is identical to the digit --
    // 225 times the threshold swamps any capacity multiplier -- so a sweep taken there would be a
    // column of one number and a reader would conclude the field does nothing.
    stand: { block: LOCOMOTION_WHEEL, key: "gaitStabilityScaleStand",
      values: [0.35, 0.50, 0.70, 0.85, 1.00], sequence: LOCOMOTION_SEQUENCE,
      with: [[LOCOMOTION_WHEEL, { shoveImpulseNs: 10 }]] },
    fallenTorque: { block: LOCOMOTION_WHEEL, key: "fallenTorqueScale",
      values: [1.0, 0.30, 0.08, 0.0], sequence: LOCOMOTION_SEQUENCE },
  },
  multileg: {
    footFriction: { block: LOCOMOTION_MULTILEG, key: "footFriction",
      values: [0.25, 0.45, 0.55, 0.70, 0.90] },
    strideCadence: { block: LOCOMOTION_MULTILEG, key: "strideCadence",
      values: [6.0, 9.0, 11.2, 14.0, 18.0] },
    strideSwing: { block: LOCOMOTION_MULTILEG, key: "strideSwing",
      values: [0.20, 0.28, 0.34, 0.42, 0.55] },
    kneeLiftScale: { block: LOCOMOTION_MULTILEG, key: "kneeLiftScale",
      values: [1.2, 1.8, 2.4, 3.0, 3.6] },
    hipTorque: { block: LOCOMOTION_MULTILEG, key: "hipTorque",
      values: [40, 80, 120, 180, 240, 600] },
    kneeTorque: { block: LOCOMOTION_MULTILEG, key: "kneeTorque",
      values: [20, 40, 60, 90, 120, 300] },
    ankleTorque: { block: LOCOMOTION_MULTILEG, key: "ankleTorque",
      values: [10, 30, 80, 200] },
    targetRate: { block: LOCOMOTION_MULTILEG, key: "targetRate", values: [2, 4, 6, 10, 20] },
    waistTorque: { block: BENCH_STAND_LOCOMOTION, key: "waistTorque",
      values: [800, 2000, 5000, 12000], sequence: LOCOMOTION_SEQUENCE },
    // Straddling the biped's 12, from above: the other comparison the session exists for is that
    // the shove that fells the biped leaves this one standing.
    shove: { block: LOCOMOTION_MULTILEG, key: "shoveImpulseNs",
      values: [12, 20, 24, 30, 40, 900], sequence: LOCOMOTION_SEQUENCE },
    // Read at the biped's own fall impulse for the reason the wheel's `stand` sweep states: at
    // this module's own 2400 N.s bench shove every row is identical, because 104 times the
    // threshold does not care what the threshold is.
    brace: { block: LOCOMOTION_MULTILEG, key: "braceCapacityMultiplier",
      values: [1.0, 1.5, 2.0, 2.6, 3.4], sequence: LOCOMOTION_SEQUENCE,
      with: [[LOCOMOTION_MULTILEG, { shoveImpulseNs: 12 }]] },
    fallenTorque: { block: LOCOMOTION_MULTILEG, key: "fallenTorqueScale",
      values: [1.0, 0.30, 0.08, 0.0], sequence: LOCOMOTION_SEQUENCE },
  },
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
  // **Rung 1's whole speed, not its speed between chops.** `chop.driveRate` used to sit beside
  // this and swept the *other* ceiling -- the one a scripted velocity event ran at -- so between
  // them the two numbers described an arm with two top speeds and a button to choose. There is
  // one now, and this sweep is about all of it.
  rate: { block: CHAIN_PITCH, key: "targetRate", values: [2.5, 4, 6, 9, 12, 16, 30], mark: "guard" },
  torque: { block: CHAIN_PITCH, key: "motorTorque", values: [120, 200, 320, 500, 900], mark: "guard" },
  force: {
    block: CHAIN_REACH, key: "anchorForce",
    values: [1400, 2400, 3900, 6000, 9000, 14000], mark: "guard",
  },
  // The same widening as `rate` above, in the units an anchor works in: the four sweeps that
  // stood here after this one were `thrust.followSeconds`, `thrust.strokeRate`, `cut.strokeRate`,
  // `thrust.driveSeconds` and `cut.swingRate`, and every one of them tuned a script that no
  // longer exists. Their tables are in `docs/measurements.md`. This range now runs up past the
  // old stroke rates because those *were* this ceiling with a button held.
  reachRate: {
    block: CHAIN_REACH, key: "anchorRate",
    values: [1.2, 2.0, 3.0, 5.0, 8.0, 12.0], mark: "extend",
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
    slot: "primary", locomotion: null, course: false, stroke: false, parry: false,
    markDistance: null, markHeight: 0 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--json") { args.json = true; continue; }
    if (flag === "--stroke") { args.stroke = true; continue; }
    if (flag === "--parry") { args.parry = true; continue; }
    const value = argv[index + 1];
    switch (flag) {
      case "--chain": args.chain = value; index += 1; break;
      case "--terminal": args.terminal = value; index += 1; break;
      case "--module": args.module = value; index += 1; break;
      case "--sweep": args.sweep = value; index += 1; break;
      case "--slot": args.slot = value; index += 1; break;
      case "--locomotion": args.locomotion = value ?? "biped"; index += 1; break;
      case "--course": args.course = true; break;
      case "--mark-distance": args.markDistance = Number(value); index += 1; break;
      case "--mark-height": args.markHeight = Number(value); index += 1; break;
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
    const table = LOCOMOTION_SWEEPS[args.locomotion];
    if (!table) {
      throw new Error(`no sweep table for locomotion module "${args.locomotion}";`
        + ` known: ${Object.keys(LOCOMOTION_SWEEPS).join(", ")}`);
    }
    const sweep = table[args.sweep];
    if (!sweep) {
      throw new Error(`unknown ${args.locomotion} sweep "${args.sweep}";`
        + ` known: ${Object.keys(table).join(", ")}`);
    }
    const rows = [];
    for (const value of sweep.values) {
      const run = await runGolemLocomotion({
        moduleId: args.locomotion, course: args.course,
        sequence: sweep.sequence ?? walkSequenceFor(args.locomotion),
        // `with` is a fixed setting the whole sweep is read *at*, and it is not a convenience: a
        // stability field swept at an impulse a hundred times its own threshold produces a column
        // of one number, which reads as "this field does nothing" and is the shape of a measurement
        // that is about something else. The two entries that carry one say why beside themselves.
        overrides: [...(sweep.with ?? []), [sweep.block, { [sweep.key]: value }]],
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

/**
 * One line a stroke: what the weapon did at the mark, and what it cost the arm to do it.
 *
 * `miss` leads because a speed at a mark the weapon never reached is a number about nothing, and
 * it is the column the grid is read on first.
 */
const strokeLine = (run) => `${run.moduleId.padEnd(24)}`
  + ` miss ${run.missMetres.toFixed(3)} m`
  + ` @ ${fixed(run.alongMetres, 3)} m back`
  + `, v ${run.speedAtMark.toFixed(2)} m/s (tip ${run.tipSpeedAtMark.toFixed(2)})`
  + `, peak ${run.peakTipSpeedDriven.toFixed(2)}`
  + `, stray ${fixed(run.peakAnchorStrayMm, 1)} mm`
  + `, at ${fixed(run.markAt, 3)} s`
  + `, crossings ${run.crossings}`;

const shapeLabel = (cell) => `swing ${cell.chamberSwing.toFixed(2)}`
  + ` stroke ${cell.strokeSeconds.toFixed(2)}`
  + ` draw ${cell.chamberReach.toFixed(2)}`
  + ` wind ${cell.chamberSeconds.toFixed(2)}`;

/** Every cell of `STROKE_GRID`, in the order the axes are written. */
export function strokeGridCells(grid = STROKE_GRID) {
  const cells = [];
  for (const chamberSwing of grid.chamberSwing) {
    for (const strokeSeconds of grid.strokeSeconds) {
      for (const chamberReach of grid.chamberReach) {
        for (const chamberSeconds of grid.chamberSeconds) {
          cells.push(Object.freeze({ chamberSwing, strokeSeconds, chamberReach, chamberSeconds }));
        }
      }
    }
  }
  return Object.freeze(cells);
}

async function mainStroke(args) {
  const modules = args.module || args.chain
    ? [idFor(args)]
    : STROKE_BENCH_MODULES;
  const markOptions = { distance: args.markDistance, height: args.markHeight };
  if (args.sweep) {
    if (args.sweep !== "stroke") {
      throw new Error(`--stroke takes only "--sweep stroke", not "${args.sweep}"`);
    }
    const cells = strokeGridCells();
    const rows = [];
    for (const moduleId of modules) {
      for (const shape of cells) {
        const run = await runStrokeBench({ moduleId, slot: args.slot, shape, mark: markOptions });
        rows.push({
          moduleId, weapon: run.weapon, markMetres: run.markMetres, ...shape,
          missMetres: run.missMetres, alongMetres: run.alongMetres,
          speedAtMark: run.speedAtMark, tipSpeedAtMark: run.tipSpeedAtMark,
          markAt: run.markAt, crossings: run.crossings,
          peakTipSpeedDriven: run.peakTipSpeedDriven,
          peakAnchorStrayMm: run.peakAnchorStrayMm,
        });
      }
    }
    if (args.json) { process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`); return; }
    process.stdout.write(`harness: ${HARNESS}\n\n`);
    let seen = null;
    for (const row of rows) {
      if (row.moduleId !== seen) {
        seen = row.moduleId;
        process.stdout.write(`${row.moduleId} -- ${row.weapon},`
          + ` mark ${row.markMetres.toFixed(3)} m out\n`);
      }
      process.stdout.write(`  ${shapeLabel(row)}:`
        + ` miss ${row.missMetres.toFixed(3)} m`
        + ` @ ${fixed(row.alongMetres, 3)} back,`
        + ` v ${row.speedAtMark.toFixed(2)}`
        + ` (tip ${row.tipSpeedAtMark.toFixed(2)}, peak ${row.peakTipSpeedDriven.toFixed(2)}),`
        + ` stray ${fixed(row.peakAnchorStrayMm, 1)} mm\n`);
    }
    return;
  }
  const runs = [];
  for (const moduleId of modules) {
    runs.push(await runStrokeBench({ moduleId, slot: args.slot, mark: markOptions }));
  }
  if (args.json) {
    process.stdout.write(`${JSON.stringify(runs.map((run) => ({ ...run, state: undefined })), null, 2)}\n`);
    return;
  }
  process.stdout.write(`harness: ${HARNESS}\n\n`);
  for (const run of runs) {
    process.stdout.write(`${run.label}, mark ${run.markMetres.toFixed(3)} m out`
      + ` on a ${run.reach.toFixed(2)} m reach, ${shapeLabel(run.shape)}\n`);
    process.stdout.write(`  ${strokeLine(run)}\n`);
  }
}

async function mainParry(args) {
  const modules = args.module || args.chain ? [idFor(args)] : STROKE_BENCH_MODULES;
  const runs = [];
  for (const moduleId of modules) {
    runs.push(await runParryBench({
      moduleId, slot: args.slot,
      mark: { distance: args.markDistance, height: args.markHeight },
    }));
  }
  if (args.json) {
    process.stdout.write(`${JSON.stringify(runs.map((run) => ({ ...run, state: undefined })), null, 2)}\n`);
    return;
  }
  process.stdout.write(`harness: ${HARNESS}\n`);
  process.stdout.write(`the cover asked ${PARRY_ACROSS_METRES.toFixed(2)} m across`
    + ` and ${PARRY_UP_METRES.toFixed(2)} m up, held ${PARRY_HOLD_SECONDS.toFixed(1)} s\n\n`);
  for (const run of runs) {
    process.stdout.write(`${run.label}\n`);
    process.stdout.write(`  arrived ${fixed(run.arrivedSeconds, 3)} s`
      + ` over ${run.travelMetres.toFixed(3)} m,`
      + ` resting ${fixed(run.standingOffsetMetres, 3)} m off its command,`
      + ` peak ${run.peakSpeedMps.toFixed(2)} m/s,`
      + ` overshoot ${run.overshootMm.toFixed(0)} mm,`
      + ` ripple ${fixed(run.settleRippleMm, 1)} mm\n`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.locomotion) {
    await mainLocomotion(args);
    return;
  }
  if (args.stroke) {
    await mainStroke(args);
    return;
  }
  if (args.parry) {
    await mainParry(args);
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
  if (run.gripTakenAt !== null) {
    process.stdout.write(`  second grip taken at ${run.gripTakenAt.toFixed(3)} s\n`);
  }
  if (run.peakGripStrayMm !== null) {
    process.stdout.write(`  trailing grip stray ${run.peakGripStrayMm.toFixed(3)} mm peak`
      + ` (against ${fixed(run.state.peakAnchorStrayMm, 2)} mm at the driven grip)\n`);
  }
}

// `import.meta.main` is Node 22.13's spelling and this directory pins that engine floor.
if (process.argv[1] && process.argv[1].endsWith("golem-bench.mjs")) {
  await main();
}
