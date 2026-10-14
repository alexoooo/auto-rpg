import type { Cover, Intent } from "../intent.ts";
import type { Orders } from "../orders.ts";
import type { BodySense } from "../senses.ts";
import type { SubMind } from "../sub-mind.ts";
import type { Sight } from "../tactics.ts";
import type { Side } from "../../spec/body.ts";
import type { Terms } from "./value.ts";

/**
 * **What a decision reads**, once a control step: the body and its skills as the last step left
 * them, whether it is down, its orders, the foe it fights (its focus) and how far off that foe is,
 * a foe's blow closing on its head or predicted to reach it, and what an option's model prices
 * from: what the blow coming costs, how far each reaches, what standing in the focus's reach
 * costs, and what each hand's blow at the focus is worth.
 */
export interface Situation {
  readonly sight: Sight;
  readonly time: number;
  readonly down: boolean;
  readonly orders: Orders | null;
  readonly focus: BodySense | null;
  /** Across the ground between the centres of mass, m; Infinity with no focus. */
  readonly apart: number;
  readonly threat: Cover | null;
  /** A foe's blow predicted to reach the head (`PREDICTION`). */
  readonly incoming: Cover | null;
  /** The expected cost (`cost`) of the blow predicted to reach the head, at the speed it closes and the chance it lands (`LANDS`); 0 with none. */
  readonly danger: number;
  /**
   * Head to head across the ground to the focus, m, and the most at which its hands reach this
   * body's head and this body's reach its: Infinity, 0 and 0 with no focus.
   */
  readonly reach: { readonly apart: number; readonly theirs: number; readonly mine: number };
  /** The expected cost of a second within a standing focus's reach (`LANDS`, `RATE`); 0 with none. */
  readonly exposure: number;
  /** The energy of a blow of each hand at the focus's head, J (`blowEnergy`); 0 with no focus. */
  readonly blows: Readonly<Record<Side, number>>;
}

/** The models an option may be valued by, by kind: its own, built by hand. */
export type ModelKind = "hand-built";

/**
 * **An option**: what a body does over time, chosen by its meta-controller (`metaController`):
 * whether it can begin or go on, whether it may give way, and whether it has run its course.
 * Begun, it runs until it is over, unavailable, or given up for a better one where it yields.
 */
interface OptionBase {
  readonly name: string;
  /** Its memory (`src/core/state.ts`), plain data. */
  readonly state: object;
  /** Whether it can begin now, or, running, go on. */
  available(now: Situation): boolean;
  /** Whether, running, it may give way to another now. */
  yields(now: Situation): boolean;
  /** Whether, running, it has run its course: it is over, and may only be begun afresh. */
  ended(now: Situation): boolean;
  begin(now: Situation): void;
  /** It is over, run out or given up. */
  end(): void;
  /** What running it from now is expected to bring, by each model it has (`Terms`). */
  readonly models: Readonly<Record<ModelKind, (now: Situation) => Terms>>;
}

/** An option the body carries out standing, through its skills: what it asks of them each step, the hands' cover aside. */
export interface StandingOption extends OptionBase {
  readonly posture: "standing";
  step(now: Situation, dt: number): Omit<Intent, "guard">;
  /** The body it means to be near, whose reach its walk need not keep out of (`Walker.constrain`); none where absent. */
  near?(now: Situation): string | null;
}

/** An option a body carries out down, by the sub-mind it hands its body to. */
export interface DownOption extends OptionBase {
  readonly posture: "down";
  readonly mind: SubMind;
}

export type Option = StandingOption | DownOption;
