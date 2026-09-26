import { HAND_REACH } from "./hands.ts";
import type { FighterView, Intent } from "./mind.ts";
import { HANDS, STRIKER_KINDS, isStriking, type HandName, type Striker, type WeaponKind } from "./hands.ts";

/**
 * The action primitives' whole tuning surface, and why it is not `CONFIG`.
 *
 * `AGENTS.md` calls `src/config.ts` "the whole tuning surface", and this block is
 * the standing exception: this file may not import `config.ts` at all, which
 * `action_primitives_have_no_mutable_config_backdoor` in `tests/minds.test.mjs`
 * pins by reading the source text. It was the option layer's (`src/options.ts`),
 * which skill ceiling session 06 retired with the puppet takeover; what is left is
 * what the golem's scripted execution reads through `policies.ts` -- the rest
 * command, the threat selection and the stroke roll. The reason is not tidiness. `CONFIG` is
 * deliberately mutable so a person can type `__sword.config.arm.stiffness = 1600`
 * at the console and see the next frame change; a learned controller's legality
 * and aim rules must not be reachable that way, because an artifact trained
 * against one table and deployed against another is the exact failure the
 * research contract's version fields exist to refuse. Frozen here, and every
 * number in it carries its own argument.
 *
 * So these are **not** reachable from `__sword.config`, on purpose, and moving
 * one there is a contract change rather than a convenience.
 */
export const ACTION_TUNING = Object.freeze({
  restPointerX: 0,
  restPointerY: -1,
  /**
   * The arm's aiming envelope, mirroring `CONFIG.arm.az/elMin/Max`.
   *
   * **Four entries where there were two, and the two that were here were read
   * by nothing.** `azimuthRange`, the option layer's aim and `elevation` each wrote the
   * numbers out again, so `azimuthMax` appeared in its own comment and in one
   * test and nowhere a program looked -- and moving it 1.30 -> 1.45 turned that
   * test red while changing no behaviour at all, which is the shape this
   * directory calls a test that reads the reporter rather than the thing
   * reported. They are the single source now, and a mutation of any of the four
   * moves a real placement.
   *
   * The envelope is asymmetric, which is why it takes four numbers and not two:
   * a primary arm reaches 1.30 rad outboard and 1.15 rad across its own body,
   * and a secondary is the mirror. `azimuthRange` is what applies the mirror;
   * these are stated in the primary's frame, signed, exactly as `CONFIG.arm`
   * states them.
   */
  azimuthMin: -1.15,
  azimuthMax: 1.30,
  elevationMin: -1.05,
  elevationMax: 1.25,
  rollMin: -1.40,
  rollMax: 1.40,
  gravity: 9.81,
  // How wide a shaft may be predicted to pass and still count as the thing
  // worth covering, added to the observer's own collision radius. Half a body
  // width: an arrow that will miss by more than that is not going to be
  // intercepted by an arm either, and letting it outrank a blade at arm's
  // length would be the perception equivalent of flinching at nothing.
  //
  // It is also the scale of the weight `arriving` puts on a melee tip, which is
  // the same tolerance asked as a question of degree rather than as a gate.
  arrowMissMargin: 0.45,
  // How far back along its own flight a shaft's anchor is taken, in seconds.
  //
  // A number with a motor consequence, which is why it is here rather than
  // written into `arrowAnchor` as a literal: `duelistMind` reads `tip -
  // shoulder` as the direction a threat is pointing, so this is the whole of
  // what an arrow's `inLine` and therefore its `openingNow` are computed from. A
  // tenth of a second is about 4.8 m of flight at a 48 m/s shot, which is long
  // enough that the direction is the shaft's and not the solver's jitter.
  arrowAnchorSeconds: 0.1,
});

export const clampAction = (value: number, low = -1, high = 1): number =>
  Math.max(low, Math.min(high, Number.isFinite(value) ? value : 0));

export function freshIntent(): Intent {
  return {
    forward: 0, strafe: 0, turn: 0, actingHand: "primary",
    natural: { thrust: false, guard: false },
    posture: { trunkLean: 0, trunkTwist: 0, crouch: 0 },
    // `HAND_REACH.neutral` rather than a number of this table's own, and the
    // import is deliberate: this is what a hand at rest asks for, `hands.ts` is
    // where that is decided, and it imports nothing at all -- so there is no
    // mutable table behind it and no second copy to drift. The rule this file is
    // held to forbids `config.ts` specifically, and for a reason that does not
    // apply here: `CONFIG` is mutable from the console on purpose.
    primary: { pointerX: 0, pointerY: 0, reach: HAND_REACH.neutral,
      roll: 0, wristBend: 0, thrust: false, guard: false },
    secondary: { pointerX: ACTION_TUNING.restPointerX, pointerY: ACTION_TUNING.restPointerY,
      reach: HAND_REACH.neutral, roll: 0, wristBend: 0, thrust: false, guard: false },
  };
}

export type ActionPosture = "idle" | "close" | "cover" | "commit" | "recover" | "draw";

/** Shared body response; callers choose the factual hand they consider the threat. */
export function applyActionPosture(
  view: FighterView,
  action: ActionPosture,
  into: Intent,
  threat: ThreatView,
): Intent {
  const dx = threat.tip.x - view.self.shoulder.x;
  const dy = threat.tip.y - view.self.shoulder.y;
  const dz = threat.tip.z - view.self.shoulder.z;
  const highThreat = dy > 0.12 && (Math.hypot(dx, dy, dz) < 1.15 || threat.tipSpeed > 8);
  into.posture.trunkLean = 0; into.posture.trunkTwist = 0; into.posture.crouch = 0;
  into.primary.wristBend = 0; into.secondary.wristBend = 0;
  if (action === "cover") {
    into.posture.crouch = highThreat ? 0.58 : 0.22;
    into.posture.trunkLean = highThreat ? -0.32 : -0.10;
    for (const name of ["primary", "secondary"] as const) {
      if (view.self.hands[name].lost) continue;
      into[name].roll = -view.self.hands[name].outboard * 0.35;
      into[name].wristBend = 0.08;
    }
  } else if (action === "commit") {
    into.posture.crouch = 0.12; into.posture.trunkLean = 0.30;
    // `outboard` is the acting arm's side, and a natural striker has no arm --
    // so a body-relative +1 rather than a hand lookup that would read
    // `undefined.outboard` on a centipede. Nothing reaches this with a null
    // acting hand today (the bite skill sets no posture at all), so the guard
    // moves no existing caller: every scripted policy names a real hand.
    const acting = into.actingHand === null ? null : view.self.hands[into.actingHand];
    into.posture.trunkTwist = (acting?.outboard ?? 1) * 0.68;
    into.primary.wristBend = 0.12; into.secondary.wristBend = 0.12;
  } else if (action === "draw") {
    into.primary.roll = 0; into.secondary.roll = 0;
  } else {
    into.primary.roll = 0; into.secondary.roll = 0;
  }
  return into;
}

export interface ActionPoint { x: number; y: number; z: number }

/**
 * The one thing coming at me that is worth answering, and what is known about it.
 *
 * **There were three of these and two of them drove motor execution.**
 * `features.ts` sorted every attached hand by `tipSpeed` preferring the striking
 * ones; `options.ts` and `policies.ts` carried a byte-identical pair that picked
 * lead-versus-off by `isStriking` and then `tipSpeed`, synthesising a literal for
 * a body with no hands at all. The first could disagree with the other two about
 * which hand the threat was -- so the learned perception could be looking at one
 * blade while the cover skill covered the other, and nothing anywhere said so.
 * This is the reconciliation; the three are now one function with one answer.
 *
 * It is deliberately **not** a `HandView`. A threat can be a shaft nobody is
 * holding or a set of jaws that is not a hand, and the old shape could express
 * neither -- which is why `threat.weapon` was `"empty"` for a centipede's bite
 * and `striker` exists to say what is actually arriving.
 */
export interface ThreatView {
  /** What is arriving, over every `Striker`: a held kind, a fist, an arrow, a bite. */
  striker: Striker;
  /**
   * What is in the hand, for the readers that ask that and only that.
   *
   * `"empty"` whenever `striker` is not something a hand takes, which is honest
   * rather than convenient: an arrow is in nobody's hand.
   */
  weapon: WeaponKind;
  /** Which hand it belongs to, or null for an arrow or a natural attack. */
  source: HandName | null;
  /** Publication index within its group, so an order never depends on sort stability. */
  index: number;
  /** Where it is anchored: the shoulder for a hand, the body's own for the rest. */
  shoulder: ActionPoint;
  /** The point that arrives. */
  tip: ActionPoint;
  /** World velocity of that point, m/s. Zero for a body that publishes none. */
  velocity: ActionPoint;
  /** Magnitude of the above. */
  tipSpeed: number;
  /** How far the thing behind it can put that point out, metres. */
  reach: number;
  /** True when the arm carrying it has been cut off; false for everything else. */
  lost: boolean;
  /** Which side of its owner the arm is on, +1/-1. 1 for anything that is not an arm. */
  outboard: number;
  /** Seconds until it is nearest the observer's vitals; 0 when it is not closing. */
  timeToClosest: number;
  /** How near it gets then, metres. */
  closestMiss: number;
}

/** A record a caller owns, so `selectThreat` never has to allocate one. */
export const blankThreat = (): ThreatView => ({
  striker: "empty", weapon: "empty", source: null, index: 0,
  shoulder: { x: 0, y: 0, z: 0 }, tip: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
  tipSpeed: 0, reach: 0, lost: false, outboard: 1, timeToClosest: 0, closestMiss: 0,
});

/**
 * Closest approach of a point under a constant vertical acceleration to a fixed
 * point.
 *
 * Written into a module scratch and read immediately, the same contract the
 * view itself keeps. `t` is clamped at zero, so a receding thing reports the
 * distance it is at now and no negative time -- which is what makes "is this
 * closing" a single comparison rather than a sign convention to remember. It is
 * continuous across that clamp: as the radial component goes through zero, `t`
 * goes to zero and `miss` goes to the distance the thing is at, so nothing that
 * ranks on either key steps as a stroke turns over.
 *
 * **`accelY` is the gravity term, and it is there for the shaft.** A defender
 * predicting a straight line answers the shot the archer did not take, and here
 * that decides whether the shaft is answered at all. An archer aims *over* the
 * target by a lift (the retired option layer's `actionArrowLift`), so a straight line taken
 * off the current velocity sails above the vitals by very nearly that lift: 136
 * mm of predicted miss at 8 m, 306 at 12 and 689 at 18, against a gate of about
 * 610. The gravity-free version therefore declined shafts that were going to
 * hit, at exactly the ranges a bow is used at. A blade is not falling -- it is
 * on the end of a motorised arm -- so the melee callers pass zero, which is a
 * claim about the thing rather than an omission.
 *
 * One correction step rather than a root of the cubic. The exact displacement
 * over `t` is `(v + a t / 2) t`, so re-solving the straight-line time with that
 * mean velocity makes the model exact at the time it was taken and very near it
 * either side; the miss is then evaluated on the true parabola. Measured against
 * a 1 microsecond sweep of the real minimum over the geometry above: the errors
 * are the ones quoted, this is out by under 0.02 mm and 1 microsecond, and a
 * second correction step moves it by less than a micrometre.
 * `.review/approach-check.mjs`.
 */
const APPROACH = { seconds: 0, miss: 0 };
const closingTime = (rx: number, ry: number, rz: number, vx: number, vy: number, vz: number): number => {
  const speed2 = vx * vx + vy * vy + vz * vz;
  return speed2 > 1e-9 ? Math.max(0, -(rx * vx + ry * vy + rz * vz) / speed2) : 0;
};
function approachToScratch(px: number, py: number, pz: number, vx: number, vy: number, vz: number,
  tx: number, ty: number, tz: number, accelY: number): typeof APPROACH {
  const rx = px - tx; const ry = py - ty; const rz = pz - tz;
  let t = closingTime(rx, ry, rz, vx, vy, vz);
  if (accelY !== 0) t = closingTime(rx, ry, rz, vx, vy + accelY * t * 0.5, vz);
  APPROACH.seconds = t;
  APPROACH.miss = Math.hypot(rx + vx * t, ry + vy * t + accelY * t * t * 0.5, rz + vz * t);
  return APPROACH;
}

/**
 * The running winner of one `selectThreat` call.
 *
 * Scalars rather than a candidate object, so the search allocates nothing and
 * so the whole ordering is visible in one place. Larger is better in every key,
 * which is why the arrow tier offers negated time and miss: a rule where one
 * key is minimised and the rest maximised is a rule somebody inverts.
 *
 * `order` then `kind` are the declared tie-breaks, **in that order and not the
 * other way round**. `order` first is what makes the primary hand win a tie
 * between two hands that are equally still, which is what the two motor copies
 * this function replaced did (`primary.tipSpeed >= secondary.tipSpeed ? primary
 * : secondary`); with `kind` first it would have been the alphabet of
 * `STRIKER_KINDS` deciding which hand a guard covered. `kind` stays as the last
 * key because two *different groups* can offer the same slot -- a hand and a
 * bite are both slot 0 -- and without it that pair would be decided by which was
 * visited first, which is sort stability wearing a different hat.
 */
const BEST = { group: 4, slot: 0, tier: 0, major: 0, minor: 0, kind: 0, order: 0, found: false };
function offerThreat(group: number, slot: number, tier: number, major: number, minor: number,
  kind: number, order: number): void {
  if (BEST.found) {
    if (tier > BEST.tier) return;
    if (tier === BEST.tier) {
      if (major < BEST.major) return;
      if (major === BEST.major) {
        if (minor < BEST.minor) return;
        if (minor === BEST.minor) {
          if (order > BEST.order) return;
          if (order === BEST.order && kind >= BEST.kind) return;
        }
      }
    }
  }
  BEST.group = group; BEST.slot = slot; BEST.tier = tier; BEST.major = major;
  BEST.minor = minor; BEST.kind = kind; BEST.order = order; BEST.found = true;
}
const strikerIndex = (kind: Striker): number => STRIKER_KINDS.indexOf(kind);
/**
 * `tipSpeed` is passed rather than taken from `velocity`, and the two really are
 * separate facts here. A hand publishes both and `describeFighter` derives one
 * from the other, so they agree by construction; a body that publishes only a
 * speed -- a centipede's head -- has no direction to offer, and inventing one
 * from a zero vector would report it as motionless.
 */
const writeThreat = (into: ThreatView, striker: Striker, weapon: WeaponKind, source: HandName | null,
  index: number, shoulder: ActionPoint, tip: ActionPoint, vx: number, vy: number, vz: number,
  speed: number, reach: number, lost: boolean, outboard: number, seconds: number, miss: number): ThreatView => {
  into.striker = striker; into.weapon = weapon; into.source = source; into.index = index;
  into.shoulder.x = shoulder.x; into.shoulder.y = shoulder.y; into.shoulder.z = shoulder.z;
  into.tip.x = tip.x; into.tip.y = tip.y; into.tip.z = tip.z;
  into.velocity.x = vx; into.velocity.y = vy; into.velocity.z = vz;
  into.tipSpeed = speed; into.reach = reach; into.lost = lost;
  into.outboard = outboard; into.timeToClosest = seconds; into.closestMiss = miss;
  return into;
};
/**
 * Where a shaft was `arrowAnchorSeconds` ago.
 *
 * A shaft has no shoulder, and the field cannot simply be its own position:
 * `duelistMind` reads `tip - shoulder` as the direction the threat is pointing,
 * and a zero vector there reports every arrow in the air as an open guard. The
 * only anchor an arrow has is where it came from, so this is that, taken from
 * the velocity that is already published.
 */
const ARROW_ANCHOR = { x: 0, y: 0, z: 0 };
const arrowAnchor = (shot: FighterView["projectiles"][number]): ActionPoint => {
  const back = ACTION_TUNING.arrowAnchorSeconds;
  ARROW_ANCHOR.x = shot.position.x - shot.velocity.x * back;
  ARROW_ANCHOR.y = shot.position.y - shot.velocity.y * back;
  ARROW_ANCHOR.z = shot.position.z - shot.velocity.z * back;
  return ARROW_ANCHOR;
};

/**
 * How much of a tip's speed is actually arriving, over the whole of a stroke.
 *
 * **This replaces `closing`, which was the wrong quantity for a rotating
 * blade.** That key was `reading.seconds > 0 ? tipSpeed : 0` -- the *radial*
 * component of the tip's motion toward the vitals -- and a swung blade is mostly
 * *tangential* at the instant it is sampled. Measured over real duelist bouts, a
 * hand moving faster than 1.5 m/s reported as not closing on 44 % to 68 % of the
 * samples it appeared in: it is negative through the chamber, positive through
 * the commit and negative again through the recovery, so the key meant to say
 * "this blade is arriving" collapsed to zero for about half of every stroke and
 * a committed sword tied with a hand hanging at rest.
 *
 * So the geometry is taken from the same place the arrow tier takes it: the
 * closest approach of the extrapolated point to the observer's own vitals. Miss
 * distance is what separates a blade coming at you from one sweeping past, and
 * it degrades honestly rather than discontinuously -- a tip whose path leads
 * away reports the distance it is at now, which is large, and a tip that will
 * pass through your chest reports nearly zero.
 *
 * It is a weight on the speed rather than a gate on it, and that is the half
 * that had to be different from the arrow tier. A shaft that will pass wide is
 * *gone* and the gate excludes it; a blade that will pass wide is still on the
 * end of an arm that can bring it back inside a tenth of a second, so it is
 * demoted and not excluded. `gate` is the same half-body-width tolerance both
 * tiers measure against, so the weight is 1 for a tip arriving at the vitals,
 * 1/2 for one whose path misses by a body width, and it never reaches zero.
 *
 * Two tips that are both genuinely arriving therefore order by speed, exactly as
 * `threatHand` ordered them -- and two that are not, do not. What that costs in
 * agreement with the old rule is measured in `docs/measurements.md` rather than
 * asserted here.
 */
const arriving = (speed: number, miss: number, gate: number): number => speed * gate / (gate + miss);

/**
 * Pick the threat, from published facts alone.
 *
 * The order, and every part of it is a claim somebody can argue with:
 *
 * - **An opponent arrow that is actually closing outranks everything.** It is
 *   the only thing in the world that arrives whether or not you are in measure
 *   of it, so a fighter that answered the sword in front of it while a shaft was
 *   in the air would be reading the slower half of the fight. "Closing" is a
 *   positive time to closest approach to the observer's own vital centre *and* a
 *   predicted miss inside `arrowMissMargin`; a receding shaft reports `t = 0`
 *   and is excluded by the first half, a planted one is never published at all,
 *   and one that will pass wide is excluded by the second. Sooner wins, and a
 *   nearer pass breaks a tie on that.
 * - **Then whatever can strike** -- an attached hand holding a striking kind, a
 *   bare fist, a set of jaws -- ranked by `arriving`: how fast the point is
 *   moving, weighted by how near its path takes it to those vitals. A bite is in
 *   this tier and not below it because the tier *is* `isStriking`, and jaws are
 *   a striker. Nothing published today has both jaws and hands, so no bout in
 *   the tree can tell the difference; the day one does, this is the claim to
 *   argue with rather than an accident of two branches sharing a number.
 * - **Then an attached hand that cannot strike**, then a lost one, then the body
 *   itself -- which is the literal the scripted policies and the retired option
 *   layer used to synthesise inline for a body with no hands.
 *
 * Ties break by publication order and then by kind. For two hands that is the
 * primary, which is what both motor copies did; see `offerThreat`. **There is no
 * reach-margin key.** One stood here for a session: a third rule, with no
 * counterpart in either copy this function replaced, and it decided the answer
 * on every step where the key above it collapsed -- which, with the old
 * `closing`, was about half of them.
 *
 * **What this is not.** It is not the v3 ordering with a new name on it. Two
 * things changed the hand a scripted guard covers, and both are measured in
 * `docs/measurements.md` under "Threat selection, reconciled" rather than
 * claimed here:
 *
 * - an empty hand publishes a real `tipSpeed` now, where v3 published a literal
 *   zero, so a fist is a candidate that can win; and
 * - `arriving` is not `tipSpeed`, so two tips order by speed only when both are
 *   genuinely coming at the vitals.
 *
 * Every scripted range and opening in the tree was tuned against the v3
 * ordering, so that disagreement is a real behavioural change and is reported as
 * one.
 *
 * `into` is the caller's record. Every caller on the control step owns one and
 * reads it before the next call, which is the same contract `FighterView` keeps.
 */
export function selectThreat(view: FighterView, into: ThreatView = blankThreat()): ThreatView {
  const self = view.self; const them = view.opponent;
  const vitalX = self.ground.x; const vitalY = self.vitalHeight; const vitalZ = self.ground.z;
  const gate = self.collisionRadius + ACTION_TUNING.arrowMissMargin;
  const fall = -ACTION_TUNING.gravity;
  BEST.found = false; BEST.group = 4; BEST.slot = 0;
  for (let index = 0; index < view.projectiles.length; index += 1) {
    const shot = view.projectiles[index] as FighterView["projectiles"][number];
    if (shot.owner !== "opponent") continue;
    const reading = approachToScratch(shot.position.x, shot.position.y, shot.position.z,
      shot.velocity.x, shot.velocity.y, shot.velocity.z, vitalX, vitalY, vitalZ, fall);
    if (reading.seconds <= 0 || reading.miss > gate) continue;
    offerThreat(0, index, 0, -reading.seconds, -reading.miss, strikerIndex("arrow"), index);
  }
  for (let slot = 0; slot < HANDS.length; slot += 1) {
    const name = HANDS[slot] as HandName;
    const hand = them.hands[name];
    if (!hand) continue;
    const tier = hand.lost ? 3 : isStriking(hand.weapon) ? 1 : 2;
    // A blade is held up by motors rather than falling, so no gravity term. See
    // `approachToScratch`, which takes that as an argument precisely so the two
    // callers state which they mean.
    const reading = approachToScratch(hand.tip.x, hand.tip.y, hand.tip.z,
      hand.tipVelocity.x, hand.tipVelocity.y, hand.tipVelocity.z, vitalX, vitalY, vitalZ, 0);
    offerThreat(1, slot, tier, arriving(hand.tipSpeed, reading.miss, gate), 0,
      strikerIndex(hand.weapon), slot);
  }
  const effectors = them.effectors ?? [];
  for (let index = 0; index < effectors.length; index += 1) {
    const effector = effectors[index];
    const tier = effector.lost ? 3 : isStriking(effector.weapon) ? 1 : 2;
    const reading = approachToScratch(effector.tip.x, effector.tip.y, effector.tip.z,
      effector.tipVelocity.x, effector.tipVelocity.y, effector.tipVelocity.z,
      vitalX, vitalY, vitalZ, 0);
    offerThreat(2, index, tier, arriving(Math.hypot(effector.tipVelocity.x,
      effector.tipVelocity.y, effector.tipVelocity.z), reading.miss, gate), 0,
    strikerIndex(effector.weapon), HANDS.length + index);
  }
  const bite = them.naturalAttacks?.bite;
  if (bite) {
    // The head is the striker and the body speed is its speed; there is no
    // direction to extrapolate, so the miss is simply where it is now.
    const reading = approachToScratch(them.tip.x, them.tip.y, them.tip.z, 0, 0, 0, vitalX, vitalY, vitalZ, 0);
    offerThreat(3, 0, 1, arriving(them.tipSpeed, reading.miss, gate), 0, strikerIndex("bite"), 0);
  }
  if (BEST.group === 0) {
    const shot = view.projectiles[BEST.slot] as FighterView["projectiles"][number];
    const speed = Math.hypot(shot.velocity.x, shot.velocity.y, shot.velocity.z);
    return writeThreat(into, "arrow", "empty", null, BEST.slot, arrowAnchor(shot), shot.position,
      shot.velocity.x, shot.velocity.y, shot.velocity.z, speed, 0, false, 1,
      -BEST.major, -BEST.minor);
  }
  if (BEST.group === 1) {
    const name = HANDS[BEST.slot] as HandName;
    const hand = them.hands[name];
    const reading = approachToScratch(hand.tip.x, hand.tip.y, hand.tip.z,
      hand.tipVelocity.x, hand.tipVelocity.y, hand.tipVelocity.z, vitalX, vitalY, vitalZ, 0);
    return writeThreat(into, hand.weapon, hand.weapon, name, BEST.slot, hand.shoulder, hand.tip,
      hand.tipVelocity.x, hand.tipVelocity.y, hand.tipVelocity.z, hand.tipSpeed, hand.reach,
      hand.lost, hand.outboard, reading.seconds, reading.miss);
  }
  if (BEST.group === 2) {
    const effector = effectors[BEST.slot];
    const reading = approachToScratch(effector.tip.x, effector.tip.y, effector.tip.z,
      effector.tipVelocity.x, effector.tipVelocity.y, effector.tipVelocity.z,
      vitalX, vitalY, vitalZ, 0);
    return writeThreat(into, effector.weapon, effector.weapon, null, BEST.slot,
      effector.anchor, effector.tip, effector.tipVelocity.x, effector.tipVelocity.y,
      effector.tipVelocity.z, Math.hypot(effector.tipVelocity.x, effector.tipVelocity.y,
        effector.tipVelocity.z), effector.reach, effector.lost, 1, reading.seconds, reading.miss);
  }
  // A creature whose whole head is the striker publishes a body speed and no
  // direction, so `velocity` stays zero rather than being invented from one.
  const reading = approachToScratch(them.tip.x, them.tip.y, them.tip.z, 0, 0, 0, vitalX, vitalY, vitalZ, 0);
  if (BEST.group === 3 && bite) {
    return writeThreat(into, "bite", "empty", null, 0, them.shoulder, them.tip,
      0, 0, 0, them.tipSpeed, bite.reach, false, 1, reading.seconds, reading.miss);
  }
  // Nothing attached, nothing natural: the body itself, exactly the literal the
  // two motor copies used to build inline.
  return writeThreat(into, "empty", "empty", null, 0, them.shoulder, them.tip,
    0, 0, 0, them.tipSpeed, them.reach, false, 1, reading.seconds, reading.miss);
}

const azimuthRange = (hand: HandName): readonly [number, number] =>
  hand === "primary" ? [ACTION_TUNING.azimuthMin, ACTION_TUNING.azimuthMax]
    : [-ACTION_TUNING.azimuthMax, -ACTION_TUNING.azimuthMin];
const azimuth = (pointer: number, hand: "primary" | "secondary"): number => {
  const [min, max] = azimuthRange(hand);
  return pointer >= 0 ? pointer * max : pointer * -min;
};
const elevation = (pointer: number): number =>
  pointer >= 0 ? pointer * ACTION_TUNING.elevationMax : pointer * -ACTION_TUNING.elevationMin;
export function actionStrokeRoll(fromX: number, fromY: number, toX: number, toY: number,
  bothEdges: boolean, hand: "primary" | "secondary"): number {
  const da = azimuth(toX, hand) - azimuth(fromX, hand);
  const de = elevation(toY) - elevation(fromY);
  const mid = (elevation(toY) + elevation(fromY)) / 2;
  let roll = Math.atan2(-Math.cos(mid) * da, de);
  if (bothEdges) { while (roll > Math.PI / 2) roll -= Math.PI; while (roll < -Math.PI / 2) roll += Math.PI; }
  return clampAction(roll, ACTION_TUNING.rollMin, ACTION_TUNING.rollMax);
}

