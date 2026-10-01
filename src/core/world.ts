import type { Scene } from "@babylonjs/core/scene.js";
import type { PhysicsEngine, PhysicsWorld } from "./engine/engine.ts";
import { sourced, type Quantity } from "./spec/quantity.ts";

/** The fixed step's rate: physics and control run at 120 Hz. */
export const PHYSICS_HZ: Quantity<number> = sourced(120, "Hz", "owner-physics-rate",
  "physics and control at 120 Hz from the release of 2026-09-25");

/**
 * **The world**: one fixed step that owns physics, control and the clock. The page, the Node stand
 * and the research runners all advance it through `step` (or `advance`, which turns elapsed time
 * into whole steps), and nothing else moves its bodies or its clock.
 *
 * A step is: the sensing hooks; the step hooks, in the order they were added (minds, motor control,
 * the muscle driver); then one solver step of `dt`, which writes every body's node; then the
 * after-step hooks (readings). The physics is the engine's the world was made with (`src/core/engine/engine.ts`),
 * beside the scene, which only carries the nodes: `scene.render()` never advances it, and a page renders what the steps
 * produced. The clock is the count of steps; `time` is that count over the rate, not a sum of deltas.
 *
 * A hook added while its own list runs waits for the next step, but an after-step hook added by a
 * step hook runs in the same step. A hook removed stops at once.
 */
export interface World {
  readonly scene: Scene;
  /** The physics: bodies, joints, ground and gravity. */
  readonly physics: PhysicsWorld;
  /** Steps a second. */
  readonly hz: number;
  /** The step, s. */
  readonly dt: number;
  /** Steps taken since the world was made. */
  readonly steps: number;
  /** Seconds since the world was made: `steps / hz`. */
  readonly time: number;
  /** Its memory (`src/core/state.ts`): the steps taken, and the time `advance` owes. The physics saves its own (`PhysicsWorld.save`). */
  readonly state: object;
  /**
   * Run `hook` first in every step, before every `beforeStep` hook, after the sensing hooks added
   * before it: what reads the world for the minds, so that every mind in a step decides on the
   * same moment.
   */
  sense(hook: StepHook): Hook;
  /** Run `hook` before every solver step, after the hooks added before it. */
  beforeStep(hook: StepHook): Hook;
  /** Run `hook` after every solver step, after the hooks added before it. */
  afterStep(hook: StepHook): Hook;
  /** Take `n` steps. */
  step(n?: number): void;
  /**
   * Take the whole steps `seconds` of elapsed time owes, carrying the remainder to the next call,
   * but at most `most`: a page that falls behind runs slow rather than catching up in a burst, and
   * the time it could not take is dropped. Returns the steps taken.
   */
  advance(seconds: number, most?: number): number;
  dispose(): void;
}

/** Called with the step, s. */
type StepHook = (dt: number) => void;

export interface Hook {
  dispose(): void;
}

interface WorldOptions {
  /** Steps a second; the game's rate (`PHYSICS_HZ`) unless a finer reference is asked for. */
  readonly hz?: number;
  /** Standard gravity, or none, for reading a body alone. */
  readonly gravity?: boolean;
}

/** The world on `scene`, with a physics of `engine`'s own: make it before any body. The caller loads the engine (`loadEngine`). */
export function createWorld(scene: Scene, engine: PhysicsEngine, { hz = PHYSICS_HZ.value, gravity = true }: WorldOptions = {}): World {
  const physics = engine.createPhysics({ hz, gravity });
  const dt = 1 / hz;
  const sensing: HookEntry[] = [], before: HookEntry[] = [], after: HookEntry[] = [];
  const state = { steps: 0, owed: 0 };
  let disposed = false;

  const add = (list: HookEntry[], run: StepHook): Hook => {
    const entry: HookEntry = { run, live: true };
    list.push(entry);
    return { dispose: () => { entry.live = false; const i = list.indexOf(entry); if (i >= 0) list.splice(i, 1); } };
  };
  const runAll = (list: HookEntry[]) => {
    // A snapshot, so a hook added to this list now waits for the next step; one removed now is skipped.
    for (const entry of list.slice()) if (entry.live) entry.run(dt);
  };

  const world: World = {
    scene, physics, hz, dt, state,
    get steps() { return state.steps; },
    get time() { return state.steps / hz; },
    sense: (hook) => add(sensing, hook),
    beforeStep: (hook) => add(before, hook),
    afterStep: (hook) => add(after, hook),
    step(n = 1) {
      if (disposed) throw new Error("the world was disposed");
      for (let i = 0; i < n; i++) {
        // Babylon caches a node's world matrix per render id; a step is a new moment, so a new id.
        (scene as unknown as { _renderId: number })._renderId += 1;
        runAll(sensing);
        runAll(before);
        physics.step(dt);
        state.steps += 1;
        runAll(after);
      }
    },
    advance(seconds, most = Infinity) {
      state.owed += seconds;
      let taken = 0;
      // A step is owed once its whole length has passed, give or take the float sum's rounding.
      while (state.owed >= dt - 1e-9 && taken < most) { world.step(); state.owed -= dt; taken += 1; }
      if (state.owed >= dt) state.owed %= dt;
      return taken;
    },
    dispose() {
      disposed = true;
      sensing.length = 0;
      before.length = 0;
      after.length = 0;
      physics.dispose();
    },
  };
  return world;
}

interface HookEntry { readonly run: StepHook; live: boolean }
