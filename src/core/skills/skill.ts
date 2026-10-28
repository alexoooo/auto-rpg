import type { BodyView } from "../body.ts";
import type { Footing } from "./locomotion.ts";
import type { SupportReport } from "./support-fold.ts";

/**
 * **What every skill answers to**: the body was another mind's, and is back as `view` shows it.
 * Whatever the skill had under way is over.
 */
export interface Skill<V = BodyView> {
  resume(view: V): void;
}

/**
 * **The legs goal**: what the legs are asked this control step, a walk and the stance goal's own
 * fields in part, any of them left out. The legs complete it (`Locomotion.goal`): what it sets they
 * carry out, and what it leaves out they fill from the walk.
 *
 * - **The walk**: `walk` (forward along the legs' heading and to its right, m/s), null to stand;
 *   `face`, the heading a walk turns toward; `footing`, where each sole's middle is set, standing;
 *   `destination`, m from where the body is being taken, for its stopping. In an action's claim a
 *   walk or facing left out is the intent's: absent and a walk of none are distinct.
 * - **The stance's fields** (`StanceGoal`): `height`, the centre of mass's over the soles, m;
 *   `heading`, the stance's, rad, unstored (the legs keep their own); `centre`, the centre of
 *   mass's place over the ground, world (x, z), m; `halt`, a step not yet lifted not taken.
 */
export interface LegsGoal {
  readonly walk?: readonly [forward: number, right: number] | null;
  readonly face?: number;
  readonly footing?: Footing;
  readonly destination?: number;
  readonly height?: number;
  readonly heading?: number;
  readonly centre?: readonly [number, number];
  readonly halt?: boolean;
}

/** A legs goal with its walk and facing filled in: what the legs are given (`Locomotion.goal`). */
export type LegsAsked = LegsGoal & { readonly walk: readonly [forward: number, right: number] | null; readonly face: number };

/** What an executor reads of the skills beside it, as this step finds them. */
export interface Around {
  /** The heading the legs face, rad, and whether they have set the feet at the footing last asked. */
  readonly heading: number;
  readonly placed: boolean;
  /** How the support skill is going, or null with none. */
  readonly support: SupportReport | null;
}
