// Explicit `.ts` extension, for the reason `fighter.ts` gives at length: Node
// runs a TypeScript file by stripping its types, and its ESM resolver insists on
// the extension where Vite does not care.
//
// `config.ts` is the *only* run-time import in this file, and that is a property
// worth keeping rather than an accident. `config.ts` imports nothing at all, so
// a policy can be put in front of a hand-written view in `tests/minds.test.mjs`
// with no Babylon, no scene and no bout anywhere in the graph -- which is what
// makes those tests cost milliseconds instead of seconds. The geometry below is
// therefore written out in scalars on `{ x, y, z }` rather than through
// `Vector3`'s methods: every position a view carries is a `Vector3` in the
// arena, but nothing here needs it to be one, so nothing here demands it.
import { CONFIG } from "./config.ts";
// `hands.ts` imports nothing either, so the property above still holds exactly:
// a policy can be put in front of a hand-written view with no Babylon anywhere
// in the graph. It is imported for its *values* -- a policy has to ask what the
// hand it is planning for is holding, and to be able to name the other hand.
import {
  cutsBothWays,
  handsFor,
  hasHeldWeapon,
  isShield,
  isShooting,
  isStrapped,
  isStriking,
  otherHand,
  type HandName,
} from "./hands.ts";
import type { BodyView, FighterView, HandIntent, Intent, Mind } from "./mind.ts";
import { ACTION_SHOT_TIMING, ACTION_STROKE_TIMING, actionAimAt, actionArcherAim, actionCoverAt, actionDistance, actionShotPhase, bareCrowdDistance, bareHoldDistance,
  actionStrokePose, actionStrokeReading, actionStrokeRoll, applyActionPosture, blankThreat, freshIntent, selectThreat, strokePoint,
  type ThreatView } from "./action-primitives.ts";

/**
 * The two policies that fight.
 *
 * Both of them drive a fighter through the same `Intent` a person produces --
 * a cursor position, a wrist roll, a thrust, a guard and three movement axes --
 * and neither can do anything else. There is no call anywhere in this file that
 * sets a joint angle, places a blade, or reads the other mind: a policy that
 * wants to know whether it is about to be hit has to look at a blade, the same
 * way you do.
 *
 * That constraint is what makes the measurements in `docs/measurements.md`
 * worth taking -- the policy table in particular. An AI that could
 * pose the arm directly would be a different game's AI, and beating it would say
 * nothing about whether *this* arm is worth fighting with.
 *
 * **On fractional axes.** A person's `forward`, `strafe` and `turn` are only ever
 * -1, 0 or +1, because they come from keys. A policy here returns fractions of
 * those, which is the same controller read as a stick rather than as a switch --
 * `steer` multiplies the axis by a speed and by nothing else, so 0.4 is
 * four-tenths of a walk and not a privilege. What a fraction buys is a
 * proportional turn, which stops a policy from sawing left and right across the
 * heading it wants; the ceiling is still `fighter.turnSpeed`, so a policy turns
 * no faster than a person holding Q.
 */

const A = CONFIG.arm;

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

/** The one shape any position in a `FighterView` has to have to be read here. */
interface Point {
  x: number;
  y: number;
  z: number;
}

const distance = actionDistance;

/** Where a cursor is, which is the only thing a policy ever hands the arm. */
interface Aim {
  pointerX: number;
  pointerY: number;
}

const WRIST = {
  neutral: 0,
  guard: 0.08,
  cut: 0.12,
  shield: 0.18,
} as const;

/**
 * A fresh intent for a policy to own and overwrite in place.
 *
 * `mind.ts`'s `NEUTRAL` is the same thing frozen, and this is deliberately not a
 * copy of it: importing a *value* from `mind.ts` would make the dependency
 * between the two files run both ways at run time, and a module cycle that
 * happens to work because nobody reads the constant during evaluation is exactly
 * the sort of thing that stops working when somebody moves a line -- in the
 * browser, not in a test. The annotation is what keeps the two shapes married:
 * add a field to `Intent` and this is a compile error rather than a key that is
 * quietly missing.
 *
 * One of these per mind, returned from every `decide` and never reallocated,
 * because `decide` runs 240 times a second per fighter.
 *
 * Exported for the tests, which used to declare their own copies of this shape
 * -- four of them, all plain JS and all untyped, so none of them was a compile
 * error when the intent grew two hands and every one of them handed `undefined`
 * to an arm. A fixture that can silently disagree with the thing it stands for
 * is worse than no fixture.
 */
export const blankIntent = (): Intent => freshIntent();

export type PostureAction = "idle" | "close" | "cover" | "commit" | "recover" | "draw";

/**
 * Procedural whole-body answer to an action policy's decision.
 *
 * The action policy still decides whether to close, cover, strike or draw. This
 * layer owns only the extra degrees of freedom: the waist, knees and wrist
 * orientation. It is deliberately stateless so the body's response limit is
 * the one place posture speed is decided.
 */
export function postureFor(view: FighterView, action: PostureAction, into: Intent): Intent {
  return applyActionPosture(view, action, into, threatHand(view));
}

/**
 * Which hand a policy is attacking with, this step.
 *
 * It used to be `intent[intent.actingHand]`, **read once at construction**, and
 * that one line is most of "when selecting two swords, only one hand is used".
 * `blankIntent` sets `actingHand: "primary"` and nothing ever wrote it, so the
 * second hand kept the rest pose it was built with for the whole bout.
 *
 * Asked every step rather than settled once, because the answer changes: an arm
 * gets cut off, and the two hands take turns. `prefer` is what the policy would
 * like -- the hand whose turn it is -- and this is the nearest thing to it that
 * can actually hit somebody. With two fists the caller supplies what it knows
 * how to watch: a duelist passes the dangerous hand, while a swinger passes the
 * opponent's chest and preserves its defining ignorance of blades. A hand
 * holding a shield is never selected, which is the other half of the fix: a
 * fighter carrying a shield in the primary and a sword in the secondary used
 * to attack with the shield.
 */
function attackHand(view: FighterView, prefer: HandName, threat: Point): HandName {
  const hands = view.self.hands;
  const spare = otherHand(prefer);
  const armed = (name: HandName): boolean =>
    !hands[name].lost && isStriking(hands[name].weapon);
  const steel = (name: HandName): boolean =>
    armed(name) && hasHeldWeapon(hands[name].weapon);
  // A fist is an attack of last resort. The preference between hands may never
  // make a fighter put down the sword it already has in order to punch.
  if (steel(prefer)) return prefer;
  if (steel(spare)) return spare;
  if (armed(prefer) && armed(spare)) {
    // With two bare hands, leave the one already nearest the threat on cover.
    const gap2 = (name: HandName): number => {
      const tip = hands[name].tip;
      const x = tip.x - threat.x;
      const y = tip.y - threat.y;
      const z = tip.z - threat.z;
      return x * x + y * y + z * z;
    };
    return gap2(prefer) >= gap2(spare) ? prefer : spare;
  }
  if (armed(prefer)) return prefer;
  if (armed(spare)) return spare;
  // Nothing left to swing. Keep an arm that is still attached, so the fighter
  // goes on turning to face and goes on covering with whatever it has.
  return hands[prefer].lost && !hands[spare].lost ? spare : prefer;
}

/**
 * Which hand a policy is *shooting* with, this step.
 *
 * `attackHand`'s sibling rather than a flag on it, because the two questions have
 * different answers and a policy knows which one it is asking. A bow is not a
 * striking weapon -- you do not swing it -- so `isStriking` is false for one and
 * `attackHand` would walk straight past the only hand that matters to an archer.
 *
 * When neither hand shoots it hands back `attackHand`'s answer, so an archer
 * given a sword still turns to face and still has an arm it can be told about.
 * It will not fence with it: see `archerMind`, which declines to invent a
 * swordsman out of a policy that is not one.
 */
function shootHand(view: FighterView, prefer: HandName): HandName {
  const hands = view.self.hands;
  const able = (name: HandName): boolean =>
    !hands[name].lost && isShooting(hands[name].weapon);
  if (able(prefer)) return prefer;
  const spare = otherHand(prefer);
  if (able(spare)) return spare;
  return attackHand(view, prefer, view.opponent.shoulder);
}

/**
 * The thing of theirs worth watching.
 *
 * `BodyView.tip` is the primary's and stays the primary's -- see its own note --
 * so a guard built on it is a guard against whichever hand happens to be first,
 * which is the shield if they are carrying one there. This picked the hand that
 * could actually hurt, and the faster of the two when both could.
 *
 * It was a lead-versus-off pick written out here, **byte-identical to a copy in
 * `options.ts`** and disagreeing with a third in `learning/features.ts` -- so
 * the guard and the learned perception could be looking at different hands, and
 * nothing said so. `selectThreat` is the one answer now, and it can also say
 * "the shaft in the air", which no version of this shape could.
 *
 * **It is a different answer, not the same one refactored.** An empty hand
 * publishes a real speed now and the ranking is not `tipSpeed`, so the hand this
 * policy guards against differs from the one it guarded against at `f789ea4` on
 * about a tenth of the control steps of a sword-and-fist duel and a quarter of a
 * bare-handed one. That is measured, with the win rates either side of it, in
 * `docs/measurements.md` under "Threat selection, reconciled".
 *
 * The scratch is module-level rather than per policy, for the reason this
 * function was module-level: `decide` runs 240 times a second per fighter, both
 * fighters decide synchronously, and neither keeps what it is handed.
 */
const threatScratch = blankThreat();
const threatHand = (view: FighterView): ThreatView => selectThreat(view, threatScratch);

/**
 * The cursor and the arm's aim, in both directions.
 *
 * `Fighter.aimArm` maps the cursor onto an azimuth and an elevation **in torso
 * space** through its own `spread`, which is deliberately asymmetric -- the arm
 * reaches further across its own side than across the far one -- so the inverse
 * has to be asymmetric in the same way, and reading the four limits out of
 * `config.ts` is how the two stay married when somebody retunes the envelope.
 *
 * `azimuthOf` and `elevationOf` are `spread` written out for the two axes it is
 * used on, which is a third copy of one rule and is worth being uneasy about.
 * They are not shared with `fighter.ts` because that file imports Babylon and
 * this one deliberately imports nothing but `config.ts`, which is the whole
 * reason `tests/minds.test.mjs` costs milliseconds. What guards the drift is not
 * this comment: it is the takeover reading in `main.ts`, which inverts the
 * mapping to seed a handover and then measures how far the hand actually moved
 * on the next step. A disagreement between the two copies shows up there as
 * hundreds of millimetres, immediately, in the page.
 *
 * The inverses clamp into the cursor's own -1..1, so a point behind the fighter
 * or above its reach comes back as the nearest thing the controller can ask for
 * rather than as a wrapped angle pointing somewhere absurd. That matters: a
 * target directly behind produces an azimuth near +-pi, and without the clamp
 * the sign of that would decide which way the arm flailed.
 */
const azimuthRange = (hand: HandName): readonly [number, number] =>
  hand === "primary" ? [A.azMin, A.azMax] : [-A.azMax, -A.azMin];
export const azimuthOf = (pointerX: number, hand: HandName = "primary") => {
  const [min, max] = azimuthRange(hand);
  return pointerX >= 0 ? pointerX * max : pointerX * -min;
};
export const elevationOf = (pointerY: number) =>
  pointerY >= 0 ? pointerY * A.elMax : pointerY * -A.elMin;
export const cursorForAzimuth = (azimuth: number, hand: HandName = "primary") => {
  const [min, max] = azimuthRange(hand);
  return clamp(azimuth >= 0 ? azimuth / max : azimuth / -min, -1, 1);
};
export const cursorForElevation = (elevation: number) =>
  clamp(elevation >= 0 ? elevation / A.elMax : elevation / -A.elMin, -1, 1);

/**
 * Where the cursor has to sit for the hand to be sent at a point in the world.
 *
 * `from` is the shoulder the arm hangs off, and it defaults to the body's --
 * which is the primary's, and was the only one anybody could aim before there
 * were two. It matters for the other one: the two sockets are 420 mm apart, so
 * a bearing taken from the wrong one is out by about eight degrees at fighting
 * distance, and the whole of a shield's placement is an angle measured off that
 * bearing.
 */
function aimAt(view: FighterView, target: Point, into: Aim, hand: HandName, from?: Point): Aim {
  return actionAimAt(view, target, into, hand, from);
}

/**
 * The wrist roll that puts the edge along the stroke, from the stroke alone.
 *
 * This is the difference between a cut and a slap, and it is worth deriving
 * rather than guessing, because guessing it wrong is invisible -- the swing looks
 * identical and simply does no damage.
 *
 * `driveAnchor` builds the hand's frame from the aim direction `a`: the edge
 * starts as `e0`, the part of world up perpendicular to `a`, and is then turned
 * about `a` by `roll` toward `z0 = a x e0`. Writing `a` out in the torso's
 * spherical angles, `e0` is exactly `da/d(elevation)` and `z0` works out to
 * `(-cos az, 0, sin az)`, which makes `da/d(azimuth) = -cos(el) * z0`. So a
 * stroke that moves the cursor by `dAz` and `dEl` sends the blade along
 *
 *     v  ~  dEl * e0  -  cos(el) * dAz * z0
 *
 * and the edge lies along `v` when `roll = atan2(-cos(el) * dAz, dEl)`.
 *
 * Measured against that derivation in `.review/swing-probe.mjs`, on the
 * swinger's own stroke: edge alignment at the peak of the swing is **0.955**
 * with this roll, **0.740** with the roll left at zero, and **0.126** with the
 * sign flipped. The damage model raises alignment to the power of
 * `combat.edgeExponent`, which is 2, so those three are worth 91 %, 55 % and 2 %
 * of a full cut. Getting the sign backwards is not a near miss.
 *
 * Folded into +-pi/2 **when the weapon is double-edged**, which the sword is and
 * which was the only case there was: the damage model takes the absolute value
 * of the edge dot product, so `roll` and `roll +- pi` are the same cut, and the
 * short one is the one that stays inside `arm.rollMin/rollMax` and the one the
 * wrist can actually get to.
 *
 * For a single-bitted weapon those two are not the same cut at all -- one of
 * them is the poll -- and the fold picks between them by which is closer to
 * zero, which is to say by nothing. Measured: an axe swung with the fold left in
 * arrived poll-first on **64 %** of the contacts that landed on a body, and a
 * poll scores nothing. Unfolded, the derivation puts the weapon's +X along the
 * direction of travel, which is exactly where a bit belongs.
 *
 * What is left is the wrist. The unfolded answer lives in (-pi, pi] and
 * `arm.rollMin/rollMax` is +-1.4, so a stroke that wants the last half-radian of
 * the turn gets the clamp instead -- and that is not a shortcoming of this
 * function but of the arm, and of every real axeman, who steps round rather than
 * turning a wrist that far. `docs/measurements.md` has what it costs.
 */
export function rollForStroke(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  bothEdges = true,
  hand: HandName = "primary",
): number {
  return actionStrokeRoll(fromX, fromY, toX, toY, bothEdges, hand);
}

/**
 * The line a guard has to cover, as a cursor position.
 *
 * Their point when it is actually extended toward me -- nearer to my shoulder
 * than their own shoulder is -- and their chest when it is not, so a blade that
 * has been dropped, chambered or cut off does not drag the guard round to point
 * at the floor.
 *
 * A function rather than two copies inside `duelistMind`, because the guard and
 * the recover want the same answer and two copies of an answer is one copy
 * somebody edits. Module level rather than a closure per call, because `decide`
 * runs 240 times a second per fighter and a closure there is a closure a second
 * per five milliseconds of fight.
 */
function threatPoint(
  view: FighterView,
  threat: ThreatView,
  tipGap: number,
  bodyGap: number,
  into: Point,
): Point {
  const them = view.opponent;
  if (isShooting(threat.weapon)) {
    // A held bow tip is not a melee striker and says nothing about the next
    // shot. Present the guard to the observable shooter-to-vitals line instead.
    into.x = them.ground.x;
    into.y = them.shoulder.y;
    into.z = them.ground.z;
  } else if (tipGap < bodyGap) {
    into.x = threat.tip.x;
    into.y = threat.tip.y;
    into.z = threat.tip.z;
  } else {
    into.x = them.ground.x;
    into.y = them.shoulder.y;
    into.z = them.ground.z;
  }
  return into;
}

function coveringLine(
  view: FighterView,
  threat: ThreatView,
  tipGap: number,
  bodyGap: number,
  target: Point,
  into: Aim,
  hand: HandName,
  from: Point,
): Aim {
  // Retain the old scratch point for allocation behaviour; the shared
  // primitive owns the geometric decision used by CombatOption.cover.
  void target;
  return actionCoverAt(view, threat, into, hand, from, tipGap, bodyGap);
}

/**
 * What a hand that is not the one attacking does with itself.
 *
 * These are the numbers behind "no policy knows what a shield is for", and the
 * two that matter were derived rather than picked. `docs/measurements.md` has
 * the working; the short version is that `mountFor` welds a strapped plate's
 * face normal to the hand's +X, so:
 *
 * - the plate's normal is **square to the forearm**, which caps how much of the
 *   board an enemy can see at `sin` of the angle between the forearm and the
 *   line to him. An arm pointed at somebody presents an edge however it is
 *   rolled. So the arm has to go *across*, and `across` is how far.
 * - within that cap, `roll` slides the normal all the way round the circle
 *   perpendicular to the forearm -- and **nothing in the program was setting it
 *   for a shield**. It sat wherever the last cut had left it. Checked against
 *   the recorded page readings: at cursor X -1.0 the arm was 66 degrees off the
 *   line, so 0.91 of the board was available and 0.26 was measured. Two thirds
 *   of a shield was being thrown away by the wrist alone.
 *
 * A buckler takes none of this. Its face runs *along* the arm, so it faces
 * wherever the arm points and `roll` does nothing to where it faces: it is
 * simply punched out at the threat. That is the whole difference between the two
 * shields from a policy's side, and `isStrapped` is the question that asks it.
 */
const GUARD = {
  /**
   * How far across the line of the blow a strapped shield's arm is held,
   * radians, measured from the bearing to the threat and turned inboard.
   *
   * 0.80 rad is a shade past the 0.785 the geometry asks for: with the shoulder
   * 0.21 m out, 0.14 m up and 0.02 m forward of the chest and the hand capped at
   * `shield.reachCap`, 45 degrees across puts the fist 16 mm past its owner's
   * own centre line and 246 mm in front of his chest, which is where a person's
   * shield hand is. It also makes `sin` of the angle to the threat 0.707, so
   * 0.187 m^2 of a 0.264 m^2 board is available -- against the 0.033 m^2 an arm
   * on the covering line presents.
   *
   * Derived first and then swept, which is the only reason it is worth writing
   * that the two agree. Mean damage taken over 24 bouts: 213.9 at 0.45, 214.3 at
   * 0.65, **160.8 at 0.80**, 195.4 at 0.95, 184.7 at 1.10.
   */
  across: 0.80,
  /**
   * How far above the bearing to the threat the shield hand is carried, radians.
   *
   * **Negative**, which is the opposite of what was written here first. The
   * argument for a lift was that `shield.gripInset` puts the fist above the
   * board's centre, so a hand held level with the threat covers the belly rather
   * than the head. That is true of the *plate* and it is the wrong conclusion,
   * because the fist itself is only one of the things a blow can find. Held
   * high, the board covers the head and leaves everything under it open.
   * Measured, 24 bouts of `duelist` with a shield against `swinger`, mean damage
   * taken by part:
   *
   * | lift | total taken | head | torso | pelvis | legs |
   * |---|---|---|---|---|---|
   * | +0.16 | 241.0 | 16.4 | 70.5 | 38.4 | 23.2 |
   * | -0.05 | 212.7 | 22.0 | 45.7 | 26.8 | 25.7 |
   * | **-0.20** | **160.8** | 12.3 | 34.7 | 22.6 | 25.6 |
   * | -0.28 | 193.8 | 27.1 | 36.0 | 22.4 | 21.6 |
   *
   * The no-shield control over the same 24 bouts is 284.5 taken, with 58.9 of it
   * on the head and no leg damage at all -- so a low guard trades some legs for
   * most of a head, which is the trade a person makes.
   */
  lift: -0.20,
  /**
   * How far the wrist is turned to bring the plate round, radians, signed to
   * match the way the arm was swung across.
   *
   * A **constant**, and it was not obvious that one would do. The placement above
   * puts the hand at a fixed angular offset from the bearing to the threat, so
   * the turn that brings the plate round is very nearly fixed as well -- and it
   * is, measured over 30 threat bearings (five azimuths, three heights, two
   * ranges), settled, on both hands:
   *
   * | roll | of what placement made available | worst pose | hand off its anchor |
   * |---|---|---|---|
   * | 0 (no turn) | 56 %, 63 % | 0.054 | 32 mm |
   * | 0.8 | 94 %, 96 % | 0.080 | 36 mm |
   * | **1.0** | **96 %, 96 %** | 0.161 | 34 mm |
   * | 1.2 | 101 %, 96 % | 0.233 | 49 mm |
   * | 2.0 | 62 %, 84 % | 0.095 | 103 mm |
   *
   * (Two figures per row: the secondary hand and the primary. The 101 % is the
   * frame giving up -- the plate stops being square to the forearm, so it is
   * measured against a ceiling that no longer applies.)
   *
   * **A servo was written first and the measurement refused it.** It read
   * `HandView.face` -- where the plate actually was -- took the signed angle to
   * where it should be, and stepped the command toward it. That is textbook and
   * it wound up: the command moved faster than the arm could follow, so the
   * error never closed, and 237 of 420 sampled steps sat pinned at the former +-2.6
   * wrist limit with the hand a median 137 mm off its own anchor and the plate
   * no longer square to the forearm at all. It collected 54 % where this
   * collects 96 %. The field it read went with it.
   *
   * **The sign is not free.** Swept at elevation zero, hand-to-anchor stray
   * holding a shield: a roll of +1.0 on the *primary* arm swung across to
   * azimuth -0.7 strays **504 mm**, and the mirror of that breaks the secondary.
   * The wrist has authority turning the same way the arm was swung and almost
   * none turning against it -- which is the arm defect `docs/measurements.md`
   * already records, met head on for the first time. `-outboard` is that sign.
   */
  roll: 1.0,
  /**
   * How far off the line a second blade covers, radians.
   *
   * Not zero, because two blades on the same covering line rest against each
   * other and a guard occupying the same space as the one beside it is a guard
   * doing nothing. Outboard, so the pair covers a wedge.
   *
   * The weakest number here, and it is worth saying so. Two swords, 24 bouts
   * against `swinger`:
   *
   * | spread | taken | died | killed |
   * |---|---|---|---|
   * | 0 | 342.9 | 2 | 22 |
   * | 0.15 | 322.0 | 5 | 19 |
   * | **0.30** | **294.4** | 4 | 20 |
   * | 0.45 | 308.7 | 4 | 20 |
   *
   * Chosen on damage taken, which is a continuous measure over 24 samples and so
   * the less noisy of the two -- but a spread of zero kills more and dies less,
   * and at 24 bouts the difference between 2 deaths and 4 is not one this
   * distinguishes. Somebody wanting a two-sword fighter to *win* rather than to
   * be hit less should re-run this with more bouts before believing the pick.
   *
   * **There is a second copy of this number and it is deliberate.** Session 18
   * gave the option layer's `cover` the same rule -- the hand that is not
   * leading a guard steps outboard off the line -- and `options.ts` may not
   * import `config.ts`, which this file does. `ACTION_TUNING.guardSpread` in
   * `action-primitives.ts` is that copy, carries this table, and points back
   * here. A session that moves one moves both.
   */
  spread: 0.30,
} as const;

/** Scratch for planning one off hand, owned by the policy and reused. */
interface OffScratch {
  aim: Aim;
}

const offScratch = (): OffScratch => ({ aim: { pointerX: 0, pointerY: 0 } });

/**
 * Plan one hand that is not the one attacking, by what is in it.
 *
 * Four jobs and one place they are written, because both policies want the same
 * four and two copies of a rule is one copy somebody edits. What differs between
 * the policies is the `threat` they hand in -- `swinger` never reads a blade and
 * passes its opponent's chest, `duelist` passes whichever of their hands can
 * actually hurt -- and that difference is the policies' characters rather than
 * this function's business.
 */
function planOffHand(
  view: FighterView,
  name: HandName,
  threat: Point,
  into: HandIntent,
  s: OffScratch,
): void {
  const me = view.self.hands[name];
  if (me.lost) return;

  if (isShield(me.weapon)) {
    aimAt(view, threat, s.aim, name, me.shoulder);
    if (isStrapped(me.weapon)) {
      // Across the line, up, and turned: the three halves of the placement, and
      // the third one is worth as much as the other two. `roll` slides the
      // plate's normal all the way round the circle square to the forearm, so
      // the arm sets the ceiling and the wrist decides how much of it is
      // collected -- 56 % of it without this line, 96 % with it.
      into.pointerX = cursorForAzimuth(
        azimuthOf(s.aim.pointerX, name) - me.outboard * GUARD.across,
        name,
      );
      into.pointerY = cursorForElevation(elevationOf(s.aim.pointerY) + GUARD.lift);
      into.roll = -me.outboard * GUARD.roll;
      into.wristBend = WRIST.shield;
    } else {
      // A buckler is punched at the thing. Its face is along the arm, so where
      // the arm points is where it faces, and the roll is spent on nothing.
      into.pointerX = s.aim.pointerX;
      into.pointerY = s.aim.pointerY;
      into.roll = 0;
      into.wristBend = WRIST.neutral;
    }
    // No guard button: `shield.reachCap` already has a strapped plate at a bent
    // elbow, and `reachGuard` would pull it another 40 mm into its owner's
    // chest. A buckler wants the arm out, which is what the button is not for.
    into.thrust = false;
    into.guard = false;
    return;
  }

  if (isStriking(me.weapon)) {
    if (!hasHeldWeapon(me.weapon)) {
      const working = view.self.hands[otherHand(name)].weapon;
      if (handsFor(working) !== 2) {
        // The fist already nearest the line stays there as a compact cover. It
        // is the real hand and forearm in the collision solver, so no block rule
        // follows: the body has to be physically in the way.
        aimAt(view, threat, s.aim, name, me.shoulder);
        into.pointerX = s.aim.pointerX;
        into.pointerY = s.aim.pointerY;
        into.roll = 0;
        into.wristBend = WRIST.guard;
        into.thrust = false;
        into.guard = true;
        return;
      }
      // A bow's other hand is the draw hand even though no rigid second grip is
      // modelled. Resting here preserves that two-handed commitment.
    } else {
    // A second blade covers while the first one works, offset outboard so the
    // two are not resting against each other. It takes its turn at attacking on
    // the next cycle -- see `attackHand` -- so this is what it does between its
    // own cuts rather than instead of them.
    aimAt(view, threat, s.aim, name, me.shoulder);
    into.pointerX = cursorForAzimuth(
      azimuthOf(s.aim.pointerX, name) + me.outboard * GUARD.spread,
      name,
    );
    into.pointerY = s.aim.pointerY;
    into.wristBend = WRIST.guard;
    into.thrust = false;
    into.guard = true;
    return;
    }
  }

  // Nothing in it. `arm.restPointerY` is the bottom of the cursor range, which
  // is as close to by-its-side as the envelope goes.
  into.pointerX = A.restPointerX;
  into.pointerY = A.restPointerY;
  into.roll = 0;
  into.wristBend = WRIST.neutral;
  into.thrust = false;
  into.guard = false;
}

/**
 * Where a policy points its shield when it is not allowed to read a blade.
 *
 * `swinger`'s whole documented character is that it never looks at the other
 * fighter's weapon, and a shield that tracked an incoming point would quietly
 * make it a different policy. Its opponent's chest is what it is already walking
 * at and turning to face, so covering that is a guard it is entitled to.
 */
function chestOf(body: BodyView, into: Point): Point {
  into.x = body.ground.x;
  into.y = body.shoulder.y;
  into.z = body.ground.z;
  return into;
}

/** Shortest signed way round from one heading to another, in radians. */
function angleTo(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * How hard to lean on the turn axis to face a point.
 *
 * Proportional rather than bang-bang, which is the one place a policy uses the
 * controller in a way a keyboard cannot. See the note at the top of the file:
 * the ceiling is unchanged, so this buys steadiness and not speed.
 */
function turnToward(view: FighterView, target: Point, gain: number): number {
  const here = view.self.ground;
  const wanted = Math.atan2(target.x - here.x, target.z - here.z);
  return clamp(angleTo(view.self.facing, wanted) * gain, -1, 1);
}

/**
 * A small deterministic generator, so that "N bouts" means N different bouts and
 * not one bout run N times.
 *
 * Mulberry32. It is here rather than in the harness because the variation has to
 * be in the *policies'* own timing -- their cadence jitter and their start
 * offsets -- and not in the physics: nudging a body to make a distribution is
 * measuring a different simulator each time, and the point of a distribution is
 * that every sample is the same simulator.
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

/** A seed for a policy nobody gave one to. The picker is one such caller. */
export const randomSeed = (): number => (Math.random() * 0x100000000) >>> 0;

/**
 * The naive opponent, and the one you should beat.
 *
 * Walks straight in, turning to face, and once it is in measure runs a
 * four-phase cycle on a fixed cadence: chamber the cursor high and outside,
 * commit -- sweeping it across and down as fast as the hand will go, because the
 * *speed of the cursor* is what makes the damage -- follow through, and recover
 * to centre. Then it does it again.
 *
 * **It never reads a guard.** Nothing in here looks at the opponent's blade at
 * all: the only thing it asks about the other fighter is where it is standing,
 * and that only to decide whether to keep walking. Once a cycle starts it runs
 * to the end whatever appears in front of it.
 *
 * That is the property that makes it worth fighting rather than a mere target.
 * Its cadence is fixed, so its openings are learnable: the 0.42 s recover after
 * every commit is the same 0.42 s every time, and a person who notices that owns
 * the fight. A policy that swung when it saw an opening would be harder and
 * would teach nothing.
 *
 * The stroke is a fixed path in cursor space rather than an aimed one, which is
 * the other half of naive. It cuts through the volume in front of its own sword
 * shoulder and lands whatever happens to be standing there.
 */
/**
 * The reach every range in this file was tuned at: an arm held at
 * `arm.reachNeutral` with an arming sword on the end of it.
 *
 * Written out rather than left implied, because until there was a weapon of a
 * different length it was implied in six literals across two policies and a
 * comment saying "the 1.45 m the point of the blade reaches". Handed an axe --
 * 0.68 m of haft and head against the sword's 0.935 -- `duelist` went on holding
 * 1.40 m and committing at 1.48, which is a quarter of a metre outside its own
 * range. It swung at the air: 31 blows in twelve bouts, against a sword's 398 in
 * the same bouts against the same opponent.
 *
 * The association is the one `Arm.strikeReach` uses, so that a hand holding a
 * sword computes bit-for-bit the same number and `shiftedTo` below is exactly
 * zero. That is not fussiness: every figure in `docs/measurements.md` was taken
 * with these ranges, and a policy that moved by a float's last bit would make
 * the whole table unreadable for no reason.
 */
const TUNED_REACH =
  CONFIG.arm.reachNeutral + (CONFIG.sword.gripLength / 2 + CONFIG.sword.bladeLength);

/**
 * A distance tuned against a sword, moved onto whatever this hand holds.
 *
 * An offset rather than a ratio, and that is the physical claim: a weapon 255 mm
 * shorter has to be carried 255 mm closer, not to 82 % of the distance. The
 * numbers being shifted are all "shoulder to shoulder, at which my point lands
 * on them", and a body's depth does not scale with the thing being swung at it.
 */
const shiftedTo = (tuned: number, reach: number): number => tuned + (reach - TUNED_REACH);

/**
 * Shoulder gap for a bare-hand exchange.
 *
 * The weapon-length shift alone says 0.365 m, a distance two torsos cannot
 * occupy: their collision capsules stop the feet before the range gate opens.
 * At 0.72 m, a 0.60 m committed arm reaches the near surface of a 0.20 m-deep
 * torso. The session-06 corpus records whether that geometric floor produces a
 * dangerous but steel-inferior fighter.
 */
const FIST_RANGE = 0.72;

const SWINGER = {
  /**
   * Shoulder-to-shoulder metres at which it stops closing and starts cutting.
   *
   * Measured rather than chosen: `.review/swing-probe.mjs` puts the point of the
   * blade **1.45 m** from the shoulder through the whole of the commit, so a
   * fighter standing 1.30 m away is comfortably inside the stroke with room for
   * the arc to have turned the blade across the target rather than at it.
   *
   * Shoulder to shoulder rather than `view.measure`, and the difference matters.
   * `measure` is to the nearest *part*, which is normally the opponent's
   * outstretched sword hand, so it moves by 150 mm purely because the other
   * fighter dropped into a guard -- a range gate built on it would open and close
   * for reasons that have nothing to do with range. `measure` earns its keep in
   * `duelist`, where "something of theirs is close to me" is exactly the
   * question.
   *
   * And the sword's 1.45 is why this is a *tuned* number rather than a fixed
   * one: it is shifted by `shiftedTo` onto whatever the attacking hand actually
   * holds. A weapon a quarter of a metre shorter has to be walked a quarter of a
   * metre further in, and this policy's whole character is that it walks in.
   */
  engage: 1.30,
  turnGain: 2.2,

  /**
   * The four phases, in seconds, and the cursor position each one ends at.
   *
   * The commit is the number that matters. Sweeping the cursor 1.55 units across
   * and 1.15 down in 0.13 s is 12 cursor-units a second, against the 4.8 of the
   * standard parity sweep, and it takes the point of the blade well past
   * `combat.referenceSpeed` -- the 11 m/s a cut has to clear to do full damage.
   * It is set at 0.13 rather than at the 0.10 that goes faster still because
   * 0.10 is quicker than a hand, and this policy is meant to be beaten by one.
   *
   * Two numbers, and the gap between them is worth knowing. Driven from a
   * *standing start* at the chamber pose, the commit alone peaks at **22.2 m/s**
   * (0.10 s reaches 25.9, 0.25 s reaches 14.7). Run as the whole cycle by
   * `npm run measure --only swing`, which is this policy driving a real arm with
   * nothing in the arena to hit, it peaks at **40.0 m/s, over 28 swings ranging
   * 36.4 to 42.2**. The difference is momentum: the chamber leg hands the commit
   * a blade that is already travelling, and a swing measured from rest is
   * therefore a floor on a swing measured in flight rather than an estimate of
   * it. Do not quote the 22.2 as the policy's swing speed.
   */
  chamberSeconds: 0.34,
  commitSeconds: 0.13,
  followSeconds: 0.10,
  recoverSeconds: 0.42,

  /** High and outside, on the sword shoulder's side. */
  chamber: { x: 0.85, y: 0.80 },
  /** Across and down. The stroke this pair defines is what the roll is built from. */
  through: { x: -0.70, y: -0.35 },
  /** Past the target, because a cut that stops on contact is a chop. */
  follow: { x: -0.95, y: -0.60 },
  /** Centre guard, which is also where it walks in from. */
  rest: { x: 0.0, y: 0.05 },

  /**
   * How much the cadence and the stroke wander, per swing.
   *
   * The cadence is fixed in *shape* -- four phases, always in that order, always
   * in those proportions -- and this wobbles its absolute rate by a tenth and the
   * end of the stroke by a tenth of the cursor's range. That is what turns N
   * bouts into N bouts rather than into one bout measured N times, and it is
   * deliberately small enough that the openings stay learnable.
   */
  timing: 0.10,
  stroke: 0.10,
} as const;

type Leg = 0 | 1 | 2 | 3;

export function swingerMind(seed = randomSeed()): Mind {
  const random = mulberry32(seed);
  const intent = blankIntent();
  const off = offScratch();
  const punch = offScratch();
  const chest: Point = { x: 0, y: 0, z: 0 };

  /**
   * Which hand is swinging, and which one it would rather be next time.
   *
   * `prefer` flips at the end of every cycle and `attackHand` takes the nearest
   * thing to it that can actually hit somebody, so two swords alternate and a
   * sword beside a shield never gives up its turn. This is the whole of "two
   * swords use both hands offensively": the cadence below is not duplicated, it
   * changes hands.
   */
  let attacker: HandName = "primary";
  let prefer: HandName = "primary";
  /**
   * Which way is outboard for the hand that is swinging: +1 or -1.
   *
   * The stroke below is written for a right arm -- "high and outside, on the
   * sword shoulder's side" -- so the left arm has to swing the mirror of it.
   * Without this the off hand cuts across its own chest, which is both wrong to
   * watch and slower, and it was happening every time a person took the primary
   * because `splitMind` handed the policy the secondary.
   */
  let mirror = 1;
  /**
   * Whether the attacking hand's weapon cuts on both sides of its edge axis.
   *
   * A closure variable beside `mirror`, and for the same reason: `beginCycle`
   * fixes the whole stroke -- its roll included -- at the moment it starts, and
   * it does not see the view. Both are re-read from the attacking hand every
   * step, so a fighter that loses an arm and picks the exchange up with the
   * other one gets this cycle's answer rather than the last one's.
   */
  let bothEdges = true;

  // Where the last leg of the cycle left the cursor, and where this one is
  // taking it. Held rather than recomputed because the chamber leg starts from
  // wherever the recover left off, which is not always exactly `rest`.
  let fromX: number = SWINGER.rest.x;
  let fromY: number = SWINGER.rest.y;
  let toX: number = SWINGER.rest.x;
  let toY: number = SWINGER.rest.y;

  /** This cycle's commit, jittered at the top of it and read by the second leg. */
  let commitX: number = SWINGER.through.x;
  let commitY: number = SWINGER.through.y;

  let leg: Leg = 0;
  let elapsed = 0;
  let legSeconds: number = SWINGER.chamberSeconds;
  /** True between cycles: parked at centre, waiting to be in measure. */
  let waiting = true;
  /** The start offset. Two swingers built together do not swing together. */
  let pause = random() * 0.6;

  const jitter = (amount: number) => (random() * 2 - 1) * amount;

  const beginCycle = (hand: HandIntent): void => {
    fromX = hand.pointerX;
    fromY = hand.pointerY;
    toX = SWINGER.chamber.x * mirror;
    toY = SWINGER.chamber.y;
    leg = 0;
    elapsed = 0;
    legSeconds = SWINGER.chamberSeconds * (1 + jitter(SWINGER.timing));

    commitX = (SWINGER.through.x + jitter(SWINGER.stroke)) * mirror;
    commitY = SWINGER.through.y + jitter(SWINGER.stroke);
    // The roll is set once, here, for the *commit* -- so the edge is already
    // leading before the chamber has finished lifting the blade, which is how a
    // person does it and is the only way the wrist has time to get there. The
    // stroke it is computed from is this cycle's jittered one, so no two swings
    // carry quite the same roll.
    //
    // Mirrored with the stroke rather than negated afterwards, because
    // `rollForStroke` derives the roll from the stroke and a mirrored stroke has
    // a mirrored roll by construction. Negating the answer would be a second
    // statement of the same fact, and the one that gets it backwards.
    hand.roll = rollForStroke(
      SWINGER.chamber.x * mirror,
      SWINGER.chamber.y,
      commitX,
      commitY,
      bothEdges,
      attacker,
    );
    hand.wristBend = WRIST.cut;
  };

  const nextLeg = (): void => {
    fromX = toX;
    fromY = toY;
    elapsed = 0;
    switch (leg) {
      case 0:
        leg = 1;
        toX = commitX;
        toY = commitY;
        legSeconds = SWINGER.commitSeconds * (1 + jitter(SWINGER.timing));
        return;
      case 1:
        leg = 2;
        toX = SWINGER.follow.x * mirror;
        toY = SWINGER.follow.y;
        legSeconds = SWINGER.followSeconds * (1 + jitter(SWINGER.timing));
        return;
      case 2:
        leg = 3;
        toX = SWINGER.rest.x;
        toY = SWINGER.rest.y;
        legSeconds = SWINGER.recoverSeconds * (1 + jitter(SWINGER.timing));
        return;
      default:
        // Round again: park at centre and re-ask whether anything is in reach.
        // The other hand gets the next cycle if it is holding anything it can
        // swing; `attackHand` hands it straight back if it is not.
        waiting = true;
        pause = random() * 0.10;
        prefer = otherHand(attacker);
        leg = 0;
        toX = SWINGER.rest.x;
        toY = SWINGER.rest.y;
    }
  };

  return {
    name: "swinger",
    decide(view: FighterView, dt: number): Intent {
      const gap = distance(view.self.shoulder, view.opponent.shoulder);

      const opponentChest = chestOf(view.opponent, chest);
      attacker = attackHand(view, prefer, opponentChest);
      intent.actingHand = attacker;
      mirror = view.self.hands[attacker].outboard;
      bothEdges = cutsBothWays(view.self.hands[attacker].weapon);
      const hand = intent[attacker];

      // Its own range, for the weapon it is actually holding.
      const attack = view.self.hands[attacker];
      const engage = hasHeldWeapon(attack.weapon)
        ? shiftedTo(SWINGER.engage, attack.reach)
        : FIST_RANGE;

      intent.turn = turnToward(view, view.opponent.ground, SWINGER.turnGain);
      intent.forward = gap > engage ? 1 : 0;
      intent.strafe = 0;
      postureFor(
        view,
        gap > engage ? "close" : waiting ? "idle" : leg === 3 ? "recover" : "commit",
        intent,
      );
      hand.thrust = false;
      hand.guard = false;

      // The other hand, whatever is in it, aimed at the chest this policy is
      // already walking at -- and at nothing more informative than that, because
      // `swinger` does not read blades and a shield that tracked an incoming
      // point would quietly make it a different policy.
      planOffHand(view, otherHand(attacker), chestOf(view.opponent, chest), intent[otherHand(attacker)], off);

      if (waiting) {
        hand.pointerX = SWINGER.rest.x;
        hand.pointerY = SWINGER.rest.y;
        pause -= dt;
        // The one and only look at the range the cycle takes. From here to the
        // end of the recover it swings on its clock and on nothing else.
        if (pause <= 0 && gap <= engage) {
          waiting = false;
          beginCycle(hand);
        }
        return intent;
      }

      elapsed += dt;
      while (elapsed >= legSeconds) {
        const carry = elapsed - legSeconds;
        nextLeg();
        elapsed = carry;
        if (waiting) {
          hand.pointerX = SWINGER.rest.x;
          hand.pointerY = SWINGER.rest.y;
          return intent;
        }
      }

      const t = legSeconds > 0 ? elapsed / legSeconds : 1;
      hand.pointerX = strokePoint(fromX, toX, t);
      hand.pointerY = strokePoint(fromY, toY, t);
      if (!hasHeldWeapon(view.self.hands[attacker].weapon)) {
        aimAt(view, chest, punch.aim, attacker, view.self.hands[attacker].shoulder);
        hand.pointerX = leg === 0
          ? clamp(punch.aim.pointerX + mirror * 0.22, -1, 1)
          : punch.aim.pointerX;
        hand.pointerY = leg === 0
          ? clamp(punch.aim.pointerY - 0.10, -1, 1)
          : punch.aim.pointerY;
        hand.guard = leg === 0;
        hand.thrust = leg === 1;
      }
      return intent;
    },
  };
}

/**
 * The one that fights back.
 *
 * Four things, and each of them is a different answer to the same question --
 * what does a fight look like when neither side is simply walking into the
 * other?
 *
 * - **It holds measure** rather than closing. It hovers at the edge of its own
 *   reach, closes when given ground and backs off when crowded. That alone is
 *   most of what makes a bout read as a fight rather than as a collision.
 * - **It guards between exchanges**: right button held, which drops the hand to
 *   `arm.reachGuard` and brings the blade in, with the cursor on the covering
 *   line between its own shoulder and whatever the opponent's point is doing.
 *   The two blades are on colliding layers, so this is a real parry and not a
 *   pose.
 * - **It commits on an opening** -- the opponent's point out of line, or moving
 *   away fast, which is a blade that has been committed elsewhere -- and buys
 *   exactly one cut, aimed at the head and neck, before returning to its guard.
 * - **It steps off-line**, strafing while it closes rather than walking down the
 *   middle, and reversing the circle every second or two.
 *
 * The one thing in here that is not a reaction is `patience`. Two duelists that
 * both wait for an opening never find one, because a guarding blade is by
 * definition in line -- and a pairing that never terminates is not a fight, it is
 * a hung measurement. So an exchange it has been refused for long enough is one
 * it takes anyway, which is what a person does and what stops `duelist` versus
 * `duelist` from running to the cap. Measured: 100 of 100 bouts decided, at two
 * seeds, mean 10.4 s against a 60 s cap.
 *
 * **It never thrusts.** The left button is on the controller and this does not
 * press it, which is a decision rather than an omission: `arm.reachThrust`
 * drives the point straight out along the aim line, and landing one needs the
 * contact inside `combat.thrustTipZone` of the tip with the blade travelling
 * along itself -- a different attack, with a different opening and a different
 * recovery. One policy doing both would be two policies wearing one name, and
 * the second of them is worth its own measurement rather than a share of this
 * one's.
 */
const DUELIST = {
  /**
   * Shoulder-to-shoulder metres it tries to keep.
   *
   * Just inside the 1.45 m the point of the blade reaches, so a commit taken from
   * here lands without a step, and just outside `swinger`'s own 1.30 m engage
   * range, so the naive one has to come to it. The gap between the two is the
   * whole of the tactical difference between them.
   */
  hold: 1.40,
  /**
   * Nearest part of theirs, in metres, at which it gives ground.
   *
   * The one distance here that is **not** shifted by the weapon's reach, and
   * deliberately: it is about *their* arm arriving, not about mine leaving. A
   * fighter holding a shorter weapon is not less crowded by somebody standing on
   * top of it.
   */
  crowd: 0.85,
  /** Shoulder to shoulder, past which a commit would fall short. */
  strike: 1.48,

  turnGain: 2.4,
  /** How hard it leans on the walk axis per metre it is out of position. */
  closeGain: 1.6,
  /** Dead band about `hold`, so it does not shuffle in place. */
  slack: 0.06,

  strafe: 0.55,
  circleMin: 1.2,
  circleMax: 2.2,

  /**
   * The opening, as two readings of the opponent's blade.
   *
   * `outOfLine` is the cosine between the way their point is facing and the
   * direction from them to me: 1 is a blade aimed at my chest, and anything below
   * this is a blade that is somewhere else. `theirCommit` and `receding` are the
   * other opening -- a point moving fast and away is a point that has been spent
   * on something, and the window after it is the one worth buying.
   */
  outOfLine: 0.30,
  theirCommit: 5.0,
  receding: 0.6,

  /** Seconds of no opening after which it makes one. */
  patience: 2.4,
  /** Seconds after an exchange before it will buy another. */
  cooldown: 0.30,

  chamberSeconds: ACTION_STROKE_TIMING.chamber,
  cutSeconds: ACTION_STROKE_TIMING.commit,
  recoverSeconds: ACTION_STROKE_TIMING.recover,

  /**
   * How far to either side of the target the stroke is chambered and followed
   * through, in cursor units.
   *
   * The cut is a straight line in cursor space with the target at its midpoint,
   * so these two numbers are the whole of its shape: 1.24 units of azimuth and
   * 1.00 of elevation in 0.11 s, which is the same order as `swinger`'s commit
   * and reaches the same speeds. It is aimed where `swinger`'s is not.
   */
  offset: { x: 0.62, y: 0.50 },

  /**
   * How far above the shoulder the head sits, in metres.
   *
   * The view carries no part positions -- only a ground point, a shoulder and a
   * point of a blade -- so the one place a cut can be aimed at is a column above
   * the opponent's own ground position, and this is how far up it. It is
   * `body.headCentre - fighter.shoulderHeight` rounded down a little, so the cut
   * arrives across the neck rather than over the top of the skull.
   *
   * This is the one number in this file that is anatomy rather than tactics, and
   * it is only safe because both sides are the same unit today. The day session
   * 08 gives them different bodies, a policy will need to be told how tall the
   * thing in front of it is, and `FighterView` is where that belongs.
   */
  headLift: 0.20,
} as const;

/**
 * The archer's numbers.
 *
 * Fewer than the other two policies have, and that is the character rather than
 * an omission: there is no stroke to phase, no wrist to roll and no chamber to
 * hold. What an archer does is stand at a distance, point, and wait.
 */
const ARCHER = {
  /**
   * Shoulder-to-shoulder metres it wants between itself and the other fighter.
   *
   * Far enough that a sword is a walk away rather than a step. `duelist` closes
   * at roughly 3 m/s, and a full draw is 0.9 s, so six metres is about two shots
   * before it has a fight on its hands -- which is the trade this policy is for.
   */
  standOff: 6.0,
  /**
   * And the distance at which it stops holding ground and backs off.
   *
   * Below this it walks backwards while drawing. It does *not* stop drawing:
   * a bow at three metres is still a bow, and a policy that panicked and lowered
   * it would be a policy that cannot defend itself at all.
   */
  giveGround: 3.2,
  turnGain: 2.4,
  /**
   * How far off the bearing it will loose, in radians.
   *
   * The arrow leaves along the arm and the arm aims in *torso* space, so a shot
   * taken mid-turn goes where the fighter was pointing rather than where it was
   * looking. 0.15 rad is about 9 degrees, which at six metres is a metre of
   * miss -- so this gate is most of what separates an archer from a fighter
   * spraying arrows across the arena.
   */
  aimTolerance: 0.15,
  /** Where on the body it aims, above the shoulder line. */
  chestLift: -0.12,
  /** Seconds between letting one go and starting the next. */
  cooldown: ACTION_SHOT_TIMING.cooldown,
} as const;

/**
 * How far above the mark to aim, for an arrow that has to fall on the way.
 *
 * **Computed rather than tuned**, which is unusual for this file and is worth
 * the exception. Every other constant here is a judgement about how a fighter
 * behaves; this one is where a thrown thing lands, and that has an answer. The
 * flight is `range / speed` and the drop is `g t^2 / 2`, so the lift is
 * `g range^2 / 2 v^2` -- quadratic in the range, which is why a linear fudge
 * would have been right at exactly one distance and wrong at every other.
 *
 * Reading `CONFIG.arrow` from a policy is the same liberty `SWINGER.engage`
 * already takes with the sword's length: a person shooting a bow knows how fast
 * it shoots, and house rule 1 is about what a policy may *do* -- it may only
 * produce an `Intent` -- rather than about what it may know.
 */
/**
 * Stands off, draws, and looses.
 *
 * The third policy, and the first that does not fence. It exists for a reason
 * beyond having an archer to fight: without it the bow would ship as a weapon
 * **no policy uses**, which is exactly the hole session 04 was named for -- a
 * kind with a mesh, a builder, a config block and a picker entry that every mind
 * in the program silently declines to pick up. `isStriking` is false for a bow
 * on purpose, so `duelist` and `swinger` handed one find no hand to attack with
 * and fall through to the branch two shields already take. That is a fighter who
 * has brought a bow to a sword fight, which is a true thing about the world; it
 * is not a policy for the bow.
 *
 * **The draw is counted rather than read.** `Arm` owns the string and the view
 * does not carry it, so this holds `thrust` for `CONFIG.arrow.drawSeconds` and
 * lets go -- the same clock `buttons.ts` is integrating on the other side of the
 * seam, from the same constant. Publishing the draw on `HandView` would be the
 * tidier-looking option and it would be a field with one reader that duplicates
 * a number both sides already have; `AGENTS.md` has the rule about that, and
 * `HandView.reach` is the exception that earns it (a *weapon's* length is not
 * knowable from `config.ts` without knowing the weapon).
 *
 * **It does not fence.** Handed a sword instead of a bow it keeps its distance
 * and never attacks, and that is deliberate rather than unfinished: the moment
 * this policy grows a melee branch it stops being a measurement of what a bow is
 * worth and becomes a measurement of a mixed policy. What it *does* do without a
 * bow is back away, which is at least a coherent fighter.
 */
export function archerMind(seed = randomSeed()): Mind {
  const random = mulberry32(seed);
  const intent = blankIntent();
  const aim: Aim = { pointerX: 0, pointerY: 0 };
  const off = offScratch();
  const cover: Point = { x: 0, y: 0, z: 0 };

  let shooter: HandName = "primary";
  /** Seconds the string has been coming back, or -1 while resting. */
  let drawn = -1;
  // Two archers built together should not loose on the same frame.
  let rest = random() * ARCHER.cooldown;
  /** One step of released button, which is what the loose actually is. */
  let releasing = false;

  return {
    name: "archer",
    decide(view: FighterView, dt: number): Intent {
      const self = view.self;
      const them = view.opponent;
      const gap = distance(self.shoulder, them.shoulder);

      shooter = shootHand(view, shooter);
      intent.actingHand = shooter;
      const hand = intent[shooter];
      const me = self.hands[shooter];

      // ---- feet -----------------------------------------------------------
      intent.turn = turnToward(view, them.ground, ARCHER.turnGain);
      intent.strafe = 0;
      intent.forward = gap < ARCHER.giveGround ? -1 : gap > ARCHER.standOff ? 1 : 0;
      postureFor(
        view,
        drawn >= 0 ? "draw" : gap < ARCHER.giveGround ? "cover" : "close",
        intent,
      );

      // ---- the mark --------------------------------------------------------
      // Their shoulder line, dropped to the chest, and then lifted by whatever
      // the arrow is going to lose on the way.
      actionArcherAim(view, shooter, aim);
      hand.pointerX = aim.pointerX;
      hand.pointerY = aim.pointerY;
      hand.roll = 0;
      hand.wristBend = WRIST.neutral;
      hand.guard = false;

      // The hand that is not on the bow. A bow takes both, so in practice this
      // is an empty hand resting -- but it is asked rather than assumed, because
      // a fighter can be built by a harness with anything in either hand.
      planOffHand(view, otherHand(shooter), chestOf(them, cover), intent[otherHand(shooter)], off);

      // ---- the string ------------------------------------------------------
      // One step of released button *is* the loose: `nextDraw` fires on the edge
      // where the level ends, so this has to spend a step down before it may
      // start pulling again.
      if (releasing) {
        releasing = false;
        hand.thrust = false;
        rest = ARCHER.cooldown;
        drawn = -1;
        return intent;
      }

      if (!isShooting(me.weapon) || me.lost) {
        // Nothing to draw. It keeps its distance and its facing and does not
        // pretend to be a swordsman.
        hand.thrust = false;
        drawn = -1;
        return intent;
      }

      if (rest > 0) {
        rest -= dt;
        hand.thrust = false;
        return intent;
      }

      // Square enough to shoot? The arrow leaves along the arm, and the arm aims
      // in torso space, so a shot taken mid-turn goes where the body is pointing.
      const bearing = Math.atan2(them.ground.x - self.ground.x, them.ground.z - self.ground.z);
      const square = Math.abs(angleTo(self.facing, bearing)) < ARCHER.aimTolerance;

      if (!square) {
        // Hold whatever draw it has rather than dropping it: a bow half drawn
        // while you turn is a bow you can loose the moment you are round.
        hand.thrust = drawn >= 0;
        return intent;
      }

      drawn = drawn < 0 ? 0 : drawn + dt;
      if (actionShotPhase(drawn) !== "draw") {
        releasing = true;
        hand.thrust = false;
        return intent;
      }
      hand.thrust = true;
      return intent;
    },
  };
}

type Stance = "hold" | "chamber" | "cut" | "recover";

export function duelistMind(seed = randomSeed()): Mind {
  const random = mulberry32(seed);
  const intent = blankIntent();
  const aim: Aim = { pointerX: 0, pointerY: 0 };
  const target: Point = { x: 0, y: 0, z: 0 };
  // The off hand's own scratch and its own copy of the point being covered.
  // Separate from `aim` and `target` above rather than shared with them, because
  // the cut freezes a stroke into those two and an off hand re-aiming every step
  // through the same objects would be re-aiming the cut.
  const off = offScratch();
  const cover: Point = { x: 0, y: 0, z: 0 };

  /** Which hand is cutting, and which one gets the next exchange. */
  let attacker: HandName = "primary";
  let prefer: HandName = "primary";
  /** Which way is outboard for it: the chamber lifts high and *outside*. */
  let mirror = 1;

  let stance: Stance = "hold";
  let elapsed = 0;

  // The start offset, and the reason two duelists built together do not both
  // lunge on the same frame.
  let cooldown = DUELIST.cooldown + random() * 0.8;
  let sinceOpening = random() * DUELIST.patience;
  let patience = DUELIST.patience * (0.8 + random() * 0.4);

  let circle = random() < 0.5 ? -1 : 1;
  let circleLeft = DUELIST.circleMin + random() * (DUELIST.circleMax - DUELIST.circleMin);

  // The stroke, frozen when the commit begins. A cut is a plan: re-aiming it
  // halfway through at 240 Hz would be a homing missile rather than a person,
  // and a person cannot change their mind at 0.11 s notice either.
  let fromX = 0;
  let fromY = 0;
  let toX = 0;
  let toY = 0;

  /**
   * How fast the opponent's point is getting further from my shoulder, m/s,
   * low-passed.
   *
   * A raw frame-to-frame difference at 240 Hz is mostly solver noise, and this is
   * the only quantity in the file that is a rate rather than a position -- which
   * is why it is the only one that needed one. Keeping it is keeping a memory of
   * where a blade was a moment ago, which is exactly what a person does with a
   * blade and is still a pure function of this policy's own state.
   */
  let gapRate = 0;
  let lastGap = -1;

  /**
   * This policy's own reading of the threat, and **not** the module scratch
   * `threatHand` writes into.
   *
   * `postureFor` runs partway down `decide` and asks the same question, so a
   * duelist holding the module record would have it rewritten under it halfway
   * through the step. The two answers agree today, because nothing moves between
   * the two calls -- which is exactly what makes the aliasing the kind of defect
   * that survives until somebody adds a line and cannot see why the guard moved.
   */
  const watching = blankThreat();

  const goTo = (next: Stance): void => {
    stance = next;
    elapsed = 0;
  };

  return {
    name: "duelist",
    decide(view: FighterView, dt: number): Intent {
      const self = view.self;
      const them = view.opponent;
      const gap = distance(self.shoulder, them.shoulder);

      const threat = selectThreat(view, watching);
      attacker = attackHand(view, prefer, threat.tip);
      intent.actingHand = attacker;
      mirror = self.hands[attacker].outboard;
      const hand = intent[attacker];
      hand.thrust = false;
      // Everything this hand aims is aimed from **its own** socket. The two are
      // 420 mm apart, and aiming the left hand from the right shoulder is not a
      // rounding error: measured over 12 bouts, the secondary's cuts landed 216
      // of 483 points of damage on the torso and 20 on the head, against the
      // primary's 45 and 90, and a fighter fighting left-handed killed nobody in
      // 24 bouts while dealing twice the damage. The head is what a duelist aims
      // at and the head is what ends a bout.
      const socket = self.hands[attacker].shoulder;

      // ---- what their blade is doing -------------------------------------
      // Whichever of their hands can actually hurt, rather than whichever is
      // first. An opponent carrying a shield in the primary and a sword in the
      // secondary used to be guarded against the shield.
      const tipGap = distance(threat.tip, self.shoulder);
      if (lastGap >= 0 && dt > 0) {
        const rate = (tipGap - lastGap) / dt;
        gapRate += (rate - gapRate) * (1 - Math.exp(-12 * dt));
      }
      lastGap = tipGap;

      const bladeX = threat.tip.x - threat.shoulder.x;
      const bladeY = threat.tip.y - threat.shoulder.y;
      const bladeZ = threat.tip.z - threat.shoulder.z;
      const bladeLength = Math.hypot(bladeX, bladeY, bladeZ) || 1;
      const towardX = self.shoulder.x - them.shoulder.x;
      const towardY = self.shoulder.y - them.shoulder.y;
      const towardZ = self.shoulder.z - them.shoulder.z;
      const towardLength = Math.hypot(towardX, towardY, towardZ) || 1;
      const inLine =
        (bladeX * towardX + bladeY * towardY + bladeZ * towardZ) / (bladeLength * towardLength);

      const opening =
        inLine < DUELIST.outOfLine ||
        (threat.tipSpeed > DUELIST.theirCommit && gapRate > DUELIST.receding);
      sinceOpening = opening ? 0 : sinceOpening + dt;
      if (cooldown > 0) cooldown -= dt;

      // ---- feet ------------------------------------------------------------
      intent.turn = turnToward(view, them.ground, DUELIST.turnGain);

      circleLeft -= dt;
      if (circleLeft <= 0) {
        circle = -circle;
        circleLeft = DUELIST.circleMin + random() * (DUELIST.circleMax - DUELIST.circleMin);
      }
      intent.strafe = circle * DUELIST.strafe;

      // Crowding is read off `measure` -- the nearest part of them, whatever it
      // is -- because being crowded is not a fact about their shoulders. Range
      // keeping is read off the shoulders, because that one is.
      // Both ranges moved onto the weapon this hand is actually holding. `hold`
      // and `strike` are 1.40 and 1.48 for a sword, which is where every number
      // in `docs/measurements.md` was taken, and 1.145 and 1.225 for an axe.
      const reach = view.self.hands[attacker].reach;
      const bare = !hasHeldWeapon(view.self.hands[attacker].weapon);
      // Put the far edge of the dead band on punch range. Adding the slack here
      // stops at 0.84 m and can never satisfy the 0.72 m commit gate.
      const hold = bare ? bareHoldDistance() : shiftedTo(DUELIST.hold, reach);
      const strike = bare ? FIST_RANGE : shiftedTo(DUELIST.strike, reach);

      const crowd = bare ? bareCrowdDistance(reach) : DUELIST.crowd;
      if (view.measure < crowd) {
        intent.forward = -0.8;
      } else if (gap > hold + DUELIST.slack) {
        intent.forward = clamp((gap - hold) * DUELIST.closeGain, 0, 1);
      } else if (gap < hold - DUELIST.slack) {
        intent.forward = clamp((gap - hold) * DUELIST.closeGain, -1, 0);
      } else {
        intent.forward = 0;
      }

      postureFor(
        view,
        stance === "hold" ? "cover" : stance === "recover" ? "recover" : "commit",
        intent,
      );

      // ---- hands -----------------------------------------------------------
      // The hand that is not cutting, planned first and from the same reading,
      // so a shield is placed against the point that is actually coming rather
      // than against whatever the cut left the cursor pointing at.
      planOffHand(
        view,
        otherHand(attacker),
        threatPoint(view, threat, tipGap, towardLength, cover),
        intent[otherHand(attacker)],
        off,
      );

      if (stance === "hold") {
        hand.guard = true;
        coveringLine(view, threat, tipGap, towardLength, target, aim, attacker, socket);
        hand.pointerX = aim.pointerX;
        hand.pointerY = aim.pointerY;
        // Along the covering line the blade is a bar, not an edge, so the roll
        // is left where the last cut put it rather than spent on nothing.

        if (cooldown <= 0 && gap <= strike && (opening || sinceOpening > patience)) {
          target.x = them.ground.x;
          target.y = them.shoulder.y + DUELIST.headLift;
          target.z = them.ground.z;
          aimAt(view, target, aim, attacker, socket);

          fromX = clamp(aim.pointerX + DUELIST.offset.x * mirror, -1, 1);
          fromY = clamp(aim.pointerY + DUELIST.offset.y, -1, 1);
          toX = clamp(aim.pointerX - DUELIST.offset.x * mirror, -1, 1);
          toY = clamp(aim.pointerY - DUELIST.offset.y, -1, 1);
          hand.roll = rollForStroke(
            fromX,
            fromY,
            toX,
            toY,
            cutsBothWays(view.self.hands[attacker].weapon),
            attacker,
          );
          hand.wristBend = WRIST.cut;

          patience = DUELIST.patience * (0.8 + random() * 0.4);
          sinceOpening = 0;
          goTo("chamber");
          // The chamber lifts from wherever the guard left the cursor.
          aim.pointerX = hand.pointerX;
          aim.pointerY = hand.pointerY;
        }
        return intent;
      }

      elapsed += dt;
      const strokeElapsed = elapsed + (stance === "cut" ? ACTION_STROKE_TIMING.chamber
        : stance === "recover" ? ACTION_STROKE_TIMING.chamber + ACTION_STROKE_TIMING.commit : 0);
      const stroke = actionStrokeReading(strokeElapsed);
      const expectedStrokePhase = stance === "cut" ? "commit" : stance;
      const t = stroke.phase === expectedStrokePhase ? stroke.fraction : 1;

      if (stance === "chamber") {
        hand.guard = false;
        // A step in with the chamber, on the diagonal the strafe is already
        // walking: closing straight down the middle is what `swinger` does.
        intent.forward = Math.max(intent.forward, 0.35);
        const pose = actionStrokePose({ phase: "chamber", fraction: t }, aim,
          { pointerX: fromX, pointerY: fromY }, { pointerX: toX, pointerY: toY }, aim);
        hand.pointerX = pose.pointerX; hand.pointerY = pose.pointerY;
        if (t >= 1) goTo("cut");
        return intent;
      }

      if (stance === "cut") {
        hand.guard = false;
        hand.thrust = !hasHeldWeapon(self.hands[attacker].weapon);
        intent.forward = Math.max(intent.forward, 0.2);
        const pose = actionStrokePose({ phase: "commit", fraction: t }, aim,
          { pointerX: fromX, pointerY: fromY }, { pointerX: toX, pointerY: toY }, aim);
        hand.pointerX = pose.pointerX; hand.pointerY = pose.pointerY;
        if (t >= 1) goTo("recover");
        return intent;
      }

      // Recover: the guard goes back up immediately and the cursor walks back to
      // the covering line under it, because the hand is what is slow and the
      // button is not.
      hand.guard = true;
      coveringLine(view, threat, tipGap, towardLength, target, aim, attacker, socket);
      const pose = actionStrokePose({ phase: "recover", fraction: t }, aim,
        { pointerX: fromX, pointerY: fromY }, { pointerX: toX, pointerY: toY }, aim);
      hand.pointerX = pose.pointerX; hand.pointerY = pose.pointerY;
      if (t >= 1) {
        cooldown = DUELIST.cooldown;
        // The other hand buys the next exchange if it is holding anything it
        // can cut with. Two blades then take turns, and the one that is not
        // cutting covers -- which is both halves of using both hands.
        prefer = otherHand(attacker);
        goTo("hold");
      }
      return intent;
    },
  };
}
