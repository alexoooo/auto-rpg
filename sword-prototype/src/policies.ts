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
import type { FighterView, HandIntent, Intent, Mind } from "./mind.ts";

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
const HALF_PI = Math.PI / 2;

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

/** The one shape any position in a `FighterView` has to have to be read here. */
interface Point {
  x: number;
  y: number;
  z: number;
}

const distance = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Where a cursor is, which is the only thing a policy ever hands the arm. */
interface Aim {
  pointerX: number;
  pointerY: number;
}

/**
 * A fresh intent for a policy to own and overwrite in place.
 *
 * `mind.ts`'s `NEUTRAL` is the same thing frozen, and this is deliberately not a
 * copy of it: importing a *value* from `mind.ts` would make the dependency
 * between the two files run both ways at run time, and a module cycle that
 * happens to work because nobody reads the constant during evaluation is exactly
 * the sort of thing that stops working when somebody moves a line -- in the
 * browser, not in a test. The annotation is what keeps the two shapes married:
 * add a field to `InputState` and this is a compile error rather than a key that
 * is quietly missing.
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
export const blankIntent = (): Intent => ({
  forward: 0,
  strafe: 0,
  turn: 0,
  zoom: 1,
  driving: "primary",
  primary: { pointerX: 0, pointerY: 0, roll: 0, thrust: false, guard: false },
  secondary: { pointerX: 0, pointerY: 0, roll: 0, thrust: false, guard: false },
});

/**
 * The hand a policy is talking about.
 *
 * Every policy in this file fights one-handed, and says so here rather than by
 * writing `intent.primary` forty times. What that buys is the thing worth
 * having: a policy driving a fighter's off hand -- which is what `splitMind`
 * asks one to do -- is the same policy with a different hand name, not a second
 * implementation of it.
 */
const handOf = (intent: Intent): HandIntent => intent[intent.driving];

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
export const azimuthOf = (pointerX: number) =>
  pointerX >= 0 ? pointerX * A.azMax : pointerX * -A.azMin;
export const elevationOf = (pointerY: number) =>
  pointerY >= 0 ? pointerY * A.elMax : pointerY * -A.elMin;
export const cursorForAzimuth = (azimuth: number) =>
  clamp(azimuth >= 0 ? azimuth / A.azMax : azimuth / -A.azMin, -1, 1);
export const cursorForElevation = (elevation: number) =>
  clamp(elevation >= 0 ? elevation / A.elMax : elevation / -A.elMin, -1, 1);

/**
 * Where the cursor has to sit for the hand to be sent at a point in the world.
 */
function aimAt(view: FighterView, target: Point, into: Aim): Aim {
  const shoulder = view.self.shoulder;
  const dx = target.x - shoulder.x;
  const dy = target.y - shoulder.y;
  const dz = target.z - shoulder.z;

  // Into torso space. `facing` is a yaw in the convention used everywhere here
  // -- zero down +Z, turning toward +X -- so the torso's right is
  // (cos f, 0, -sin f) and its forward is (sin f, 0, cos f), and this is those
  // two dotted into the offset.
  const cos = Math.cos(view.self.facing);
  const sin = Math.sin(view.self.facing);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;

  const length = Math.hypot(localX, dy, localZ);
  const azimuth = Math.atan2(localX, localZ);
  const elevation = length > 1e-6 ? Math.asin(clamp(dy / length, -1, 1)) : 0;

  into.pointerX = cursorForAzimuth(azimuth);
  into.pointerY = cursorForElevation(elevation);
  return into;
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
 * Folded into +-pi/2 because the sword is double-edged and `Combat` takes the
 * absolute value of the edge dot product, so `roll` and `roll +- pi` are the same
 * cut; the short one is the one that stays inside `arm.rollMin/rollMax` and the
 * one the wrist can get to.
 */
export function rollForStroke(fromX: number, fromY: number, toX: number, toY: number): number {
  const deltaAz = azimuthOf(toX) - azimuthOf(fromX);
  const deltaEl = elevationOf(toY) - elevationOf(fromY);
  const midEl = (elevationOf(toY) + elevationOf(fromY)) / 2;

  let roll = Math.atan2(-Math.cos(midEl) * deltaAz, deltaEl);
  while (roll > HALF_PI) roll -= Math.PI;
  while (roll < -HALF_PI) roll += Math.PI;
  return clamp(roll, A.rollMin, A.rollMax);
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
function coveringLine(
  view: FighterView,
  tipGap: number,
  bodyGap: number,
  target: Point,
  into: Aim,
): Aim {
  const them = view.opponent;
  if (tipGap < bodyGap) {
    target.x = them.tip.x;
    target.y = them.tip.y;
    target.z = them.tip.z;
  } else {
    target.x = them.ground.x;
    target.y = them.shoulder.y;
    target.z = them.ground.z;
  }
  return aimAt(view, target, into);
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
  // The hand this policy drives, taken once. A policy fights one-handed and
  // says which hand it means through `driving`, and the caller decides what
  // that maps onto: `splitMind` hands a policy's hand to whichever arm the
  // person is not using. So this is "my hand", not "the right hand".
  const hand = handOf(intent);

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

  const beginCycle = (): void => {
    fromX = hand.pointerX;
    fromY = hand.pointerY;
    toX = SWINGER.chamber.x;
    toY = SWINGER.chamber.y;
    leg = 0;
    elapsed = 0;
    legSeconds = SWINGER.chamberSeconds * (1 + jitter(SWINGER.timing));

    commitX = SWINGER.through.x + jitter(SWINGER.stroke);
    commitY = SWINGER.through.y + jitter(SWINGER.stroke);
    // The roll is set once, here, for the *commit* -- so the edge is already
    // leading before the chamber has finished lifting the blade, which is how a
    // person does it and is the only way the wrist has time to get there. The
    // stroke it is computed from is this cycle's jittered one, so no two swings
    // carry quite the same roll.
    hand.roll = rollForStroke(SWINGER.chamber.x, SWINGER.chamber.y, commitX, commitY);
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
        toX = SWINGER.follow.x;
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
        waiting = true;
        pause = random() * 0.10;
        leg = 0;
        toX = SWINGER.rest.x;
        toY = SWINGER.rest.y;
    }
  };

  return {
    name: "swinger",
    decide(view: FighterView, dt: number): Intent {
      const gap = distance(view.self.shoulder, view.opponent.shoulder);

      intent.turn = turnToward(view, view.opponent.ground, SWINGER.turnGain);
      intent.forward = gap > SWINGER.engage ? 1 : 0;
      intent.strafe = 0;
      hand.thrust = false;
      hand.guard = false;

      if (waiting) {
        hand.pointerX = SWINGER.rest.x;
        hand.pointerY = SWINGER.rest.y;
        pause -= dt;
        // The one and only look at the range the cycle takes. From here to the
        // end of the recover it swings on its clock and on nothing else.
        if (pause <= 0 && gap <= SWINGER.engage) {
          waiting = false;
          beginCycle();
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
      hand.pointerX = fromX + (toX - fromX) * t;
      hand.pointerY = fromY + (toY - fromY) * t;
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
  /** Nearest part of theirs, in metres, at which it gives ground. */
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

  chamberSeconds: 0.15,
  cutSeconds: 0.11,
  recoverSeconds: 0.26,

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

type Stance = "hold" | "chamber" | "cut" | "recover";

export function duelistMind(seed = randomSeed()): Mind {
  const random = mulberry32(seed);
  const intent = blankIntent();
  // The hand this policy drives, taken once. A policy fights one-handed and
  // says which hand it means through `driving`, and the caller decides what
  // that maps onto: `splitMind` hands a policy's hand to whichever arm the
  // person is not using. So this is "my hand", not "the right hand".
  const hand = handOf(intent);
  const aim: Aim = { pointerX: 0, pointerY: 0 };
  const target: Point = { x: 0, y: 0, z: 0 };

  let stance: Stance = "hold";
  let elapsed = 0;
  let stanceSeconds = 0;

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

  const goTo = (next: Stance, seconds: number): void => {
    stance = next;
    stanceSeconds = seconds;
    elapsed = 0;
  };

  return {
    name: "duelist",
    decide(view: FighterView, dt: number): Intent {
      const self = view.self;
      const them = view.opponent;
      const gap = distance(self.shoulder, them.shoulder);

      // ---- what their blade is doing -------------------------------------
      const tipGap = distance(them.tip, self.shoulder);
      if (lastGap >= 0 && dt > 0) {
        const rate = (tipGap - lastGap) / dt;
        gapRate += (rate - gapRate) * (1 - Math.exp(-12 * dt));
      }
      lastGap = tipGap;

      const bladeX = them.tip.x - them.shoulder.x;
      const bladeY = them.tip.y - them.shoulder.y;
      const bladeZ = them.tip.z - them.shoulder.z;
      const bladeLength = Math.hypot(bladeX, bladeY, bladeZ) || 1;
      const towardX = self.shoulder.x - them.shoulder.x;
      const towardY = self.shoulder.y - them.shoulder.y;
      const towardZ = self.shoulder.z - them.shoulder.z;
      const towardLength = Math.hypot(towardX, towardY, towardZ) || 1;
      const inLine =
        (bladeX * towardX + bladeY * towardY + bladeZ * towardZ) / (bladeLength * towardLength);

      const opening =
        inLine < DUELIST.outOfLine ||
        (them.tipSpeed > DUELIST.theirCommit && gapRate > DUELIST.receding);
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
      if (view.measure < DUELIST.crowd) {
        intent.forward = -0.8;
      } else if (gap > DUELIST.hold + DUELIST.slack) {
        intent.forward = clamp((gap - DUELIST.hold) * DUELIST.closeGain, 0, 1);
      } else if (gap < DUELIST.hold - DUELIST.slack) {
        intent.forward = clamp((gap - DUELIST.hold) * DUELIST.closeGain, -1, 0);
      } else {
        intent.forward = 0;
      }

      // ---- hands -----------------------------------------------------------
      if (stance === "hold") {
        hand.guard = true;
        coveringLine(view, tipGap, towardLength, target, aim);
        hand.pointerX = aim.pointerX;
        hand.pointerY = aim.pointerY;
        // Along the covering line the blade is a bar, not an edge, so the roll
        // is left where the last cut put it rather than spent on nothing.

        if (cooldown <= 0 && gap <= DUELIST.strike && (opening || sinceOpening > patience)) {
          target.x = them.ground.x;
          target.y = them.shoulder.y + DUELIST.headLift;
          target.z = them.ground.z;
          aimAt(view, target, aim);

          fromX = clamp(aim.pointerX + DUELIST.offset.x, -1, 1);
          fromY = clamp(aim.pointerY + DUELIST.offset.y, -1, 1);
          toX = clamp(aim.pointerX - DUELIST.offset.x, -1, 1);
          toY = clamp(aim.pointerY - DUELIST.offset.y, -1, 1);
          hand.roll = rollForStroke(fromX, fromY, toX, toY);

          patience = DUELIST.patience * (0.8 + random() * 0.4);
          sinceOpening = 0;
          goTo("chamber", DUELIST.chamberSeconds);
          // The chamber lifts from wherever the guard left the cursor.
          aim.pointerX = hand.pointerX;
          aim.pointerY = hand.pointerY;
        }
        return intent;
      }

      elapsed += dt;
      const t = stanceSeconds > 0 ? clamp(elapsed / stanceSeconds, 0, 1) : 1;

      if (stance === "chamber") {
        hand.guard = false;
        // A step in with the chamber, on the diagonal the strafe is already
        // walking: closing straight down the middle is what `swinger` does.
        intent.forward = Math.max(intent.forward, 0.35);
        hand.pointerX = aim.pointerX + (fromX - aim.pointerX) * t;
        hand.pointerY = aim.pointerY + (fromY - aim.pointerY) * t;
        if (t >= 1) goTo("cut", DUELIST.cutSeconds);
        return intent;
      }

      if (stance === "cut") {
        hand.guard = false;
        intent.forward = Math.max(intent.forward, 0.2);
        hand.pointerX = fromX + (toX - fromX) * t;
        hand.pointerY = fromY + (toY - fromY) * t;
        if (t >= 1) goTo("recover", DUELIST.recoverSeconds);
        return intent;
      }

      // Recover: the guard goes back up immediately and the cursor walks back to
      // the covering line under it, because the hand is what is slow and the
      // button is not.
      hand.guard = true;
      coveringLine(view, tipGap, towardLength, target, aim);
      hand.pointerX = toX + (aim.pointerX - toX) * t;
      hand.pointerY = toY + (aim.pointerY - toY) * t;
      if (t >= 1) {
        cooldown = DUELIST.cooldown;
        goTo("hold", 0);
      }
      return intent;
    },
  };
}
