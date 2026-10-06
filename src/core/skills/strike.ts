import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../body.ts";
import { rigidPoints } from "../build/rigid.ts";
import { targetWindow } from "../control/target-window.ts";
import { newHandContact } from "../control/hand-feedback.ts";
import { intoFrameToRef } from "../control/kinematics.ts";
import type { Hand, HandGoal, MusclePush, Pose } from "../control/motor.ts";
import type { HandAction } from "../mind/intent.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { distance, sub } from "../spec/vec.ts";
import { deepFreeze } from "../state.ts";
import { GUARD } from "./guard.ts";
import { PLACING, wrap, type Footing } from "./locomotion.ts";
import type { Skill } from "./skill.ts";
import { aimOf, netsOf, recipeAt, recipesFor, REPERTOIRE, type Band, type Chosen, type Repertoire, type StrikeWindow } from "./strikes.ts";
import { sin, cos, asin, atan2, hypot } from "../math/real.ts";

/**
 * **Seconds stood still in the guard before a strike is thrown**: the start every recipe was
 * searched from, the body standing where it was built. By then each human's centre of mass has
 * settled to 6 mm/s or less. Set, with the table it settles by:
 * `docs/reference/human-and-strikes.md#stand-time`.
 */
export const STAND = 1.5;

/**
 * **The most a blow turns the pelvis to follow its target**, rad either way. From the commit to the
 * end of the pushes the stance's heading is turned by how far the target's bearing has turned
 * since the commit, seen from where the feet's middle stood then, so a target that moves across
 * the heading under a blow stays where the recipe's window had it. Read on the stand at 0.15 and
 * 0.3 against a target 6 and 12 cm across: `docs/reference/blows.md#steered`.
 */
export const STEER = 0.3;

/**
 * **How the body comes to a recipe's place**: its centre of mass walks toward the place at the
 * error over `seconds`, no faster than `pace` (m/s), until it is within `reach` (m); then the feet
 * are set there (`Locomotion.place`). A walk alone does not stand a body where it stops: stopped,
 * the stance steps a foot out from the gait's width to the width it was built at, which moves the
 * body some 10 cm to one side, out of the recipe's window; and a slow walk asked for a few
 * centimetres leans the body without stepping. The pace is one each human holds while turning;
 * `seconds` and `reach` are set. Evidence: `docs/reference/human-and-strikes.md#approach`.
 */
export const APPROACH = { pace: 0.3, seconds: 1, reach: 0.25 } as const;

/**
 * **A placed blow**: the point a hand strikes with (`aimOf`), carried by a hand goal from where
 * it is to `through` m beyond the target along that line, in `seconds`. The body stands for it
 * with the target `stretch` of the arm's straight length from the shoulder, the arm's length
 * being the spec's: the shoulder to the point, in the reference pose's segments laid straight.
 * It is what a hand throws at a target no recipe's window holds. Set on the targets' battery:
 * `docs/reference/blows.md#placed`.
 */
export const PLACED: Placed = Object.freeze({ stretch: 1, seconds: 0.4, through: 0.15 });

/** Point-return acceptance and deadline; engineering inputs in `docs/reference/arena-point-control.md#strike-cycle`. */
const POINT_RETURN = Object.freeze({ near: 0.03, slow: 0.2, hold: 0.1, limit: 2 });

/** A placed blow's settings (`PLACED`). */
export interface Placed {
  readonly stretch: number;
  readonly seconds: number;
  readonly through: number;
}

/**
 * What a placed blow reads of a hand's arm, from the spec in its reference pose: the shoulder to
 * the point the hand strikes with, by the elbow and the wrist, laid straight, m; and, from the
 * head's centre of mass in the body frame, the shoulder and how far ahead the toes reach, m.
 */
interface Arm {
  readonly length: number;
  readonly shoulder: Vec3;
  readonly toes: number;
}

function armOf(spec: BodySpec, hand: Hand, aim: string): Arm {
  const segment = (name: string) => {
    const found = spec.segments.find((s) => s.name === name);
    if (!found) throw new Error(`${spec.model} has no ${name}`);
    return found;
  };
  const joint = (name: string): Vec3 => {
    const found = spec.joints.find((j) => j.name === `${name}.${hand}`);
    if (!found) throw new Error(`${spec.model} has no ${name}.${hand}`);
    return found.centre.value;
  };
  const point = rigidPoints(spec, segment(`hand.${hand}`)).get(aim);
  if (!point) throw new Error(`${spec.model}'s ${hand} hand has no point ${aim} to strike with`);
  const shoulder = joint("shoulder"), elbow = joint("elbow"), wrist = joint("wrist"), head = segment("head").centreOfMass.value;
  return {
    length: distance(shoulder, elbow) + distance(elbow, wrist) + distance(wrist, point.value),
    shoulder: sub(shoulder, head),
    toes: Math.max(segment("foot.left").distal.value[2], segment("foot.right").distal.value[2]) - head[2],
  };
}

/**
 * How far ahead of the head a placed blow's target stands, `up` m over the head: where it is
 * `stretch` of the arm from the shoulder, straight ahead of the head. A target too high or too
 * low for any such place is stood for as near as the arm's length allows, under or over the
 * shoulder; and never nearer than the toes: a body does not stand on what it strikes.
 */
function placedDistance({ length, shoulder, toes }: Arm, stretch: number, up: number, reserve = 0): number {
  const reach = Math.max(0, stretch * length - reserve), rise = up - shoulder[1];
  const flat = reach * reach - shoulder[0] * shoulder[0] - rise * rise;
  return Math.max(toes, shoulder[2] + (flat > 0 ? Math.sqrt(flat) : 0));
}

/**
 * How far ahead of its head a body of `spec` stands a target `up` m over the head for `hand`'s
 * placed blow, m (`PLACED`, unless an experiment passes another).
 */
export function placedReach(spec: BodySpec, hand: Hand, up: number, placing: Placed = PLACED): number {
  return placedDistance(armOf(spec, hand, aimOf(spec, hand)), placing.stretch, up);
}

/** How a hand's attack is carried out: thrown with a recipe, or placed with the point it strikes with. */
type Blow =
  | { readonly kind: "recipe"; readonly chosen: Chosen }
  | { readonly kind: "placed"; readonly aim: string; readonly arm: Arm };

/** Where a placed blow is thrown from about its place: wherever the approach leaves the body (`APPROACH.reach`), each way. */
type Standing = Pick<StrikeWindow, "along" | "across">;

/** What a hand of a body may throw with what it holds: its recipes (`recipesFor`), each as a blow, and its placed blow. */
interface Blows {
  readonly chosen: readonly Chosen[];
  readonly recipes: readonly Blow[];
  readonly placed: Blow;
}

function blowsOf(spec: BodySpec, repertoire: Repertoire, hand: Hand): Blows {
  const chosen = recipesFor(repertoire, spec, hand), aim = aimOf(spec, hand);
  return deepFreeze({
    chosen,
    recipes: chosen.map((one) => ({ kind: "recipe", chosen: one } as const)),
    placed: { kind: "placed", aim, arm: armOf(spec, hand, aim) } as const,
  });
}

/** Of `blows`, the recipe thrown at a target `up` m over the head, by its place among them; null where no window holds that height, and the blow is placed. */
function chooseIn(blows: Blows, up: number): number | null {
  const at = recipeAt(blows.chosen, up);
  return at < 0 ? null : at;
}

/** How far ahead of the head `blow`'s target stands as it is thrown, m, the target `up` m over the head. */
function standOff(blow: Blow, up: number, placing: Placed, reserve = 0): number {
  switch (blow.kind) {
    case "recipe": return blow.chosen.recipe.place.ahead;
    case "placed": return placedDistance(blow.arm, placing.stretch, up, reserve);
    default: {
      const never: never = blow;
      throw new Error(`unknown blow ${JSON.stringify(never)}`);
    }
  }
}

const WITHIN: Standing = deepFreeze({ along: [-APPROACH.reach, APPROACH.reach], across: [-APPROACH.reach, APPROACH.reach] });

/** Where about its place `blow` is thrown from. */
function windowOf(blow: Blow): Standing {
  switch (blow.kind) {
    case "recipe": return blow.chosen.window;
    case "placed": return WITHIN;
    default: {
      const never: never = blow;
      throw new Error(`unknown blow ${JSON.stringify(never)}`);
    }
  }
}

/**
 * **How far a hand's blow reaches** at a target some height over the head: how far ahead of the
 * head the blow has its target (`StrikeReport.distance`), and how much nearer or further than that
 * the target may stand along the heading for the blow to be thrown from where the body stands, m.
 */
interface Range {
  readonly reach: number;
  readonly along: readonly [number, number];
}

/** The range of `blows`' blow at a target `up` m over the head: the one the strike skill chooses there. */
function rangeIn(blows: Blows, up: number, placing: Placed, reserve = 0, spacing = 0): Range {
  const recipe = chooseIn(blows, up), blow = recipe === null ? blows.placed : blows.recipes[recipe]!;
  return { reach: standOff(blow, up, placing, reserve) + spacing, along: windowOf(blow).along };
}

/**
 * **The range of `spec`'s `hand`** with what it holds, at a target `up` m over its head, as its
 * strike skill throws (`strikeSkill`, the game's repertoire and placed blow unless an experiment
 * passes others): what one body knows of another's blow by what it sees of it (`BodySense.spec`).
 */
export function rangeOf(spec: BodySpec, hand: Hand, up: number, repertoire: Repertoire = REPERTOIRE, placing: Placed = PLACED): Range {
  if (repertoire !== REPERTOIRE) return rangeIn(blowsOf(spec, repertoire, hand), up, placing);
  let blows = GAME_BLOWS.get(spec);
  if (!blows) GAME_BLOWS.set(spec, blows = { left: blowsOf(spec, REPERTOIRE, "left"), right: blowsOf(spec, REPERTOIRE, "right") });
  return rangeIn(blows[hand], up, placing);
}

/** Each body's blows under the game's repertoire, read once a spec: a body's are the same every step. */
const GAME_BLOWS = new WeakMap<BodySpec, Readonly<Record<Hand, Blows>>>();

/** No hand given a goal. */
const NO_HANDS: Readonly<Record<Hand, HandGoal | null>> = Object.freeze({ left: null, right: null });

/** Where a strike is: walking to its place, setting the feet there, standing still, holding its chamber, pushing or carrying its point, or returning it. */
type StrikePhase = "approach" | "place" | "settle" | "chamber" | "swing" | "return";

type PointReason = "contact" | "miss" | "cancelled" | "preparation-timeout" | "return-timeout" | "interrupted" | "target-moved";

interface PointResponse {
  /** Finished attempts, including cancellations and failures, each counted once. */
  completed: Record<Hand, number>;
  reasons: Record<PointReason, number>;
  last: { hand: Hand; reason: PointReason; returned: boolean; time: number } | null;
}

/** How the strike skill is going, as the last command left it. */
export interface StrikeReport {
  /** The hand whose attack the skill is carrying out, or null. */
  readonly hand: Hand | null;
  readonly phase: StrikePhase | null;
  /** How the attack in hand is carried out, as last chosen: with a recipe, or placed. */
  readonly blow: Blow["kind"] | null;
  /** The recipe being thrown; null with none, or with a placed blow. */
  readonly chosen: Chosen | null;
  /** How far ahead of the head the blow in hand has its target as it is thrown, m: what the body stands for. */
  readonly distance: number | null;
  /** Seconds since the pushes, or a placed blow's path, began (negative before). */
  readonly since: number;
  /** Strikes thrown to the end of their pushes, each hand. */
  readonly thrown: Readonly<Record<Hand, number>>;
  /** Point-cycle outcomes: verified returns, preparation/return timeouts, and interruptions. */
  readonly pointCycle?: { readonly returned: Readonly<Record<Hand, number>>; readonly failed: number; readonly interrupted: number; readonly response?: Readonly<PointResponse> };
  /**
   * Seconds since the body last walked, set its feet or finished a strike: the stand before a
   * strike, and, counting on through the chamber and the pushes, the strike's clock.
   */
  readonly still: number;
  /**
   * The range of `hand`'s blow at a target `up` m over the head (`rangeOf`): its place in the
   * recipe whose window holds that height, or a placed blow's with none, and the window along.
   */
  rangeAt(hand: Hand, up: number): Range;
  /** What each hand's recipe nets in each band (`netsOf`): null for a band it has none in. */
  readonly nets: Readonly<Record<Hand, Readonly<Record<Band, number | null>>>>;
}

/** What the strike skill asks of the body this step. */
interface StrikeCommand {
  /** Walk (forward, right, m/s) toward the recipe's place, or stand; and face the target. */
  readonly walk: readonly [number, number] | null;
  readonly face: number;
  /** Where to set the feet (`Locomotion.place`), in place of a walk; null walks or stands. */
  readonly footing: Footing | null;
  readonly posture: Pose;
  readonly pushes: readonly MusclePush[];
  /** A placed blow's goal for its hand, made for the step; null for a hand with none. */
  readonly hands: Readonly<Record<Hand, HandGoal | null>>;
  /** How far the stance's heading is turned to follow the target, rad (`STEER`). */
  readonly steer: number;
}

/**
 * **The strike skill**: a hand's attack carried out, with a recipe (`strikes.ts`) or placed
 * (`PLACED`). It chooses the blow as it takes the attack up: of the recipes for what the hand
 * holds, the one whose window holds the target's height over the head (`recipeAt`); else a
 * placed blow. It walks the body toward the place where its feet stand square for the
 * target to be at the middle of the blow's window (`Chosen.window`, or about a placed blow's
 * distance) straight ahead of the head, and sets its feet there (`APPROACH`), or, for a recipe
 * whose window holds the target from where the body stands, stands where it is; stands still in the
 * guard `STAND` seconds; then chooses the blow again by the head as it stands, once for a point
 * attacked (from one stand to the next a height at a window's edge reads either side of it), and
 * asks the window of it, standing again for another blow or setting the feet again if it is out.
 * A recipe
 * holds its chamber and pushes, the pelvis turned to follow its target across (`STEER`). A placed
 * blow carries its point through the target by a hand goal in the body frame (`BodyView.root`).
 * Optional point motion adds measured preparation and return, with the settings `POINT_RETURN`.
 * While it works the skill has the legs (a blow is thrown standing) and the trunk; the other hand
 * guards. One strike at a time: the right hand's first when both attack. An attack given up
 * before its blow begins is dropped. A recipe begun is thrown to the end of its pushes, whatever
 * its hand is then asked. A placed blow given up is over, unthrown, unless point motion returns
 * its committed hand first. Resumed (`Skill.resume`), the strike in hand is discarded and the
 * body has stood still for no time.
 */
interface StrikeSkill extends Skill {
  /** This step's command for the hands' actions, or null when neither attacks and no strike is under way. */
  command(view: BodyView, hands: Readonly<Record<Hand, HandAction>>, heading: number, placed: boolean, dt: number): StrikeCommand | null;
  /** Count a step the body stood still (the skill not commanding): walking, it is reset. */
  idle(walking: boolean, dt: number): void;
  readonly report: StrikeReport;
  /** Its memory (`src/core/state.ts`). The recipes it chose are the body's, fixed when it is made, and no memory. */
  readonly state: object;
}

/** **What the strike skill remembers.** */
interface StrikeState {
  /** The hand whose attack it is carrying out, and where that strike is. */
  hand: Hand | null;
  phase: StrikePhase | null;
  /**
   * How that attack is carried out, as last chosen: the recipe's place among the hand's
   * (`recipesFor`), null with a placed blow; and how far ahead of the head its target is stood for, m.
   */
  blow: Blow["kind"] | null;
  recipe: number | null;
  distance: number | null;
  /** The point attacked that the blow was chosen for by the head as it stood; null until it has stood for one. */
  stoodFor: [number, number, number] | null;
  /** Seconds since the body last walked, set its feet or finished a strike (`StrikeReport.still`). */
  still: number;
  /** Seconds since the pushes, or a placed blow's path, began; minus infinity with no strike thrown. */
  since: number;
  /** When the throw began, and when the body first stood for it, in `still`'s count. */
  begun: number | null;
  readyAt: number | null;
  /**
   * Where the feet's middle stood as the recipe's throw was committed, and the target's bearing
   * from there then; the heading's turn to follow the target since (`STEER`).
   */
  origin: [number, number] | null;
  bearing: number | null;
  steer: number;
  /** The feet's width apart as built, m, and the head over their middle as the body last stood: along the heading and across it. */
  width: number | null;
  over: [number, number] | null;
  /** Strikes thrown to the end of their pushes, each hand. */
  readonly thrown: Record<Hand, number>;
  /** The pushes of the command last made: the one list, written again by each. */
  readonly pushes: MusclePush[];
  /** Measured body-frame point motion for the optional Hermite trajectory. */
  readonly motion?: { previous: Record<Hand, Vec3 | null>; velocity: Vec3 | null; home: Vec3 | null;
    chamber: Vec3 | null; launched: number | null; returning: boolean; time: number; ready: number;
    reaction?: { touching: Record<Hand, boolean>; reason: PointReason | null };
    outcomes: { returned: Record<Hand, number>; failed: number; interrupted: number; response?: PointResponse } };
}

export function strikeSkill(spec: BodySpec, repertoire: Repertoire, placing: Placed = PLACED, steering = STEER, pointMotion = false, pointSpacing = 0, pointResponse = false): StrikeSkill {
  const known = { left: blowsOf(spec, repertoire, "left"), right: blowsOf(spec, repertoire, "right") };
  /** The recipe `hand` throws at a target `up` m over the head, by its place among the hand's; null where no window holds that height, and the blow is placed. */
  const choose = (hand: Hand, up: number): number | null => chooseIn(known[hand], up);
  /** The blow `hand` throws with its recipe at `recipe`, or placed with none. */
  const blowOf = (hand: Hand, recipe: number | null): Blow => recipe === null ? known[hand].placed : known[hand].recipes[recipe]!;
  const state: StrikeState = {
    hand: null, phase: null, blow: null, recipe: null, distance: null, stoodFor: null,
    still: 0, since: -Infinity, begun: null, readyAt: null, origin: null, bearing: null, steer: 0, width: null, over: null,
    thrown: { left: 0, right: 0 }, pushes: [],
    ...(pointMotion ? { motion: { previous: { left: null, right: null }, velocity: null, home: null,
      chamber: null, launched: null, returning: false, time: 0, ready: 0,
      ...(pointResponse ? { reaction: { touching: { left: false, right: false }, reason: null } } : {}),
      outcomes: { returned: { left: 0, right: 0 }, failed: 0, interrupted: 0,
        ...(pointResponse ? { response: { completed: { left: 0, right: 0 }, reasons: { contact: 0, miss: 0, cancelled: 0,
          "preparation-timeout": 0, "return-timeout": 0, interrupted: 0, "target-moved": 0 }, last: null } } : {}) } } } : {}),
  };
  const report: StrikeReport = {
    get hand() { return state.hand; },
    get phase() { return state.phase; },
    get blow() { return state.blow; },
    get chosen() { return state.hand && state.recipe !== null ? known[state.hand].chosen[state.recipe]! : null; },
    get distance() { return state.distance; },
    get since() { return state.since; },
    get thrown() { return state.thrown; },
    get still() { return state.still; },
    rangeAt: (hand, up) => rangeIn(known[hand], up, placing, pointMotion ? placing.through : 0, pointSpacing),
    ...(state.motion ? { pointCycle: state.motion.outcomes } : {}),
    nets: { left: netsOf(known.left.chosen), right: netsOf(known.right.chosen) },
  };
  const finishResponse = (reason: PointReason, returned: boolean, time: number): void => {
    const response = state.motion?.outcomes.response;
    if (!response || !state.hand || !state.motion?.home) return;
    response.completed[state.hand]++; response.reasons[reason]++;
    response.last = { hand: state.hand, reason, returned, time };
  };
  const end = (): void => {
    state.hand = null; state.phase = null; state.blow = null; state.recipe = null; state.distance = null; state.stoodFor = null;
    state.begun = null; state.readyAt = null; state.since = -Infinity;
    state.origin = null; state.bearing = null; state.steer = 0;
    if (state.motion) {
      state.motion.velocity = null; state.motion.home = null;
      state.motion.chamber = null; state.motion.launched = null;
      state.motion.returning = false; state.motion.time = 0; state.motion.ready = 0;
      if (state.motion.reaction) state.motion.reaction.reason = null;
    }
  };
  const place = new Vector3();
  return {
    report, state,
    resume(view) {
      if (state.motion?.reaction) finishResponse("interrupted", false, view.time);
      if (state.motion?.home) state.motion.outcomes.interrupted++;
      if (state.hand) end();
      state.still = 0;
      if (state.motion) { state.motion.previous.left = null; state.motion.previous.right = null; }
    },
    idle(walking, dt) {
      if (state.hand) end();
      state.still = walking ? 0 : state.still + dt;
    },
    command(view, hands, heading, placed, dt) {
      const velocities: Partial<Record<Hand, Vec3>> | null = state.motion ? {} : null;
      if (state.motion) for (const hand of ["left", "right"] as const) {
        const at = view.points[hand][aimOf(spec, hand)]!, previous = state.motion.previous[hand];
        const position: Vec3 = [at.x, at.y, at.z];
        velocities![hand] = previous ? position.map((v, k) => (v - previous[k]!) / dt) as unknown as Vec3 : [0, 0, 0];
        state.motion.previous[hand] = position;
      }
      const reaction = state.motion?.reaction;
      const contactEdge = { left: false, right: false };
      if (reaction) for (const hand of ["left", "right"] as const) {
        const touching = (view.handFeedback?.[hand].impulse ?? 0) > 0;
        contactEdge[hand] = newHandContact(reaction.touching[hand], view.handFeedback?.[hand]);
        reaction.touching[hand] = touching;
      }
      const s = view.stance, fx = sin(heading), fz = cos(heading);
      // Across the ground, forward is (fx, fz) and the right (fz, -fx).
      const inFrame = (x: number, z: number): [number, number] => [x * fx + z * fz, x * fz - z * fx];
      const feetX = (s.soles.left.x + s.soles.right.x) / 2, feetZ = (s.soles.left.z + s.soles.right.z) / 2;
      // As built the feet stand square, as a recipe was thrown from: their width, and the head over
      // their middle, are the body's own until it has stood again.
      const width = state.width ??= Math.abs(inFrame(s.soles.right.x - s.soles.left.x, s.soles.right.z - s.soles.left.z)[1]);
      const over = state.over ??= inFrame(view.head.x - feetX, view.head.z - feetZ);
      // Cancellation drops an uncommitted attack. A committed point cycle returns its hand;
      // other placed blows end immediately, and a recipe finishes its pushes.
      if (state.hand && hands[state.hand].kind !== "attack") {
        if (state.begun === null) end();
        else if (state.blow === "placed") {
          if (state.motion?.home) {
            if (!state.motion.returning) {
              state.motion.returning = true; state.motion.time = 0; state.motion.ready = 0;
              state.motion.velocity = velocities![state.hand]!; state.motion.outcomes.interrupted++;
              if (reaction) reaction.reason = "cancelled";
            }
          } else { end(); state.still = 0; }
        }
      }
      // Else the right hand's attack, then the left's.
      const hand = state.hand ??= hands.right.kind === "attack" ? "right" : hands.left.kind === "attack" ? "left" : null;
      if (!hand) return null;
      const action = hands[hand];
      let walk: readonly [number, number] | null = null, face = heading, footing: Footing | null = null;
      if (state.begun === null && action.kind === "attack") {
        const [tx, ty, tz] = action.target, up = ty - view.head.y;
        if (state.blow === null) {
          const recipe = choose(hand, up), taken = blowOf(hand, recipe);
          state.blow = taken.kind;
          state.recipe = recipe;
          state.distance = standOff(taken, up, placing, pointMotion ? placing.through : 0) + pointSpacing;
        }
        const window = windowOf(blowOf(hand, state.recipe)), reach = state.distance!;
        const middle = [(window.along[0] + window.along[1]) / 2, (window.across[0] + window.across[1]) / 2] as const;
        const [ahead, aside] = inFrame(tx - view.head.x, tz - view.head.z);
        // Facing so that the target stands at the window's middle across: its bearing less the
        // angle that puts it there, for across = r sin(bearing - heading).
        face = atan2(tx - view.head.x, tz - view.head.z) - asin(Math.max(-1, Math.min(1, middle[1] / hypot(ahead, aside))));
        // Where the feet stand, square and their width apart across the heading, for the head over
        // them to have the target at the window's middle.
        const along = reach + middle[0] + over[0], across = middle[1] + over[1], half = width / 2;
        const mx = tx - along * fx - across * fz, mz = tz - along * fz + across * fx;
        const at: Footing = { left: [mx - half * fz, mz + half * fx], right: [mx + half * fz, mz - half * fx] };
        if (state.phase !== "settle") {
          const square = s.phase === "stand"
            && hypot(s.soles.left.x - at.left[0], s.soles.left.z - at.left[1]) <= PLACING.near
            && hypot(s.soles.right.x - at.right[0], s.soles.right.z - at.right[1]) <= PLACING.near;
          const [toX, toZ] = inFrame(mx - s.centre.x, mz - s.centre.z);
          // A recipe's window holding the target from where the body stands: it stands there, and
          // is then within `APPROACH.reach` of its place.
          const off = ahead - reach, held = (state.blow === "recipe" || pointResponse)
            && window.along[0] <= off && off <= window.along[1] && window.across[0] <= aside && aside <= window.across[1];
          if (square || (state.phase === "place" && placed)) state.phase = "settle";
          else if (state.phase !== "place" && held) state.phase = "settle";
          else if (state.phase !== "place" && hypot(toX, toZ) > APPROACH.reach) {
            // Walked toward the place, the centre of mass leading.
            const speed = hypot(toX, toZ) / APPROACH.seconds, scale = speed > APPROACH.pace ? APPROACH.pace / speed : 1;
            walk = [toX / APPROACH.seconds * scale, toZ / APPROACH.seconds * scale];
            state.phase = "approach";
          } else {
            footing = at;
            state.phase = "place";
          }
          if (state.phase !== "settle") { state.still = 0; state.readyAt = null; }
        }
        if (state.phase === "settle") {
          // It settles on both feet (point response also measures centre speed), then chooses the blow by the head,
          // once for the point attacked, and asks its window.
          const standSeconds = pointResponse ? POINT_RETURN.hold : STAND;
          if (s.phase === "stand" && (!pointResponse || hypot(s.velocity.x, s.velocity.y, s.velocity.z) < POINT_RETURN.slow)) state.still += dt;
          else if (pointResponse) { state.still = 0; state.readyAt = null; }
          state.readyAt ??= state.still;
          if (state.still >= standSeconds) {
            const chosen = state.stoodFor !== null && state.stoodFor[0] === tx && state.stoodFor[1] === ty && state.stoodFor[2] === tz;
            const recipe = chosen ? state.recipe : choose(hand, up), stood = blowOf(hand, recipe), same = recipe === state.recipe, off = ahead - reach;
            state.stoodFor = [tx, ty, tz];
            if (same && window.along[0] <= off && off <= window.along[1] && window.across[0] <= aside && aside <= window.across[1]) {
              state.begun = Math.max(standSeconds, state.readyAt);
            } else {
              // Another blow, or out of its window: the body stands again, for the blow chosen and
              // the head as it stands over the feet now. Another blow's place is walked to, or set,
              // from the next step; the same blow's feet are set again.
              state.over = inFrame(view.head.x - feetX, view.head.z - feetZ);
              if (same) footing = at;
              state.phase = same ? "place" : "approach";
              state.blow = stood.kind;
              state.recipe = recipe;
              state.distance = standOff(stood, up, placing, pointMotion ? placing.through : 0) + pointSpacing;
              state.still = 0;
              state.readyAt = null;
            }
          }
        }
      } else state.still += dt;
      // A recipe thrown follows its target across: the heading turned as its bearing has, while its hand attacks.
      if (state.begun !== null && state.blow === "recipe" && steering > 0 && action.kind === "attack") {
        const origin = state.origin ??= [feetX, feetZ];
        const bearing = atan2(action.target[0] - origin[0], action.target[2] - origin[1]);
        state.bearing ??= bearing;
        state.steer = Math.max(-steering, Math.min(steering, wrap(bearing - state.bearing)));
      }
      const { pushes, steer } = state;
      pushes.length = 0;
      let posture = GUARD, goals = NO_HANDS;
      if (state.begun !== null) {
        const blow = blowOf(hand, state.recipe);
        let over: boolean;
        switch (blow.kind) {
          case "recipe": {
            const { strike } = blow.chosen, chamber = strike.chamber ?? { seconds: 0, pose: {} };
            const since = state.since = state.still - (state.begun + chamber.seconds);
            over = since >= Math.max(0, ...strike.pushes.map((p) => p.to));
            if (since < 0) { posture = { ...GUARD, ...chamber.pose }; state.phase = "chamber"; }
            else {
              state.phase = "swing";
              for (const p of strike.pushes) if (since >= p.from && since < p.to) pushes.push({ channel: p.channel, sense: p.sense, level: p.level ?? 1 });
            }
            break;
          }
          case "placed": {
            const motion = state.motion;
            const since = state.since = state.still - (motion ? motion.launched ?? Infinity : state.begun);
            over = since >= placing.seconds;
            if (motion) {
              const at = view.points[hand][blow.aim]!;
              motion.home ??= [at.x, at.y, at.z];
              if (!motion.returning && motion.launched === null) {
                if (action.kind !== "attack") throw new Error("a point chamber needs an attack target");
                if (!motion.chamber) {
                  intoFrameToRef(view.root, action.target, place);
                  const span = hypot(place.x - at.x, place.y - at.y, place.z - at.z);
                  // Reserve half the straight reach for a stroke, retracting no further than its follow-through.
                  const retreat = Math.max(0, Math.min(placing.through, blow.arm.length / 2 - span));
                  const back = span > 0 ? retreat / span : 0;
                  motion.chamber = [at.x - back * (place.x - at.x), at.y - back * (place.y - at.y), at.z - back * (place.z - at.z)];
                  motion.velocity = velocities![hand]!;
                }
                state.phase = "chamber"; motion.time += dt;
                const target = motion.chamber;
                const ready = hypot(at.x - target[0], at.y - target[1], at.z - target[2]) <= POINT_RETURN.near
                  && hypot(...velocities![hand]!) <= POINT_RETURN.slow && !view.down && s.phase === "stand";
                motion.ready = ready ? motion.ready + dt : 0;
                const goal: HandGoal = { places: [{ point: blow.aim, position: target }], seconds: placing.seconds,
                  through: 0, follows: false, initialVelocity: motion.velocity! };
                goals = hand === "left" ? { left: goal, right: null } : { left: null, right: goal };
                if (motion.ready >= POINT_RETURN.hold) {
                  const window = targetWindow([view.head.x, view.head.y, view.head.z], s.facing, action.target,
                    rangeIn(known[hand], action.target[1] - view.head.y, placing, placing.through, pointSpacing), APPROACH.reach);
                  if (reaction && !window.inside) { reaction.reason = "target-moved"; motion.returning = true; }
                  else motion.launched = state.still;
                  motion.velocity = velocities![hand]!; motion.ready = 0; motion.time = 0;
                } else if (motion.time >= POINT_RETURN.limit) {
                  if (reaction) reaction.reason = "preparation-timeout";
                  motion.outcomes.failed++; motion.returning = true; motion.time = 0; motion.ready = 0; motion.velocity = velocities![hand]!;
                }
                over = false;
                break;
              }
              if (reaction && contactEdge[hand] && !motion.returning && motion.launched !== null) {
                reaction.reason = "contact"; motion.returning = true; motion.time = 0; motion.ready = 0;
                motion.velocity = velocities![hand]!;
              }
              if (over && !motion.returning) {
                if (reaction) reaction.reason = "miss";
                state.thrown[hand]++;
                motion.returning = true; motion.time = 0; motion.ready = 0;
                motion.velocity = velocities![hand]!;
              }
              if (motion.returning) {
                state.phase = "return";
                motion.time += dt;
                const speed = velocities![hand]!, home = motion.home;
                const near = hypot(at.x - home[0], at.y - home[1], at.z - home[2]) <= POINT_RETURN.near;
                const slow = hypot(...speed) <= POINT_RETURN.slow;
                motion.ready = near && slow && !view.down && (pointResponse || s.phase === "stand") ? motion.ready + dt : 0;
                if (motion.ready >= POINT_RETURN.hold || motion.time >= POINT_RETURN.limit) {
                  const returned = motion.ready >= POINT_RETURN.hold;
                  if (returned) motion.outcomes.returned[hand]++;
                  else motion.outcomes.failed++;
                  finishResponse(returned ? reaction?.reason ?? "miss" : "return-timeout", returned, view.time);
                  end(); state.still = 0;
                } else {
                  const goal: HandGoal = { places: [{ point: blow.aim, position: home }], seconds: placing.seconds,
                    through: 0, follows: false, initialVelocity: motion.velocity! };
                  goals = hand === "left" ? { left: goal, right: null } : { left: null, right: goal };
                }
                over = false;
                break;
              }
            }
            state.phase = "swing";
            if (action.kind !== "attack") throw new Error("a placed blow is carried only while its hand attacks");
            if (!over) {
              // The target in the body frame as the body now stands: the path's end moves with it.
              intoFrameToRef(view.root, action.target, place);
              const goal: HandGoal = { places: [{ point: blow.aim, position: [place.x, place.y, place.z] }], seconds: placing.seconds, through: placing.through, follows: true,
                ...(state.motion ? { initialVelocity: state.motion.velocity ??= velocities![hand]! } : {}) };
              goals = hand === "left" ? { left: goal, right: null } : { left: null, right: goal };
            }
            break;
          }
          default: {
            const never: never = blow;
            throw new Error(`unknown blow ${JSON.stringify(never)}`);
          }
        }
        if (over) {
          state.thrown[hand] += 1;
          end();
          state.still = 0;
        }
      }
      return { walk, face, footing, posture, pushes, hands: goals, steer };
    },
  };
}
