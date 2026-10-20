import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../body.ts";
import { rigidPoints } from "../build/rigid.ts";
import { intoFrameToRef } from "../control/kinematics.ts";
import type { EffectorGoal, MusclePush, Pose } from "../control/motor.ts";
import type { Attack, BlowAttack } from "../mind/intent.ts";
import type { Side, BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { distance, sub } from "../spec/vec.ts";
import { deepFreeze } from "../state.ts";
import { GUARD, guardPosture } from "./guard.ts";
import { PLACING, type Footing } from "./locomotion.ts";
import { wrap } from "../math/turn.ts";
import type { Skill } from "./skill.ts";
import { aimOf, closesToStrike, holdsAt, netsOf, recipeAt, recipesFor, REPERTOIRE, type Band, type Chosen, type Repertoire, type StrikeWindow } from "./strikes.ts";
import { sin, cos, asin, atan2, hypot } from "../math/real.ts";
import type { ActionAround, ActionEnding, ActionRequest, Executor, LifecycleUpdate, TargetRef } from "./action.ts";
import { withinActionWindow } from "../mind/action-window.ts";

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

function armOf(spec: BodySpec, hand: Side, aim: string): Arm {
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
function placedDistance({ length, shoulder, toes }: Arm, stretch: number, up: number): number {
  const reach = stretch * length, rise = up - shoulder[1];
  const flat = reach * reach - shoulder[0] * shoulder[0] - rise * rise;
  return Math.max(toes, shoulder[2] + (flat > 0 ? Math.sqrt(flat) : 0));
}

/**
 * How far ahead of its head a body of `spec` stands a target `up` m over the head for `hand`'s
 * placed blow, m (`PLACED`, unless an experiment passes another).
 */
export function placedReach(spec: BodySpec, hand: Side, up: number, placing: Placed = PLACED, aim = aimOf(spec, hand)): number {
  return placedDistance(aimedArm(spec, hand, aim), placing.stretch, up);
}

/** Each spec's arms with the points they strike with (`aimOf`), read once: a spec does not change, and a mind asks of it for every candidate blow. */
const AIMED = new WeakMap<BodySpec, Map<string, Arm>>();

/** `hand`'s arm of `spec` with the point it strikes with (`armOf`, `aimOf`), read once a spec. */
function aimedArm(spec: BodySpec, hand: Side, aim: string): Arm {
  let arms = AIMED.get(spec);
  if (!arms) AIMED.set(spec, arms = new Map());
  const key = `${hand}/${aim}`, known = arms.get(key);
  if (known) return known;
  const arm = armOf(spec, hand, aim); arms.set(key, arm); return arm;
}

/** Whether a level approach can put the hand's striking point at this height above the head. */
export function placedHeightFits(spec: BodySpec, hand: Side, up: number, placing: Placed = PLACED, aim = aimOf(spec, hand)): boolean {
  const arm = aimedArm(spec, hand, aim);
  return Math.abs(up - arm.shoulder[1]) <= arm.length * placing.stretch;
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

function blowsOf(spec: BodySpec, repertoire: Repertoire, hand: Side): Blows {
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
function standOff(blow: Blow, up: number, placing: Placed): number {
  switch (blow.kind) {
    case "recipe": return blow.chosen.recipe.place.ahead;
    case "placed": return placedDistance(blow.arm, placing.stretch, up);
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
function rangeIn(blows: Blows, up: number, placing: Placed): Range {
  const recipe = chooseIn(blows, up), blow = recipe === null ? blows.placed : blows.recipes[recipe]!;
  return { reach: standOff(blow, up, placing), along: windowOf(blow).along };
}

/**
 * **The range of `spec`'s `hand`** with what it holds, at a target `up` m over its head, as its
 * strike skill throws (`strikeSkill`, the game's repertoire and placed blow unless an experiment
 * passes others): what one body knows of another's blow by what it sees of it (`BodySense.spec`).
 */
export function rangeOf(spec: BodySpec, hand: Side, up: number, repertoire: Repertoire = REPERTOIRE, placing: Placed = PLACED): Range {
  if (repertoire !== REPERTOIRE) return rangeIn(blowsOf(spec, repertoire, hand), up, placing);
  let blows = GAME_BLOWS.get(spec);
  if (!blows) GAME_BLOWS.set(spec, blows = { left: blowsOf(spec, REPERTOIRE, "left"), right: blowsOf(spec, REPERTOIRE, "right") });
  return rangeIn(blows[hand], up, placing);
}

/** Each body's blows under the game's repertoire, read once a spec: a body's are the same every step. */
const GAME_BLOWS = new WeakMap<BodySpec, Readonly<Record<Side, Blows>>>();

/** No hand given a goal. */
const NO_HANDS: Readonly<Record<Side, EffectorGoal | null>> = Object.freeze({ left: null, right: null });

/** Where a strike is: walking to its place, setting the feet there, standing still, holding its chamber, pushing or carrying its point, or returning it. */
type StrikePhase = "approach" | "place" | "settle" | "chamber" | "swing" | "return";

/** How the strike skill is going, as the last command left it. */
export interface StrikeReport {
  readonly impact?: boolean;
  /** The hand whose attack the skill is carrying out, or null. */
  readonly hand: Side | null;
  readonly phase: StrikePhase | null;
  /** The additional hand still returning while the reported hand carries a follow-up. */
  readonly returning?: Side | null;
  /** Opposite hand available for a follow-up after contact release and actual homeward motion. */
  readonly overlapHand?: Side | null;
  /** How the attack in hand is carried out, as last chosen: with a recipe, or placed. */
  readonly blow: Blow["kind"] | null;
  /** The recipe being thrown; null with none, or with a placed blow; absent from a skill that throws no recipes. */
  readonly chosen?: Chosen | null;
  /** How far ahead of the head the blow in hand has its target as it is thrown, m: what the body stands for. */
  readonly distance?: number | null;
  /** Seconds since the pushes, or a placed blow's path, began (negative before). */
  readonly since: number;
  /**
   * Whether the skill reads its target afresh each step as it comes to it, so a fighter gives it
   * the point as it is (the straight punch); absent or false, it sets the feet for the point it is
   * given, and the recipe executor retains its aimed point while its window holds it.
   */
  readonly follows?: boolean;
  /** Strikes thrown to the end of their pushes, each hand. */
  readonly thrown: Readonly<Record<Side, number>>;
  /** Point-cycle outcomes: verified returns, preparation/return timeouts, and interruptions. */
  readonly pointCycle?: { readonly returned: Readonly<Record<Side, number>>; readonly failed: number; readonly interrupted: number };
  /**
   * Seconds since the body last walked, set its feet or finished a strike: the stand before a
   * strike, and, counting on through the chamber and the pushes, the strike's clock.
   */
  readonly still: number;
  /**
   * The range of `hand`'s blow at a target `up` m over the head (`rangeOf`): its place in the
   * recipe whose window holds that height, or a placed blow's with none, and the window along.
   */
  rangeAt(hand: Side, up: number): Range;
  /** What each hand's recipe nets in each band (`netsOf`): null for a band it has none in; absent from a skill that throws no recipes. */
  readonly nets?: Readonly<Record<Side, Readonly<Record<Band, number | null>>>>;
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
  readonly hands: Readonly<Record<Side, EffectorGoal | null>>;
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
 * attacked (from one stand to the next a height at a window's edge reads either side of it) and
 * keeping a recipe whose window still holds the target (`holdsAt`), and
 * asks the window of it, standing again for another blow or setting the feet again if it is out.
 * A recipe
 * holds its chamber and pushes, the pelvis turned to follow its target across (`STEER`). A placed
 * blow carries its point through the target by a hand goal in the body frame (`BodyView.root`).
 * While it works the skill has the legs (a blow is thrown standing) and the trunk; the other hand
 * guards. One strike at a time; a kick is not this skill's. An attack given up
 * before its blow begins is dropped. A recipe begun is thrown to the end of its pushes, whatever
 * its hand is then asked. A placed blow given up is over, unthrown. Resumed (`Skill.resume`), the strike in hand is discarded and the
 * body has stood still for no time. Its arms rest in `guard`, the body's (`guardPosture`), and a
 * recipe's chamber is laid over it.
 */
interface StrikeSkill extends Skill {
  /** This step's command for the attack asked for, or null when none is and no strike is under way. */
  command(view: BodyView, attack: Attack | null, heading: number, placed: boolean, dt: number): StrikeCommand | null;
  /** Count a step the body stood still (the skill not commanding): walking, it is reset. */
  idle(walking: boolean, dt: number): void;
  readonly report: StrikeReport;
  /** Its memory (`src/core/state.ts`). The recipes it chose are the body's, fixed when it is made, and no memory. */
  readonly state: object;
}

/** **What the strike skill remembers.** */
interface StrikeState {
  /** The hand whose attack it is carrying out, and where that strike is. */
  hand: Side | null;
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
  readonly thrown: Record<Side, number>;
  /** The pushes of the command last made: the one list, written again by each. */
  readonly pushes: MusclePush[];
}

/** The blow `attack` asks of the strike skill; it throws no kick. */
function blowAsked(attack: Attack | null): BlowAttack | null {
  if (!attack) return null;
  switch (attack.kind) {
    case "blow": return attack;
    case "kick": throw new Error("the strike skill throws blows, not kicks");
    default: {
      const never: never = attack;
      throw new Error(`unknown attack ${JSON.stringify(never)}`);
    }
  }
}

export function strikeSkill(spec: BodySpec, repertoire: Repertoire, placing: Placed = PLACED, steering = STEER, guard: Pose = GUARD): StrikeSkill {
  const known = { left: blowsOf(spec, repertoire, "left"), right: blowsOf(spec, repertoire, "right") };
  /** The recipe `hand` throws at a target `up` m over the head, by its place among the hand's; null where no window holds that height, and the blow is placed. */
  const choose = (hand: Side, up: number): number | null => chooseIn(known[hand], up);
  /** The blow `hand` throws with its recipe at `recipe`, or placed with none. */
  const blowOf = (hand: Side, recipe: number | null): Blow => recipe === null ? known[hand].placed : known[hand].recipes[recipe]!;
  const state: StrikeState = {
    hand: null, phase: null, blow: null, recipe: null, distance: null, stoodFor: null,
    still: 0, since: -Infinity, begun: null, readyAt: null, origin: null, bearing: null, steer: 0, width: null, over: null,
    thrown: { left: 0, right: 0 }, pushes: [],
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
    rangeAt: (hand, up) => rangeIn(known[hand], up, placing),
    nets: { left: netsOf(known.left.chosen), right: netsOf(known.right.chosen) },
  };
  const end = (): void => {
    state.hand = null; state.phase = null; state.blow = null; state.recipe = null; state.distance = null; state.stoodFor = null;
    state.begun = null; state.readyAt = null; state.since = -Infinity;
    state.origin = null; state.bearing = null; state.steer = 0;
  };
  const place = new Vector3();
  return {
    report, state,
    resume() {
      if (state.hand) end();
      state.still = 0;
    },
    idle(walking, dt) {
      if (state.hand) end();
      state.still = walking ? 0 : state.still + dt;
    },
    command(view, attack, heading, placed, dt) {
      const asked = blowAsked(attack);
      const s = view.stance, fx = sin(heading), fz = cos(heading);
      // Across the ground, forward is (fx, fz) and the right (fz, -fx).
      const inFrame = (x: number, z: number): [number, number] => [x * fx + z * fz, x * fz - z * fx];
      const feetX = (s.soles.left.x + s.soles.right.x) / 2, feetZ = (s.soles.left.z + s.soles.right.z) / 2;
      // As built the feet stand square, as a recipe was thrown from: their width, and the head over
      // their middle, are the body's own until it has stood again.
      const width = state.width ??= Math.abs(inFrame(s.soles.right.x - s.soles.left.x, s.soles.right.z - s.soles.left.z)[1]);
      const over = state.over ??= inFrame(view.head.x - feetX, view.head.z - feetZ);
      // Cancellation drops an uncommitted attack. A placed blow ends immediately, and a recipe
      // finishes its pushes.
      if (state.hand && asked?.hand !== state.hand) {
        if (state.begun === null) end();
        else if (state.blow === "placed") { end(); state.still = 0; }
      }
      // Else the hand the attack asks for.
      const hand = state.hand ??= asked?.hand ?? null;
      if (!hand) return null;
      const action = asked?.hand === hand ? asked : null;
      let walk: readonly [number, number] | null = null, face = heading, footing: Footing | null = null;
      if (state.begun === null && action) {
        const [tx, ty, tz] = action.target, up = ty - view.head.y;
        if (state.blow === null) {
          const recipe = choose(hand, up), taken = blowOf(hand, recipe);
          state.blow = taken.kind;
          state.recipe = recipe;
          state.distance = standOff(taken, up, placing);
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
          const off = ahead - reach, held = state.blow === "recipe"
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
          // It settles on both feet, then chooses the blow by the head, once for the point
          // attacked, and asks its window. A recipe set up is kept while its window holds the
          // target's height, so two windows that overlap in height do not trade places.
          if (s.phase === "stand") state.still += dt;
          state.readyAt ??= state.still;
          if (state.still >= STAND) {
            const chosen = state.stoodFor !== null && state.stoodFor[0] === tx && state.stoodFor[1] === ty && state.stoodFor[2] === tz;
            const kept = state.recipe !== null && holdsAt(known[hand].chosen[state.recipe]!, up);
            const recipe = chosen || kept ? state.recipe : choose(hand, up), stood = blowOf(hand, recipe), same = recipe === state.recipe, off = ahead - reach;
            state.stoodFor = [tx, ty, tz];
            if (same && window.along[0] <= off && off <= window.along[1] && window.across[0] <= aside && aside <= window.across[1]) {
              state.begun = Math.max(STAND, state.readyAt);
            } else {
              // Another blow, or out of its window: the body stands again, for the blow chosen and
              // the head as it stands over the feet now. Another blow's place is walked to, or set,
              // from the next step; the same blow's feet are set again.
              state.over = inFrame(view.head.x - feetX, view.head.z - feetZ);
              if (same) footing = at;
              state.phase = same ? "place" : "approach";
              state.blow = stood.kind;
              state.recipe = recipe;
              state.distance = standOff(stood, up, placing);
              state.still = 0;
              state.readyAt = null;
            }
          }
        }
      } else state.still += dt;
      // A recipe thrown follows its target across: the heading turned as its bearing has, while its hand attacks.
      if (state.begun !== null && state.blow === "recipe" && steering > 0 && action) {
        const origin = state.origin ??= [feetX, feetZ];
        const bearing = atan2(action.target[0] - origin[0], action.target[2] - origin[1]);
        state.bearing ??= bearing;
        state.steer = Math.max(-steering, Math.min(steering, wrap(bearing - state.bearing)));
      }
      const { pushes, steer } = state;
      pushes.length = 0;
      let posture = guard, goals = NO_HANDS;
      if (state.begun !== null) {
        const blow = blowOf(hand, state.recipe);
        let over: boolean;
        switch (blow.kind) {
          case "recipe": {
            const { strike } = blow.chosen, chamber = strike.chamber ?? { seconds: 0, pose: {} };
            const since = state.since = state.still - (state.begun + chamber.seconds);
            over = since >= Math.max(0, ...strike.pushes.map((p) => p.to));
            if (since < 0) { posture = { ...guard, ...chamber.pose }; state.phase = "chamber"; }
            else {
              state.phase = "swing";
              for (const p of strike.pushes) if (since >= p.from && since < p.to) pushes.push({ channel: p.channel, sense: p.sense, level: p.level ?? 1 });
            }
            break;
          }
          case "placed": {
            const since = state.since = state.still - state.begun;
            over = since >= placing.seconds;
            state.phase = "swing";
            if (!action) throw new Error("a placed blow is carried only while its hand attacks");
            if (!over) {
              // The target in the body frame as the body now stands: the path's end moves with it.
              intoFrameToRef(view.root, action.target, place);
              const goal: EffectorGoal = { places: [{ point: blow.aim, position: [place.x, place.y, place.z] }], seconds: placing.seconds, through: placing.through, follows: true };
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

/**
 * A recipe's admitted preparation and return are finite even when its feet cannot settle: `prepare`
 * s bounds placing and settling; a chamber, once begun, runs its recipe's own fixed time.
 */
const RECIPE_ACTION = Object.freeze({ prepare: 6, return: .4, returnLimit: 1.2, near: .05, slow: .6, hold: .05 });

/** Recipe settings and the shared aim rule supplied by an action's registration. */
interface RecipeActionSettings {
  readonly repertoire?: Repertoire;
  readonly placed?: Placed;
  readonly steer?: number;
  readonly guard?: Pose;
  readonly resolve?: (view: BodyView, target: TargetRef, action: string, effector: string) => Vec3 | null;
}

/** A named recipe executor separates elapsed motion from pure per-instance command generation. */
export function recipeExecutor(spec: BodySpec, actions: readonly string[], settings: RecipeActionSettings = {}): Executor {
  const repertoire = settings.repertoire ?? REPERTOIRE, placing = settings.placed ?? PLACED;
  const guard = settings.guard ?? guardPosture(spec), steering = settings.steer ?? STEER;
  const known = { left: blowsOf(spec, repertoire, "left"), right: blowsOf(spec, repertoire, "right") };
  const hands = { left: ["hand.left", "trunk", "legs"], right: ["hand.right", "trunk", "legs"] } as const;
  const resolve = settings.resolve ?? ((_view: BodyView, target: TargetRef) => target.kind === "point" ? target.at : null);
  const sideOf = (effector: string): Side => {
    if (effector === "hand.left") return "left";
    if (effector === "hand.right") return "right";
    throw new Error(`recipe executor has no effector ${effector}`);
  };
  const ownGuard = (hand: Side): Pose => Object.fromEntries(Object.entries(guard).filter(([name]) => !name.includes(`.${hand === "left" ? "right" : "left"} `)));
  const guarding = { left: ownGuard("left"), right: ownGuard("right") };
  const state = { width: null as number | null, live: null as null | {
    request: ActionRequest; hand: Side; phase: "prepare" | "commit" | "release";
    stage: "admitting" | "place" | "settle" | "chamber" | "swing" | "return";
    footing: Footing | null; placing: number; didPlace: boolean;
    time: number; elapsed: number; quiet: number; ready: number; withdrawn: boolean;
    origin: readonly [number, number] | null; bearing: number;
    ending: ActionEnding; recipe: number | null; target: Vec3; home: Vec3; previous: Vec3;
    facing: number; lower: number; steer: number;
  } };
  const local = new Vector3();
  const selected = (hand: Side, recipe: number | null) => recipe === null ? known[hand].placed : known[hand].recipes[recipe]!;
  const preparation = (view: BodyView, action: string, effector: string, target: TargetRef, heading: number) => {
    if (!actions.includes(action)) return { kind: "blocked", reason: "unknown action" } as const;
    if (effector !== "hand.left" && effector !== "hand.right") return { kind: "blocked", reason: "unsupported effector" } as const;
    if (view.down) return { kind: "blocked", reason: "body is down" } as const;
    if (state.live) return { kind: "waiting", reason: "recipe executor is returning or striking" } as const;
    const at = resolve(view, target, action, effector);
    if (!at) return { kind: "blocked", reason: "target has no aim" } as const;
    const hand = sideOf(effector), recipe = chooseIn(known[hand], at[1] - view.head.y), blow = selected(hand, recipe);
    if (blow.kind === "placed" && Math.abs(at[1] - view.head.y - blow.arm.shoulder[1]) > blow.arm.length * placing.stretch)
      return { kind: "blocked", reason: "target is outside the arm's height band" } as const;
    const reach = standOff(blow, at[1] - view.head.y, placing), window = windowOf(blow);
    const dx = view.head.x - view.stance.centre.x, dz = view.head.z - view.stance.centre.z;
    const ahead = dx * sin(heading) + dz * cos(heading), aside = dx * cos(heading) - dz * sin(heading);
    // Entry permits a modest facing error and approach speed; settling belongs to preparation.
    const entry = { at, along: [reach + ahead + window.along[0], reach + ahead + window.along[1]] as const,
      across: [aside + window.across[0], aside + window.across[1]] as const, facing: .4, speed: APPROACH.pace };
    if (!withinActionWindow(view, entry, heading)) return { kind: "position", window: entry } as const;
    return { kind: "ready" } as const;
  };
  const release = (ending: ActionEnding) => {
    const live = state.live!;
    live.phase = "release"; live.stage = "return"; live.footing = null; live.time = 0; live.ready = 0; live.ending = ending;
  };
  return {
    state,
    needs(_action, effector) { return hands[sideOf(effector)]; },
    readiness(view, action, effector, target, around) { return preparation(view, action, effector, target, around.heading); },
    resume() { state.live = null; },
    start(view, request, around) {
      if (state.live) throw new Error("recipe executor already owns an instance");
      const hand = sideOf(request.effector), target = resolve(view, request.target, request.action, request.effector);
      if (!target) throw new Error("recipe target has no aim");
      const p = view.effectors[request.effector]!.points[aimOf(spec, hand)]!;
      state.live = { request: { ...request }, hand, phase: "prepare", stage: "admitting", time: 0, elapsed: 0, quiet: 0, ready: 0,
        footing: null, placing: 0, didPlace: false, withdrawn: false, origin: null, bearing: 0, ending: { kind: "completed" }, recipe: chooseIn(known[hand], target[1] - view.head.y),
        target: [...target], home: [p.x, p.y, p.z], previous: [p.x, p.y, p.z],
        facing: atan2(target[0] - view.head.x, target[2] - view.head.z), lower: around.lower, steer: 0 };
    },
    update(view, continued, around, dt) {
      state.width ??= hypot(view.stance.soles.right.x - view.stance.soles.left.x, view.stance.soles.right.z - view.stance.soles.left.z);
      const live = state.live;
      if (!live) return [];
      const request = continued.find(one => one.id === live.request.id);
      if (!request) live.withdrawn = true;
      if (view.down) {
        state.live = null;
        return [{ id: live.request.id, ending: { kind: "interrupted", reason: "body is down" } }];
      }
      const source = request ?? live.request;
      const target = resolve(view, source.target, source.action, source.effector);
      if (live.phase === "prepare" && !target) release({ kind: "lost", reason: "target is no longer sensed" });
      else if (live.phase === "prepare" && live.withdrawn) release({ kind: "cancelled" });
      if (target && !live.withdrawn && live.phase !== "release") live.target = [...target];
      live.time += dt; live.elapsed += dt;
      let blow = selected(live.hand, live.recipe);
      const chamber = blow.kind === "recipe" ? blow.chosen.strike.chamber?.seconds ?? 0 : 0;
      const duration = blow.kind === "recipe" ? Math.max(0, ...blow.chosen.strike.pushes.map(push => push.to)) : placing.seconds;
      if (live.phase === "prepare") {
        if (live.stage !== "chamber" && live.elapsed >= RECIPE_ACTION.prepare) release({ kind: "stalled", reason: "preparation deadline" });
        else if (live.stage === "chamber") {
          if (live.time >= chamber) { live.phase = "commit"; live.stage = "swing"; live.time = 0; }
        } else if (live.stage === "place") {
          live.placing++;
          if (live.placing > 1 && around.placed && view.stance.phase === "stand") {
            live.stage = "settle"; live.footing = null; live.quiet = 0; live.didPlace = true;
          }
        } else {
          const window = windowOf(blow), middle = [(window.along[0] + window.along[1]) / 2, (window.across[0] + window.across[1]) / 2];
          const tx = live.target[0] - view.head.x, tz = live.target[2] - view.head.z;
          live.facing = atan2(tx, tz) - asin(Math.max(-1, Math.min(1, middle[1]! / (hypot(tx, tz) || 1))));
          const entering = live.stage === "admitting";
          if (view.stance.phase === "stand") live.stage = "settle";
          live.quiet = view.stance.phase === "stand" && hypot(view.stance.velocity.x, view.stance.velocity.z) <= RECIPE_ACTION.slow
            && (!around.support || around.support.ready || around.support.stage === "stand") ? live.quiet + dt : 0;
          if (view.stance.phase === "stand" && (entering || live.quiet >= STAND)) {
            const up = live.target[1] - view.head.y;
            const next = live.quiet < STAND || live.recipe !== null && holdsAt(known[live.hand].chosen[live.recipe]!, up) ? live.recipe : chooseIn(known[live.hand], up);
            const same = next === live.recipe;
            live.recipe = next; blow = selected(live.hand, next);
            const limits = windowOf(blow), reach = standOff(blow, up, placing), fx = sin(around.heading), fz = cos(around.heading);
            const ahead = tx * fx + tz * fz - reach, across = tx * fz - tz * fx;
            const fits = limits.along[0] <= ahead && ahead <= limits.along[1] && limits.across[0] <= across && across <= limits.across[1];
            if (same && fits && (blow.kind === "recipe" || live.didPlace)) {
              if (live.quiet >= STAND) {
                const p = view.effectors[live.request.effector]!.points[aimOf(spec, live.hand)]!;
                live.home = [p.x, p.y, p.z];
                live.origin = [(view.stance.soles.left.x + view.stance.soles.right.x) / 2, (view.stance.soles.left.z + view.stance.soles.right.z) / 2];
                live.bearing = atan2(live.target[0] - live.origin[0], live.target[2] - live.origin[1]);
                live.stage = chamber > 0 ? "chamber" : "swing"; live.phase = chamber > 0 ? "prepare" : "commit"; live.time = 0;
              }
            } else {
              // Place before waiting to settle; waiting at an invalid footing cannot prepare a blow.
              const soles = view.stance.soles, mx = (soles.left.x + soles.right.x) / 2, mz = (soles.left.z + soles.right.z) / 2;
              const width = state.width;
              const along = reach + (limits.along[0] + limits.along[1]) / 2 + (view.head.x - mx) * fx + (view.head.z - mz) * fz;
              const aside = (limits.across[0] + limits.across[1]) / 2 + (view.head.x - mx) * fz - (view.head.z - mz) * fx;
              const x = live.target[0] - along * fx - aside * fz, z = live.target[2] - along * fz + aside * fx;
              live.footing = { left: [x - width * fz / 2, z + width * fx / 2], right: [x + width * fz / 2, z - width * fx / 2] };
              live.stage = "place"; live.placing = 0; live.quiet = 0;
            }
          }
        }
      } else if (live.phase === "commit") {
        if (live.time >= duration) release({ kind: "completed" });
      } else {
        const p = view.effectors[live.request.effector]!.points[aimOf(spec, live.hand)]!;
        const near = hypot(p.x - live.home[0], p.y - live.home[1], p.z - live.home[2]) <= RECIPE_ACTION.near;
        const slow = hypot(p.x - live.previous[0], p.y - live.previous[1], p.z - live.previous[2]) <= RECIPE_ACTION.slow * dt;
        live.ready = near && slow ? live.ready + dt : 0;
        if (live.ready >= RECIPE_ACTION.hold || live.time >= RECIPE_ACTION.returnLimit) {
          state.live = null;
          return [{ id: live.request.id, ending: live.ready >= RECIPE_ACTION.hold ? live.ending
            : { kind: "stalled", reason: `return deadline${live.ending.reason ? ` after ${live.ending.reason}` : ""}` } }];
        }
      }
      if (live.origin && (live.stage === "chamber" || live.phase === "commit"))
        live.steer = Math.max(-steering, Math.min(steering, wrap(atan2(live.target[0] - live.origin[0], live.target[2] - live.origin[1]) - live.bearing)));
      const p = view.effectors[live.request.effector]!.points[aimOf(spec, live.hand)]!;
      live.previous = [p.x, p.y, p.z];
      const updates: LifecycleUpdate[] = [{ id: live.request.id, phase: live.phase, stage: live.stage, holds: hands[live.hand] }];
      return updates;
    },
    command(view, id, _around: ActionAround) {
      const live = state.live;
      if (!live || live.request.id !== id) throw new Error(`recipe executor has no instance ${id}`);
      const common = { posture: guarding[live.hand], legs: live.footing ? { kind: "place" as const, footing: live.footing } : { kind: "walk" as const, walk: null, face: live.facing },
        lower: live.lower, steer: live.steer, ...(closesToStrike(spec, live.hand) ? { handPoses: { [live.hand]: "fist" as const } } : {}) };
      if (live.phase === "release") return { ...common, effectors: { [live.request.effector]: {
        places: [{ point: aimOf(spec, live.hand), position: live.home }], seconds: RECIPE_ACTION.return,
      } } };
      const blow = selected(live.hand, live.recipe);
      if (live.phase === "prepare") return live.stage === "chamber" && blow.kind === "recipe"
        ? { ...common, posture: { ...common.posture, ...blow.chosen.strike.chamber?.pose } } : common;
      if (blow.kind === "recipe") return { ...common, pushes: blow.chosen.strike.pushes
        .filter(push => live.time >= push.from && live.time < push.to)
        .map(push => ({ channel: push.channel, sense: push.sense, level: push.level ?? 1 })) };
      intoFrameToRef(view.root, live.target, local);
      return { ...common, effectors: { [live.request.effector]: { places: [{ point: blow.aim, position: [local.x, local.y, local.z] as Vec3 }],
        seconds: placing.seconds, through: placing.through, follows: true } } };
    },
  };
}
