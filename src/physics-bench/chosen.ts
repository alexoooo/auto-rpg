import type { Settings } from "./engines/types.ts";

/**
 * **Each engine's cheapest setting that passes both fidelity cases** at the `today` bar
 * (`research/physics-bakeoff/fidelity.mjs`, `thresholds.mjs`), ranked by cost on 8 humans spaced and
 * piled (`candidates.mjs`), and the rows kept for the record. Node harness chose them; the page
 * runs the same. The feet's inertia factor is the one the whole human needs to stand (case C,
 * `standingHuman`): MuJoCo passes cases A and B without one and diverges on the whole human.
 *
 * Neither MuJoCo row survives the pile: when the second layer lands, a light freedom runs away and
 * MuJoCo resets the whole world (BADQVEL), with or without control. `mujoco-pile` is the cheapest
 * setting found that passes both cases and holds piles of 16, 32 and 64: rotor inertia on every
 * hinge (`armature`, solver conditioning) and 4 sub-steps (`research/physics-bakeoff/mujoco-armature.mjs`).
 */
export interface Chosen {
  readonly engine: "havok" | "mujoco" | "mujoco-mt" | "rapier" | "rapier-simd";
  readonly tag: string;
  readonly settings: Settings;
  readonly conditioning?: Readonly<Record<string, number>>;
  /** Havok's real human (`buildBody`) instead of the neutral one. */
  readonly real?: boolean;
  readonly note: string;
}

export const FEET = (k: number): Record<string, number> => ({ "foot.left": k, "foot.right": k });

export const CHOSEN: readonly Chosen[] = [
  { engine: "mujoco", tag: "mujoco", settings: { hz: 120, substeps: 2 }, conditioning: FEET(100), note: "passes both at x1 and x100; x100 for the whole human (case C)" },
  { engine: "mujoco", tag: "mujoco-1step", settings: { hz: 120, substeps: 1, timeconst: 0.03 }, conditioning: FEET(100), note: "fails only case B's deviation mark; x100 for case C" },
  { engine: "mujoco", tag: "mujoco-pile", settings: { hz: 120, substeps: 4, armature: 0.001 }, conditioning: FEET(100), note: "passes both and holds the pile; armature 0.001 kg m2" },
  { engine: "rapier", tag: "rapier", settings: { hz: 120, substeps: 1, iterations: 16, pgs: 2 }, conditioning: FEET(100), note: "passes both; feet x100" },
  { engine: "rapier-simd", tag: "rapier-simd", settings: { hz: 120, substeps: 1, iterations: 16, pgs: 2 }, conditioning: FEET(100), note: "passes both; feet x100" },
  { engine: "havok", tag: "havok", settings: { hz: 120, substeps: 12, damping: "default" }, conditioning: FEET(300), note: "passes both; 1440 Hz, feet x300" },
  { engine: "havok", tag: "havok-today", settings: { hz: 120, substeps: 1, damping: "default" }, conditioning: FEET(100), note: "today; fails case A" },
  { engine: "havok", tag: "havok-real-today", settings: { hz: 120, substeps: 1 }, conditioning: FEET(100), real: true, note: "today, the core's buildBody and world" },
];

/**
 * MuJoCo's threaded build (`@mujoco/mujoco/mt`) at the chosen MuJoCo setting, a thread pool of
 * `threads` bound to each world (`mju_threadpool`); 1 is the threaded build without a pool.
 */
export const mujocoThreaded = (threads: number): Chosen => ({
  engine: "mujoco-mt", tag: `mujoco-mt-t${threads}`, settings: { hz: 120, substeps: 2, threads }, conditioning: FEET(100),
  note: "the threaded build; needs cross-origin isolation",
});
