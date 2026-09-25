/**
 * The walker: the middle rung of the naive ladder (skill ceiling session 03,
 * `docs/plans/2026-09-25-skill-ceiling-03-drills-and-league.md`).
 *
 * It faces the other body, walks straight in, and swings on a fixed clock whenever the other body
 * is inside its reach. That is the whole of it, and each missing piece is missing on purpose:
 *
 * - **No reading.** Nothing here looks at the other body's weapons, its speed or its stroke. The
 *   only things read are where the other body stands and how far this body's own striker reaches.
 * - **No guard.** Between swings the striker is held pointed at the mark it will swing at; the
 *   other hand rests where a person's un-pressed hand rests. Nothing covers anything.
 * - **No footwork.** It never backs off, never circles and never strafes: it walks in until it is
 *   inside its own striking range and stands there.
 *
 * It is an `Intent` mind until session 06 replaces the command surface; after that it is written
 * against the new surface. What it swings with is chosen by capability, never by module: the
 * primary hand when it can be asked for a stroke, the other hand when only that one can, and the
 * body's natural striker (a ram head) when no hand can.
 *
 * **The stroke is shared.** `strokeCommand` below writes one stroke of a published striker from its
 * published capability, and the drills (`tests/harness/drills.mjs`) drive their scripted opponents
 * through the same function, so a drill's "committed cut" is the stroke a walker would throw.
 */
import type { FighterView, HandName, Intent } from "../mind.ts";
import type { Forkable } from "../forkable.ts";
import { mulberry32 } from "../rng.ts";
import {
  GOLEM_TACTICS, STROKE_SHAPES, aimAt, angleTo, canAttack, canSwing, clamp, distance, freshGolemIntent,
  mirror, readyNatural, reachForDistance, writeAim, type Aim, type Point,
} from "./tactics.ts";

export const WALKER = {
  /** Seconds between two swings while the other body is in reach: the fixed clock. */
  period: 1.1,
  /** The walk stops at this fraction of the striker's reach, measured socket to mark. */
  holdFraction: 0.80,
  /** Swings begin inside this fraction of the striker's reach. */
  strikeFraction: GOLEM_TACTICS.strikeFraction,
  /** How hard it walks in, per metre it is short of its hold (the duelist's gain). */
  closeGain: GOLEM_TACTICS.closeGain,
  /** How hard it turns to face, per radian of error (the duelist's gain). */
  turnGain: GOLEM_TACTICS.turnGain,
  /** Where along the terminal the mark is wanted, as the duelist's `strikeBite`. */
  strikeBite: GOLEM_TACTICS.strikeBite,
};

/** What a stroke is doing at a given moment of it. */
export type StrokeStage = "chamber" | "commit" | "done";

/** The striker a body swings: a hand, or its natural striker (`null`), or nothing at all. */
export type StrikerChoice = { readonly hand: HandName | null; readonly reach: number } | null;

/**
 * The striker this body swings, by capability: the primary if it can be asked for a stroke, the
 * other hand if only it can, the natural striker if no hand can, and nothing otherwise. A hand
 * that has come off is not a striker.
 */
export function chooseStriker(view: FighterView): StrikerChoice {
  const self = view.self;
  const caps = self.capabilities;
  if (!caps) return null;
  for (const hand of ["primary", "secondary"] as const) {
    if (!self.hands[hand].lost && canAttack(caps.effectors[hand])) return { hand, reach: self.hands[hand].reach };
  }
  const natural = readyNatural(self);
  return natural ? { hand: null, reach: natural.reach } : null;
}

/**
 * How far the striker is from the mark: socket to mark for a hand, carrier to carrier on the
 * ground for a natural striker (whose reach is published from over the carrier's own centre).
 */
export function strikerGap(view: FighterView, striker: StrikerChoice, mark: Point): number {
  const self = view.self;
  const them = view.opponent;
  if (!striker) return Infinity;
  if (striker.hand === null) return Math.hypot(them.ground.x - self.ground.x, them.ground.z - self.ground.z);
  return distance(self.hands[striker.hand].shoulder, mark);
}

/** Their shoulder height over their footprint, which is where the duelist aims too. */
export function markOf(view: FighterView, into: Point, lift = 0): Point {
  const them = view.opponent;
  into.x = them.ground.x;
  into.y = them.shoulder.y + lift;
  into.z = them.ground.z;
  return into;
}

/** Turn to face the other body, the only feet command every mind here shares. */
export function faceThem(intent: Intent, view: FighterView, gain = WALKER.turnGain): void {
  const self = view.self;
  const them = view.opponent;
  const bearing = Math.atan2(them.ground.x - self.ground.x, them.ground.z - self.ground.z);
  intent.turn = clamp(angleTo(self.facing, bearing) * gain, -1, 1);
}

/**
 * Hold a striker pointed at `mark`, drawn to the middle of its reach: the walker's rest between
 * swings and a drill actor's stance before one. A natural striker is left in its own rest.
 */
export function pointAt(intent: Intent, view: FighterView, hand: HandName | null, mark: Point, scratch: Aim): void {
  intent.posture.trunkTwist = 0;
  intent.posture.trunkLean = 0;
  intent.natural.thrust = false;
  intent.natural.guard = false;
  if (hand === null) return;
  const self = view.self;
  const caps = self.capabilities;
  if (!caps) return;
  const me = self.hands[hand];
  const cap = caps.effectors[hand];
  const trunkHeading = self.facing + self.trunkTwist * caps.trunkTwistMax;
  aimAt(me.shoulder, mark, trunkHeading, me.outboard, scratch);
  writeAim(intent[hand], cap, scratch, me.outboard, 0, 0, 1, 0);
  const shape = STROKE_SHAPES[me.weapon];
  intent[hand].roll = cap.rollMax > 0 ? clamp(shape.roll, -cap.rollMax, cap.rollMax) : 0;
  intent[hand].wristBend = 0;
  intent[hand].thrust = false;
  intent[hand].guard = false;
}

/** How long one stroke of this striker lasts, chamber and follow-through included, seconds. */
export function strokeSeconds(view: FighterView, hand: HandName | null): number {
  if (hand === null) return GOLEM_TACTICS.ramSeconds;
  const shape = STROKE_SHAPES[view.self.hands[hand].weapon];
  return shape.chamberSeconds + Math.max(GOLEM_TACTICS.commitSeconds, shape.strokeSeconds + GOLEM_TACTICS.followSeconds);
}

/**
 * One stroke of a published striker at `mark`, `elapsed` seconds into it, written into `intent`.
 *
 * A hand's stroke is the duelist's: a chamber outboard of and above the mark, then a sweep through
 * it to the weapon's follow on the clock of its `STROKE_SHAPES` row, with the trunk wound and swept
 * and the feet stepping by the shape's `stepIn`. A natural striker's is a ram: the trunk leans in,
 * and the neck fires once the lean has had `ramLeanSeconds`. Nothing is rate-limited here; whether
 * the limb follows the command is the body's business.
 */
export function strokeCommand(
  intent: Intent, view: FighterView, hand: HandName | null, elapsed: number, mark: Point, scratch: Aim,
): StrokeStage {
  const self = view.self;
  const caps = self.capabilities;
  if (!caps) return "done";
  if (hand === null) {
    intent.posture.trunkTwist = 0;
    intent.posture.trunkLean = GOLEM_TACTICS.ramLean;
    intent.natural.guard = false;
    intent.natural.thrust = elapsed >= GOLEM_TACTICS.ramLeanSeconds;
    intent.forward = 1;
    return elapsed >= GOLEM_TACTICS.ramSeconds ? "done" : elapsed >= GOLEM_TACTICS.ramLeanSeconds ? "commit" : "chamber";
  }
  const me = self.hands[hand];
  const cap = caps.effectors[hand];
  const shape = STROKE_SHAPES[me.weapon];
  const trunkHeading = self.facing + self.trunkTwist * caps.trunkTwistMax;
  const handIntent = intent[hand];
  aimAt(me.shoulder, mark, trunkHeading, me.outboard, scratch);
  intent.natural.thrust = false;
  intent.natural.guard = false;
  handIntent.guard = false;
  handIntent.wristBend = cap.bendMax > 0 ? GOLEM_TACTICS.cutBend : 0;
  if (elapsed < shape.chamberSeconds) {
    intent.posture.trunkTwist = me.outboard * GOLEM_TACTICS.trunkSweep;
    intent.posture.trunkLean = 0;
    handIntent.thrust = false;
    handIntent.roll = cap.rollMax > 0 ? clamp(shape.windRoll, -cap.rollMax, cap.rollMax) : 0;
    writeAim(handIntent, cap, scratch, me.outboard, canSwing(cap) ? shape.chamberSwing : 0, shape.chamberLift, 1,
      shape.chamberReach);
    return "chamber";
  }
  const into = elapsed - shape.chamberSeconds;
  const commitEnds = Math.max(GOLEM_TACTICS.commitSeconds, shape.strokeSeconds + GOLEM_TACTICS.followSeconds);
  if (into >= commitEnds) return "done";
  const t = shape.strokeSeconds > 0 ? clamp(into / shape.strokeSeconds, 0, 1) : 1;
  const swept = canSwing(cap) ? 1 : 0;
  const strikeReach = reachForDistance(distance(me.shoulder, mark), me.reach, cap, WALKER.strikeBite);
  intent.posture.trunkTwist = -me.outboard * GOLEM_TACTICS.trunkSweep;
  intent.posture.trunkLean = GOLEM_TACTICS.commitLean;
  handIntent.thrust = true;
  handIntent.roll = cap.rollMax > 0 ? clamp(shape.roll, -cap.rollMax, cap.rollMax) : 0;
  intent.forward = clamp(intent.forward + shape.stepIn, -1, 1);
  writeAim(handIntent, cap, scratch, me.outboard,
    swept * (shape.chamberSwing - t * (shape.chamberSwing + shape.followSwing)),
    shape.chamberLift - t * (shape.chamberLift + shape.followLift),
    0,
    shape.chamberReach + t * (strikeReach - shape.chamberReach));
  return "commit";
}

/** Rest a hand where a person's un-pressed hand rests: no aim, no guard, nothing covered. */
export function restHand(intent: Intent, hand: HandName): void {
  const h = intent[hand];
  h.pointerX = 0; h.pointerY = 0; h.reach = 0; h.roll = 0; h.wristBend = 0; h.thrust = false; h.guard = false;
}

export interface GolemWalker extends Forkable {
  decide(view: FighterView, dt: number): Intent;
}

/** The walker's state machine: walk, and on the clock, swing. */
export function golemWalker(seed: number): GolemWalker {
  const random = mulberry32(seed);
  const intent = freshGolemIntent();
  const aim: Aim = { swing: 0, lift: 0, horizontal: 0 };
  const mark: Point = { x: 0, y: 0, z: 0 };
  /** Seconds since the last swing began; seeded so two walkers built together are out of phase. */
  let sinceSwing = random() * WALKER.period;
  /** Seconds into the swing in progress, or -1 between swings. */
  let swinging = -1;
  /** Which striker the swing in progress is thrown with (`null` is the natural striker). */
  let swingHand: HandName | null = "primary";

  const decide = (view: FighterView, dt: number): Intent => {
    intent.forward = 0;
    intent.strafe = 0;
    intent.posture.crouch = 0;
    faceThem(intent, view);
    markOf(view, mark);
    const striker = chooseStriker(view);
    const other: HandName = striker?.hand === "secondary" ? "primary" : "secondary";
    restHand(intent, other);
    intent.actingHand = striker ? striker.hand : "primary";
    if (!striker) {
      restHand(intent, "primary");
      intent.posture.trunkTwist = 0;
      intent.posture.trunkLean = 0;
      intent.natural.thrust = false;
      intent.natural.guard = false;
      return intent;
    }
    const gap = strikerGap(view, striker, mark);
    // Straight in, easing off over the last half metre so it stops at its hold rather than in them;
    // never backwards, which would be footwork.
    intent.forward = clamp((gap - striker.reach * WALKER.holdFraction) * WALKER.closeGain, 0, 1);
    sinceSwing += dt;
    // A natural striker's reach is published from over its own carrier, which two bodies' collision
    // radii keep further apart than a ram head reaches (0.92 m against 0.68 on the wheeled rammer,
    // Node bout runner), so it fires from the duelist's lunge gate rather than from inside its reach.
    const strikeAt = striker.hand === null ? striker.reach + GOLEM_TACTICS.ramLunge : striker.reach * WALKER.strikeFraction;
    if (swinging < 0 && gap <= strikeAt && sinceSwing >= WALKER.period) {
      swinging = 0;
      sinceSwing = 0;
      swingHand = striker.hand;
    }
    if (swinging >= 0) {
      const stage = strokeCommand(intent, view, swingHand, swinging, mark, aim);
      swinging += dt;
      if (stage === "done") swinging = -1;
    }
    if (swinging < 0) pointAt(intent, view, striker.hand, mark, aim);
    if (view.self.capabilities?.pairedHands) mirror(intent.primary, intent.secondary);
    return intent;
  };

  return {
    decide,
    // A fork of the world (`src/forkable.ts`): every let and every object the walker steps on.
    captureState: (): Record<string, unknown> => ({ random, intent, aim, mark, sinceSwing, swinging, swingHand }),
    restoreState(state: Record<string, unknown>): void {
      ({ sinceSwing, swinging, swingHand } = state as never);
    },
  };
}
