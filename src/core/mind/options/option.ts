import type { Cover, Intent } from "../intent.ts";
import type { Orders } from "../orders.ts";
import type { BodySense } from "../senses.ts";
import type { SubMind } from "../sub-mind.ts";
import type { Sight } from "../tactics.ts";

/**
 * **What a decision reads**, once a control step: the body and its skills as the last step left
 * them, whether it is down, its orders, the foe it fights (its focus) and how far off that foe is,
 * and a foe's blow closing on its head or predicted to reach it.
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
}

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
}

/** An option the body carries out standing, through its skills: what it asks of them each step, the hands' cover aside. */
export interface StandingOption extends OptionBase {
  readonly posture: "standing";
  step(now: Situation, dt: number): Omit<Intent, "guard">;
}

/** An option a body carries out down, by the sub-mind it hands its body to. */
export interface DownOption extends OptionBase {
  readonly posture: "down";
  readonly mind: SubMind;
}

export type Option = StandingOption | DownOption;
