import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../body.ts";
import { rigidPoints } from "../build/rigid.ts";
import { intoFrameToRef } from "../control/kinematics.ts";
import type { Hand, HandGoal, MusclePush, Pose } from "../control/motor.ts";
import type { HandAction } from "../mind/intent.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { distance, sub } from "../spec/vec.ts";
import { deepFreeze } from "../state.ts";
import { GUARD } from "./guard.ts";
import { PLACING, type Footing } from "./locomotion.ts";
import type { Skill } from "./skill.ts";
import { aimOf, recipeFor, type Chosen, type Repertoire, type StrikeWindow } from "./strikes.ts";
import { sin, cos, asin, atan2, hypot } from "../math/real.ts";

/**
 * **Seconds stood still in the guard before a strike is thrown**: the start every recipe was
 * searched from, the body standing where it was built. By then each human's centre of mass has
 * settled to 6 mm/s or less. Set, with the table it settles by:
 * `docs/reference/human-and-strikes.md#stand-time`.
 */
export const STAND = 1.5;

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
function placedDistance({ length, shoulder, toes }: Arm, stretch: number, up: number): number {
  const reach = stretch * length, rise = up - shoulder[1];
  const flat = reach * reach - shoulder[0] * shoulder[0] - rise * rise;
  return Math.max(toes, shoulder[2] + (flat > 0 ? Math.sqrt(flat) : 0));
}

/** How a hand's attack is carried out: thrown with a recipe, or placed with the point it strikes with. */
type Blow =
  | { readonly kind: "recipe"; readonly chosen: Chosen }
  | { readonly kind: "placed"; readonly aim: string; readonly arm: Arm };

/** Where a placed blow is thrown from about its place: wherever the approach leaves the body (`APPROACH.reach`), each way. */
type Standing = Pick<StrikeWindow, "along" | "across">;

/** No hand given a goal. */
const NO_HANDS: Readonly<Record<Hand, HandGoal | null>> = Object.freeze({ left: null, right: null });

/** Where a strike is: walking to its place, setting the feet there, standing still, holding its chamber, or pushing or carrying its point. */
type StrikePhase = "approach" | "place" | "settle" | "chamber" | "swing";

/** How the strike skill is going, as the last command left it. */
export interface StrikeReport {
  /** The hand whose attack the skill is carrying out, or null. */
  readonly hand: Hand | null;
  readonly phase: StrikePhase | null;
  /** How the attack in hand is carried out, as last chosen: with a recipe, or placed. */
  readonly blow: Blow["kind"] | null;
  /** The recipe being thrown, and whether it was searched on another body; null with none, or with a placed blow. */
  readonly chosen: Chosen | null;
  /** How far ahead of the head the blow in hand has its target as it is thrown, m: what the body stands for. */
  readonly distance: number | null;
  /** Seconds since the pushes, or a placed blow's path, began (negative before). */
  readonly since: number;
  /** Strikes thrown to the end of their pushes, each hand. */
  readonly thrown: Readonly<Record<Hand, number>>;
  /**
   * Seconds since the body last walked, set its feet or finished a strike: the stand before a
   * strike, and, counting on through the chamber and the pushes, the strike's clock.
   */
  readonly still: number;
  /**
   * How far ahead of the head each hand strikes at a target as high as the head, m: its recipe's
   * distance, or a placed blow's with no recipe. The tactics close to it; the skill brings the
   * body the rest of the way (`Chosen.window`, `APPROACH`).
   */
  readonly reach: Readonly<Record<Hand, number>>;
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
}

/**
 * **The strike skill**: a hand's attack carried out, with a recipe (`strikes.ts`) or placed
 * (`PLACED`). It chooses the blow as it takes the attack up: the recipe for what the hand holds,
 * where the hand has one and the target's height over the head lies in its window (`StrikeWindow.up`);
 * else a placed blow. It walks the body toward the place where its feet stand square for the
 * target to be at the middle of the blow's window (`Chosen.window`, or about a placed blow's
 * distance) straight ahead of the head, and sets its feet there (`APPROACH`); stands still in the
 * guard `STAND` seconds; then chooses the blow again by the head as it stands, and asks the
 * window of it, standing again for another blow or setting the feet again if it is out. A recipe
 * holds its chamber and pushes. A placed blow has no chamber: it carries its point through the
 * target by a hand goal that follows the target in the body frame (`BodyView.root`), each step.
 * While it works the skill has the legs (a blow is thrown standing) and the trunk; the other hand
 * guards. One strike at a time: the right hand's first when both attack. An attack given up
 * before its blow begins is dropped. A recipe begun is thrown to the end of its pushes, whatever
 * its hand is then asked; a placed blow is carried only at what its hand attacks, and given up it
 * is over, unthrown. Resumed (`Skill.resume`), the strike in hand is over, unthrown, and the
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
  /** How that attack is carried out, and how far ahead of the head its target is stood for, m, as last chosen. */
  blow: Blow["kind"] | null;
  distance: number | null;
  /** Seconds since the body last walked, set its feet or finished a strike (`StrikeReport.still`). */
  still: number;
  /** Seconds since the pushes, or a placed blow's path, began; minus infinity with no strike thrown. */
  since: number;
  /** When the throw began, and when the body first stood for it, in `still`'s count. */
  begun: number | null;
  readyAt: number | null;
  /** The feet's width apart as built, m, and the head over their middle as the body last stood: along the heading and across it. */
  width: number | null;
  over: [number, number] | null;
  /** Strikes thrown to the end of their pushes, each hand. */
  readonly thrown: Record<Hand, number>;
  /** The pushes of the command last made: the one list, written again by each. */
  readonly pushes: MusclePush[];
}

export function strikeSkill(spec: BodySpec, repertoire: Repertoire, placing: Placed = PLACED): StrikeSkill {
  const blows = (hand: Hand) => {
    const chosen = recipeFor(repertoire, spec, hand), aim = aimOf(spec, hand);
    return deepFreeze({
      recipe: chosen && { kind: "recipe", chosen } as const,
      placed: { kind: "placed", aim, arm: armOf(spec, hand, aim) } as const,
    });
  };
  const known = { left: blows("left"), right: blows("right") };
  /** The blow `hand` throws at a target `up` m over the head: its recipe where that height is in its window, else placed. */
  const choose = (hand: Hand, up: number): Blow => {
    const { recipe, placed } = known[hand];
    return recipe && recipe.chosen.window.up[0] <= up && up <= recipe.chosen.window.up[1] ? recipe : placed;
  };
  /** How far ahead of the head `blow`'s target stands as it is thrown, m, the target `up` m over the head. */
  const standOff = (blow: Blow, up: number): number => {
    switch (blow.kind) {
      case "recipe": return blow.chosen.recipe.distance;
      case "placed": return placedDistance(blow.arm, placing.stretch, up);
      default: {
        const never: never = blow;
        throw new Error(`unknown blow ${JSON.stringify(never)}`);
      }
    }
  };
  const within: Standing = { along: [-APPROACH.reach, APPROACH.reach], across: [-APPROACH.reach, APPROACH.reach] };
  /** Where about its place `blow` is thrown from. */
  const windowOf = (blow: Blow): Standing => {
    switch (blow.kind) {
      case "recipe": return blow.chosen.window;
      case "placed": return within;
      default: {
        const never: never = blow;
        throw new Error(`unknown blow ${JSON.stringify(never)}`);
      }
    }
  };
  /** The blow of `kind` that `hand` knows: a recipe was chosen only for a hand that has one. */
  const blowOf = (hand: Hand, kind: Blow["kind"]): Blow => {
    switch (kind) {
      case "recipe": return known[hand].recipe!;
      case "placed": return known[hand].placed;
      default: {
        const never: never = kind;
        throw new Error(`unknown blow ${String(never)}`);
      }
    }
  };
  const state: StrikeState = {
    hand: null, phase: null, blow: null, distance: null,
    still: 0, since: -Infinity, begun: null, readyAt: null, width: null, over: null,
    thrown: { left: 0, right: 0 }, pushes: [],
  };
  const report: StrikeReport = {
    get hand() { return state.hand; },
    get phase() { return state.phase; },
    get blow() { return state.blow; },
    get chosen() { return state.hand && state.blow === "recipe" ? known[state.hand].recipe!.chosen : null; },
    get distance() { return state.distance; },
    get since() { return state.since; },
    get thrown() { return state.thrown; },
    get still() { return state.still; },
    reach: { left: standOff(choose("left", 0), 0), right: standOff(choose("right", 0), 0) },
  };
  const end = (): void => {
    state.hand = null; state.phase = null; state.blow = null; state.distance = null;
    state.begun = null; state.readyAt = null; state.since = -Infinity;
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
    command(view, hands, heading, placed, dt) {
      const s = view.stance, fx = sin(heading), fz = cos(heading);
      // Across the ground, forward is (fx, fz) and the right (fz, -fx).
      const inFrame = (x: number, z: number): [number, number] => [x * fx + z * fz, x * fz - z * fx];
      const feetX = (s.soles.left.x + s.soles.right.x) / 2, feetZ = (s.soles.left.z + s.soles.right.z) / 2;
      // As built the feet stand square, as a recipe was thrown from: their width, and the head over
      // their middle, are the body's own until it has stood again.
      const width = state.width ??= Math.abs(inFrame(s.soles.right.x - s.soles.left.x, s.soles.right.z - s.soles.left.z)[1]);
      const over = state.over ??= inFrame(view.head.x - feetX, view.head.z - feetZ);
      // An attack given up: dropped before its blow begins; a placed blow under way is over, and the
      // body stands anew for whatever comes next; a recipe under way is thrown to its end.
      if (state.hand && hands[state.hand].kind !== "attack") {
        if (state.begun === null) end();
        else if (state.blow === "placed") { end(); state.still = 0; }
      }
      // Else the right hand's attack, then the left's.
      const hand = state.hand ??= hands.right.kind === "attack" ? "right" : hands.left.kind === "attack" ? "left" : null;
      if (!hand) return null;
      const action = hands[hand];
      let walk: readonly [number, number] | null = null, face = heading, footing: Footing | null = null;
      if (state.begun === null && action.kind === "attack") {
        const [tx, ty, tz] = action.target, up = ty - view.head.y;
        if (state.blow === null) {
          const taken = choose(hand, up);
          state.blow = taken.kind;
          state.distance = standOff(taken, up);
        }
        const window = windowOf(blowOf(hand, state.blow)), reach = state.distance!;
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
          if (square || (state.phase === "place" && placed)) state.phase = "settle";
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
          // It stands out its time on both feet, then chooses the blow by the head as it stands,
          // and asks its window.
          if (s.phase === "stand") state.still += dt;
          state.readyAt ??= state.still;
          if (state.still >= STAND) {
            const stood = choose(hand, up), off = ahead - reach;
            if (stood.kind === state.blow
              && window.along[0] <= off && off <= window.along[1] && window.across[0] <= aside && aside <= window.across[1]) {
              state.begun = Math.max(STAND, state.readyAt);
            } else {
              // Another blow, or out of its window: the body stands again, for the blow chosen and
              // the head as it stands over the feet now. Another blow's place is walked to, or set,
              // from the next step; the same blow's feet are set again.
              state.over = inFrame(view.head.x - feetX, view.head.z - feetZ);
              if (stood.kind === state.blow) footing = at;
              state.phase = stood.kind === state.blow ? "place" : "approach";
              state.blow = stood.kind;
              state.distance = standOff(stood, up);
              state.still = 0;
              state.readyAt = null;
            }
          }
        }
      } else state.still += dt;
      const { pushes } = state;
      pushes.length = 0;
      let posture = GUARD, goals = NO_HANDS;
      if (state.begun !== null) {
        const blow = blowOf(hand, state.blow!);
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
            const since = state.since = state.still - state.begun;
            over = since >= placing.seconds;
            state.phase = "swing";
            if (action.kind !== "attack") throw new Error("a placed blow is carried only while its hand attacks");
            if (!over) {
              // The target in the body frame as the body now stands: the path's end moves with it.
              intoFrameToRef(view.root, action.target, place);
              const goal: HandGoal = { places: [{ point: blow.aim, position: [place.x, place.y, place.z] }], seconds: placing.seconds, through: placing.through, follows: true };
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
      return { walk, face, footing, posture, pushes, hands: goals };
    },
  };
}
