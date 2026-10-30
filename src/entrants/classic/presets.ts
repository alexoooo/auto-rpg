import { BLADE_FIGHTER, FIGHTING, MOVE, STAND_UP, type FighterConfig } from "../../core/mind/config.ts";
import { deepFreeze } from "../../core/state.ts";

/** The Classic fighter: the blade fighter, getting about by `MOVE` and standing up once down. */
export const CLASSIC: FighterConfig = deepFreeze({ ...BLADE_FIGHTER, locomotion: MOVE, subs: [STAND_UP] });

/** Classic throwing the straight punch as its body's record has it (`PunchRecord`), held at the edge of its foe's reach. */
export const PUNCHER: FighterConfig = deepFreeze({ ...CLASSIC, tactics: { ...FIGHTING, list: [
  { kind: "follow-orders" }, { kind: "clear-of-fallen" }, { kind: "break-clinch", metres: .65 }, { kind: "attack" }, { kind: "edge", band: .25, patience: 4 }, { kind: "approach" }, { kind: "cover", guard: "pose" }] }, executors: [{ name: "punch", kind: "straight-punch" }],
  actions: [{ name: "strike", executor: "punch", effectors: ["hand.right", "hand.left"], regions: [{ kind: "mark", mark: "high" }], aim: { kind: "centre", lead: 0 } }] });

/**
 * The Puncher waiting for its foe to come to it: it holds the edge of its foe's reach for as long
 * as an Arena bout lasts, so a foe walking in meets the punch of a body already settled before it
 * can settle for its own.
 */
export const COUNTER_PUNCHER: FighterConfig = deepFreeze({ ...PUNCHER, tactics: { ...PUNCHER.tactics, list: [
  { kind: "follow-orders" }, { kind: "clear-of-fallen" }, { kind: "break-clinch", metres: .65 }, { kind: "attack" }, { kind: "edge", band: .25, patience: 120 }, { kind: "approach" }, { kind: "cover", guard: "pose" }] } });

/** The configurable behaviour fighter: the blade fighter's actions, taken in turn. */
export const BEHAVIOURS: FighterConfig = deepFreeze({ ...CLASSIC, tactics: { ...FIGHTING, choose: { kind: "rotate", rethink: .2, patience: 2 }, list: [
  { kind: "follow-orders" }, { kind: "attack" }, { kind: "approach" }, { kind: "cover", guard: "cover" }] } });

/** Either hand. */
const EITHER_HAND = ["hand.right", "hand.left"] as const;

/**
 * **The duellist**: Behaviours' parts for a fighter that thrusts with the blade one hand holds and
 * covers with what the other holds. It thrusts at the trunk's opening; approaches its window facing
 * its way there, at its run's pace, while the window is over 1.5 m off; covers by prediction; and
 * stands up once down. With a sword, it is the mind every humanoid has unless its fight says
 * otherwise (`defaultMind`).
 */
export const DUELLIST: FighterConfig = deepFreeze({ ...BEHAVIOURS,
  tactics: { ...BEHAVIOURS.tactics, list: [
    { kind: "follow-orders" }, { kind: "clear-of-fallen" }, { kind: "attack" }, { kind: "approach", travel: 1.5 }, { kind: "cover", guard: "ward" }] },
  executors: [{ name: "blade-thrust", kind: "blade-thrust" }],
  actions: [{ name: "thrust", executor: "blade-thrust", effectors: EITHER_HAND, regions: [{ kind: "mark", mark: "middle" }], aim: { kind: "surface", tuning: {} } }] });
