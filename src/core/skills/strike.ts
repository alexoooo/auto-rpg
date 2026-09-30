import type { BodyView } from "../body.ts";
import type { Hand, MusclePush, Pose } from "../control/motor.ts";
import type { HandAction } from "../mind/intent.ts";
import type { BodySpec } from "../spec/body.ts";
import { GUARD } from "./guard.ts";
import { PLACING, type Footing } from "./locomotion.ts";
import { recipeFor, type Chosen, type Repertoire } from "./strikes.ts";

/**
 * **Seconds stood still in the guard before a strike is thrown**: a recipe was searched from a body
 * that had stood that long where it was built. The body settles by then: the centre of mass's
 * speed, mm/s, by the seconds stood (Node core stand), converged with the rate:
 *
 *     seconds                0.5   1    1.5   2
 *     Warrior 120 Hz          62   19    5    1
 *             480 Hz          66   20    5    1
 *             1920 Hz         67   20    5    1
 *     Rogue   120 Hz          43   14    3    0
 *             480 Hz          52   15    3    1
 *             1920 Hz         52   15    3    0
 *
 * `STAND` is the first of the table's at which each human is at 5 mm/s or less. A step into a
 * stance first (the old Routine set its right foot 0.3 m across and 0.15 behind) does not converge
 * with the rate: at 1920 Hz the bearing foot slid 15 cm toward the swinging one in the swing's last
 * 60 ms and the body staggered at up to 1.4 m/s; 4 cm at 480 Hz; none at 120 Hz (the Warrior).
 */
export const STAND = 1.5;

/**
 * **How the body comes to a recipe's place**: its centre of mass walks toward the place at the
 * error over `seconds`, no faster than `pace` (m/s), until it is within `reach` (m); then the feet
 * are set there (`Locomotion.place`). A walk alone does not stand a body where it stops: a walk's
 * feet are the gait's 20 cm apart, and stopped, the stance steps one foot out to the 39 cm it was
 * built standing at, which moves the feet's middle, and the body settling over it, some 10 cm to
 * one side; a slow walk asked for a few centimetres leans the body without stepping, and the lean
 * comes back. So stopped by its head, the Warrior settled out of the recipe's window each time and
 * walked again, round and round the post (the Routine, Node stand, 120 Hz). With its feet set, each of
 * the 360 strikes each human threw in the Routine stood inside its window, at 120 and 480 Hz
 * (`research/core-routine-battery.mjs`). The pace is the Routine's for its turns, which each human
 * held.
 */
export const APPROACH = { pace: 0.3, seconds: 1, reach: 0.25 } as const;

/** Where a strike is: walking to its place, setting the feet there, standing still, holding its chamber, or pushing. */
export type StrikePhase = "approach" | "place" | "settle" | "chamber" | "swing";

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
  /** Seconds stood still, not walking and not striking. */
  readonly still: number;
  /**
   * How far ahead of the head each hand strikes, m: its recipe's distance, or null if it has none.
   * A mind closes to it; the skill brings the body the rest of the way (`Chosen.window`, `APPROACH`).
   */
  readonly reach: Readonly<Record<Hand, number | null>>;
}

/** What the strike skill asks of the body this step. */
export interface StrikeCommand {
  /** Walk (forward, right, m/s) toward the recipe's place, or stand; and face the target. */
  readonly walk: readonly [number, number] | null;
  readonly face: number;
  /** Where to set the feet (`Locomotion.place`), in place of a walk; null walks or stands. */
  readonly footing: Footing | null;
  readonly posture: Pose;
  readonly pushes: readonly MusclePush[];
}

/**
 * **The strike skill**: a hand's attack carried out with a recipe (`strikes.ts`, option A of the
 * plan). It chooses the recipe for what the hand holds; walks the body toward the place where its
 * feet stand square for the target to be at the middle of the recipe's window for the hand (`Chosen.window`)
 * about its distance straight ahead of the head, and sets its feet there (`APPROACH`); stands still
 * in the guard `STAND` seconds and asks the window of the head as it then stands, setting the feet
 * again if it is out; holds the chamber; and pushes. While it works it has the legs (a recipe is
 * thrown standing) and the trunk; the other hand guards. One strike at a time: the right hand's
 * first when both attack. An attack given up before its chamber is dropped; one chambered is thrown
 * to the end of its pushes.
 */
export interface StrikeSkill {
  /** This step's command for the hands' actions, or null when neither attacks and no strike is under way. */
  command(view: BodyView, hands: Readonly<Record<Hand, HandAction>>, heading: number, placed: boolean, dt: number): StrikeCommand | null;
  /** Count a step the body stood still (the skill not commanding): walking, it is reset. */
  idle(walking: boolean, dt: number): void;
  readonly report: StrikeReport;
}

export function strikeSkill(spec: BodySpec, repertoire: Repertoire): StrikeSkill {
  const chosen: Record<Hand, Chosen | null> = { left: recipeFor(repertoire, spec, "left"), right: recipeFor(repertoire, spec, "right") };
  const thrown = { left: 0, right: 0 };
  const pushes: MusclePush[] = [];
  let hand: Hand | null = null, phase: StrikePhase | null = null, still = 0, since = -Infinity;
  /** When the throw began, in `still`'s count. */
  let begun: number | null = null, readyAt: number | null = null;
  /** The feet's width apart as built, m, and the head over their middle as the body last stood: along the heading and across it. */
  let width: number | null = null, over: [number, number] | null = null;
  const report: StrikeReport = {
    get hand() { return hand; },
    get phase() { return phase; },
    get chosen() { return hand ? chosen[hand] : null; },
    get since() { return since; },
    thrown,
    get still() { return still; },
    reach: { left: chosen.left?.recipe.distance ?? null, right: chosen.right?.recipe.distance ?? null },
  };
  const end = (): void => { hand = null; phase = null; begun = null; readyAt = null; since = -Infinity; };
  return {
    report,
    idle(walking, dt) {
      if (hand) end();
      still = walking ? 0 : still + dt;
    },
    command(view, hands, heading, placed, dt) {
      const s = view.stance, fx = Math.sin(heading), fz = Math.cos(heading);
      // Across the ground, forward is (fx, fz) and the right (fz, -fx).
      const inFrame = (x: number, z: number): [number, number] => [x * fx + z * fz, x * fz - z * fx];
      const feetX = (s.soles.left.x + s.soles.right.x) / 2, feetZ = (s.soles.left.z + s.soles.right.z) / 2;
      // As built the feet stand square, as a recipe was thrown from: their width, and the head over
      // their middle, are the body's own until it has stood again.
      width ??= Math.abs(inFrame(s.soles.right.x - s.soles.left.x, s.soles.right.z - s.soles.left.z)[1]);
      over ??= inFrame(view.head.x - feetX, view.head.z - feetZ);
      // A strike under way is carried to its end; else the right hand's attack, then the left's.
      if (hand && begun === null && hands[hand].kind !== "attack") end();
      if (!hand) hand = hands.right.kind === "attack" && chosen.right ? "right" : hands.left.kind === "attack" && chosen.left ? "left" : null;
      if (!hand) return null;
      const { strike, recipe, window } = chosen[hand]!, action = hands[hand];
      const chamber = strike.chamber ?? { seconds: 0, pose: {} };
      let walk: readonly [number, number] | null = null, face = heading, footing: Footing | null = null;
      if (begun === null && action.kind === "attack") {
        const [tx, , tz] = action.target;
        const middle = [(window.along[0] + window.along[1]) / 2, (window.across[0] + window.across[1]) / 2] as const;
        const [ahead, aside] = inFrame(tx - view.head.x, tz - view.head.z);
        // Facing so that the target stands at the window's middle across: its bearing less the
        // angle that puts it there, for across = r sin(bearing - heading).
        face = Math.atan2(tx - view.head.x, tz - view.head.z) - Math.asin(Math.max(-1, Math.min(1, middle[1] / Math.hypot(ahead, aside))));
        // Where the feet stand, square and their width apart across the heading, for the head over
        // them to have the target at the window's middle.
        const along = recipe.distance + middle[0] + over[0], across = middle[1] + over[1], half = width / 2;
        const mx = tx - along * fx - across * fz, mz = tz - along * fz + across * fx;
        const at: Footing = { left: [mx - half * fz, mz + half * fx], right: [mx + half * fz, mz - half * fx] };
        if (phase !== "settle") {
          const square = s.phase === "stand"
            && Math.hypot(s.soles.left.x - at.left[0], s.soles.left.z - at.left[1]) <= PLACING.near
            && Math.hypot(s.soles.right.x - at.right[0], s.soles.right.z - at.right[1]) <= PLACING.near;
          const [toX, toZ] = inFrame(mx - s.centre.x, mz - s.centre.z);
          if (square || (phase === "place" && placed)) phase = "settle";
          else if (phase !== "place" && Math.hypot(toX, toZ) > APPROACH.reach) {
            // Walked toward the place, the centre of mass leading.
            const speed = Math.hypot(toX, toZ) / APPROACH.seconds, scale = speed > APPROACH.pace ? APPROACH.pace / speed : 1;
            walk = [toX / APPROACH.seconds * scale, toZ / APPROACH.seconds * scale];
            phase = "approach";
          } else {
            footing = at;
            phase = "place";
          }
          if (phase !== "settle") { still = 0; readyAt = null; }
        }
        if (phase === "settle") {
          // It stands out its time on both feet, then asks the window of the head as it stands.
          if (s.phase === "stand") still += dt;
          readyAt ??= still;
          if (still >= STAND) {
            const off = ahead - recipe.distance;
            if (window.along[0] <= off && off <= window.along[1] && window.across[0] <= aside && aside <= window.across[1]) {
              begun = Math.max(STAND, readyAt);
            } else {
              // Out of it: the feet are set again, for the head as it stands over them now.
              over = inFrame(view.head.x - feetX, view.head.z - feetZ);
              footing = at;
              phase = "place";
              still = 0;
              readyAt = null;
            }
          }
        }
      } else still += dt;
      pushes.length = 0;
      let posture = GUARD;
      if (begun !== null) {
        since = still - (begun + chamber.seconds);
        if (since < 0) { posture = { ...GUARD, ...chamber.pose }; phase = "chamber"; }
        else {
          phase = "swing";
          for (const p of strike.pushes) if (since >= p.from && since < p.to) pushes.push({ channel: p.channel, sense: p.sense, level: p.level ?? 1 });
          if (since >= Math.max(0, ...strike.pushes.map((p) => p.to))) {
            thrown[hand] += 1;
            end();
            still = 0;
          }
        }
      }
      return { walk, face, footing, posture, pushes };
    },
  };
}
