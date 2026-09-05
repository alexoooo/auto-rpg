// Explicit `.ts` extensions, for the reason every file in this directory gives: Node runs a
// TypeScript file by stripping its types, and its ESM resolver insists on the extension where Vite
// does not care.
//
// **This file imports no value at all.** `hands.ts` is the one exception and it imports nothing
// itself, which is the property that lets a whole bout of this mind's cadence be stepped in front
// of a hand-written view with no Babylon, no scene and no solver anywhere in the graph -- the same
// property `policies.ts` keeps and for the same reason. In particular it does **not** import
// `src/action-primitives.ts`: those strokes are shaped for a Warrior's seven-axis arm and their
// ranges are an arming sword's length, and reaching for them here is the exact mistake this
// session was told to avoid.
import { isShield } from "../hands.ts";
import type { BodyView, FighterView, HandIntent, HandName, Intent } from "../mind.ts";
import type { EffectorCapability, GolemCapabilities } from "./module.ts";

/**
 * The golem's scripted mind: a state machine over what its modules publish.
 *
 * ## What it reads, and what it deliberately does not
 *
 * **Capabilities, never module ids.** There is no `chain`, no `terminal` and no `if (id === ...)`
 * anywhere below, and that is the whole design constraint: a new option on the shelf must need no
 * new mind. What it asks is:
 *
 * | question | answered by |
 * |---|---|
 * | can this effector attack at all | `capabilities.effectors[hand].strokes` carries `thrust` |
 * | is a stroke a swept cut or a chop | the same list carries `cut` |
 * | can it be held as a guard | the same list carries `cover` |
 * | can the arm be aimed across the body | `reachable` is non-null and its swing span is non-zero |
 * | can the terminal be turned to face | `rollMax` is above zero |
 * | how far the business end goes | `HandView.reach` |
 * | what the business end is for | `HandView.weapon`, which is the terminal's own description |
 * | can the body turn its weapon without its arm | `capabilities.trunkTwistMax` |
 * | can the carrier lower the whole body | `capabilities.crouchTravel` |
 * | is there a striker that is not on an arm | `BodyView.naturalAttacks`, by iteration, not by name |
 *
 * The pair is the capability, exactly as the plan freezes it: the chain says which strokes exist
 * and the terminal says what a stroke is for. A pitch chain publishes `thrust` and `cover` and no
 * `cut`, so a golem carrying one chops rather than sweeping; an arm chain publishes all three; a
 * capped socket publishes none and this mind will not try to fight with it. A plate is described
 * as a shield, so it is what the golem covers with and it attacks only when nothing else can.
 *
 * **Every hand command is inside the envelope by construction.** The two aiming axes are written
 * by inverting the *published* span -- `unspan` is `spanned` in `arm-core.ts` read backwards and
 * clamps into the cursor's own -1..1 -- so a target outside the shell arrives as the nearest pose
 * the controller can ask for rather than as a refusal, which is frozen rule 3. `roll` is written
 * only inside `rollMax` and only when there is a roll axis to write into. The mind asks the module
 * to clamp and never the other way round.
 *
 * **Nothing here is a servo.** The aim is a function of two published positions and the clock. It
 * never reads where the limb *got to* and steps the command toward it: that controller winds up,
 * measured at 237 of 420 steps pinned against a stop with the hand 137 mm off its own anchor, and
 * the one reading it does take of an achieved value -- `BodyView.trunkTwist`, to know which way its
 * own sockets are pointing -- is a coordinate transform rather than an error term. The trunk's own
 * command is computed from the bearing to the opponent and never from the arm's aim, so the two
 * cannot chase each other.
 *
 * ## The states
 *
 * ```
 *            ┌──────────── gap > strike ────────────┐
 *            v                                      │
 *        approach ───── gap <= hold ─────────>  measure  <───── recover done ─────┐
 *            │                                   │  ^                             │
 *            │                        gap < near │  │ gap > near + slack          │
 *            │                                   v  │ or the dwell runs out       │
 *            │                                withdraw                            │
 *            │                                      │                             │
 *            └──── an opening, or patience spent, and gap <= strike ────> chamber ─┴─> commit ─> recover
 * ```
 *
 * `approach` and `measure` both orbit; `chamber`, `commit` and `recover` are one exchange and run
 * to the end once started, which is what stops the mind changing its mind at 240 Hz. Every edge is
 * either a dwell expiring or a range crossing with its own hysteresis band, which is what stops it
 * flickering at a threshold. The three range gates are all fractions of a **published** reach, so a
 * whip and a capped socket are the same code at different distances -- the trap this session was
 * handed is that `duelist.hold`, `duelist.strike` and `swinger.engage` were an arming sword's
 * length written as a decimal, and any weapon of another length swung at the air.
 */

// --------------------------------------------------------------------------------- small arithmetic

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

/** Shortest signed way round from one heading to another, in radians. */
export function angleTo(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * Where a cursor has to sit for a published span to produce `value`.
 *
 * `spanned` in `arm-core.ts` read backwards, and the reason it is written here rather than imported
 * is that a *mind* is not allowed to reach into a chain: what it has is the envelope, and this is
 * the envelope's own arithmetic. A zero span answers zero, which is not a rounding case -- a mace
 * pins `swingMin` and `swingMax` to the same number, so there is exactly one azimuth this arm has
 * and every cursor position commands it. The clamp into -1..1 is what makes "the mind asks the
 * module to clamp" true at the cursor rather than at the anchor.
 */
export const unspan = (value: number, min: number, max: number): number =>
  max === min ? 0 : clamp(((value - min) / (max - min)) * 2 - 1, -1, 1);

/** The one shape any position in a view has to have to be read here. */
interface Point { x: number; y: number; z: number }

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * A small deterministic generator, so that N bouts means N different bouts.
 *
 * Mulberry32, the same one `policies.ts` carries and for the same argument: the variation has to be
 * in the policy's own cadence and not in the physics, because nudging a body to make a distribution
 * is measuring a different simulator every time. A second copy rather than an import, because that
 * one lives in a file whose ranges are a Warrior's and this file deliberately imports no value from
 * it; six lines of a named public algorithm is the cheaper of the two duplications.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------------------- the capabilities

/** Can this effector be asked for a stroke at all? A capped socket cannot. */
export const canAttack = (cap: EffectorCapability): boolean => cap.strokes.includes("thrust");
/** Is its stroke a swept cut, or only the chop a one-axis chain has? */
export const canCut = (cap: EffectorCapability): boolean => cap.strokes.includes("cut");
/** Can it be held as a guard? Everything but a capped socket can. */
export const canCover = (cap: EffectorCapability): boolean => cap.strokes.includes("cover");
/**
 * Can the *arm* point the terminal across the body?
 *
 * Two ways the answer is no and they are the same answer: a chain whose command is an angle rather
 * than a point publishes no reachable set at all, and a chain carrying a two-socket terminal
 * publishes one whose azimuth range is exactly zero. Either way the golem has to turn with its
 * trunk or its carrier, which is what `trunkTwistMax` is read for.
 */
export const canSwing = (cap: EffectorCapability): boolean =>
  cap.reachable !== null && cap.reachable.swingMax > cap.reachable.swingMin;

/**
 * The closest the business end can be brought to its own socket, metres.
 *
 * `HandView.reach` is the far end of the same shell -- how far the point goes at full extension --
 * and the difference between the two is the published reach axis, so this is the *inner* radius of
 * the volume this effector's point lives in and nothing else. It is what "the opponent is inside my
 * sweep" means for a body whose weapon is an arm, and it moves by itself when the arm is a whip or
 * a capped socket. A chain with no reachable set has a fixed tip distance, so its shell has no
 * thickness and the inner radius is the outer one.
 */
export const innerReach = (reach: number, cap: EffectorCapability): number =>
  cap.reachable ? reach - (cap.reachable.reachMax - cap.reachable.reachMin) : reach;

/** The three distances one exchange is gated on, and the band between them. */
export interface TacticalRanges {
  /** The inner radius of the shell the business end lives in. Inside it, a stroke is already past. */
  readonly near: number;
  /** Where it stands between exchanges. */
  readonly hold: number;
  /** The furthest a commit is taken from. */
  readonly strike: number;
  /** The hysteresis band both range gates carry. */
  readonly slack: number;
}

/**
 * Where one effector wants the fight to happen, from what it publishes about itself.
 *
 * **The inner radius is a floor on the other two, and that is derived rather than tuned.** A hold
 * distance inside `near` is a distance at which the arm is already past the mark before the stroke
 * starts, and a golem that chose one would spend the bout backing off from a range it had picked
 * for itself. It binds hardest exactly where a fraction of the far edge is least informative: a
 * chain whose command is an angle rather than a point has a tip at a *fixed* distance, so its shell
 * has no thickness at all and `near` is the whole reach -- for a blade on the pitch chain that is
 * 1.14 m against a 0.82 fraction's 0.94 m, so without the floor rung 1 would hold a fifth of a
 * metre inside its own tip and never strike from where it stood.
 *
 * Exported because it is the one piece of arithmetic in this file whose *shape* is worth asserting
 * rather than whose behaviour is: `tests/golem-mind.test.mjs` asks it of every registered build's
 * real published capability, which is a question a bout cannot answer for a build nobody ran.
 */
export function tacticalRanges(reach: number, cap: EffectorCapability): TacticalRanges {
  const slack = reach * GOLEM_TACTICS.slackFraction;
  const near = innerReach(reach, cap);
  const hold = Math.max(reach * GOLEM_TACTICS.holdFraction, near + slack);
  return Object.freeze({
    near, hold, slack,
    strike: Math.max(reach * GOLEM_TACTICS.strikeFraction, hold + slack),
  });
}

/** The first natural striker that is ready, or null. By iteration, never by name. */
function readyNatural(body: BodyView): { readonly reach: number } | null {
  for (const key of Object.keys(body.naturalAttacks)) {
    const attack = body.naturalAttacks[key];
    if (attack.ready) return attack;
  }
  return null;
}

// ------------------------------------------------------------------------------------- the numbers

/**
 * Every constant this mind has, and where each came from.
 *
 * **The five range numbers are fractions of a published reach and not distances.** That is the
 * whole of the lesson the trap for this session states: `duelist.hold` was 1.40 with a comment
 * saying "just inside the 1.45 m the point of the blade reaches", and handed an axe it stood a
 * quarter of a metre outside its own range and swung at the air for a whole bout -- 31 blows
 * against 398. A golem's reach varies by chain, by terminal *and* by how tall its carrier stands,
 * so there is no length here at all: every gate is a dimensionless multiple of
 * `HandView.reach`, which the module publishes for whatever is actually bolted on.
 *
 * The sweeps below are all the **Node arena harness** -- `NullEngine`, real Havok, the same
 * `stepPair` loop the page runs with the render half taken out, driven through `scripts/measure.mjs`
 * as a library. Nothing here may be compared with a page reading or with a figure from
 * `scripts/golem-bench.mjs`; the two harnesses in this directory that have been compared disagree by
 * about 9 % on a peak transient with identical code. **Every one of these is provisional**, pinned
 * before any human gate, and is a measurement rather than a verdict.
 */
export const GOLEM_TACTICS = {
  /**
   * Where it stands, as a fraction of the primary effector's published reach.
   *
   * Swept on the default golem against the Warrior `duelist`, 8 side-swapped bouts, 60 s cap, seed
   * 20260904, Node arena harness, 2026-09-04. The column that decides it is damage dealt, because
   * at these numbers nothing finishes and a win rate over 8 bouts distinguishes nothing:
   *
   * | hold | strike | golem damage / bout | golem contacts | damage taken |
   * |---:|---:|---:|---:|---:|
   * | 0.72 | 0.86 | 5.90 | 45.6 | 60.10 |
   * | **0.78** | **0.92** | **10.52** | **73.9** | 57.15 |
   * | 0.84 | 0.98 | 8.42 | 62.1 | 56.03 |
   * | 0.90 | 1.00 | 3.11 | 30.4 | 55.44 |
   *
   * The shape is the one the geometry predicts: too far out and the sweep passes in front of the
   * opponent, too close and the arm is inside its own inner radius before the stroke starts. The
   * pair is swept together because `strike` has to stay outside `hold` or the mind never commits
   * from where it chose to stand.
   */
  holdFraction: 0.78,
  /** The furthest a commit is taken from, as the same fraction. Outside `hold` by construction. */
  strikeFraction: 0.92,
  /**
   * The hysteresis band on both range gates, as the same fraction.
   *
   * Not a dead band for its own sake: `approach` is left at `hold` and re-entered at `strike`, so
   * the band between them is already wide. This is what stops the *withdraw* gate chattering, where
   * the two ranges are one number apart.
   */
  slackFraction: 0.06,

  /** How hard it leans on the turn axis per radian off the bearing. Clamped to the axis. */
  turnGain: 2.6,
  /** How hard it leans on the walk axis per metre it is out of position. */
  closeGain: 1.8,
  /**
   * How much of the strafe axis an orbit spends, and how long a lane lasts.
   *
   * A biped golem's carrier tops out at 0.8 m/s against a Warrior's walk, so an orbit here is a
   * lean rather than a circle -- what it buys is that the golem is never standing still, which is
   * the first of the dynamism measures and the thing `idle` conspicuously was not doing.
   */
  strafe: 0.55,
  circleMin: 1.3,
  circleMax: 2.6,

  /**
   * The opening, as two readings of the opponent's business end.
   *
   * The same two `duelist` uses, and deliberately the same numbers: they are properties of what a
   * blade coming at you looks like rather than of the arm holding it, and a golem watching a
   * Warrior is watching the blade `duelist` was tuned against. `outOfLine` is the cosine between
   * the way their point is facing and the direction from them to me; `theirCommit` and `receding`
   * are the other opening, a point moving fast and away.
   */
  outOfLine: 0.30,
  theirCommit: 5.0,
  receding: 0.6,

  /**
   * Seconds of no opening after which it makes one, and seconds after an exchange before another.
   *
   * `patience` is the one thing here that is not a reaction, and it is what stops golem versus
   * golem running to the cap: two bodies that both wait for an opening never find one, because a
   * covering arm is by definition in line. Shorter than `duelist`'s 2.4 because a golem's cut is
   * 0.18 s of stroke on top of a 0.22 s chamber, so its exchanges are further apart to begin with.
   */
  patience: 1.6,
  cooldown: 0.30,

  /**
   * The three legs of one exchange, in seconds.
   *
   * `chamberSeconds` is what the arm is given to get to the chambered pose before the button goes
   * down, and it is the number the drive's own rate limit decides: the anchor moves the commanded
   * point at 1.2 m/s outside a stroke, so a chamber that crosses most of the shell wants about two
   * tenths. `commitSeconds` has to outlast the module's own stroke, which is 0.18 s for an arm
   * chain's cut and 0.09 s for a one-axis chop -- and outlasting it is free, because a stroke is an
   * edge and a held button starts nothing. `recoverSeconds` is the guard going back up.
   *
   * Swept together as one cadence multiplier on the default golem, 8 side-swapped bouts, seed
   * 20260904, Node arena harness:
   *
   * | cadence | golem damage / bout | contacts | completed exchanges |
   * |---:|---:|---:|---:|
   * | x0.7 | 8.63 | 71.2 | 41.9 |
   * | **x1.0** | **10.52** | **73.9** | **31.5** |
   * | x1.4 | 7.31 | 55.5 | 23.1 |
   */
  chamberSeconds: 0.22,
  commitSeconds: 0.22,
  recoverSeconds: 0.30,

  /**
   * How far outboard and above the aim the stroke is chambered, radians.
   *
   * An **angle**, in the envelope's own published vocabulary, and clamped by the span it is written
   * into -- so it is not a length in disguise and a narrower chain simply chambers less far. The
   * pair is half of the module's own cut sweep, which is what puts the middle of the sweep on the
   * mark: an arm chain's cut carries the target 0.99 rad inboard and 0.77 rad down over its drive.
   *
   * Swept on the default golem, 8 side-swapped bouts, seed 20260904, Node arena harness:
   *
   * | swing / lift | golem damage / bout | mean contact speed, m/s |
   * |---|---:|---:|
   * | 0.25 / 0.20 | 6.04 | 5.11 |
   * | **0.50 / 0.39** | **10.52** | **6.28** |
   * | 0.75 / 0.58 | 9.13 | 6.44 |
   * | 1.00 / 0.77 | 5.86 | 6.51 |
   *
   * The far end of that sweep is the shape the envelope predicts rather than a failure of the
   * stroke: chambered past 0.75 rad the pose is against the outboard limit before the button goes
   * down, so the sweep starts from wherever the clamp put it and the speed stops improving while
   * the aim gets worse.
   */
  chamberSwing: 0.05,
  chamberLift: 0.04,

  /**
   * Where a cover is held, in the same vocabulary: across the line and a little below it.
   *
   * `across` is turned **inboard** from the bearing to the threat, which is what makes a plate a
   * board rather than an edge -- the plate's face is square to the limb, so an arm pointed at
   * somebody presents nothing. It is the golem's version of `GUARD.across`, restated as an angle
   * off a published azimuth rather than as a Warrior's shoulder geometry.
   *
   * Swept on the default golem -- blade in the primary, plate in the secondary -- 8 side-swapped
   * bouts, seed 20260904, Node arena harness, on damage taken:
   *
   * | across | damage taken / bout | golem damage dealt |
   * |---:|---:|---:|
   * | 0.00 | 60.72 | 10.44 |
   * | 0.30 | 58.01 | 10.49 |
   * | **0.55** | **57.15** | **10.52** |
   * | 0.80 | 57.96 | 10.31 |
   *
   * A weak effect, and it is worth saying so: 6 % of the damage taken across the whole sweep, over
   * 8 bouts. A plate on a golem is a module with health that a blade wears down rather than a board
   * a fighter interposes, so most of what it does it does by being in the way.
   */
  coverAcross: 0.55,
  coverLift: -0.15,

  /**
   * How far the wrist is turned to put the edge along the sweep, radians, signed by the socket.
   *
   * **A constant chosen from a sweep, and not a servo.** The alternative was to derive it from the
   * commanded stroke the way `rollForStroke` does for a Warrior, and the derivation there is a page
   * of spherical geometry that is right for one arm; here the sweep is the module's own and the
   * mind does not know its rates. So: swept, on the default golem, 8 side-swapped bouts, seed
   * 20260904, Node arena harness, reading the mean edge alignment of every contact the damage model
   * scored -- which is the number `src/scoring.ts` raises to the power of `combat.edgeExponent`, so
   * it is worth its square:
   *
   * | roll | mean scored alignment | golem damage / bout |
   * |---:|---:|---:|
   * | -1.20 | 0.331 | 6.98 |
   * | -0.60 | 0.472 | 9.02 |
   * | 0.00 | 0.596 | 9.71 |
   * | **0.60** | **0.688** | **10.52** |
   * | 1.20 | 0.559 | 8.84 |
   *
   * Written only when `rollMax` is above zero, which is rung 3 and no earlier: every chain below it
   * chose its edge at build because a chain with no roll axis has to, and a mace has no edge at all.
   * A command written into an axis that does not exist would be spending a channel nobody reads.
   */
  cutRoll: 0.30,
  /** How far the wrist is flexed on a cut and on a cover, normalized 0..1 as the intent is. */
  cutBend: 0.14,
  coverBend: 0.10,

  /**
   * How far the trunk turns into the blow, normalized to its own envelope.
   *
   * Chambered one way and swept the other, so the trunk is turning *through* the exchange rather
   * than holding a pose. It matters most where it matters at all: a mace pins the swing to zero, so
   * a golem carrying one cannot turn its weapon with its arm and the trunk is the only thing that
   * can. Measured on a mace golem, peak driven tip speed over 8 bouts, seed 20260904, Node arena
   * harness:
   *
   * | trunk sweep | mace peak driven tip speed, m/s | mace damage / bout |
   * |---:|---:|---:|
   * | 0.00 | 4.71 | 3.02 |
   * | 0.45 | 5.44 | 4.11 |
   * | **0.75** | **5.93** | **4.66** |
   *
   * The blade golem is barely moved by it -- 10.52 against 10.31 damage a bout with the sweep off --
   * which is the honest reading: the trunk is a slow, heavy joint and an arm that can already swing
   * does not need it. It is kept for both because a rule that applied only to the pinned case would
   * be a special case for a module id.
   */
  trunkSweep: 0.75,
  /** How far it leans into a commit and away from a withdraw, normalized. */
  commitLean: 0.40,
  withdrawLean: -0.25,

  /** Seconds a withdraw may last before it goes back to holding, whatever the range says. */
  withdrawSeconds: 0.70,
  /**
   * Seconds after a failed withdraw during which being crowded is fought from rather than answered.
   *
   * The dwell that turns a two-state oscillation into a decision. A biped golem's carrier tops out
   * at 0.8 m/s and a Warrior closes faster than that, so a golem that answers every crossing of its
   * own inner radius by giving ground gives ground for the whole bout: measured before this
   * existed, a mace golem placed inside its own shell spent 1389 of 1440 sampled steps withdrawing
   * and committed nothing.
   */
  crowdedSeconds: 2.5,
  /** Seconds `approach` and `measure` must each be held before the other may be entered. */
  rangeDwell: 0.18,
} as const;

// ---------------------------------------------------------------------------------- the machine

export type GolemStance = "approach" | "measure" | "withdraw" | "chamber" | "commit" | "recover";

/** What is worth watching, copied out of the view rather than held as a reference into it. */
interface Threat {
  readonly tip: Point;
  readonly shoulder: Point;
  tipSpeed: number;
}

/** Where the aim wants the business end, in the socket's own published vocabulary. */
interface Aim {
  /** Outboard-signed azimuth, radians: positive is away from the golem. */
  swing: number;
  /** Elevation, radians. */
  lift: number;
  /** Ground distance from the socket to the mark, metres. */
  horizontal: number;
}

/**
 * The thing of theirs worth watching.
 *
 * Their hands, and only their hands, because that is what `BodyView` publishes for every unit --
 * a golem fills `hands` with its own effector records rather than inventing a second list, so this
 * one function reads a Warrior, a Broot and another golem. A hand that has been cut off is not a
 * threat whatever its weapon is doing on the floor, and a shield is not a threat either; among what
 * is left, the faster point is the one to watch. When nothing qualifies it falls back to the body's
 * own published point, which is the honest answer for a body whose weapon is its head.
 */
function watch(them: BodyView, into: Threat): Threat {
  let best: { tip: Point; shoulder: Point; speed: number } | null = null;
  for (const name of ["primary", "secondary"] as const) {
    const hand = them.hands[name];
    if (hand.lost || isShield(hand.weapon)) continue;
    if (!best || hand.tipSpeed > best.speed) {
      best = { tip: hand.tip, shoulder: hand.shoulder, speed: hand.tipSpeed };
    }
  }
  const tip = best ? best.tip : them.tip;
  const shoulder = best ? best.shoulder : them.shoulder;
  into.tip.x = tip.x; into.tip.y = tip.y; into.tip.z = tip.z;
  into.shoulder.x = shoulder.x; into.shoulder.y = shoulder.y; into.shoulder.z = shoulder.z;
  into.tipSpeed = best ? best.speed : them.tipSpeed;
  return into;
}

/**
 * Where a mark sits from one socket, in that socket's own frame.
 *
 * The socket's frame is the *trunk's*, because that is what an effector is bolted to, and the trunk
 * is turned relative to the carrier by whatever twist it has achieved. `BodyView.trunkTwist` is
 * published normalized and `capabilities.trunkTwistMax` is what turns it back into an angle, which
 * is the whole reason that field is published. Reading an achieved value here is a coordinate
 * transform and not a feedback term: the socket really is where the trunk really is, and nothing
 * downstream of this writes the trunk.
 */
function aimAt(socket: Point, mark: Point, frameHeading: number, outboard: number, into: Aim): Aim {
  const dx = mark.x - socket.x;
  const dy = mark.y - socket.y;
  const dz = mark.z - socket.z;
  const horizontal = Math.hypot(dx, dz);
  into.swing = angleTo(frameHeading, Math.atan2(dx, dz)) * outboard;
  into.lift = Math.atan2(dy, horizontal);
  into.horizontal = horizontal;
  return into;
}

/**
 * Write the two aiming axes of one hand, inside the published span and nowhere else.
 *
 * The branch is the capability and not a body: an effector with no reachable set has no point to
 * command, so `pointerX` is a channel nothing reads and `pointerY` spans whatever single axis the
 * chain does have. `raise` is what that chain is asked for instead -- normalized, because the only
 * honest thing a mind can say about an axis it cannot see the units of is "as far up as you go".
 */
function writeAim(
  hand: HandIntent,
  cap: EffectorCapability,
  aim: Aim,
  outboard: number,
  swingOffset: number,
  liftOffset: number,
  raise: number,
): void {
  const shell = cap.reachable;
  if (!shell) {
    hand.pointerX = 0;
    hand.pointerY = clamp(raise, -1, 1);
    return;
  }
  hand.pointerX = unspan(aim.swing + swingOffset, shell.swingMin, shell.swingMax) * outboard;
  hand.pointerY = unspan(aim.lift + liftOffset, shell.liftMin, shell.liftMax);
}

/** A blank command this mind owns and overwrites in place; `decide` runs 240 times a second. */
const freshGolemIntent = (): Intent => ({
  forward: 0,
  strafe: 0,
  turn: 0,
  actingHand: "primary",
  natural: { thrust: false, guard: false },
  posture: { trunkLean: 0, trunkTwist: 0, crouch: 0 },
  primary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false },
  secondary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false },
});

/** What the tactics expose to a test and to the policy that names them. */
export interface GolemTactics {
  readonly stance: GolemStance;
  decide(view: FighterView, dt: number): Intent;
}

/**
 * The state machine.
 *
 * Returns the tactics rather than a `Mind` so that `golem-policies.ts` owns the name and the
 * registration and this file owns the behaviour -- and so that a test can read `stance` without
 * the mind having to publish a field a bout would never look at.
 */
export function golemTactics(seed: number): GolemTactics {
  const random = mulberry32(seed);
  const intent = freshGolemIntent();

  const aim: Aim = { swing: 0, lift: 0, horizontal: 0 };
  const cover: Aim = { swing: 0, lift: 0, horizontal: 0 };
  const threat: Threat = { tip: { x: 0, y: 0, z: 0 }, shoulder: { x: 0, y: 0, z: 0 }, tipSpeed: 0 };
  const mark: Point = { x: 0, y: 0, z: 0 };
  const guardMark: Point = { x: 0, y: 0, z: 0 };

  /** Which effector is taking this exchange, and which one would like the next. */
  let attacker: HandName = "primary";
  let prefer: HandName = "primary";

  let stance: GolemStance = "approach";
  let elapsed = 0;
  /** Seconds in `approach` or `measure`, so a range crossing has to persist to be believed. */
  let ranged = 0;

  // The start offsets, and the reason two golems built together do not commit on the same frame.
  let cooldown = GOLEM_TACTICS.cooldown + random() * 0.8;
  let sinceOpening = random() * GOLEM_TACTICS.patience;
  let patience = GOLEM_TACTICS.patience * (0.8 + random() * 0.4);
  /** Seconds left of the grace a failed withdraw buys. See `crowdedSeconds`. */
  let crowdedGrace = 0;
  let circle = random() < 0.5 ? -1 : 1;
  let circleLeft = GOLEM_TACTICS.circleMin
    + random() * (GOLEM_TACTICS.circleMax - GOLEM_TACTICS.circleMin);

  /**
   * How fast their point is getting further from my socket, m/s, low-passed.
   *
   * The only rate in the file, and the only thing it keeps between steps about the world. A raw
   * frame-to-frame difference at 240 Hz is mostly solver noise; keeping this is keeping a memory of
   * where a blade was a moment ago, which is what a person does with a blade.
   */
  let gapRate = 0;
  let lastGap = -1;

  const goTo = (next: GolemStance): void => {
    stance = next;
    elapsed = 0;
  };

  /**
   * Which effector takes the exchange.
   *
   * By capability and then by role: an effector that cannot be asked for a stroke is never chosen,
   * a described shield is chosen only when nothing else can attack, and between two that qualify
   * the preference alternates so two blades take turns. A severed module is out on `HandView.lost`,
   * which is the field that says an arm has come off whatever its envelope still reports.
   */
  const chooseAttacker = (self: BodyView, caps: GolemCapabilities, want: HandName): HandName => {
    const other: HandName = want === "primary" ? "secondary" : "primary";
    const able = (name: HandName): boolean =>
      !self.hands[name].lost && canAttack(caps.effectors[name]);
    const armed = (name: HandName): boolean => able(name) && !isShield(self.hands[name].weapon);
    if (armed(want)) return want;
    if (armed(other)) return other;
    if (able(want)) return want;
    if (able(other)) return other;
    // Nothing can strike. Keep an effector that is still attached, so the body goes on turning to
    // face and goes on covering with whatever it has.
    return self.hands[want].lost && !self.hands[other].lost ? other : want;
  };

  return {
    get stance(): GolemStance { return stance; },

    decide(view: FighterView, dt: number): Intent {
      const self = view.self;
      const them = view.opponent;
      const caps = self.capabilities;
      // A body with no published capabilities is not a golem, and this mind has nothing to say
      // about one. Refused by standing still rather than by throwing: the picker and the registry
      // are what keep this from happening, and a mind that took a bout down would be a worse
      // failure than one that visibly does nothing.
      if (!caps) return intent;

      const trunkHeading = self.facing + self.trunkTwist * caps.trunkTwistMax;

      attacker = chooseAttacker(self, caps, prefer);
      const spare: HandName = attacker === "primary" ? "secondary" : "primary";
      intent.actingHand = attacker;
      const cap = caps.effectors[attacker];
      const spareCap = caps.effectors[spare];
      const hand = intent[attacker];
      const off = intent[spare];
      const me = self.hands[attacker];
      const socket = me.shoulder;

      // ---- ranges, all of them fractions of a published reach ---------------------------------
      //
      // **The inner radius is a floor on where it stands, and that is derived rather than tuned.**
      // `near` is the closest the business end can be brought to its own socket, out of the same
      // published shell the far edge comes from, so a hold distance inside it is a distance at
      // which the arm is already past the mark before the stroke starts -- and a golem that chose
      // one would spend the whole bout backing off from a range it had picked for itself. Measured
      // before the floor existed: the default build's `holdFraction` of 0.78 puts it 1.39 m out
      // against an inner radius of 1.36 m, and a mace's 1.06 m against 1.00 m, so both stood inside
      // their own hysteresis band and churned between holding and giving ground.
      const reach = me.reach;
      const { near, hold, strike, slack } = tacticalRanges(reach, cap);
      const gap = distance(socket, them.shoulder);

      // ---- what their business end is doing ----------------------------------------------------
      watch(them, threat);
      const tipGap = distance(threat.tip, socket);
      if (lastGap >= 0 && dt > 0) {
        const rate = (tipGap - lastGap) / dt;
        gapRate += (rate - gapRate) * (1 - Math.exp(-12 * dt));
      }
      lastGap = tipGap;

      const bladeX = threat.tip.x - threat.shoulder.x;
      const bladeY = threat.tip.y - threat.shoulder.y;
      const bladeZ = threat.tip.z - threat.shoulder.z;
      const bladeLength = Math.hypot(bladeX, bladeY, bladeZ) || 1;
      const towardX = socket.x - them.shoulder.x;
      const towardY = socket.y - them.shoulder.y;
      const towardZ = socket.z - them.shoulder.z;
      const towardLength = Math.hypot(towardX, towardY, towardZ) || 1;
      const inLine =
        (bladeX * towardX + bladeY * towardY + bladeZ * towardZ) / (bladeLength * towardLength);
      const opening = inLine < GOLEM_TACTICS.outOfLine ||
        (threat.tipSpeed > GOLEM_TACTICS.theirCommit && gapRate > GOLEM_TACTICS.receding);
      sinceOpening = opening ? 0 : sinceOpening + dt;
      if (cooldown > 0) cooldown -= dt;
      if (crowdedGrace > 0) crowdedGrace -= dt;

      // ---- the marks ---------------------------------------------------------------------------
      //
      // The attack aims at a column over their own footprint at the height of their published
      // shoulder, which is live: a body that has fallen brings the mark down with it, and that is
      // what makes the crouch below fire without anybody writing a `downed` branch. The guard
      // covers their point when it is actually extended toward me -- nearer to my socket than their
      // own shoulder is -- and their chest when it is not, so a blade that has been chambered or cut
      // off does not drag the plate round to point at the floor.
      mark.x = them.ground.x;
      mark.y = them.shoulder.y;
      mark.z = them.ground.z;
      if (tipGap < towardLength) {
        guardMark.x = threat.tip.x; guardMark.y = threat.tip.y; guardMark.z = threat.tip.z;
      } else {
        guardMark.x = them.ground.x; guardMark.y = them.shoulder.y; guardMark.z = them.ground.z;
      }
      aimAt(socket, mark, trunkHeading, me.outboard, aim);

      // ---- the feet ----------------------------------------------------------------------------
      const bearing = Math.atan2(them.ground.x - self.ground.x, them.ground.z - self.ground.z);
      intent.turn = clamp(angleTo(self.facing, bearing) * GOLEM_TACTICS.turnGain, -1, 1);

      circleLeft -= dt;
      if (circleLeft <= 0) {
        circle = -circle;
        circleLeft = GOLEM_TACTICS.circleMin
          + random() * (GOLEM_TACTICS.circleMax - GOLEM_TACTICS.circleMin);
      }
      intent.strafe = circle * GOLEM_TACTICS.strafe;
      intent.forward = clamp((gap - hold) * GOLEM_TACTICS.closeGain, -1, 1);

      // ---- the posture -------------------------------------------------------------------------
      //
      // The trunk turns *through* an exchange -- chambered one way and swept the other -- which is
      // the only way a golem carrying a weapon with no azimuth of its own can put speed into it.
      // The crouch is derived rather than chosen: when the mark is below the lowest elevation the
      // arm can be pointed at, the shortfall in height is what the carrier has to make up, and
      // `crouchTravel` is how much of that it has. A carrier with no range answers zero and the
      // whole expression is skipped, which is a wheel refusing a command it cannot honour rather
      // than a branch on which module is fitted.
      const chambering = stance === "chamber";
      const committing = stance === "commit";
      intent.posture.trunkTwist = chambering
        ? me.outboard * GOLEM_TACTICS.trunkSweep
        : committing ? -me.outboard * GOLEM_TACTICS.trunkSweep : 0;
      intent.posture.trunkLean = committing ? GOLEM_TACTICS.commitLean
        : stance === "withdraw" ? GOLEM_TACTICS.withdrawLean : 0;
      intent.posture.crouch = 0;
      if (cap.reachable && caps.crouchTravel > 1e-6) {
        const shortfall = (cap.reachable.liftMin - aim.lift) * aim.horizontal;
        intent.posture.crouch = clamp(shortfall / caps.crouchTravel, 0, 1);
      }

      // ---- the head ----------------------------------------------------------------------------
      //
      // The duck is a level and is held whenever the golem is not mid-exchange, on both heads: a
      // plain head has no striker and still has a neck to pull in. The lunge is an edge and is
      // spent only when there is a striker that is ready and the opponent is inside its own
      // published reach -- and only while the arms are between strokes, because a body that
      // head-butts through its own cut is a body putting its fatal part into its own blade.
      const natural = readyNatural(self);
      intent.natural.guard = !chambering && !committing;
      intent.natural.thrust = natural !== null &&
        view.measure <= natural.reach &&
        (stance === "recover" || stance === "measure" || !canAttack(cap));

      // ---- the hand that is not striking --------------------------------------------------------
      //
      // Planned first and from the same reading, so a plate is placed against the point that is
      // actually coming rather than against whatever the last cut left the cursor pointing at. What
      // it does is decided by what it is: a described shield covers the incoming line, anything else
      // that can be held as a guard holds one offset outboard so the pair covers a wedge rather than
      // resting against itself, and a capped socket is left where it is because nothing reads it.
      if (!self.hands[spare].lost && canCover(spareCap)) {
        const spareSocket = self.hands[spare].shoulder;
        aimAt(spareSocket, guardMark, trunkHeading, self.hands[spare].outboard, cover);
        const across = isShield(self.hands[spare].weapon)
          ? -GOLEM_TACTICS.coverAcross : GOLEM_TACTICS.coverAcross;
        writeAim(off, spareCap, cover, self.hands[spare].outboard,
          across, GOLEM_TACTICS.coverLift, 1);
        off.roll = 0;
        off.wristBend = spareCap.bendMax > 0 ? GOLEM_TACTICS.coverBend : 0;
        off.thrust = false;
        off.guard = true;
      } else {
        off.pointerX = 0;
        off.pointerY = 0;
        off.roll = 0;
        off.wristBend = 0;
        off.thrust = false;
        off.guard = false;
      }

      // ---- the exchange -------------------------------------------------------------------------
      hand.roll = cap.rollMax > 0 ? clamp(GOLEM_TACTICS.cutRoll, -cap.rollMax, cap.rollMax) : 0;
      hand.wristBend = cap.bendMax > 0
        ? (chambering || committing ? GOLEM_TACTICS.cutBend : GOLEM_TACTICS.coverBend) : 0;

      if (stance === "approach" || stance === "measure" || stance === "withdraw") {
        // A guard held, on the covering line. `guard` is a level: on an arm chain it pulls the
        // business end in and raises it, and on a one-axis chain it raises the whole limb, and
        // either way it is what "between exchanges" looks like.
        hand.guard = canCover(cap);
        hand.thrust = false;
        aimAt(socket, guardMark, trunkHeading, me.outboard, cover);
        writeAim(hand, cap, cover, me.outboard, 0, GOLEM_TACTICS.coverLift, 1);

        if (stance === "withdraw") {
          intent.forward = -1;
          if (elapsed > GOLEM_TACTICS.withdrawSeconds || gap > near + slack) {
            // **A withdraw that did not open the range is a withdraw that is not going to.** A
            // golem walks at its carrier's speed and a Warrior closes faster than that, so a body
            // crowded against a wall would give ground, fail, give ground again, and never strike
            // -- which is the flicker this grace exists to stop. After it, being crowded is a thing
            // the golem fights from rather than a thing it answers, which is what a person does.
            if (gap < near) crowdedGrace = GOLEM_TACTICS.crowdedSeconds;
            ranged = 0;
            goTo("measure");
          }
          elapsed += dt;
          return intent;
        }

        ranged += dt;
        if (gap < near && crowdedGrace <= 0 && ranged > GOLEM_TACTICS.rangeDwell) {
          ranged = 0;
          goTo("withdraw");
          return intent;
        }
        if (stance === "approach") {
          if (gap <= hold && ranged > GOLEM_TACTICS.rangeDwell) { ranged = 0; goTo("measure"); }
        } else if (gap > strike + slack && ranged > GOLEM_TACTICS.rangeDwell) {
          ranged = 0;
          goTo("approach");
        }

        if (cooldown <= 0 && gap <= strike && canAttack(cap) &&
          (opening || sinceOpening > patience)) {
          patience = GOLEM_TACTICS.patience * (0.8 + random() * 0.4);
          sinceOpening = 0;
          ranged = 0;
          goTo("chamber");
        }
        return intent;
      }

      elapsed += dt;

      if (stance === "chamber") {
        // The button is up and the guard is down, so the chain's own `wanted` pose is what the
        // cursor says and the stroke will start from there. Chambered outboard and above the mark
        // by half the sweep the module is about to run, which is what puts the middle of that sweep
        // on it -- and a chain with no azimuth is simply raised, because there is nothing else it
        // can be asked for.
        hand.guard = false;
        hand.thrust = false;
        writeAim(hand, cap, aim, me.outboard,
          canSwing(cap) ? GOLEM_TACTICS.chamberSwing : 0, GOLEM_TACTICS.chamberLift, 1);
        if (elapsed >= GOLEM_TACTICS.chamberSeconds) goTo("commit");
        return intent;
      }

      if (stance === "commit") {
        // **Both buttons, and the order is the capability.** A press with the guard held is the
        // swept cut on a chain that has one and the chop on a chain that does not, which is why
        // there is no branch here: the pair decides what the stroke *is*, and the module decides
        // what it does. Holding both starts nothing further -- a stroke is an edge -- so the mind
        // may sit on the buttons until it is ready to recover.
        hand.guard = canCover(cap);
        hand.thrust = true;
        writeAim(hand, cap, aim, me.outboard, 0, 0, 0);
        if (elapsed >= GOLEM_TACTICS.commitSeconds) goTo("recover");
        return intent;
      }

      // Recover: the guard goes back up immediately and the aim walks back to the covering line
      // under it, because the limb is what is slow and the button is not.
      hand.guard = canCover(cap);
      hand.thrust = false;
      aimAt(socket, guardMark, trunkHeading, me.outboard, cover);
      writeAim(hand, cap, cover, me.outboard, 0, GOLEM_TACTICS.coverLift, 1);
      if (elapsed >= GOLEM_TACTICS.recoverSeconds) {
        cooldown = GOLEM_TACTICS.cooldown;
        prefer = spare;
        ranged = 0;
        goTo(gap <= hold ? "measure" : "approach");
      }
      return intent;
    },
  };
}
