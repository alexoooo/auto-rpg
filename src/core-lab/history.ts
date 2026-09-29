import type { BuiltBody } from "../core/build/build-body.ts";
import type { World } from "../core/world.ts";

/**
 * **The lab's history**: the last few seconds of a body that is not on a loop, recorded a physics
 * sub-step at a time, so a paused page can show any moment of them again. Beside the routine's
 * timeline (`timeline.ts`), which records one loop; this one rolls. It records the segments'
 * transforms and whatever `read` returns after each step; showing a frame writes those transforms
 * onto the segments' nodes and nothing else.
 *
 * The solver's bodies are not rewound, so a shown frame is a picture. Before the world steps
 * again, the live frame goes back on the nodes (`show(live())`), because a joint reads its angles
 * from them.
 */
export interface History<T> {
  /** Frames held now, 0 the oldest; it grows to the capacity and then rolls. */
  readonly frames: number;
  /** Seconds per frame: the physics sub-step. */
  readonly seconds: number;
  /** The newest frame, -1 before the first step. */
  live(): number;
  /** What was read at `frame`, or null if it is not held. */
  at(frame: number): T | null;
  /** Put the body as it was at `frame` (clamped to what is held); returns the frame shown, -1 if none is. */
  show(frame: number): number;
  dispose(): void;
}

/** Record the last `seconds` of `built` in `world`, and what `read` says after each step. */
export function recordHistory<T>(built: BuiltBody, world: World, seconds: number, read: () => T): History<T> {
  const capacity = Math.round(seconds / world.dt);
  const nodes = [...built.segments.values()].map((segment) => segment.node);
  const pose = new Float64Array(capacity * nodes.length * 7);
  const readings: T[] = new Array(capacity);
  let written = 0;
  const held = () => Math.min(written, capacity);
  /** The ring slot of frame `frame`, 0 the oldest held. */
  const slot = (frame: number) => (written - held() + frame) % capacity;

  const hook = world.afterStep(() => {
    const at = written % capacity;
    readings[at] = read();
    let k = at * nodes.length * 7;
    for (const node of nodes) {
      const p = node.position, q = node.rotationQuaternion!;
      pose[k++] = p.x; pose[k++] = p.y; pose[k++] = p.z;
      pose[k++] = q.x; pose[k++] = q.y; pose[k++] = q.z; pose[k++] = q.w;
    }
    written++;
  });

  return {
    get frames() { return held(); },
    seconds: world.dt,
    live: () => held() - 1,
    at: (frame) => frame >= 0 && frame < held() ? readings[slot(frame)]! : null,
    show(frame) {
      if (held() === 0) return -1;
      const shown = Math.max(0, Math.min(held() - 1, Math.round(frame)));
      let k = slot(shown) * nodes.length * 7;
      for (const node of nodes) {
        node.position.set(pose[k]!, pose[k + 1]!, pose[k + 2]!);
        node.rotationQuaternion!.set(pose[k + 3]!, pose[k + 4]!, pose[k + 5]!, pose[k + 6]!);
        k += 7;
      }
      return shown;
    },
    dispose: () => hook.dispose(),
  };
}
