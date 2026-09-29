import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BuiltBody } from "../core/build/build-body.ts";
import { ROUTINE, type Routine, type Step } from "./routine.ts";

/**
 * **The lab's timeline**: the routine's current loop, recorded a physics sub-step at a time from
 * its start to the live frame, so a paused page can show any moment of it again. A frame is a
 * sub-step's place in the loop; frame 0 is the loop's start, the body as built on the first loop.
 * When the loop starts again, the last one is forgotten: frames after the live one are always
 * still to come. It records the body's segment transforms and what the readout and the skin read
 * (the step, the fist speed, each hand's closure); showing a frame writes those transforms onto
 * the segments' nodes and nothing else.
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
  /** The frame the world is at now: every frame up to it is recorded, none after it. */
  live(): number;
  /** What was read at `frame`, or null if the loop has not reached it yet. */
  at(frame: number): FrameReading | null;
  /** Put the body as it was at `frame`; a frame the loop has not reached leaves it as it is. */
  show(frame: number): void;
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

  const record = (): void => {
    const state = routine.state();
    const frame = Math.round(state.time / seconds) % frames;
    time[frame] = state.time;
    stepOf[frame] = state.stepIndex;
    fist[frame] = routine.fistSpeed();
    left[frame] = routine.closure("left");
    right[frame] = routine.closure("right");
    const size = nodes.length * 7;
    let k = frame * size;
    for (const node of nodes) {
      const p = node.position, q = node.rotationQuaternion!;
      pose[k++] = p.x; pose[k++] = p.y; pose[k++] = p.z;
      pose[k++] = q.x; pose[k++] = q.y; pose[k++] = q.z; pose[k++] = q.w;
    }
    if (frame < live) {
      // A new loop: the last one's frames are not this one's past. The routine sums its clock in
      // floating point, so a loop can begin a sub-step late; its first frame stands for the start.
      stepOf.fill(-1, frame + 1);
      for (let early = 0; early < frame; early++) {
        time[early] = time[frame]!; stepOf[early] = stepOf[frame]!; fist[early] = fist[frame]!;
        left[early] = left[frame]!; right[early] = right[frame]!;
        pose.copyWithin(early * size, frame * size, (frame + 1) * size);
      }
    }
    live = frame;
  };
  // The body as built is the loop's start.
  record();
  const observer: Observer<Scene> = scene.onAfterPhysicsObservable.add(record);

  return {
    frames,
    seconds,
    live: () => live,
    at(frame) {
      if (frame < 0 || frame >= frames || stepOf[frame]! < 0) return null;
      return { time: time[frame]!, step: steps[stepOf[frame]!]!, fist: fist[frame]!, closure: { left: left[frame]!, right: right[frame]! } };
    },
    show(frame) {
      if (frame < 0 || frame >= frames || stepOf[frame]! < 0) return;
      let k = frame * nodes.length * 7;
      for (const node of nodes) {
        node.position.set(pose[k]!, pose[k + 1]!, pose[k + 2]!);
        node.rotationQuaternion!.set(pose[k + 3]!, pose[k + 4]!, pose[k + 5]!, pose[k + 6]!);
        k += 7;
      }
    },
    dispose: () => scene.onAfterPhysicsObservable.remove(observer),
  };
}
