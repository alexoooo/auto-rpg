import type { BodyView } from "../body.ts";
import type { Hand, MusclePush, Pose } from "../control/motor.ts";
import type { HandAction } from "../mind/intent.ts";
import type { BodySpec } from "../spec/body.ts";
import { GUARD } from "./guard.ts";
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
 * **How far from a recipe's place a target may be and still be struck there**, m: along the
 * heading from the recipe's distance, and across it. Provisional, until the plan's step 3
 * measures how a recipe's reading falls off with them; inside it, the head's drift while the body
 * settles (a few millimetres) does not send it walking.
 */
export const RANGE = { along: 0.02, across: 0.02 } as const;

/**
 * **How the body walks into a recipe's range**: toward the place at the error over `seconds`, no
 * faster than `pace` (m/s). Provisional, as `RANGE`. The pace is the Routine's for its turns, which
 * each human held.
 */
export const APPROACH = { pace: 0.3, seconds: 1 } as const;

/** Where a strike is: walking to its range, standing still before it, holding its chamber, or pushing. */
export type StrikePhase = "approach" | "settle" | "chamber" | "swing";

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
}

/** What the strike skill asks of the body this step. */
export interface StrikeCommand {
  /** Walk (forward, right, m/s) toward the recipe's range, or stand; and face the target. */
  readonly walk: readonly [number, number] | null;
  readonly face: number;
  readonly posture: Pose;
  readonly pushes: readonly MusclePush[];
}

/**
 * **The strike skill**: a hand's attack carried out with a recipe (`strikes.ts`, option A of the
 * plan). It chooses the recipe for what the hand holds; walks the body until the target is at the
 * recipe's distance straight ahead of its head (`RANGE`, `APPROACH`); stands still in the guard
 * `STAND` seconds; holds the chamber; and pushes. While it works it has the legs (a recipe is
 * thrown standing) and the trunk; the other hand guards. One strike at a time: the right hand's
 * first when both attack. An attack given up before its chamber is dropped; one chambered is thrown
 * to the end of its pushes.
 */
export interface StrikeSkill {
  /** This step's command for the hands' actions, or null when neither attacks and no strike is under way. */
  command(view: BodyView, hands: Readonly<Record<Hand, HandAction>>, heading: number, dt: number): StrikeCommand | null;
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
  const report: StrikeReport = {
    get hand() { return hand; },
    get phase() { return phase; },
    get chosen() { return hand ? chosen[hand] : null; },
    get since() { return since; },
    thrown,
    get still() { return still; },
  };
  const end = (): void => { hand = null; phase = null; begun = null; readyAt = null; since = -Infinity; };
  return {
    report,
    idle(walking, dt) {
      if (hand) end();
      still = walking ? 0 : still + dt;
    },
    command(view, hands, heading, dt) {
      // A strike under way is carried to its end; else the right hand's attack, then the left's.
      if (hand && begun === null && hands[hand].kind !== "attack") end();
      if (!hand) hand = hands.right.kind === "attack" && chosen.right ? "right" : hands.left.kind === "attack" && chosen.left ? "left" : null;
      if (!hand) return null;
      const { strike, recipe } = chosen[hand]!, action = hands[hand];
      const chamber = strike.chamber ?? { seconds: 0, pose: {} };
      let walk: readonly [number, number] | null = null, face = heading;
      if (begun === null && action.kind === "attack") {
        // The target from the head, across the ground: along the heading and to its right.
        const dx = action.target[0] - view.head.x, dz = action.target[2] - view.head.z;
        const fx = Math.sin(heading), fz = Math.cos(heading);
        const along = dx * fx + dz * fz - recipe.distance, across = dx * fz - dz * fx;
        face = Math.atan2(dx, dz);
        if (Math.abs(along) > RANGE.along || Math.abs(across) > RANGE.across) {
          const speed = Math.hypot(along, across) / APPROACH.seconds, scale = speed > APPROACH.pace ? APPROACH.pace / speed : 1;
          walk = [along / APPROACH.seconds * scale, across / APPROACH.seconds * scale];
          phase = "approach";
          readyAt = null;
          still = 0;
        } else {
          still += dt;
          readyAt ??= still;
          phase = "settle";
          if (still >= STAND) begun = Math.max(STAND, readyAt);
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
      return { walk, face, posture, pushes };
    },
  };
}
