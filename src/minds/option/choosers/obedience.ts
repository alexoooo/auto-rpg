import { deepFreeze } from "../../../core/state.ts";
import type { Obedience, ObedienceLevel } from "../contract/objective.ts";

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
