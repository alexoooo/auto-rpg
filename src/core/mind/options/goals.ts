import type { Readiness } from "../../skills/action.ts";
import { blocked, LEGS, READY, type Situation, type StandingOption } from "./option.ts";
import { threatened } from "./percepts.ts";
import { CLINCH, clinched, type Terms } from "./value.ts";
import type { Walker } from "./walk.ts";

/** How the edge is held: how far past the foe's reach it stands, m, and how long it waits there for the foe to come in, s. */
export interface Edge {
  readonly band: number;
  readonly patience: number;
}

/** How the options fighter holds the edge: a quarter metre past the foe's reach, waiting there up to two minutes. */
export const EDGE: Edge = Object.freeze({ band: .25, patience: 120 });

/**
 * **A limit read each step**: a number, m, or one of the reach readings (`Reach`: the focus's
 * reach, this body's, or the range two guards meet at), `plus` m past it.
 */
export type Limit = number | { readonly reach: "theirs" | "mine" | "guards"; readonly plus?: number };

/**
 * **A named goal**: a band of the range head to head to the focus (`Reach.apart`), from `near` and
 * `width` m past it, each read each step from the bodies, so a resized body, a longer weapon or
 * another foe moves it and no number is retuned.
 */
export interface Goal {
  readonly near: Limit;
  readonly width: Limit;
}

/**
 * **The named goals**: `close`, inside this body's reach; `at the edge`, just outside the focus's
 * (`EDGE`'s band); `out of reach`, past that band; `guard to guard`, where two guards meet, to the
 * band past it.
 */
export const GOALS = Object.freeze({
  "close": Object.freeze({ near: 0, width: Object.freeze({ reach: "mine" }) }),
  "at the edge": Object.freeze({ near: Object.freeze({ reach: "theirs" }), width: EDGE.band }),
  "out of reach": Object.freeze({ near: Object.freeze({ reach: "theirs", plus: EDGE.band }), width: Infinity }),
  "guard to guard": Object.freeze({ near: Object.freeze({ reach: "guards" }), width: EDGE.band }),
} satisfies Readonly<Record<string, Goal>>);

/** A named goal's name (`GOALS`). */
export type GoalName = keyof typeof GOALS;

/** `limit` as `now` reads it, m. */
export const limitOf = (now: Situation, limit: Limit): number =>
  typeof limit === "number" ? limit : limit.plus === undefined ? now.reach[limit.reach] : now.reach[limit.reach] + limit.plus;

/** Whether the range head to head to the focus is within `goal`'s band. */
export function within(now: Situation, goal: Goal): boolean {
  const near = limitOf(now, goal.near), apart = now.reach.apart;
  return apart >= near && apart <= near + limitOf(now, goal.width);
}

/**
 * **Move to a named goal** (`GOALS`), facing a standing focus (`toGoal`): footwork, on offer
 * standing at a standing focus out of the goal's band and with the reaches it reads, run its course
 * once in the band; it always yields and asks for no blow. Its model: the walk to the band's
 * nearer end at its pace, through the blow coming and the focus's pressure while it walks within
 * the focus's reach (`threatened`), leaving the body there; a walk that ends out of a clinch
 * (`CLINCH`) leaves its chance of going down behind.
 */
export function moveTo(name: GoalName, walk: Walker): StandingOption {
  const goal: Goal = GOALS[name];
  const reads = (limit: Limit, reach: "theirs" | "mine" | "guards"): boolean => typeof limit !== "number" && limit.reach === reach;
  const UNFIT = blocked("no standing focus with the reach it reads"), THERE = blocked("within its band");
  const AWAY: Readiness = Object.freeze({ kind: "waiting", reason: "not in its band" });
  const fits = (now: Situation): boolean => !now.down && !!now.focus && !now.focus.down
    && (!(reads(goal.near, "theirs") || reads(goal.width, "theirs")) || now.reach.theirs > 0) && (!(reads(goal.near, "mine") || reads(goal.width, "mine")) || now.reach.mine > 0);
  return {
    name, posture: "standing", layer: "footwork", state: {},
    entry: (now) => !fits(now) ? UNFIT : within(now, goal) ? THERE : READY,
    exit: (now) => within(now, goal) ? READY : AWAY,
    holds: () => LEGS,
    yields: () => true,
    ended: (now) => within(now, goal),
    begin() {},
    end() {},
    model: (now): Terms => {
      const apart = now.reach.apart, near = limitOf(now, goal.near), far = near + limitOf(now, goal.width), pace = walk.pace(now);
      const to = apart < near ? near : apart > far ? far : apart, duration = Math.abs(to - apart) / pace;
      const nearer = Math.min(apart, to), inReach = Math.max(0, Math.min(Math.max(apart, to), now.reach.theirs) - nearer) / pace;
      const leaves = now.apart + to - apart >= CLINCH.within;
      return { duration, dealt: 0, taken: now.danger + threatened(now, inReach, nearer), orders: 0, exit: { apart: to, down: leaves ? 0 : clinched(now, duration) } };
    },
    step: (now) => ({ ...toGoal(now, goal, walk), actions: [] }),
  };
}

/**
 * **The walk to a goal** (`Goal`), facing the focus: in from beyond its band, into the band made
 * centre to centre (head to head less centre to centre taken off each end), or straight at the
 * focus where the heads stand farther apart than the band reaches even with the centres together;
 * back from nearer than its near end; and standing within.
 */
export function toGoal(now: Situation, goal: Goal, walk: Walker): ReturnType<Walker["toward"]> {
  const face = walk.facing(now), apart = now.reach.apart, outside = limitOf(now, goal.near), band = limitOf(now, goal.width);
  const focus = now.focus!, centre = now.sight.view.stance.centre;
  if (apart > outside + band) {
    const near = outside + now.apart - apart, far = near + band;
    if (far <= 0) return walk.toward(now, focus.centre.x - centre.x, focus.centre.z - centre.z, face);
    return walk.range(now, Math.max(0, near), far, face);
  }
  if (apart < outside) return walk.toward(now, -(focus.centre.x - centre.x), -(focus.centre.z - centre.z), face);
  return { move: null, face };
}
