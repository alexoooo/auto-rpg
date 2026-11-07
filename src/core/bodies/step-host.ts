import type { PhysicsWorld } from "../physics/engine.ts";

/** Called with the step, s. */
export type StepHook = (dt: number) => void;

/** A hook a step runs; disposing it stops it at once. */
export interface Hook {
  dispose(): void;
}

/**
 * **What a body needs of the world it steps in**: its physics, the step and its command's delay and
 * actuator law, and the points in a step where its hooks run. The world (`World`,
 * `src/core/world/world.ts`) is one.
 */
export interface StepHost {
  /** The physics: bodies, joints, ground and gravity. */
  readonly physics: PhysicsWorld;
  /** The step, s. */
  readonly dt: number;
  /** The actuator law shared by every body: symmetric reference bounds or each side's own muscle bounds. */
  readonly actuation: "symmetric" | "directional";
  /** The steps a body's command waits before it is applied (`COMMAND_DELAY`): a whole number, 1 or more. */
  readonly delay: number;
  /**
   * Run `hook` after every sensing hook and before every step hook, after the preparing hooks added
   * before it: what makes a body ready to be read (its hands' and its toes' shapes) and hands a mind
   * kept apart what it reads (`World.minds`).
   */
  prepare(hook: StepHook): Hook;
  /** Run `hook` before every solver step, after the hooks added before it. */
  beforeStep(hook: StepHook): Hook;
  /** Run `hook` after all post-physics observations, after the hooks added before it. */
  afterStep(hook: StepHook): Hook;
}
