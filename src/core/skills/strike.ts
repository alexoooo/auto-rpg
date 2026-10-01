import type { BodyView } from "../body.ts";
import type { Hand, MusclePush, Pose } from "../control/motor.ts";
import type { HandAction } from "../mind/intent.ts";
import type { BodySpec } from "../spec/body.ts";
import { GUARD } from "./guard.ts";
import { PLACING, type Footing } from "./locomotion.ts";
import { recipeFor, type Chosen, type Repertoire } from "./strikes.ts";
import { sin, cos, asin, atan2, hypot } from "../math/real.ts";

/**
 * **Seconds stood still in the guard before a strike is thrown**: the start every recipe was
 * searched from, the body standing where it was built. By then each human's centre of mass has
 * settled to 5 mm/s or less. A step into a stance before the strike is not used: its landing does
 * not converge with the physics rate. Table: `docs/reference/human-and-strikes.md#stand-time`.
 */
export const STAND = 1.5;

/**
 * **How the body comes to a recipe's place**: its centre of mass walks toward the place at the
 * error over `seconds`, no faster than `pace` (m/s), until it is within `reach` (m); then the feet
 * are set there (`Locomotion.place`). A walk alone does not stand a body where it stops: stopped,
 * the stance steps a foot out from the gait's width to the width it was built at, which moves the
 * body some 10 cm to one side, out of the recipe's window; and a slow walk asked for a few
 * centimetres leans the body without stepping. The pace is one each human holds while turning.
 * Evidence: `docs/reference/human-and-strikes.md#approach`.
 */
export const APPROACH = { pace: 0.3, seconds: 1, reach: 0.25 } as const;

/** Where a strike is: walking to its place, setting the feet there, standing still, holding its chamber, or pushing. */
type StrikePhase = "approach" | "place" | "settle" | "chamber" | "swing";

/** How the strike skill is going, as the last command left it. */
export interface StrikeReport {
  /** The hand whose attack the skill is carrying out, or null. */
  readonly hand: Hand | null;
  readonly phase: StrikePhase | null;
  /** The strike being thrown, and whether its recipe was searched on another body. */
  readonly chosen: Chosen | null;
  /** Seconds since the pushes began (negative before). */
  readonly since: number;
  /** Strikes thrown to the end of their pushes, each hand. */
  readonly thrown: Readonly<Record<Hand, number>>;
  /**
   * Seconds since the body last walked, set its feet or finished a strike: the stand before a
   * strike, and, counting on through the chamber and the pushes, the strike's clock.
   */
  readonly still: number;
  /**
   * How far ahead of the head each hand strikes, m: its recipe's distance, or null if it has none.
   * The tactics close to it; the skill brings the body the rest of the way (`Chosen.window`, `APPROACH`).
   */
  readonly reach: Readonly<Record<Hand, number | null>>;
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
}

/**
 * **The strike skill**: a hand's attack carried out with a recipe (`strikes.ts`). It chooses the
 * recipe for what the hand holds; walks the body toward the place where its feet stand square for
 * the target to be at the middle of the recipe's window for the hand (`Chosen.window`) about its
 * distance straight ahead of the head, and sets its feet there (`APPROACH`); stands still in the
 * guard `STAND` seconds and asks the window of the head as it then stands, setting the feet again
 * if it is out; holds the chamber; and pushes. While it works it has the legs (a recipe is
 * thrown standing) and the trunk; the other hand guards. One strike at a time: the right hand's
 * first when both attack. An attack given up before its chamber is dropped; one chambered is thrown
 * to the end of its pushes.
 */
interface StrikeSkill {
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
  /** Seconds since the body last walked, set its feet or finished a strike (`StrikeReport.still`). */
  still: number;
  /** Seconds since the pushes began; minus infinity with no strike thrown. */
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

export function strikeSkill(spec: BodySpec, repertoire: Repertoire): StrikeSkill {
  const chosen: Record<Hand, Chosen | null> = { left: recipeFor(repertoire, spec, "left"), right: recipeFor(repertoire, spec, "right") };
  const state: StrikeState = {
    hand: null, phase: null, still: 0, since: -Infinity, begun: null, readyAt: null, width: null, over: null,
    thrown: { left: 0, right: 0 }, pushes: [],
  };
  const report: StrikeReport = {
    get hand() { return state.hand; },
    get phase() { return state.phase; },
    get chosen() { return state.hand ? chosen[state.hand] : null; },
    get since() { return state.since; },
    get thrown() { return state.thrown; },
    get still() { return state.still; },
    reach: { left: chosen.left?.recipe.distance ?? null, right: chosen.right?.recipe.distance ?? null },
  };
  const end = (): void => { state.hand = null; state.phase = null; state.begun = null; state.readyAt = null; state.since = -Infinity; };
  return {
    report, state,
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
      // A strike under way is carried to its end; else the right hand's attack, then the left's.
      if (state.hand && state.begun === null && hands[state.hand].kind !== "attack") end();
      const hand = state.hand ??= hands.right.kind === "attack" && chosen.right ? "right" : hands.left.kind === "attack" && chosen.left ? "left" : null;
      if (!hand) return null;
      const { strike, recipe, window } = chosen[hand]!, action = hands[hand];
      const chamber = strike.chamber ?? { seconds: 0, pose: {} };
      let walk: readonly [number, number] | null = null, face = heading, footing: Footing | null = null;
      if (state.begun === null && action.kind === "attack") {
        const [tx, , tz] = action.target;
        const middle = [(window.along[0] + window.along[1]) / 2, (window.across[0] + window.across[1]) / 2] as const;
        const [ahead, aside] = inFrame(tx - view.head.x, tz - view.head.z);
        // Facing so that the target stands at the window's middle across: its bearing less the
        // angle that puts it there, for across = r sin(bearing - heading).
        face = atan2(tx - view.head.x, tz - view.head.z) - asin(Math.max(-1, Math.min(1, middle[1] / hypot(ahead, aside))));
        // Where the feet stand, square and their width apart across the heading, for the head over
        // them to have the target at the window's middle.
        const along = recipe.distance + middle[0] + over[0], across = middle[1] + over[1], half = width / 2;
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
          // It stands out its time on both feet, then asks the window of the head as it stands.
          if (s.phase === "stand") state.still += dt;
          state.readyAt ??= state.still;
          if (state.still >= STAND) {
            const off = ahead - recipe.distance;
            if (window.along[0] <= off && off <= window.along[1] && window.across[0] <= aside && aside <= window.across[1]) {
              state.begun = Math.max(STAND, state.readyAt);
            } else {
              // Out of it: the feet are set again, for the head as it stands over them now.
              state.over = inFrame(view.head.x - feetX, view.head.z - feetZ);
              footing = at;
              state.phase = "place";
              state.still = 0;
              state.readyAt = null;
            }
          }
        }
      } else state.still += dt;
      const { pushes } = state;
      pushes.length = 0;
      let posture = GUARD;
      if (state.begun !== null) {
        const since = state.since = state.still - (state.begun + chamber.seconds);
        if (since < 0) { posture = { ...GUARD, ...chamber.pose }; state.phase = "chamber"; }
        else {
          state.phase = "swing";
          for (const p of strike.pushes) if (since >= p.from && since < p.to) pushes.push({ channel: p.channel, sense: p.sense, level: p.level ?? 1 });
          if (since >= Math.max(0, ...strike.pushes.map((p) => p.to))) {
            state.thrown[hand] += 1;
            end();
            state.still = 0;
          }
        }
      }
      return { walk, face, footing, posture, pushes };
    },
  };
}
