import type { Model } from "../model.ts";

/**
 * **What every engine adapter builds and how the bake-off drives it.** A scene is placed models on
 * an optional ground; segments are numbered model by model in `models` order, each model's in its
 * own order. The adapter builds each segment world-aligned at its centre of mass (`model.ts`).
 *
 * One control step is: `prepare()` (an engine that must compute derived state before it can be
 * read does it here: MuJoCo's `mj_step1`), `read(state)`, the controller, `applyTorques`, then
 * `step()`, which advances the control step's length in `substeps` solver steps with the torques
 * held. The bake-off times `prepare` + `step` as the solver, `read` as readback.
 */
export interface SceneSpec {
  readonly models: readonly Model[];
  readonly ground: boolean;
  /** Rotational-inertia factor by segment name: solver conditioning, not anatomy (the feet's: `FEET`, `chosen.ts`). */
  readonly conditioning?: Readonly<Record<string, number>>;
  /** Friction coefficient of every shape and the ground. */
  readonly friction?: number;
}

export interface Settings {
  /** Control steps a second. */
  readonly hz: number;
  /** Solver steps per control step. */
  readonly substeps: number;
  /** Engine-specific knobs (iterations, solver, integrator, joint kind ...). */
  readonly [knob: string]: number | string | boolean;
}

export interface Sim {
  /** Engine and settings, for tables. */
  readonly label: string;
  readonly segments: number;
  prepare(): void;
  /** 13 numbers a segment (`control.ts` `STRIDE`). */
  read(state: Float64Array): void;
  /** 3 numbers a segment, world, N m, held over the next `step`. */
  applyTorques(torques: Float64Array): void;
  step(): void;
  dispose(): void;
}

export const FRICTION = 1;

/** Masses of every segment of `scene`, in segment order. */
export const massesOf = (scene: SceneSpec): Float64Array =>
  Float64Array.from(scene.models.flatMap((m) => m.segments.map((s) => s.mass)));

/** Inertia factor of segment `name` in `scene`. */
export const conditioningOf = (scene: SceneSpec, name: string): number => scene.conditioning?.[name] ?? 1;

export const describe = (settings: Settings): string =>
  Object.entries(settings).filter(([k]) => k !== "hz").map(([k, v]) => `${k}=${v}`).join(" ");
