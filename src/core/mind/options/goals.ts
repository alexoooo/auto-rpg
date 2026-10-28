import type { Situation } from "./option.ts";
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
 * **The walk to a goal** (`Goal`), facing the focus: in from beyond its band, toward its near end
 * (head to head made centre to centre), back from nearer than its near end, and standing within.
 */
export function toGoal(now: Situation, goal: Goal, walk: Walker): ReturnType<Walker["toward"]> {
  const face = walk.facing(now), apart = now.reach.apart, outside = limitOf(now, goal.near), band = limitOf(now, goal.width);
  const focus = now.focus!, centre = now.sight.view.stance.centre;
  if (apart > outside + band) {
    const near = Math.max(0, outside + now.apart - apart);
    return walk.range(now, near, near + band, face);
  }
  if (apart < outside) return walk.toward(now, -(focus.centre.x - centre.x), -(focus.centre.z - centre.z), face);
  return { move: null, face };
}
