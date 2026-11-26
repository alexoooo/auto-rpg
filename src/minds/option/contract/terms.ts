import type { Position } from "../../../control/ground-reading.ts";
import type { Spot } from "../../../skills/framework/menu.ts";
import type { StanceNumbers } from "../../../skills/framework/profile/profile.ts";
import type { FoePhase } from "../../../skills/perception/threat.ts";

/** A point on the ground, or a motion over it: x and z, m or m/s. */
export interface Ground { readonly x: number; readonly z: number }

/**
 * **Where an Option leaves the body**: what of the situation it changes, each a percept by its name
 * (`Percepts`): where on the ground the body stands and the way it faces (`where`), its bearing
 * around the focus where the focus has not turned to face it there (`around`; else as `where`
 * reads it), what bears it (`posture`; down unless standing) and its velocity over the ground,
 * m/s (`velocity`); and, where it reckons it, the seconds before the focus's pressure reaches the
 * body there (`grace`, `Situation.grace`); and how it stands there (`stance`, `StanceNumbers`),
 * where its Option knows. What it does not name is as it was, the foe included (`placed`).
 */
export interface Leaves {
  readonly where?: Spot;
  readonly around?: number;
  readonly posture?: Position;
  readonly grace?: number;
  readonly velocity?: Ground;
  readonly stance?: StanceNumbers;
  /** What the focus is doing as it leaves it (`FoePhase`), where its trials say; as at the decision where none do. */
  readonly phase?: FoePhase;
}

/** **One way an Option ends**: where it leaves the body (`Leaves`), and the chance it ends so. */
export interface Outcome {
  readonly leaves: Leaves;
  readonly chance: number;
}

/**
 * **What running an Option from a state is expected to bring**, over its run, in life (a share of
 * a body's full life, the verdict's unit) where it is a payoff: how long it runs, s; the focus's
 * life its blows take; its own life the blows it takes take, the blow coming included; the metres
 * it walks as ordered; the ways it ends (`Outcome`), whose chances sum to one; and, where it runs
 * and may be let go now, before its point of no return, what letting it go leaves: the seconds
 * until its body could begin it again, and its own life lost meanwhile.
 */
export interface Terms {
  readonly duration: number;
  readonly dealt: number;
  readonly taken: number;
  readonly orders: number;
  readonly outcomes: readonly Outcome[];
  readonly letGo?: { readonly seconds: number; readonly taken: number };
}

/**
 * **What an Option is asked to price** besides the state: the target it runs at, by its place in
 * its `targets` (its first unless given), so a search prices each without aiming it (`Option.aim`);
 * and the chooser's horizon in seconds. An Option that runs as long as it is held (`Option.open`)
 * is priced over that time (as an instant unless given); a finite walk uses it to bound sampling.
 */
export interface Ask {
  readonly target?: number;
  readonly until?: number;
}
