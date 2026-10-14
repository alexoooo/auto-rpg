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

/** **What a skill asks of the legs** this step, by kind. */
export type LegsAsk =
  /** The tactics' walk and facing. */
  | { readonly kind: "free" }
  /** No walk: the body stands where it is. */
  | { readonly kind: "hold" }
  /** Walk (forward, right, m/s), or stand, facing `face`. */
  | { readonly kind: "walk"; readonly walk: readonly [number, number] | null; readonly face: number }
  /** Set the feet at `footing` (`Locomotion.place`). */
  | { readonly kind: "place"; readonly footing: Footing };

/** What an executor reads of the skills beside it, as this step finds them. */
export interface Around {
  /** The heading the legs face, rad, and whether they have set the feet at the footing last asked. */
  readonly heading: number;
  readonly placed: boolean;
  /** How the support skill is going, or null with none. */
  readonly support: SupportReport | null;
}
