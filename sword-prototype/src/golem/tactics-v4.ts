// Explicit `.ts` extensions, for the reason `tactics.ts` gives. **This file imports no value that
// is not `tactics.ts`, `tactics-v2.ts`, `tactics-v3.ts`, `pilot.ts`, `hands.ts` or `rng.ts`**, and
// none of those has a scene in it, so a whole bout of this executor's cadence can be stepped in
// front of a hand-written view.
import { isShield, type Striker, type WeaponKind } from "../hands.ts";
import { mulberry32 } from "../rng.ts";
import type { MyPhase } from "./duel-model.ts";
import type { BodyView, FighterView, HandIntent, HandName, Intent } from "../mind.ts";
import type { EffectorCapability, GolemCapabilities } from "./module.ts";
import {
  aimAt, angleTo, canAttack, canCover, canSwing, clamp, distance, freshGolemIntent, innerReach,
  mirror, reachForDistance, readyNatural, watch, writeAim,
  type Aim, type Point, type StrokeShape, type Threat,
} from "./tactics.ts";
import { slotHealth, strokeReader, type StrokePhase, type TargetSlot } from "./tactics-v2.ts";
import {
  COMMITTED_SHAPES, GOLEM_TACTICS_V3, THRUST_SHAPES, reachAt,
  type Intercept,
} from "./tactics-v3.ts";
import { askCadence, type Pilot, type PilotReading } from "./pilot.ts";

/**
 * The golem's fourth executor: a body whose command is a vector rather than a name.
 * Session 12 of the style set.
 *
 * ## Why a fourth file, and what it is for
 *
 * `tactics-v3.ts` names fifteen options and the fifteen are a partition. Choosing `cut` chooses a
 * stand-off, a lean, a target and a reach all at once, at values a table froze before the bout
 * started, so every style in the set is a different way of picking among the same fifteen frozen
 * bundles and the distance a mind holds is a constant rather than a thing it decides. A learned
 * policy over fifteen names cannot express *half a step closer than last time*, because no option
 * means that; Session 10's flat league is what that cost, measured. So the command here is nine
 * numbers and three gates, each clamped to its own range and each already something `writeAim` in
 * `tactics.ts` consumes.
 *
 * v3 does not move, for the reason v3 gave for not moving v2: four minds and three checked-in
 * artifacts -- the style tables, the style model and `LEARNER_LAYOUT` -- are keyed to fifteen
 * options and would be refused on load. The arithmetic that turns a mark into a hand command is
 * imported from `tactics.ts` exactly as v2 and v3 import it, and the two shape tables are imported
 * from v3 rather than copied, because a fourth copy of the envelope rule would be a fourth place
 * for it to be wrong. The state machine is written out again, because it is the thing that changes.
 *
 * ## The machine
 *
 * ```
 *   free ──(commit gate)──> chamber ──> commit ──> recover ──> free
 *    │                         │           │          ^
 *    │                         └───────────┴──────────┘   (the abort gate, at any point in either,
 *    │                                                      for half a cooldown)
 *    └──(the feet, the lean, the guard and the parry, written every step from the held command)
 * ```
 *
 * Five stances against v3's ten, and the five that are gone are the five that were bundles:
 * `circle`, `retreat`, `duck`, `feint` and `shove`. A circle is a strafe, a retreat is a negative
 * advance, a duck is a low target, and a feint is a stroke started and aborted -- which is the whole
 * argument of this session: the tactic is not gone, it has moved out of the executor and become
 * something a mind can *ask for by degree*.
 *
 * The chamber and the commit are two stances and not one clock, which is v3's arrangement copied
 * rather than tidied, and it is copied for two reasons that both showed up as a failing test. The
 * first: v3 restarts the clock at the transition, so the commit's first step is at `t` exactly zero
 * and not at `t` a frame's worth. The second: v3 decides which half of the arc it is writing from
 * the *stance* and transitions after writing, so the step on which the chamber's clock runs out
 * still writes the chamber's pose. A single clock handed to `driveStroke` gets both wrong by one
 * step in opposite directions, and one step of a hundred and forty is invisible in a bout and
 * exactly the thing this file promises did not happen.
 *
 * ## What is still derived, and why each one is
 *
 * Five things the mind does not write, all of them physics rather than tactics: the turn (a body
 * faces what it is fighting), the crouch (the carrier sinks when the mark is under the arm's
 * floor), the trunk twist through a stroke (the hips that drive the arc, scaled by how wide the
 * arc is), the guard's *bearing* (the cover points at their point; the mind writes how far out it
 * holds), and which hand acts (alternating, as v2 and v3 alternate). The last of those is the one
 * bundle left on the surface and is written down as such in the session's entry.
 *
 * ## What was dropped
 *
 * The combination -- v3's `comboFraction`, which starts the spare hand's stroke as the acting
 * hand's arc ends on a roll of the executor's own dice -- is not here. It is a reflex, and this
 * file has none; a mind that wants a two-hand flurry holds the commit gate and gets one, because
 * the preferred hand alternates after every stroke. What that costs is measured rather than
 * assumed, and the number is in `docs/measurements.md` under this session.
 */

// ------------------------------------------------------------------------------------- the numbers

/**
 * A table whose literal types are widened, so that `Object.assign(GOLEM_TACTICS_V4, {...})` from a
 * harness and `{ ...GOLEM_TACTICS_V4, askHz: 20 }` from a test both type-check against the same
 * shape a test reads back. v2's and v3's own copies of this, for the same reason.
 */
type Widened<T> = {
  -readonly [K in keyof T]: T[K] extends boolean ? boolean : T[K] extends number ? number : T[K];
};

/**
 * Every constant this executor has: v3's whole table, copied at load, and six rows of its own.
 *
 * *(Four until Session 07 of the learn set, which added `holdMetres` as a candidate behind a flag,
 * and five until Session 09, which added `holdMyReach` beside it. A count in prose is what this
 * directory keeps getting wrong when a row is appended under it.)*
 *
 * The copy is taken at load for the reason v3 takes its copy of v2's. A harness that moves
 * `GOLEM_TACTICS_V3` after this module has loaded moves the four styles and not this file, which
 * is the isolation those styles need; the price is that a *shared* row is reached by its bare name
 * on v2's table or v3's and never on this one, and a mind that drives this executor reaches its own
 * numbers through its own prefix instead. That is the same arrangement, and the same trap, v3 has.
 *
 * **Most of what is inherited is not read here**, and that is the point of the surface rather than
 * an oversight: `standOffFraction`, `holdFraction`, `patience`, `cutLean`, `circleSeconds`,
 * `voidStep`, `duckDepth` and two dozen others were the values the bundles were frozen at, and on
 * this executor every one of them is a number a mind writes. They stay on the table because a mind
 * built over this executor is welcome to read them as *defaults* -- `golem-driver` reads six --
 * and because a table that dropped them would make a control row against v3 unwritable.
 */
const DRIVEN = {
  ...GOLEM_TACTICS_V3,

  /**
   * Asks a second. `PILOT_HZ` is the argument for twelve; this row is how a run moves it.
   *
   * On the table rather than only in `pilot.ts` so that `--override driver.askHz=20` is a sweep,
   * which is the frozen rule every constant in this tree lives under. Zero means never, which is
   * a control condition and not a mistake: a body asked once at the start of the bout and never
   * again is what "the command is held between asks" costs at the limit.
   */
  askHz: 12,
  /**
   * What an abort charges, as a fraction of a cooldown.
   *
   * v3's `chamberAbort` charges half, and half is kept: an abort that cost nothing would make the
   * feint free, and a feint that is free is a stroke that is always shown and never thrown. The
   * cost is the whole reason the gate is a decision.
   */
  abortCooldown: 0.5,
  /**
   * The trunk twist a stroke sweeps, scaled by how wide the arc is.
   *
   * v3 writes `trunkSweep` through every chamber and commit whatever the stroke is, so a thrust
   * turns the hips as hard as a cut does. Here the twist is `trunkSweep` times the commanded
   * swing, which is zero for a point stroke and all of it for the committed cut -- the hips follow
   * the arc, which is what they are for. This row is the multiplier, so the two can be told apart
   * in a sweep.
   */
  sweepBySwing: 1,
  /**
   * Whether a stroke may be started with the mark outside this arm's strike range.
   *
   * On, and on is the executor giving up a gate rather than gaining one. v3 offers `strike` only
   * inside `strike` and `cut` only inside `strike + cutReachMetres`, which are tactics -- a stroke
   * thrown from too far away misses, and missing is a thing a mind should be allowed to do and be
   * charged a cooldown for. Off restores v3's gate at this executor's own strike range, which is
   * the control row for the claim that removing it is worth anything.
   */
  strokeOutOfRange: true,
  /**
   * Whether `standOff` is a distance in metres rather than a multiple of *their* published reach.
   *
   * Off, and off is what ships. This row is Session 07 of the learn set's first candidate, landed
   * behind a flag and measured by `scripts/axis-probe.mjs` before anything is asked to depend on it.
   *
   * **What it is for.** The zero of the action space is the midpoint of `COMMAND_RANGES.standOff`,
   * because `commandFromAction` centres an axis on the midpoint of the range it is given. Under the
   * reach multiple that zero is *one of somebody else's arms* -- so the same head output puts a body
   * at 1.45 m in front of a sword and at 2.2 m in front of a maul, and the axis a policy is fitted
   * on is a different physical distance in every matchup it meets. Under this flag the zero is
   * 1.0 m and stays 1.0 m whoever is standing there, and what the axis means stops being a fact
   * about the opponent.
   *
   * **Why a flag on this table and not a tenth axis.** A tenth axis widens `COMMAND_AXES`, which
   * bumps `POLICY_VERSION` and refuses every table fitted before it; a flag changes what an existing
   * axis *means* and the shipped table goes on loading and fighting exactly as it does today. The
   * cost of the cheaper form is stated rather than hidden: a mind cannot hold both readings at once,
   * so this is a choice made for a whole run and not a thing a policy can trade off inside a bout.
   * If a run ever wants both, that is the tenth axis and it is a version bump; Session 09's manifest
   * is where that argument belongs.
   *
   * The range does not move with the meaning, which is the one trap here. `COMMAND_RANGES.standOff`
   * is [0, 2] either way, so under this flag the reachable stand-offs are 0 to 2 **metres** -- which
   * covers every hold the set has measured (the fencer's shipped `standOffFraction` of 1.00 on a
   * 1.78 m golem arm is 1.78 m) and clips a mind that wanted to stand further out than two metres,
   * where under the multiple it could ask for 2 x 1.78. That clip is a real narrowing and is the
   * thing an arm against the unchanged surface has to pay for.
   */
  holdMetres: false,
  /**
   * Whether `standOff` is a multiple of *my own* reach rather than of theirs.
   *
   * Off, and off is what ships. Session 09 of the learn set's own candidate, and the one the whole
   * set's reading of the owner's complaint rests on -- so it is stated at length.
   *
   * **What the complaint was.** A stroke opens when the mark is inside a fraction of the acting
   * hand's own reach; Session 07 measured that fraction at 0.92 of *mine*. The axis that decides
   * where the feet stand is a multiple of *theirs*. So the number a policy writes and the number
   * that decides whether the stroke is thrown are denominated in two different bodies, and there is
   * no output on the current surface that means "just inside my own range" -- not because the head
   * is too small but because the coordinate does not exist. Over the viable pool that is not a
   * quibble: Session 07 found *their* reach spanning 17 % across the pool while *mine* spans a
   * factor of 3.4, so the axis a policy is fitted on is nearly constant in the quantity it is
   * written in and enormously variable in the quantity it has to be right about.
   *
   * **What this row does.** `hold = me.reach * standOff`. The zero of the action space -- the
   * midpoint of `COMMAND_RANGES.standOff`, which is 1.0 -- becomes exactly one of my own arms, and
   * 0.92 of it, the distance at which the stroke opens, is a fixed output the head can name once
   * and mean everywhere. A short-armed body asking for 0.92 stands close and a long-armed one
   * asking for 0.92 stands far, and both are asking the same tactical question.
   *
   * **Why a flag and not a tenth axis**, and why it is exclusive with `holdMetres`: the argument is
   * `holdMetres`'s, above, unchanged -- a flag changes what an existing axis means, so
   * `COMMAND_AXES` and `POLICY_VERSION` do not move and the shipped table goes on loading. The two
   * cannot both be up because they are two readings of one number; `holdMetres` wins if a harness
   * raises both, which is stated so that the tie is a documented choice rather than a source order.
   *
   * The clip is the same trap and a different size. `COMMAND_RANGES.standOff` is [0, 2] either way,
   * so under this flag the reachable stand-offs are 0 to twice my own reach -- which on the pool's
   * shortest arm is a narrower window in metres than the reach multiple gave and on its longest a
   * wider one. That is the narrowing an arm has to pay for.
   */
  holdMyReach: false,
};

/** Every constant this executor has. `Widened` is why a harness can assign a number to any row. */
export type DrivenTactics = Widened<typeof DRIVEN>;

export const GOLEM_TACTICS_V4: DrivenTactics = DRIVEN;

// ------------------------------------------------------------------------------------ the command

/**
 * What a mind writes: nine numbers and three gates.
 *
 * Every one of the nine is a quantity the body already consumes, in the vocabulary it already
 * publishes it in, so that nothing here is a new physical claim -- the surface is wider, not
 * different. Every one is clamped by the executor to the range in `COMMAND_RANGES` and the clamp
 * is counted, so a policy whose head has drifted out of the box is a number in the run's log and
 * not a body doing something impossible.
 *
 * **The three gates are numbers and not booleans**, and the executor thresholds them at a half.
 * That is deliberate: a policy with a Bernoulli head writes its probability and the sampling is
 * the *mind's*, so a mind that wants to explore samples before it writes and a mind that wants to
 * play greedy writes a one or a zero. The executor never rolls a die about a gate, because an
 * executor that rolled would be an executor with a tactic.
 */
export interface StyleCommand {
  /** Where to stand, as a multiple of *their* published reach. Zero is chest to chest. */
  standOff: number;
  /** Sideways, -1 left through +1 right, in my own frame. */
  strafe: number;
  /** Trunk lean, -1 back through +1 forward. */
  lean: number;
  /** Feet, added to whatever holding the stand-off asks for: -1 back through +1 forward. */
  advance: number;
  /** The mark, up their body: 0 the floor they stand on, 1 the crown of their head. */
  targetHeight: number;
  /** The mark, across their body: -1 to +1 of their own collision radius, their right positive. */
  targetLateral: number;
  /** How far out the acting hand holds its guard, on its own published shell: -1 in, +1 out. */
  reach: number;
  /** The arc: 0 a point driven straight out, 1 the committed cut Session 02 measured. */
  swing: number;
  /** Where along the terminal the mark is crossed: 0 the point on it, 1 the anchor on it. */
  bite: number;
  /** Start a stroke as soon as the arm is free. */
  commit: number;
  /** Abandon the stroke in flight, wherever it is, for `abortCooldown` of a cooldown. */
  abort: number;
  /** Send the spare hand to where their point crosses my guard shell. */
  parry: number;
}

/** The nine continuous axes, in the order a policy head would emit them. */
export const COMMAND_AXES = [
  "standOff", "strafe", "lean", "advance", "targetHeight", "targetLateral", "reach", "swing", "bite",
] as const;

/** The three gates, in the order a policy head would emit them. */
export const COMMAND_GATES = ["commit", "abort", "parry"] as const;

/**
 * What each axis will accept. Outside it the value is clamped and the refusal counted.
 *
 * `standOff` is the only one whose roof is not a physical one, and Session 14's calibration moved
 * it from 3 to 2. The argument for 3 was that a mind asking for more is asking to leave rather
 * than to stand somewhere, which is true and was not the number that mattered: a policy head is
 * read through `commandFromAction`, which centres an axis on the **midpoint** of the range it is
 * given, so a roof of 3 puts the zero of the action space at 1.5 of the opponent's reach. A stroke
 * opens at `max(reach * strikeFraction, near + slack)` with `strikeFraction` 0.92, and the feet
 * settle at `hold - advance / closeGain` with `closeGain` 1.8, so from that zero a saturated
 * `advance` still leaves a body at 1.19 of their reach and unable to touch them. A roof of 2 puts
 * the zero at `freshCommand`'s neutral of 1 and the fencer's shipped `standOffFraction` of 1.00,
 * which is a place a fight happens; 2 is still a stand-off no weapon in the set can cross. The
 * measurement is in `docs/measurements.md` under Session 14's calibration, and moving this number
 * is what `POLICY_VERSION` 2 refuses a version-1 table for.
 *
 * The rest are the ranges the channels themselves publish -- `writeAim`'s reach axis is -1 to +1, a
 * posture axis is -1 to +1, a bite is a fraction of an overhang -- and the swing is 0 to 1 because
 * it is a blend of two measured shapes and there is nothing outside them to blend toward.
 */
export const COMMAND_RANGES: Readonly<Record<keyof StyleCommand, readonly [number, number]>> =
  Object.freeze({
    standOff: [0, 2], strafe: [-1, 1], lean: [-1, 1], advance: [-1, 1],
    targetHeight: [0, 1], targetLateral: [-1, 1], reach: [-1, 1], swing: [0, 1], bite: [0, 1],
    commit: [0, 1], abort: [0, 1], parry: [0, 1],
  });

/**
 * The command a body is driven with before any mind has spoken, and the one a refused field falls
 * back to: stand at their reach, face them, hold the guard out, want nothing.
 *
 * It is a function and not a frozen constant because a pilot is expected to fill one of these in
 * place at twelve hertz and hand the same object back, which is what keeps the surface free of
 * allocation.
 */
export const freshCommand = (): StyleCommand => ({
  standOff: 1, strafe: 0, lean: 0, advance: 0,
  targetHeight: 0.5, targetLateral: 0, reach: 0, swing: 1, bite: 0.66,
  commit: 0, abort: 0, parry: 0,
});

/** How many times each field arrived outside its range, or as something that is not a number. */
export type CommandRefusals = Record<keyof StyleCommand, number>;

const freshRefusals = (): CommandRefusals => ({
  standOff: 0, strafe: 0, lean: 0, advance: 0, targetHeight: 0, targetLateral: 0,
  reach: 0, swing: 0, bite: 0, commit: 0, abort: 0, parry: 0,
});

/** What a stroke is running on: a shape the swing command has already been blended into. */
type Arc = { -readonly [K in keyof StrokeShape]: StrokeShape[K] };

const freshArc = (): Arc => ({
  chamberSwing: 0, chamberLift: 0, chamberReach: 0, followSwing: 0, followLift: 0,
  strokeSeconds: 0, chamberSeconds: 0, stepIn: 0, windRoll: 0, roll: 0,
});

/**
 * Blend the point stroke into the committed cut at `swing`, into `into`.
 *
 * The two ends are measurements and the middle is a straight line between them: at 0 the arm runs
 * its anchor out along the aim with the point on the mark and no arc at all, at 1 it sweeps the
 * shape Session 02's bench found for this terminal, and every ratio between is a real pose the arm
 * can hold because both ends are and every field of a `StrokeShape` is an offset or a duration.
 *
 * Exported so that a test can ask what an arc *would* be without standing a body up, which is how
 * "swing 1.0 is v3's committed cut to the digit" is checked.
 */
export function blendArc(kind: WeaponKind, swing: number, into: Arc = freshArc()): Arc {
  const point = THRUST_SHAPES[kind];
  const cut = COMMITTED_SHAPES[kind];
  const s = clamp(swing, 0, 1);
  // `(1 - s)a + sb` rather than `a + s(b - a)`, and the difference is the whole of what this
  // function promises: the second form returns `-0.20000000000000007` where the committed cut says
  // `-0.2`, so a swing of one would be an arc a rounding away from the one Session 02 measured and
  // the bench rows would describe a stroke that no longer exists. This form is exact at both ends.
  const mix = (a: number, b: number): number => (1 - s) * a + s * b;
  into.chamberSwing = mix(point.chamberSwing, cut.chamberSwing);
  into.chamberLift = mix(point.chamberLift, cut.chamberLift);
  into.chamberReach = mix(point.chamberReach, cut.chamberReach);
  into.followSwing = mix(point.followSwing, cut.followSwing);
  into.followLift = mix(point.followLift, cut.followLift);
  into.strokeSeconds = mix(point.strokeSeconds, cut.strokeSeconds);
  into.chamberSeconds = mix(point.chamberSeconds, cut.chamberSeconds);
  into.stepIn = mix(point.stepIn, cut.stepIn);
  into.windRoll = mix(point.windRoll, cut.windRoll);
  into.roll = mix(point.roll, cut.roll);
  return into;
}

// ------------------------------------------------------------------------------------ the machine

/** The stances this machine has. Five, against v3's ten. */
export type DrivenStance = "free" | "chamber" | "commit" | "recover" | "ram";

/** What the executor exposes to a test, to an instrument and to the mind that drives it. */
export interface GolemDriven {
  readonly stance: DrivenStance;
  /** Their arm's phase as read, which is `strokeReader`'s answer and not mine. */
  readonly phase: StrokePhase;
  readonly reading: PilotReading;
  /** The command in force: the last one asked for, clamped. */
  readonly command: Readonly<StyleCommand>;
  readonly refusals: Readonly<CommandRefusals>;
  /** How many asks have been taken, and how many of those were events rather than the clock. */
  readonly asks: number;
  readonly events: number;
  /** Strokes started, strokes abandoned, and whether the spare is holding a parry this step. */
  readonly strokes: number;
  readonly aborts: number;
  readonly parrying: boolean;
  decide(view: FighterView, dt: number): Intent;
}

const TARGET_SLOTS: readonly TargetSlot[] = Object.freeze(
  ["trunk", "head", "primary", "secondary", "locomotion"],
);

/**
 * The hand `watch` picked, by name. v3's `watchedHand`, written out again for the reason v3 wrote
 * it out: the rule is `watch`'s own, and a second exported reader of `hands` would be a second rule.
 */
function watchedHand(them: BodyView): HandName {
  let best: HandName | null = null;
  for (const name of ["primary", "secondary"] as const) {
    const hand = them.hands[name];
    if (hand.lost || isShield(hand.weapon)) continue;
    if (best === null || hand.tipSpeed > them.hands[best].tipSpeed) best = name;
  }
  return best ?? "primary";
}

/** Where a slot is on the other body, in the command's own coordinates: height up, lateral across. */
function slotCommand(them: BodyView, slot: TargetSlot, into: { height: number; lateral: number }): void {
  const rise = them.crownHeight - them.ground.y;
  const scale = rise > 1e-6 ? rise : 1;
  const radius = them.collisionRadius > 1e-6 ? them.collisionRadius : 1;
  const rightX = Math.cos(them.facing), rightZ = -Math.sin(them.facing);
  let y = them.shoulder.y;
  let dx = 0, dz = 0;
  switch (slot) {
    case "head":
      y = (them.crownHeight + them.shoulder.y) / 2;
      break;
    case "primary":
    case "secondary": {
      const hand = them.hands[slot];
      y = hand.shoulder.y;
      dx = hand.shoulder.x - them.ground.x;
      dz = hand.shoulder.z - them.ground.z;
      break;
    }
    case "locomotion":
      y = them.ground.y + (them.shoulder.y - them.ground.y) * 0.45;
      break;
    default:
      break;
  }
  into.height = clamp((y - them.ground.y) / scale, 0, 1);
  into.lateral = clamp((dx * rightX + dz * rightZ) / radius, -1, 1);
}

/**
 * The fourth executor. A seed for the one roll it still makes, a table, and a pilot.
 *
 * **The pilot is required**, for the reason v3's director is: a null pilot is a body with no mind,
 * and answering it with a default command would put a tactic in the executor under the name "the
 * default". The seed is still drawn because one roll survives -- the fallback side a circle takes
 * when the two bodies are exactly nose to nose and no side can be read, which is a coordinate and
 * not a tactic. The cooldown offset v2 and v3 draw is *not* drawn here: this executor's first ask
 * is on the first step, so two golems on the same frame diverge as soon as their minds do.
 */
export function golemDriven(
  seed: number, T: DrivenTactics = GOLEM_TACTICS_V4, pilot: Pilot | null = null,
): GolemDriven {
  if (pilot === null) {
    throw new Error("golemDriven: this executor has no tactics of its own and was handed no pilot");
  }
  const random = mulberry32(seed);
  const intent = freshGolemIntent();
  const reader = strokeReader(T);
  const cadence = askCadence(T.askHz);

  const aim: Aim = { swing: 0, lift: 0, horizontal: 0 };
  const cover: Aim = { swing: 0, lift: 0, horizontal: 0 };
  const spareAim: Aim = { swing: 0, lift: 0, horizontal: 0 };
  const probeAim: Aim = { swing: 0, lift: 0, horizontal: 0 };
  const threat: Threat = {
    tip: { x: 0, y: 0, z: 0 }, shoulder: { x: 0, y: 0, z: 0 }, tipSpeed: 0, weapon: "empty", reach: 0,
  };
  const mark: Point = { x: 0, y: 0, z: 0 };
  const guardMark: Point = { x: 0, y: 0, z: 0 };
  const probe: Point = { x: 0, y: 0, z: 0 };
  /** Where the parry is being sent: the intercept, or the closest approach, or the wall. */
  const meeting: Point = { x: 0, y: 0, z: 0 };
  const healthBySlot: Record<TargetSlot, number> = {
    trunk: 1, head: 1, primary: 1, secondary: 1, locomotion: 1,
  };
  const weakestAt = { height: 0.5, lateral: 0 };
  const arc = freshArc();

  const command = freshCommand();
  const refusals = freshRefusals();

  let attacker: HandName = "primary";
  let prefer: HandName = "primary";
  let nextPrefer: HandName = "secondary";
  /** How wide the arc in flight is, which is what the trunk's sweep is scaled by. */
  let arcSwing = 0;

  let stance: DrivenStance = "free";
  let elapsed = 0;
  let justEntered = false;
  let inside = false;
  let cooldown = 0;
  let strokes = 0;
  let aborts = 0;
  /** The side a circle takes when their armed side cannot be read; the one surviving coin. */
  const fallbackSide = random() < 0.5 ? -1 : 1;

  let gapRate = 0;
  let lastGap = -1;
  let ramFired = false;
  let ramFiredAt = 0;

  let theirsSeconds = 0;
  let mineSeconds = 0;
  let theirCommits = 0;
  let sinceTheirCommit = Number.POSITIVE_INFINITY;
  let sinceMyStroke = Number.POSITIVE_INFINITY;
  let sinceContact = Number.POSITIVE_INFINITY;
  let lastRhythmTheirs: StrokePhase = "idle";
  let lastMine: MyPhase = "free";
  let lastVitalities = -1;
  let lastTheirs: StrokePhase = "idle";

  let parrying = false;
  let intercept: Intercept | null = null;

  const reading: PilotReading = {
    gap: 0, strike: 0, slack: 0, gapRate: 0, theirWeapon: "empty", myWeapon: "empty",
    theirs: "idle", mine: "free",
    near: 0, hold: 0, theirReach: 0, inside: false, cooldown: 0,
    sinceTheirExchange: Number.POSITIVE_INFINITY, lead: 0, weakestSlot: "trunk", intercept: null,
    longer: false, shorter: false, headfirst: false, paired: false, spareCanCover: false,
    theirsSeconds: 0, mineSeconds: 0, theirCommits: 0,
    sinceTheirCommit: Number.POSITIVE_INFINITY, sinceMyStroke: Number.POSITIVE_INFINITY,
    sinceContact: Number.POSITIVE_INFINITY,
    myReach: 0, armed: false, circleSide: 1, voidAxis: 0, weakestHeight: 0.5, weakestLateral: 0,
  };

  const goTo = (next: DrivenStance): void => {
    stance = next;
    elapsed = 0;
    justEntered = true;
    ramFired = false;
    ramFiredAt = 0;
  };

  /**
   * Take one field of what the pilot wrote, clamped, and count the refusal if there was one.
   *
   * A field that is not a finite number is refused to the neutral command's value rather than to
   * the nearer end of the range, because there is no nearer end of the range to a NaN and a body
   * driven by one would be a body with an undefined pose for the rest of the bout.
   */
  const neutral = freshCommand();
  const take = (field: keyof StyleCommand, raw: number): void => {
    const [low, high] = COMMAND_RANGES[field];
    if (!Number.isFinite(raw)) {
      refusals[field] += 1;
      command[field] = neutral[field];
      return;
    }
    if (raw < low || raw > high) refusals[field] += 1;
    command[field] = raw < low ? low : raw > high ? high : raw;
  };

  const chooseAttacker = (self: BodyView, caps: GolemCapabilities, want: HandName): HandName => {
    const other: HandName = want === "primary" ? "secondary" : "primary";
    const able = (name: HandName): boolean =>
      !self.hands[name].lost && canAttack(caps.effectors[name]);
    const armedWith = (name: HandName): boolean => able(name) && !isShield(self.hands[name].weapon);
    if (armedWith(want)) return want;
    if (armedWith(other)) return other;
    if (able(want)) return want;
    if (able(other)) return other;
    return self.hands[want].lost && !self.hands[other].lost ? other : want;
  };

  /** How far out this hand's cover is held, by what it is and what it is meeting. v2's rule. */
  const coverReachFor = (weapon: Striker, theirs: WeaponKind): number =>
    isShield(weapon) ? T.shieldReach : T.guardByTheirs ? T.guardReachVs[theirs] : T.guardReach;

  /** Where a slot is in the world, so that reachability can be asked about it. v3's `slotMark`. */
  const slotMark = (them: BodyView, slot: TargetSlot, into: Point): Point => {
    into.x = them.ground.x;
    into.z = them.ground.z;
    switch (slot) {
      case "head":
        into.y = (them.crownHeight + them.shoulder.y) / 2;
        break;
      case "primary":
      case "secondary": {
        const hand = them.hands[slot];
        into.x = hand.shoulder.x; into.y = hand.shoulder.y; into.z = hand.shoulder.z;
        break;
      }
      case "locomotion":
        into.y = them.shoulder.y * 0.45;
        break;
      default:
        into.y = them.shoulder.y;
    }
    return into;
  };

  /**
   * The slot of theirs with the least health that this hand could actually be sent to. v3's, and
   * with only the second of v3's two jobs: nothing here aims at it, and the mind is told where it
   * is. `targetByHealth` and `targetMargin` are still on the table and are still read -- by a
   * *mind*, as defaults for what to write into the target -- and no longer by the executor.
   */
  const weakestReachable = (
    them: BodyView, socket: Point, reach: number, cap: EffectorCapability, heading: number,
    outboard: number,
  ): TargetSlot => {
    slotHealth(them.health, healthBySlot);
    let best: TargetSlot = "trunk";
    let bestHealth = healthBySlot.trunk > 0 ? healthBySlot.trunk : 1;
    for (const slot of TARGET_SLOTS) {
      if (slot === "trunk") continue;
      const health = healthBySlot[slot];
      if (health <= 0 || health >= bestHealth) continue;
      if ((slot === "primary" || slot === "secondary") && them.hands[slot].lost) continue;
      slotMark(them, slot, probe);
      if (distance(socket, probe) > reach) continue;
      aimAt(socket, probe, heading, outboard, probeAim);
      const shell = cap.reachable;
      if (shell && (probeAim.lift < shell.liftMin - 0.35 || probeAim.lift > shell.liftMax + 0.05)) continue;
      best = slot;
      bestHealth = health;
    }
    return best;
  };

  /**
   * One hand's stroke, written from its own clock. v3's arc, unchanged in every arithmetic detail,
   * which is what makes "a stroke at swing 1.0 is v3's cut to the digit" true of the whole stroke
   * and not only of the shape it started from.
   *
   * **Which half it writes is the stance and not the clock**, which is why `chambering` is an
   * argument rather than a comparison inside. v3 writes its two halves in two stance blocks and
   * `run` restarts at the transition; a version that read `run < chamberSeconds` instead would put
   * the first step of the sweep on the last step of the wind-up, and the arc would be one frame
   * short of the one Session 02 measured.
   */
  const driveStroke = (
    hand: HandIntent, cap: EffectorCapability, outboard: number,
    at: Aim, shape: StrokeShape, chambering: boolean, run: number, strikeReach: number,
  ): void => {
    const swept = canSwing(cap) ? 1 : 0;
    if (chambering) {
      hand.guard = false;
      hand.thrust = false;
      writeAim(hand, cap, at, outboard,
        swept * shape.chamberSwing, shape.chamberLift, 1, shape.chamberReach);
      hand.roll = cap.rollMax > 0 ? clamp(shape.windRoll, -cap.rollMax, cap.rollMax) : 0;
      return;
    }
    const t = shape.strokeSeconds > 0 ? clamp(run / shape.strokeSeconds, 0, 1) : 1;
    hand.guard = false;
    hand.thrust = true;
    writeAim(hand, cap, at, outboard,
      swept * (shape.chamberSwing - t * (shape.chamberSwing + shape.followSwing)),
      shape.chamberLift - t * (shape.chamberLift + shape.followLift),
      0,
      shape.chamberReach + t * (strikeReach - shape.chamberReach));
    hand.roll = cap.rollMax > 0 ? clamp(shape.roll, -cap.rollMax, cap.rollMax) : 0;
  };

  /** Where their point crosses my guard shell, or the closest it comes to it. v3's solve. */
  const solveIntercept = (tip: Point, vel: Point, socket: Point, r: number): Intercept | null => {
    const wx = tip.x - socket.x, wy = tip.y - socket.y, wz = tip.z - socket.z;
    const a = vel.x * vel.x + vel.y * vel.y + vel.z * vel.z;
    if (a < 1e-6) return null;
    const half = wx * vel.x + wy * vel.y + wz * vel.z;
    if (half >= 0) return null;
    const c = wx * wx + wy * wy + wz * wz - r * r;
    const disc = half * half - a * c;
    let t = -1;
    if (disc >= 0) {
      const root = Math.sqrt(disc);
      const first = (-half - root) / a;
      const second = (-half + root) / a;
      t = first > 0 ? first : second > 0 ? second : -1;
    }
    if (t < 0 || t > T.parryHorizon) {
      const closest = -half / a;
      if (closest <= 0) return null;
      const qx = tip.x + vel.x * closest, qy = tip.y + vel.y * closest, qz = tip.z + vel.z * closest;
      const miss = Math.hypot(qx - socket.x, qy - socket.y, qz - socket.z);
      if (t < 0 && miss > r + T.parryMargin) return null;
      meeting.x = qx; meeting.y = qy; meeting.z = qz;
      return { t: closest, distance: miss, wall: false };
    }
    meeting.x = tip.x + vel.x * t;
    meeting.y = tip.y + vel.y * t;
    meeting.z = tip.z + vel.z * t;
    return {
      t, distance: Math.hypot(meeting.x - socket.x, meeting.y - socket.y, meeting.z - socket.z),
      wall: false,
    };
  };

  /** The point on my guard shell on the bearing of their drawn tip. v3's wall. */
  const wallAt = (tip: Point, socket: Point, r: number): Intercept | null => {
    const dx = tip.x - socket.x, dy = tip.y - socket.y, dz = tip.z - socket.z;
    const span = Math.hypot(dx, dy, dz);
    if (span < 1e-6) return null;
    meeting.x = socket.x + dx / span * r;
    meeting.y = socket.y + dy / span * r;
    meeting.z = socket.z + dz / span * r;
    return { t: 0, distance: r, wall: true };
  };

  const plan = (view: FighterView, dt: number): void => {
    const self = view.self;
    const them = view.opponent;
    const caps = self.capabilities;
    if (!caps) return;

    const trunkHeading = self.facing + self.trunkTwist * caps.trunkTwistMax;

    attacker = caps.pairedHands ? "primary" : chooseAttacker(self, caps, prefer);
    const spare: HandName = attacker === "primary" ? "secondary" : "primary";
    intent.actingHand = attacker;
    const cap = caps.effectors[attacker];
    const spareCap = caps.effectors[spare];
    const hand = intent[attacker];
    const off = intent[spare];
    const me = self.hands[attacker];
    const socket = me.shoulder;
    const reach = me.reach;

    // ---- what their business end is doing, and their arm's phase -----------------------------
    watch(them, threat);
    const watched = watchedHand(them);
    const tipGap = distance(threat.tip, socket);
    if (lastGap >= 0 && dt > 0) {
      const rate = (tipGap - lastGap) / dt;
      gapRate += (rate - gapRate) * (1 - Math.exp(-12 * dt));
    }
    lastGap = tipGap;
    const theirs = reader.update(
      threat.reach > 0 ? distance(threat.tip, threat.shoulder) / threat.reach : 1, gapRate, dt);
    const theirWeapon = threat.weapon;

    // ---- the reach pair, the body, and the two distances that are facts about the arm ---------
    const longer = reach > them.reach * (1 + T.reachEdge);
    const shorter = reach < them.reach * (1 - T.reachEdge);
    const bodyGap = Math.hypot(them.ground.x - self.ground.x, them.ground.z - self.ground.z);
    const natural = readyNatural(self);
    const headfirst = natural !== null && !canAttack(cap) && !canAttack(spareCap);
    const paired = caps.pairedHands;
    const slack = headfirst ? natural.reach * T.slackFraction : reach * T.slackFraction;
    const near = headfirst ? 0 : innerReach(reach, cap);
    const strike = headfirst ? natural.reach + T.ramLunge : Math.max(reach * T.strikeFraction, near + slack);
    const gap = headfirst ? bodyGap : distance(socket, them.shoulder);
    // **The stand-off is the mind's and the executor floors it at nothing.** v2 and v3 floor a
    // hold at `max(reach * holdFraction, near + slack, theirReach * standOffFraction)`, and two of
    // those three are tactics: standing inside my own inner radius is a place a body may stand and
    // a place from which it cannot hit, which is a thing to be *charged* for and not forbidden.
    // What is left is a multiple of what the body in front publishes, which is the command.
    //
    // **Unless `holdMetres` is up**, in which case the command *is* the distance and the body in
    // front is not consulted at all -- see that row's own note for why an absolute stand-off is a
    // candidate. **Or `holdMyReach`**, in which case it is a multiple of the acting hand's own
    // reach instead of theirs, which is the coordinate the stroke's own gate is already written in.
    // `holdMetres` wins if both are up; see its row. Said once, here, and read twice below, because
    // the two readings of the stand-off are the reading the ask was taken at and the reading the ask
    // just wrote and they must be the same arithmetic or the mind is told about a hold it is not
    // being driven to.
    const holdFor = (standOff: number): number => (
      T.holdMetres ? standOff : (T.holdMyReach ? reach : them.reach) * standOff
    );
    let hold = holdFor(command.standOff);

    if (T.closeOnRecover && shorter && !headfirst) {
      const ownStrike = Math.max(reach * T.strikeFraction, near + slack * 2);
      if (!inside && gap <= ownStrike) inside = true;
      else if (inside && gap > ownStrike + reach * T.insideSlack) inside = false;
    } else {
      inside = false;
    }
    if (cooldown > 0) cooldown -= dt;

    // ---- the two sides: theirs, and the one off the line of their point -----------------------
    // v3's geometry exactly, and published on the reading rather than acted on. `outboard` is +1 on
    // their own right and the local X axis of a body is its right in the world, so their armed side
    // is `outboard` times their own right and their spare side is the other one, projected onto my
    // strafe axis. Nose to nose with a body whose sides read equally, the coin.
    const myRightX = Math.cos(self.facing), myRightZ = -Math.sin(self.facing);
    const theirRightX = Math.cos(them.facing), theirRightZ = -Math.sin(them.facing);
    const theirOutboard = them.hands[watched].outboard;
    const spareDot = -theirOutboard * (theirRightX * myRightX + theirRightZ * myRightZ);
    const circleSide = Math.abs(spareDot) < 1e-6 ? fallbackSide : spareDot > 0 ? 1 : -1;

    const tipVelocity = them.hands[watched].tipVelocity;
    let voidAxis = fallbackSide;
    const floorSpeed = Math.hypot(tipVelocity.x, tipVelocity.z);
    if (floorSpeed > 1e-3) {
      const nx = tipVelocity.z / floorSpeed, nz = -tipVelocity.x / floorSpeed;
      const offset = nx * (socket.x - threat.tip.x) + nz * (socket.z - threat.tip.z);
      const away = Math.abs(offset) < 1e-4 ? fallbackSide : offset > 0 ? 1 : -1;
      voidAxis = away * (nx * myRightX + nz * myRightZ);
    }

    const towardLength = distance(socket, them.shoulder) || 1;
    if (tipGap < towardLength) {
      guardMark.x = threat.tip.x; guardMark.y = threat.tip.y; guardMark.z = threat.tip.z;
    } else {
      guardMark.x = them.ground.x; guardMark.y = them.shoulder.y; guardMark.z = them.ground.z;
    }
    // ---- the spare hand's shell, and whether their point crosses it -----------------------------
    const spareLost = self.hands[spare].lost;
    const spareCanCover = !paired && !spareLost && canCover(spareCap);
    const spareSocket = self.hands[spare].shoulder;
    const spareReach = self.hands[spare].reach;
    const shellRadius = spareCanCover
      ? reachAt(coverReachFor(self.hands[spare].weapon, theirWeapon), spareReach, spareCap) : 0;
    intercept = spareCanCover && !headfirst
      ? solveIntercept(threat.tip, tipVelocity, spareSocket, shellRadius) : null;
    if (intercept === null && T.wallOnChamber && spareCanCover && !headfirst && theirs === "chamber") {
      intercept = wallAt(threat.tip, spareSocket, shellRadius);
    }
    // A parry has no timer here and v3's `parryRelease` is gone with the rest of the reflexes: the
    // gate is re-asserted twelve times a second, so what "released" means is that there is no
    // longer anything to meet. That is one of the three events, and it is read before the ask so
    // that the ask it fires is the one that sees the release.
    const parryPossible = spareCanCover && !headfirst && intercept !== null;
    const released = parrying && !parryPossible;

    // ---- the rhythm, advanced once a step and read at the ask -----------------------------------
    const mine: MyPhase = stance === "recover" ? "recover" : stance === "free" ? "free" : "exchange";
    theirsSeconds = theirs === lastRhythmTheirs ? theirsSeconds + dt : 0;
    mineSeconds = mine === lastMine ? mineSeconds + dt : 0;
    if (theirs === "commit" && lastRhythmTheirs !== "commit") { theirCommits += 1; sinceTheirCommit = 0; }
    else sinceTheirCommit += dt;
    lastRhythmTheirs = theirs;
    lastMine = mine;
    sinceMyStroke += dt;
    const vitalities = self.vitality + them.vitality;
    if (lastVitalities >= 0 && vitalities < lastVitalities - 1e-9) sinceContact = 0;
    else sinceContact += dt;
    lastVitalities = vitalities;

    // ---- what the pilot reads --------------------------------------------------------------------
    const canHand = !headfirst && canAttack(cap) && !self.hands[attacker].lost;
    const armed = cooldown <= 0 && (canHand || (headfirst && natural !== null));
    reading.gap = gap;
    reading.strike = strike;
    reading.slack = slack;
    reading.gapRate = gapRate;
    reading.theirWeapon = theirWeapon;
    reading.myWeapon = me.weapon;
    reading.theirs = theirs;
    reading.mine = mine;
    reading.near = near;
    reading.hold = hold;
    reading.theirReach = them.reach;
    reading.myReach = headfirst && natural !== null ? natural.reach : reach;
    reading.inside = inside;
    reading.cooldown = Math.max(0, cooldown);
    reading.sinceTheirExchange = reader.sinceExchange;
    reading.lead = self.vitality - them.vitality;
    reading.weakestSlot = headfirst || !canHand ? "trunk"
      : weakestReachable(them, socket, reach, cap, trunkHeading, me.outboard);
    slotCommand(them, reading.weakestSlot, weakestAt);
    reading.weakestHeight = weakestAt.height;
    reading.weakestLateral = weakestAt.lateral;
    reading.intercept = intercept;
    reading.longer = longer;
    reading.shorter = shorter;
    reading.headfirst = headfirst;
    reading.paired = paired;
    reading.spareCanCover = spareCanCover;
    reading.armed = armed;
    reading.circleSide = circleSide;
    reading.voidAxis = voidAxis;
    reading.theirsSeconds = theirsSeconds;
    reading.mineSeconds = mineSeconds;
    reading.theirCommits = theirCommits;
    reading.sinceTheirCommit = sinceTheirCommit;
    reading.sinceMyStroke = sinceMyStroke;
    reading.sinceContact = sinceContact;

    // ---- the ask ---------------------------------------------------------------------------------
    // Twelve a second, plus the three events v3 asks on: their read phase turning, my exchange
    // ending, a parry releasing. The exchange-ended event is armed where the recover ends, below,
    // which is a step earlier than this line runs -- so it arrives as a `cadence.arm()` and not as
    // a flag, and that is why there are two ways in and not one.
    const phaseTurned = theirs !== lastTheirs;
    lastTheirs = theirs;
    const eventAsk = T.eventAsks && (phaseTurned || released);
    if (cadence.step(dt, eventAsk)) {
      const wanted = pilot(reading, view);
      take("standOff", wanted.standOff);
      take("strafe", wanted.strafe);
      take("lean", wanted.lean);
      take("advance", wanted.advance);
      take("targetHeight", wanted.targetHeight);
      take("targetLateral", wanted.targetLateral);
      take("reach", wanted.reach);
      take("swing", wanted.swing);
      take("bite", wanted.bite);
      take("commit", wanted.commit);
      take("abort", wanted.abort);
      take("parry", wanted.parry);
    }

    // ---- everything the command drives, written after the ask and never before it ---------------
    // **The order here is the one defect this file was written twice to avoid.** Written the
    // obvious way -- mark, aim and feet with the rest of the reading, then the ask, then the
    // stances -- the first step of every stroke aims at the mark the *previous* command asked for,
    // because the arc is driven from an `aim` computed a dozen lines before the pilot said where to
    // put it. It is one frame in a hundred and forty and it is invisible in a bout, and it is also
    // the difference between a swing of one being v3's committed cut and being something a
    // rounding away from it, which is the promise the whole surface rests on. So the reading is
    // built from what the body publishes, the pilot is asked, and only then is a single line of
    // this executor's output written.
    // ---- the mark, which is a command and not a slot -------------------------------------------
    // Resolved against what the body in front publishes and nothing else: the floor it stands on,
    // the crown of its head, the way it is facing and the radius it takes up. A mind that wants
    // its weakest part writes the two numbers the reading gives it; a mind that wants its knee
    // writes a low height. No module id crosses this seam, which is frozen rule 1 of the set.
    const rise = them.crownHeight - them.ground.y;
    const radius = them.collisionRadius > 1e-6 ? them.collisionRadius : 1;
    const rightX = Math.cos(them.facing), rightZ = -Math.sin(them.facing);
    const across = command.targetLateral * radius;
    mark.x = them.ground.x + rightX * across;
    mark.z = them.ground.z + rightZ * across;
    mark.y = them.ground.y + command.targetHeight * (rise > 1e-6 ? rise : them.shoulder.y - them.ground.y);

    aimAt(socket, mark, trunkHeading, me.outboard, aim);
    const strikeReach = reachForDistance(distance(socket, mark), reach, cap, command.bite);

    // ---- the feet and the posture, all four axes from the command ------------------------------
    // The stand-off is read a second time, because the one above it is the hold the reading was
    // taken at -- where this body is standing off *now*, which is what a mind asking "am I where I
    // meant to be" has to be told -- and this one is the hold the command just written asks for.
    hold = holdFor(command.standOff);
    const bearing = Math.atan2(them.ground.x - self.ground.x, them.ground.z - self.ground.z);
    intent.turn = clamp(angleTo(self.facing, bearing) * T.turnGain, -1, 1);
    const keepHold = clamp((gap - hold) * T.closeGain, -1, 1);
    intent.forward = clamp(keepHold + command.advance, -1, 1);
    intent.strafe = clamp(command.strafe, -1, 1);
    intent.posture.trunkTwist = 0;
    intent.posture.trunkLean = clamp(command.lean, -1, 1);
    intent.posture.crouch = 0;
    if (cap.reachable && caps.crouchTravel > 1e-6) {
      const shortfall = (cap.reachable.liftMin - aim.lift) * aim.horizontal;
      intent.posture.crouch = clamp(shortfall / caps.crouchTravel, 0, 1);
    }
    intent.natural.guard = true;
    intent.natural.thrust = false;

    parrying = parryPossible && command.parry >= 0.5;

    // ---- the gates, read every step from the command in force -------------------------------------
    // Held rather than read only at the ask, because a command is a standing order: `commit` at one
    // means "as soon as the arm is free", which is v3's `wait` option written as a number, and a
    // mind that holds it throws with alternate hands as fast as the cooldown allows.
    const striking = stance === "chamber" || stance === "commit" || stance === "ram";
    if (striking && command.abort >= 0.5) {
      aborts += 1;
      cooldown = T.cooldown * T.abortCooldown;
      goTo("free");
    } else if (stance === "free" && command.commit >= 0.5 && cooldown <= 0) {
      if (headfirst && natural !== null) {
        strokes += 1;
        sinceMyStroke = 0;
        goTo("ram");
      } else if (canHand && (T.strokeOutOfRange || gap <= strike)) {
        arcSwing = clamp(command.swing, 0, 1);
        blendArc(me.weapon, arcSwing, arc);
        // v3's three swept rows laid over the two ends of the blend, for the same reason v3 lays
        // them over its two shapes: `strokeSeconds` and `stepIn` in `THRUST_SHAPES` are documented
        // placeholders, and `cutSeconds` is the one axis of `COMMITTED_SHAPES` that is swept from
        // the table rather than read off the bench. Dropping them here would leave three rows on
        // this executor's table that `--override` could move and nothing would read, which is a
        // worse thing to ship than the four lines.
        const point = THRUST_SHAPES[me.weapon];
        const cut = COMMITTED_SHAPES[me.weapon];
        const wide = T.cutSeconds > 0 ? T.cutSeconds : cut.strokeSeconds;
        const quick = T.thrustSeconds > 0 ? T.thrustSeconds : point.strokeSeconds;
        arc.strokeSeconds = (1 - arcSwing) * quick + arcSwing * wide;
        arc.stepIn = (1 - arcSwing) * T.thrustStepIn + arcSwing * cut.stepIn;
        strokes += 1;
        sinceMyStroke = 0;
        nextPrefer = spare;
        goTo("chamber");
      }
    }

    /** The guard, on the covering line, at the distance the command asks for. */
    const holdGuard = (): void => {
      hand.guard = canCover(cap);
      hand.thrust = false;
      aimAt(socket, guardMark, trunkHeading, me.outboard, cover);
      writeAim(hand, cap, cover, me.outboard, 0, T.coverLift, 1, command.reach);
      hand.roll = 0;
    };

    // ---- run the stance ---------------------------------------------------------------------------
    if (!justEntered) elapsed += dt;
    justEntered = false;

    if (stance === "chamber" || stance === "commit") {
      const chambering = stance === "chamber";
      intent.posture.trunkTwist =
        (chambering ? 1 : -1) * me.outboard * T.trunkSweep * (T.sweepBySwing > 0 ? arcSwing : 1);
      if (!chambering) intent.forward = clamp(intent.forward + arc.stepIn, -1, 1);
      driveStroke(hand, cap, me.outboard, aim, arc, chambering, elapsed, strikeReach);
      hand.wristBend = cap.bendMax > 0 ? T.cutBend : 0;
      if (chambering) {
        if (elapsed >= arc.chamberSeconds) goTo("commit");
      } else if (elapsed >= Math.max(T.commitSeconds, arc.strokeSeconds + T.followSeconds)) {
        goTo("recover");
      }
    } else if (stance === "ram") {
      holdGuard();
      hand.wristBend = cap.bendMax > 0 ? T.coverBend : 0;
      intent.natural.guard = false;
      if (natural !== null && !ramFired && elapsed >= T.ramLeanSeconds &&
        bodyGap <= natural.reach + T.ramBite) {
        ramFired = true;
        ramFiredAt = elapsed;
      }
      intent.natural.thrust = ramFired;
      if (ramFired ? elapsed - ramFiredAt >= T.ramFollowSeconds : elapsed >= T.ramSeconds) {
        goTo("recover");
      }
    } else if (stance === "recover") {
      holdGuard();
      hand.wristBend = cap.bendMax > 0 ? T.coverBend : 0;
      if (elapsed >= T.recoverSeconds) {
        cooldown = T.cooldown;
        prefer = paired ? "primary" : nextPrefer;
        goTo("free");
        // My exchange has ended, which is the third event: the cadence is restarted rather than
        // waited out, so the mind sees the free arm on the very next step.
        if (T.eventAsks) cadence.arm();
      }
    } else {
      holdGuard();
      hand.wristBend = cap.bendMax > 0 ? T.coverBend : 0;
    }

    // ---- the spare hand ---------------------------------------------------------------------------
    // Two things it can be doing and one it cannot: the parry the gate asked for, or the guard. A
    // paired grip has no spare -- `mirror` writes the acting hand over it at the end of `decide` --
    // and neither has a body that has lost one. v3's third case, the combination, is not here.
    if (!paired) {
      if (parrying) {
        aimAt(spareSocket, meeting, trunkHeading, self.hands[spare].outboard, spareAim);
        writeAim(off, spareCap, spareAim, self.hands[spare].outboard, 0, 0, 1,
          reachForDistance(distance(spareSocket, meeting), spareReach, spareCap, T.parryBite));
        off.roll = 0;
        off.wristBend = spareCap.bendMax > 0 ? T.coverBend : 0;
        off.thrust = false;
        off.guard = true;
      } else if (spareCanCover) {
        aimAt(spareSocket, guardMark, trunkHeading, self.hands[spare].outboard, cover);
        const acrossGuard = isShield(self.hands[spare].weapon) ? -T.coverAcross : T.coverAcross;
        writeAim(off, spareCap, cover, self.hands[spare].outboard,
          acrossGuard, T.coverLift, 1, coverReachFor(self.hands[spare].weapon, theirWeapon));
        off.roll = 0;
        off.wristBend = spareCap.bendMax > 0 ? T.coverBend : 0;
        off.thrust = false;
        off.guard = true;
      } else {
        off.pointerX = 0;
        off.pointerY = 0;
        off.reach = 0;
        off.roll = 0;
        off.wristBend = 0;
        off.thrust = false;
        off.guard = false;
      }
    }
  };

  return {
    get stance(): DrivenStance { return stance; },
    get phase(): StrokePhase { return reader.phase; },
    get reading(): PilotReading { return reading; },
    get command(): Readonly<StyleCommand> { return command; },
    get refusals(): Readonly<CommandRefusals> { return refusals; },
    get asks(): number { return cadence.asks; },
    get events(): number { return cadence.events; },
    get strokes(): number { return strokes; },
    get aborts(): number { return aborts; },
    get parrying(): boolean { return parrying; },
    decide(view: FighterView, dt: number): Intent {
      plan(view, dt);
      if (view.self.capabilities?.pairedHands) mirror(intent.primary, intent.secondary);
      return intent;
    },
  };
}
