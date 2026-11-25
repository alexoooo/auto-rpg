import type { OutcomeModel } from "../../../skills/framework/outcomes.ts";
import type { Profile } from "../../../skills/framework/profile/profile.ts";
import type { OthersModel } from "../percepts.ts";
import type { WalkStart } from "./context.ts";

/** **What a Mind predicts by**, made by its predictions part (`PredictionsPart.make`). */
export interface Predictors {
  /** Every striker's measured strikes, which model a foe's. */
  readonly strikes: readonly Profile[];
  /** What each act of the body's own brings. */
  readonly outcomes: OutcomeModel;
  /** What the foe is expected to take from the body. */
  readonly others: OthersModel;
  /** The speed a walk is priced as starting at. */
  readonly walkStart: WalkStart;
}
