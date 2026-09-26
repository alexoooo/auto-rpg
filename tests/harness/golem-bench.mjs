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

import { HAND_REACH } from "../../src/hands.ts";
import { reachFromButtons } from "../../src/bench/buttons.ts";
import { CONFIG } from "../../src/config.ts";
import { GOLEM_EFFECTORS } from "../../src/golem/build.ts";
import { resolveAttributes } from "../../src/golem/attributes.ts";
import {
  BENCH_READOUT, BENCH_STAND_LOCOMOTION, CHAIN_PITCH, CHAIN_REACH, CHAIN_WRIST, LOCOMOTION_BIPED,
  LOCOMOTION_MULTILEG, LOCOMOTION_WHEEL,
} from "../../src/golem/config.ts";
import { formatLocomotion, locomotionCommand } from "../../src/golem/locomotion.ts";
import { bipedModule } from "../../src/golem/locomotion/biped.ts";
import { multilegModule } from "../../src/golem/locomotion/multileg.ts";
import { wheelModule } from "../../src/golem/locomotion/wheel.ts";
import { skeletonBiped } from "../../src/golem/skeleton/body.ts";
import { buildLocomotionCourse, registerLocomotionCourse } from "../../src/golem/locomotion/course.ts";
import { BenchReadout, blankSample, formatReadout } from "../../src/golem/readout.ts";
import { effectorCapability } from "../../src/golem/module.ts";
import { GOLEM_MODULES, golemModule } from "../../src/golem/registry.ts";
import { buildGolemStand, golemLayers } from "../../src/golem/stand.ts";
import {
  GOLEM_TACTICS, STROKE_SHAPES, strokeTimeScale, aimAt, canCover, canSwing, distance, reachForDistance,
  tacticalRanges, writeAim,
} from "../../src/golem/tactics.ts";
import { flatSupportedWorldRegistry } from "../../src/supported-locomotion-production.ts";
import { createHeadlessArena } from "./golem-headless-arena.mjs";
import { RingMeter } from "./ring-meter.mjs";

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
/**
 * How long a nudge phase holds, and how long after it opens the push lands.
 *
 * 3.0 s because rung 3 takes about 1.75 s to stop ringing on a commanded step and **a window
 * shorter than the ring reports its own length back as a settle time** -- the defect the torso's
 * shove phase found first, at 1.8 s, and wrote down. The 0.10 s delay is so the phase's opening
 * step, where the script hands over, is not also the impulse step.
 */
const NUDGE_PHASE = Object.freeze({ seconds: 3.0, delay: 0.10 });

/**
 * The same script with a still, held phase appended: where a nudge is measured.
 *
 * **An appendix rather than a phase in each sequence, and opt-in rather than always.** There are
 * five scripts in this file and a copy of the same phase in each would be five places for one
 * rule to drift; and appending it unconditionally would lengthen every run, which moves the
 * whole-run columns (`tipWanderMm`, `stuckSteps`, the run peak) that `docs/measurements.md`
 * already has tables of. A caller that wants a ring asks for one and nothing else changes.
 *
 * The appended command is **the last phase's, repeated exactly**, so the limb enters already
 * settled and the meter reads the nudge alone rather than the limb still arriving -- which is the
 * correction the torso's shove phase needed twice, and the reason `untwist` exists there.
 */
export const withNudge = (sequence) => {
  const last = sequence[sequence.length - 1];
  const until = last.until + NUDGE_PHASE.seconds;
  return {
    sequence: Object.freeze([...sequence, Object.freeze({ ...last, name: "nudge", until })]),
    at: last.until + NUDGE_PHASE.delay,
    until,
  };
};

export const sequenceFor = (moduleId) => {
  if (moduleId.endsWith(".mace")) return MACE_SEQUENCE;
  if (moduleId.endsWith(".maul")) return MAUL_SEQUENCE;
  if (moduleId.endsWith(".whip")) return WHIP_SEQUENCE;
  if (moduleId.endsWith(".plate")) return PLATE_SEQUENCE;
  return moduleId.startsWith("effector.reach.") || moduleId.startsWith("effector.wrist.")
    || moduleId.startsWith("effector.skeletal.")
    ? REACH_SEQUENCE
    : BENCH_SEQUENCE;
};

/** A whole `Intent`, because a bench option adapts the command rather than being handed one. */
const benchIntent = () => ({
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
  /**
   * The stats the module is built at, as a setup carries them (`{ armSpeed: 1.5 }`), or null for a
   * module built exactly as the bench always built it -- with no `attributes` in its context at all.
   */
  attributes = null,
  /**
   * The motor tone the module is built on, as a fraction of every ceiling (`ModuleBuild.tone`), or
   * null for the full tone a module on the bench has always had. Physical contact session 02 reads
   * a grounded arm this way: the same arm on the same stand with its ceilings at a share.
   */
  tone = null,
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
    ...(attributes ? { attributes: resolveAttributes({ attributes }) } : {}),
    ...(tone === null ? {} : { tone: { scale: tone } }),
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
  /**
   * **The violation the latch builds, and how long the solver takes to clear it.** `maul.ts`
   * takes the grip on the first step the trailing hand is within `TERMINAL_MAUL.joinWithin` of
   * the point -- 50 mm -- so the joint is born with its two frames up to 50 mm apart and the
   * solver pulls them together over the following steps. That transient is not the joint failing
   * to hold, and `peakGripStrayMm` is a claim about the held joint, so the two are separated
   * here. `gripJoinMm` is the separation at the instant of the latch and `gripSettleSeconds` is
   * how long it took to come in.
   */
  let gripJoinMm = null;
  let gripSettleSeconds = null;
  let gripSettled = false;
  let lastGripMm = null;

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
        const mm = view.gripStray * 1000;
        if (gripTakenAt === null) {
          gripTakenAt = t;
          gripJoinMm = mm;
        }
        // **Outside the take-up, and the take-up times itself.** This read `t > gripTakenAt`
        // until 2026-09-18: one step excluded, on the reasoning that the step the grip is taken
        // is the one step whose error is the join distance rather than the solver's. One step was
        // enough while the arm was slow enough to creep through the 50 mm shell and latch at the
        // bottom of it -- the reach chain still does, at 0.19 mm. It is not enough for an arm
        // with the force to cross the whole shell in a step: correcting the chains for the sword
        // they carry (the account is beside `CHAIN_PITCH.motorTorque`) had the wrist chain latch
        // 38.9 mm out, and the solver walked that in over seven steps -- 38.9, 15.5, 6.2, 2.5,
        // 1.0, 0.39, 0.15, 0.055 -- before holding at 0.04..0.08 mm, which is the 0.085 mm this
        // bench recorded on 2026-09-06. Excluding one step read the *second* number, 15.5.
        //
        // So the cut is taken where the physics puts it rather than at a step count: the error
        // falls monotonically while the solver is clearing the violation, and the first step it
        // stops falling is the step the joint has taken up. Nothing is excluded that the joint is
        // responsible for, and `gripJoinMm` keeps the violation itself on the record, because a
        // latch that builds one is the thing `TERMINAL_MAUL.joinWithin` is a bound on.
        if (!gripSettled && lastGripMm !== null && mm >= lastGripMm) {
          gripSettled = true;
          gripSettleSeconds = t - gripTakenAt;
        }
        lastGripMm = mm;
        if (t >= BENCH_READOUT.startupExclusionSeconds && gripSettled) {
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
      /** How far apart the two frames were when the latch built the joint, millimetres. It is a
       *  violation by construction and `TERMINAL_MAUL.joinWithin` is its bound. */
      gripJoinMm,
      /** How long the solver took to clear that violation, seconds; null if it never settled. */
      gripSettleSeconds,
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
 * The mind's own capability record, built from a bench module's published envelope by
 * `effectorCapability`, the one builder `Golem.golemCapabilities` uses too. It was a second copy
 * until physical contact session 09, and the copy lacked the full-orientation branch.
 */
export const capabilityOf = (module) => effectorCapability(module.envelope());

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
 * Speeds are the published points differenced. `EffectorView` publishes no velocity, and the
 * terminal's own body velocity is not a point's on it -- a point on the end of a swinging limb
 * carries the angular part too -- so the difference is the honest reading, and it is taken at
 * `CONFIG.world.physicsHz` rather than at the frame rate.
 *
 * **The speed at the mark is read at the instant of closest approach, not at the nearest step**
 * (2026-09-25). It was the two points differenced back across one step, which is the mean speed of
 * the step *before* the sample, dt/2 behind it, on a blade gaining about 400 m/s every second, and
 * it was read at whichever step fell nearest the mark, anywhere up to dt/2 either side of the
 * blade's real passage. Both errors scale with the step, so the reading moved with the physics
 * rate while the swing did not. On the shipped cut, trial 0, Node golem bench (m/s):
 *
 *     physics, instrument                 one step back   sub-step (as now)
 *     240, every step                          15.45            15.63
 *     240, every other step, phase 0           14.70            15.52
 *     240, every other step, phase 1           13.11            15.19
 *     120, every step                          13.44            15.16
 *
 * The same 240 physics read at 120's spacing reads what 120 physics reads, so the 2.0 m/s the old
 * reading lost at 120 was the instrument. The chosen sword cut, same four rows: 13.37, 12.67,
 * 11.22 and 12.66 the old way; 13.47, 13.33, 13.14 and 13.12 now. The sub-step reading places the
 * approach at the minimum of a parabola through the squared miss of the three steps around the
 * nearest one (exact for a point passing at constant velocity), takes the fourth-order central
 * difference of the point at each of the three, and interpolates quadratically between them.
 * What is left, up to 0.4 m/s between sampling phases at 120, is a speed peak about 20 ms wide
 * sampled every 8.3 ms, which no stencil of positions recovers -- so a comparison across rates is
 * made on one instrument, with the table named.
 */
export function strokeProbe({
  socket, mark, outboard = 1, heading = 0, from = 0, to = Infinity, sweptUntil = Infinity,
}) {
  const markAim = aimAt(socket, mark, heading, outboard, { swing: 0, lift: 0, horizontal: 0 });
  const aim = { swing: 0, lift: 0, horizontal: 0 };
  const tipWas = new Vector3();
  const anchorWas = new Vector3();
  const along = new Vector3();
  const toMark = new Vector3();
  let have = false;
  let side = 0;
  let crossings = 0;
  /**
   * **The same count, taken over the swept phase alone.**
   *
   * `from`..`to` deliberately runs from the start of the arc to the end of the *follow-through*,
   * because the weapon's closest approach falls in the follow -- that is the correction this
   * probe's header records. So a crossing counted over the whole window cannot say whether the
   * blade crossed twice while swinging or once while swinging and once while following, and on
   * 2026-09-18 that distinction was the whole question: the count went from 1 to 2 when the arm
   * was corrected, and the two readings mean opposite things. Split, it answers -- the blade
   * crosses **twice inside the arc**, at 0.7542 s and again before the arc ends at 0.870, and
   * not once in the follow at all.
   */  let sweptCrossings = 0;
  /** When each crossing fell, seconds, so a count of two can be read rather than guessed at. */
  const crossingTimes = [];
  let crossedAt = null;
  let nearest = null;
  /** Every sample in the window and two either side of it, for the sub-step reading at the mark. */
  const trail = [];
  let peakTipSpeed = 0;
  let peakStrayMm = null;

  const probe = ({ t, view }) => {
    if (!view) return;
    const tip = view.tip;
    const anchor = view.anchor ?? tip;
    const tipSpeed = have ? Vector3.Distance(tip, tipWas) / SUBSTEP : 0;
    const anchorSpeed = have ? Vector3.Distance(anchor, anchorWas) / SUBSTEP : 0;
    // How much of the tip's motion the edge leads with: 1 is edge first, 0 is the flat.
    const edgeLead = have && view.edge && tipSpeed > 0
      ? Math.abs(Vector3.Dot(view.edge, tip.subtract(tipWas))) / (view.edge.length() * tipSpeed * SUBSTEP)
      : null;
    tipWas.copyFrom(tip);
    anchorWas.copyFrom(anchor);
    have = true;
    if (t >= from - 2.5 * SUBSTEP && t <= to + 2.5 * SUBSTEP) {
      trail.push({ tip: tip.clone(), anchor: anchor.clone() });
    }
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
        edgeLead,
        alongMetres: span * (1 - u),
        u,
        index: trail.length - 1,
      };
    }
    aimAt(socket, tip, heading, outboard, aim);
    const now = Math.sign(aim.swing - markAim.swing);
    if (now !== 0) {
      if (side !== 0 && now !== side) {
        crossings += 1;
        if (t <= sweptUntil) sweptCrossings += 1;
        crossingTimes.push(t);
        if (crossedAt === null) crossedAt = t;
      }
      side = now;
    }
  };

  // The sub-step reading the header describes; null where the window's edge leaves no stencil.
  const atApproach = () => {
    const k = nearest?.index;
    if (k === undefined || k < 3 || k + 3 >= trail.length) return null;
    const blend = (j, u) => trail[j].anchor.add(trail[j].tip.subtract(trail[j].anchor).scale(u));
    const missSq = (j) => {
      const { tip, anchor } = trail[j];
      const along = tip.subtract(anchor);
      const span = along.length();
      const u = span > 1e-9
        ? Math.max(0, Math.min(1, Vector3.Dot(mark.subtract(anchor), along) / (span * span)))
        : 0;
      return Vector3.DistanceSquared(blend(j, u), mark);
    };
    const q0 = missSq(k - 1), q1 = missSq(k), q2 = missSq(k + 1);
    const curve = q0 - 2 * q1 + q2;
    const offset = curve > 1e-12 ? Math.max(-1, Math.min(1, 0.5 * (q0 - q2) / curve)) : 0;
    const speedAt = (point) => {
      const v = (j) => point(j + 1).subtract(point(j - 1)).scale(8)
        .subtract(point(j + 2)).addInPlace(point(j - 2)).scaleInPlace(1 / (12 * SUBSTEP)).length();
      const a = v(k - 1), b = v(k), c = v(k + 1);
      return b + 0.5 * (c - a) * offset + 0.5 * (c - 2 * b + a) * offset * offset;
    };
    return {
      speed: speedAt((j) => blend(j, nearest.u)),
      tipSpeed: speedAt((j) => trail[j].tip),
    };
  };

  const read = () => {
    const approach = atApproach();
    return Object.freeze({
      /**
       * Metres a second of the point of the weapon that is at the mark, at the instant of closest
       * approach (see the header); the nearest step's one-step-back difference only where the
       * window's edge leaves no stencil.
       */
      speedAtMark: nearest ? (approach?.speed ?? nearest.speed) : 0,
      /** Metres a second of the business end at the same instant, which is always the larger. */
      tipSpeedAtMark: nearest ? (approach?.tipSpeed ?? nearest.tipSpeed) : 0,
      /**
       * How much of the tip's motion the edge led with at that step, 0 to 1: the cosine between the
       * published edge direction and the tip's velocity. Null for a terminal that publishes no edge.
       * A cut scores on it (`edgeAlignment` in `src/scoring.ts`), and speed alone does not say it.
       */
      edgeLeadAtMark: nearest ? nearest.edgeLead : null,
      /** How close the weapon actually came to the mark there, metres. */
      missMetres: nearest ? nearest.miss : null,
      /** How far back from the business end the mark fell, metres: where on the blade it landed. */
      alongMetres: nearest ? nearest.alongMetres : null,
      /** Seconds into the run at which that step fell. */
      markAt: nearest ? nearest.at : null,
      /** Bearing crossings over the whole window, arc and follow-through together. */
      crossings,
      /** Bearing crossings inside the swept phase: zero for a chain that cannot swing. */
      sweptCrossings,
      crossingTimes: Object.freeze([...crossingTimes]),
      crossedAt,
      peakTipSpeedDriven: peakTipSpeed,
      peakAnchorStrayMm: peakStrayMm,
    });
  };

  return { probe, read };
}

/** How far across, and how far up, the parry command asks the cover to move. Metres. */
export const PARRY_ACROSS_METRES = 0.25;
export const PARRY_UP_METRES = 0.10;
/** How close the cover has to be to its resting place to count as arrived. Metres. */
export const PARRY_ARRIVED_METRES = 0.05;
/**
 * How long the cover is held after the command moves: long enough to stop moving. Seconds.
 *
 * **4.0 from 2026-09-18, and the bench diagnosed this itself.** `settleRippleMm` exists so that an
 * arrival taken over too short a hold is not believed -- "a run whose ripple is near the arrival
 * tolerance is a run whose hold was too short" is written beside it -- and at 2.0 s the blade was
 * reading a ripple of 50.20 mm against an arrival tolerance of 50.0. It was right, and swept:
 *
 *     hold      blade ripple   blade arrival      plate ripple   plate arrival
 *     2.0 s       50.20 mm       1.920 s            35.75 mm       1.283 s
 *     3.0 s       50.16 mm       2.825 s             0.39 mm       1.120 s
 *     4.0 s        3.85 mm       2.262 s             0.00 mm       1.120 s
 *     6.0 s        0.00 mm       2.262 s             0.00 mm       1.120 s
 *
 * **The arrival was the number moving, which is the point.** It is what Session 05's guardian
 * branches on, and over a hold too short to settle it read 1.920 s, then 2.825, then 2.262 twice.
 * The last two agreeing is the reading converging; the first two were the cover still travelling
 * when the window closed. 4.0 s is where both terminals settle and where the arrival stops
 * depending on how long anyone happened to watch, and 6.0 s is the control that says so.
 *
 * It read 2.0 s from 2026-09-06, when the arm was too weakly driven to carry a cover past its
 * resting place at all. A cover with real authority overshoots and comes back, and that takes
 * longer than a cover that crept up on it.
 */
export const PARRY_HOLD_SECONDS = 4.0;

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
 * The nudge: the smallest disturbance that answers the owner's complaint, and why it is sized in
 * metres per second rather than in newton-seconds.
 *
 * `BENCH_SHOVE` on the torso is 84 N.s, and copying that number here would be a mistake worth
 * naming: 84 N.s against the 1.82 kg a wrist chain carries is about 46 m/s, which is not a nudge,
 * it is a demolition. **An impulse is only a disturbance relative to the inertia it lands on**,
 * and the inertia at the end of an effector chain is a hundredth of a trunk's. So the constant
 * below is picked against `peakTipSpeedMps`, which every ring row reports for exactly this
 * reason -- the row says what the nudge actually did, so the constant cannot silently mean
 * something different on a heavier terminal than it does on a lighter one.
 *
 * The table that picked it is in `CHAIN_WRIST`'s own doc, beside the gain it exists to measure.
 */
export const BENCH_NUDGE = Object.freeze({
  newtonSeconds: 1,
  // Across the chain rather than along it: a push down the arm's own axis is taken by the reach
  // drive as a compression and produces no swing, and a swing is what rings.
  direction: Object.freeze([0.3, -1, 0.4]),
});

/**
 * The ring probe: how far one small push moved the tip, how long the tip took to stop, and **how
 * many times it changed its mind on the way**.
 *
 * This is the column the whole damping change is judged in, and the reason it had to be built is
 * that nothing in `BenchReadout` can see a ring -- `ring-meter.mjs`'s own doc lists the four
 * metrics that look like they should and the structural reason each one cannot. The short of it
 * is that every existing column is about *lag*, and the complaint is about *oscillation*.
 *
 * **It nudges rather than teleporting the cursor**, which `AGENTS.md:181-185` is emphatic about:
 * a jumped command gives the limb no momentum to carry, so it reports a clean monotonic settle
 * that says nothing about what a blow does. The impulse lands on the terminal at the tip, which
 * is where a blow lands, and the meter is armed on the same step so the reference is the tip's
 * position before the push rather than a step into it.
 *
 * `peakTipSpeedMps` is what makes the reading self-checking and is what sizes `BENCH_NUDGE`: a
 * run whose tip never exceeded the readout's own `restTipSpeed` was not disturbed at all and its
 * settle time is a statement about the noise floor.
 */
export function ringProbe({
  at, until, bandMm = 2, newtonSeconds = BENCH_NUDGE.newtonSeconds,
}) {
  const meter = new RingMeter(bandMm);
  const previous = new Vector3();
  const push = new Vector3();
  let fired = false;
  let peakTipSpeed = 0;

  const probe = ({ t, view, module }) => {
    if (!view) return;
    const tip = view.tip;
    if (!fired) {
      if (t >= at) {
        const [dx, dy, dz] = BENCH_NUDGE.direction;
        push.set(dx, dy, dz).normalize().scaleInPlace(newtonSeconds);
        // The last part is the terminal: `effector.ts` composes `parts` as chain, then trailing
        // grip, then end. A blow lands on the weapon, not on the forearm.
        const end = module.parts[module.parts.length - 1];
        end.part.body.applyImpulse(push, tip.clone());
        meter.arm(t, until, tip.x, tip.y, tip.z);
        fired = true;
      }
      previous.copyFrom(tip);
      return;
    }
    const speed = Vector3.Distance(tip, previous) / SUBSTEP;
    previous.copyFrom(tip);
    if (speed > peakTipSpeed) peakTipSpeed = speed;
    meter.sample(t, tip.x, tip.y, tip.z);
  };

  const read = () => Object.freeze({ ...meter.state(), peakTipSpeedMps: peakTipSpeed });

  return { probe, read };
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
  /** The stats the arm is built at, as `runGolemBench` takes them. */
  attributes = null,
  /** The motor tone the arm is built on, as `runGolemBench` takes it. */
  tone = null,
  /**
   * Whether to time the shape as a mind times it for this arm: its chamber and arc times
   * `strokeTimeScale` of the arm's own capability (physical contact session 09). Off, the shape
   * runs at the durations it was benched at, whatever the arm.
   */
  timed = false,
}) {
  const kind = weaponOf(moduleId);
  let reader = null;
  let plan = null;
  const run = await runGolemBench({
    moduleId,
    slot,
    overrides,
    attributes,
    tone,
    probe: (payload) => reader?.probe(payload),
    sequence: ({ module, socket }) => {
      const cap = capabilityOf(module);
      const envelope = module.envelope();
      const authored = { ...STROKE_SHAPES[kind], ...(shapeOverride ?? {}) };
      const scale = timed ? strokeTimeScale(cap) : 1;
      const shape = Object.freeze({ ...authored, chamberSeconds: authored.chamberSeconds * scale,
        strokeSeconds: authored.strokeSeconds * scale });
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
        from: swept.until - shape.strokeSeconds, to: follow.until, sweptUntil: swept.until,
      });
      plan = {
        shape, mark, reach: envelope.reach, markMetres: distance(socket.world, mark),
        sweeps: canSwing(cap), cap,
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
    /** The capability the mind would read off this arm, as `capabilityOf` builds it. */
    capability: plan.cap,
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
    /** A two-socket terminal's held grip, as `runGolemBench` reads it; null for every other. */
    peakGripStrayMm: run.peakGripStrayMm,
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
  /** The motor tone the arm is built on, as `runGolemBench` takes it. */
  tone = null,
}) {
  let reader = null;
  let travel = null;
  const run = await runGolemBench({
    moduleId,
    slot,
    overrides,
    tone,
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
    // Re-swept after the wider reach and stabilized wrist (2026-09-21),
    // then refined chamber reach and follow lift around the best accurate stroke.
    // This is a bench candidate, not a change to the shipped policy's stroke.
    chamberSwing: 0.05, strokeSeconds: 0.15, chamberReach: 0.10, chamberSeconds: 0.32,
    followLift: 0.50,
    // Re-read 2026-09-25 at 120 Hz physics on the sub-step speed reading (`strokeProbe`'s header);
    // the 240 Hz row on the old reading was 0.0898 m, 13.380 m/s, 32.563 mm.
    bench: Object.freeze({ missMetres: 0.090, speedAtMark: 13.115, peakAnchorStrayMm: 31.9 }),
  }),
  shield: Object.freeze({
    chamberSwing: 0.80, strokeSeconds: 0.11, chamberReach: -0.70, chamberSeconds: 0.22,
    /** miss 0.059 m, 10.47 m/s, stray 33 mm, on `effector.wrist.plate`. */
    bench: Object.freeze({ missMetres: 0.059, speedAtMark: 10.47, peakAnchorStrayMm: 33 }),
  }),
  empty: Object.freeze({
    chamberSwing: 0.80, strokeSeconds: 0.15, chamberReach: -0.20, chamberSeconds: 0.22,
    /** miss 0.008 m, 12.62 m/s, stray 9 mm, on `effector.wrist.fist`. */
    bench: Object.freeze({ missMetres: 0.008, speedAtMark: 12.62, peakAnchorStrayMm: 9 }),
  }),
});

/**
 * **Re-taken whole on 2026-09-18, because the grid had been fitted to a defect.**
 *
 * Every row above was swept against a wrist whose grip rang -- 90 mm of unprovoked bob on the
 * blade, 212 on the mace, 26 on the plate -- and whose bend hinge missed its command by 1.3
 * radians during a stroke. `CHAIN_WRIST.gripInertiaRatio` fixes both, and the moment it does,
 * all three old cells stop being the best cell and two of them stop being good ones: the sword's
 * went 0.070 m to 0.253, the shield's 0.014 to 0.167. That is not the fix regressing the stroke,
 * it is a grid whose optimum was a property of the ring being re-read now the ring is gone --
 * the same thing that happened to `empty` on 2026-09-17 and was called the body's drift then.
 *
 * These rows are therefore **operating-point-dependent by construction**, which is worth stating
 * plainly rather than rediscovering a third time: any change to the wrist's conditioning, its
 * hinge ceilings or the anchor's authority invalidates all of them, and the honest response is to
 * re-run the 64 cells rather than to nudge a constant.
 *
 * Read on `missMetres` first and `speedAtMark` second, as before. What that rule buys and costs,
 * against the rows it replaces:
 *
 *     kind     was                          now                          best miss now reachable
 *     sword    0.070 m, 22.34 m/s, 8 mm     0.028 m, 15.30 m/s, 16 mm    0.009 m (at 12.64 m/s)
 *     shield   0.014 m, 11.10 m/s, 56 mm    0.059 m, 10.47 m/s, 33 mm    0.051 m (at  8.03 m/s)
 *     empty    0.108 m, 11.82 m/s, 64 mm    0.008 m, 12.62 m/s,  9 mm    0.008 m
 *
 * The sword lands two and a half times closer and arrives 7 m/s slower, and the trade is the
 * owner's, taken in advance: *"it's totally fine if attacks do less damage as a result of this
 * fix, because we can just adjust health downwards if that's a problem."* Peak tip speed on the
 * *shipped* shape moves the other way over the same change, 13.1 to 31.8 m/s, so the blade is
 * faster and the committed cell is simply one that spends less of that on the approach.
 *
 * **The shield is a real regression and is recorded as one.** 0.014 m is no longer available at
 * any cell of the grid; the best the plate can now do is 0.051 m. It keeps its stray, which
 * nearly halves, and it wants its own pass rather than a number borrowed from this one.
 */
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
 * **Nothing here asks the body to get up**: it rises on its own once its fall has settled
 * (`risingEligibility`). The `down` phase commands nothing, and `recover` walks forward once up.
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
  skeleton: skeletonBiped,
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
  /**
   * The stats the module is built at, as a setup carries them (`{ movement: 1.25 }`), or null for a
   * module built exactly as the bench always built it -- with no `attributes` in its context at all.
   */
  attributes = null,
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
    // here, so the two cannot disagree. A body at a size stat stands that much taller, which is the
    // arithmetic `Golem` does with the same field.
    socketHeight: definition.heightRange.standM * (attributes?.size ?? 1),
  });
  const prepared = prepare ? prepare({ scene, world, stand }) : null;
  const module = definition.build({
    scene, side, name: `golem.${side}.locomotion`, socket: stand.socket("locomotion"),
    layers: golemLayers(side), materials: stand.materials, world,
    ...(attributes ? { attributes: resolveAttributes({ attributes }) } : {}),
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
    // Straddling its own fall line along the push, 264.8 N.s at x1 (physical contact session 08,
    // Node locomotion bench), and on to the bench's own shove.
    shove: { block: LOCOMOTION_BIPED, key: "shoveImpulseNs",
      values: [200, 250, 280, 600, 1600], sequence: LOCOMOTION_SEQUENCE },
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
    // The bracket that matters: its line is 110.1 N.s against the biped's 264.8 (physical contact
    // session 08, Node locomotion bench), and 225 is the shove the biped survives and this does not.
    shove: { block: LOCOMOTION_WHEEL, key: "shoveImpulseNs",
      values: [80, 100, 120, 225, 800], sequence: LOCOMOTION_SEQUENCE },
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
    // Straddling its own line, 623.7 N.s, from the biped's 270 that fells a biped and leaves this
    // one standing (physical contact session 08, Node locomotion bench).
    shove: { block: LOCOMOTION_MULTILEG, key: "shoveImpulseNs",
      values: [270, 550, 600, 650, 700, 1200], sequence: LOCOMOTION_SEQUENCE },
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
  shoulderTorque: {
    block: CHAIN_REACH, key: "shoulderTorque",
    values: [100, 300, 600, 900, 1200, 1600], mark: "guard",
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
