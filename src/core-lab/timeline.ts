import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BuiltBody } from "../core/build/build-body.ts";
import { ROUTINE, type Routine, type Step } from "./routine.ts";

/**
 * **The lab's timeline**: one loop of the routine, recorded a physics sub-step at a time, so a
 * paused page can show any moment of the last loop again. It records the body's segment
 * transforms and what the readout and the skin read (the step, the fist speed, each hand's
 * closure); showing a frame writes those transforms onto the segments' nodes and nothing else.
 *
 * The solver's bodies are not rewound, so a shown frame is a picture. Before the world steps
 * again, the live frame goes back on the nodes (`show(live())`), because a joint reads its angles
 * from them.
 */
export interface Timeline {
  /** Physics sub-steps in one loop of the routine. */
  readonly frames: number;
  /** Seconds per frame: the physics sub-step. */
  readonly seconds: number;
  /** The frame the world is at now. */
  live(): number;
  /** What was read at `frame`, or null if the loop has not reached it yet. */
  at(frame: number): FrameReading | null;
  /** Put the body as it was at `frame`, or at the nearest frame recorded; returns the frame shown, -1 if none is. */
  show(frame: number): number;
  dispose(): void;
}

export interface FrameReading {
  /** Seconds into the loop. */
  readonly time: number;
  readonly step: Step;
  /** The striking fist's speed (or the faster one's), m/s. */
  readonly fist: number;
  readonly closure: { readonly left: number; readonly right: number };
}

/** Record `routine` on `built`, after every physics sub-step of `scene`. */
export function recordTimeline(built: BuiltBody, routine: Routine, scene: Scene, steps: readonly Step[] = ROUTINE): Timeline {
  const seconds = scene.getPhysicsEngine()!.getSubTimeStep() / 1000;
  const frames = Math.round(steps.reduce((sum, step) => sum + step.seconds, 0) / seconds);
  const nodes = [...built.segments.values()].map((segment) => segment.node);
  const pose = new Float64Array(frames * nodes.length * 7);
  const time = new Float64Array(frames), fist = new Float64Array(frames);
  const left = new Float64Array(frames), right = new Float64Array(frames);
  const stepOf = new Int16Array(frames).fill(-1);
  let live = 0;

  const observer: Observer<Scene> = scene.onAfterPhysicsObservable.add(() => {
    const state = routine.state();
    const frame = Math.round(state.time / seconds) % frames;
    time[frame] = state.time;
    stepOf[frame] = state.stepIndex;
    fist[frame] = routine.fistSpeed();
    left[frame] = routine.closure("left");
    right[frame] = routine.closure("right");
    let k = frame * nodes.length * 7;
    for (const node of nodes) {
      const p = node.position, q = node.rotationQuaternion!;
      pose[k++] = p.x; pose[k++] = p.y; pose[k++] = p.z;
      pose[k++] = q.x; pose[k++] = q.y; pose[k++] = q.z; pose[k++] = q.w;
    }
    live = frame;
  });

  /** `frame` if recorded, else the nearest recorded before it, else after it; -1 if none. */
  const nearest = (frame: number): number => {
    const f = Math.max(0, Math.min(frames - 1, Math.round(frame)));
    for (let i = f; i >= 0; i--) if (stepOf[i]! >= 0) return i;
    for (let i = f + 1; i < frames; i++) if (stepOf[i]! >= 0) return i;
    return -1;
  };

  return {
    frames,
    seconds,
    live: () => live,
    at(frame) {
      if (frame < 0 || frame >= frames || stepOf[frame]! < 0) return null;
      return { time: time[frame]!, step: steps[stepOf[frame]!]!, fist: fist[frame]!, closure: { left: left[frame]!, right: right[frame]! } };
    },
    show(frame) {
      const shown = nearest(frame);
      if (shown < 0) return shown;
      let k = shown * nodes.length * 7;
      for (const node of nodes) {
        node.position.set(pose[k]!, pose[k + 1]!, pose[k + 2]!);
        node.rotationQuaternion!.set(pose[k + 3]!, pose[k + 4]!, pose[k + 5]!, pose[k + 6]!);
        k += 7;
      }
      return shown;
    },
    dispose: () => scene.onAfterPhysicsObservable.remove(observer),
  };
}
