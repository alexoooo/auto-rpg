import { deepFreeze } from "../../core/state.ts";
import type { Obedience, ObedienceLevel } from "./contract/objective.ts";
import type { Ground, Leaves, Outcome } from "./contract/terms.ts";
import type { Position } from "../../control/ground-reading.ts";
import { FALLEN } from "./by-hand.ts";

/** How often an Option Mind's chooser rethinks (`Deciding.rethink`), s. A foe's mind is taken for one like it (`Pressure.latency`). */
export const RETHINK = .2;

/** Leaving the body as it is: nothing changed. */
export const AS_IS: Leaves = Object.freeze({});

/** **Ending one way**: leaving the body as it is (`AS_IS`), for certain. */
export const UNMOVED: readonly Outcome[] = Object.freeze([Object.freeze({ leaves: AS_IS, chance: 1 })]);

/** No motion over the ground. */
export const STILL: Ground = Object.freeze({ x: 0, z: 0 });

/**
 * **Up, or fallen**: leaving the body as `up` says in the share it stays up, lying in `posture`
 * (`FALLEN` unless given) in the share `down`; one outcome where either share is none.
 */
export function upOrDown(up: Leaves, down: number, posture: Position = FALLEN): readonly Outcome[] {
  if (!(down > 0)) return up === AS_IS ? UNMOVED : [{ leaves: up, chance: 1 }];
  const fallen: Outcome = { leaves: { posture, velocity: STILL }, chance: Math.min(1, down) };
  return down >= 1 ? [fallen] : [{ leaves: up, chance: 1 - down }, fallen];
}

/**
 * **How far a person's orders are carried out through blows coming**, a player's choice and the
 * one weight of an option's worth, by its value and name, each set for the play it gives: its own
 * judgement (a metre 1/60 of a life, a named foe's life a third more), steady (orders obeyed past
 * a one-two at hand and a weak blow coming, not into a heavy one: a metre 0.075 of a life, a named
 * foe's life one and a half times more) and orders first (a metre a third of a life, a named foe's
 * life twenty thirds more). Without orders it changes nothing.
 */
export const OBEDIENCE: readonly (readonly [value: ObedienceLevel, name: string, worth: Obedience])[] = deepFreeze([
  ["own", "Own judgement", { metre: 1 / 60, foe: 1 / 3 }], ["steady", "Steady", { metre: .075, foe: 1.5 }], ["orders", "Orders first", { metre: 1 / 3, foe: 20 / 3 }]]);

/** The steady level: the valued chooser's own. */
export const STEADY: Obedience = OBEDIENCE[1]![2];

/** Orders first: the level firm orders are carried out at (`Orders.firm`), whatever the chooser's own. */
export const FIRST: Obedience = OBEDIENCE[2]![2];
