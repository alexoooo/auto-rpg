import type { Scene } from "@babylonjs/core/scene.js";
import type { HavokPhysicsWithBindings } from "@babylonjs/havok";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { attachHavok, PHYSICS_HZ } from "./engine/havok.ts";

/**
 * **The world**: one fixed step that owns physics, control and the clock. The page, the Node stand
 * and the research runners all advance it through `step` (or `advance`, which turns elapsed time
 * into whole steps), and nothing else moves its bodies or its clock.
 *
 * A step is: the step hooks, in the order they were added (sensing, minds, motor control, the
 * muscle driver), then one solver step of `dt`, then the after-step hooks (readings). The solver is
 * stepped directly, never through Babylon's accumulator, so a step is exactly one solver step, and
 * `scene.render()` never advances it: the world turns the scene's own stepping off
 * (`physicsEnabled`), and a page renders what the steps produced. The clock is the count of steps;
 * `time` is that count over the rate, not a sum of deltas.
 *
 * A hook added while the world steps runs from the next step; one removed stops at once.
 */
export interface World {
  readonly scene: Scene;
  /** Steps a second. */
  readonly hz: number;
  /** The step, s. */
  readonly dt: number;
  /** Steps taken since the world was made. */
  readonly steps: number;
  /** Seconds since the world was made: `steps / hz`. */
  readonly time: number;
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
export type StepHook = (dt: number) => void;

export interface Hook {
  dispose(): void;
}

export interface WorldOptions {
  /** Steps a second; the game's rate (`PHYSICS_HZ`) unless a finer reference is asked for. */
  readonly hz?: number;
  /** Standard gravity, or none, for reading a body alone. */
  readonly gravity?: boolean;
}

/**
 * The world on `scene`, with Havok brought up on it: make it before any body (H01). Havok is
 * handed in because a browser and Node load it differently (H25).
 */
export function createWorld(scene: Scene, havok: HavokPhysicsWithBindings, { hz = PHYSICS_HZ.value, gravity = true }: WorldOptions = {}): World {
  attachHavok(scene, havok);
  const engine = scene.getPhysicsEngine()!;
  engine.setSubTimeStep(1000 / hz);
  if (!gravity) engine.setGravity(new Vector3(0, 0, 0));
  scene.physicsEnabled = false;
  const dt = 1 / hz;
  const before: HookEntry[] = [], after: HookEntry[] = [];
  let steps = 0, owed = 0, disposed = false;

  const add = (list: HookEntry[], run: StepHook): Hook => {
    const entry: HookEntry = { run, live: true };
    list.push(entry);
    return { dispose: () => { entry.live = false; const i = list.indexOf(entry); if (i >= 0) list.splice(i, 1); } };
  };
  const runAll = (list: HookEntry[]) => {
    // A snapshot, so a hook added now waits for the next step; one removed now is skipped.
    for (const entry of list.slice()) if (entry.live) entry.run(dt);
  };

  const world: World = {
    scene, hz, dt,
    get steps() { return steps; },
    get time() { return steps / hz; },
    beforeStep: (hook) => add(before, hook),
    afterStep: (hook) => add(after, hook),
    step(n = 1) {
      if (disposed) throw new Error("the world was disposed");
      for (let i = 0; i < n; i++) {
        // World transforms are cached per render id (H24); a step is a new moment.
        (scene as unknown as { _renderId: number })._renderId += 1;
        runAll(before);
        engine._step(dt);
        steps += 1;
        runAll(after);
      }
    },
    advance(seconds, most = Infinity) {
      owed += seconds;
      let taken = 0;
      // A step is owed once its whole length has passed, give or take the float sum's rounding.
      while (owed >= dt - 1e-9 && taken < most) { world.step(); owed -= dt; taken += 1; }
      if (owed >= dt) owed %= dt;
      return taken;
    },
    dispose() {
      disposed = true;
      before.length = 0;
      after.length = 0;
    },
  };
  return world;
}

interface HookEntry { readonly run: StepHook; live: boolean }
