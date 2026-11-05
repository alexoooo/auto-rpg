import type { HandPose } from "../../core/bodies/spec/body.ts";
import { handPoseCode } from "../../core/bodies/build/hand-poses.ts";

/**
 * **A world's step as a worker sends it**: one `Float64Array` a step, its head, then each body of
 * the roster in its order, its head then each segment in its built order (`RosterBody.segments`).
 *
 * - The frame's head (`FRAME_HEAD`): the world's time, s; its steps; how fast it plays, world seconds
 *   a real second over the last half second (1 in real time, less in slow motion); the step's cost
 *   in the worker, ms.
 * - A body's head (`BODY_HEAD`): its life, a fraction; 1 when it is down, else 0; 1 when it is out,
 *   else 0; its centre of mass, world, m.
 * - A segment's row (`SEGMENT_ROW`): its pose's position, world, m, and rotation, x, y, z, w, as the
 *   step left them; its hand's applied pose encoded by `handPoseCode`, or -1 for a segment that
 *   is no posable hand; its toes' bend, rad, 0 for a segment with none; 1 while it is on its body
 *   (`attachment`), 0 once it is cut off.
 */

export const FRAME_HEAD = 4;
export const BODY_HEAD = 6;
export const SEGMENT_ROW = 10;

/** A body of a worker's world as the page is told of it once: its id, its segments in built order, and what the page makes its spec from. */
export interface RosterBody<Card = unknown> {
  readonly id: string;
  readonly segments: readonly string[];
  readonly card: Card;
}

/** Where each body of `roster` starts in a frame, and the frame's length. */
export function frameLayout(roster: readonly RosterBody[]): { readonly offsets: readonly number[]; readonly length: number } {
  const offsets: number[] = [];
  let at = FRAME_HEAD;
  for (const body of roster) { offsets.push(at); at += BODY_HEAD + SEGMENT_ROW * body.segments.length; }
  return { offsets, length: at };
}

/** A body as a frame is packed from: its segments' nodes and hands, and its life, state and centre. */
export interface FramedBody {
  readonly segments: ReadonlyMap<string, {
    readonly pose: { readonly position: { readonly x: number; readonly y: number; readonly z: number };
      readonly rotation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number } };
    readonly handPose?: { readonly applied: HandPose };
    readonly toes?: { readonly bend: number };
  }>;
  /** Whether its segment `name` is on it (`attachment`). */
  attached(name: string): boolean;
  life(): number;
  down(): boolean;
  out(): boolean;
  /** Its centre of mass, world, m. */
  centre(): { readonly x: number; readonly y: number; readonly z: number };
}

/** The frame of `bodies` as they stand at `time` after `steps`: speed and cost are left 0 for the caller. */
export function packFrame(bodies: readonly FramedBody[], length: number, time: number, steps: number): Float64Array {
  const frame = new Float64Array(length);
  frame[0] = time; frame[1] = steps;
  let at = FRAME_HEAD;
  for (const body of bodies) {
    const centre = body.centre();
    frame[at] = body.life(); frame[at + 1] = body.down() ? 1 : 0; frame[at + 2] = body.out() ? 1 : 0;
    frame[at + 3] = centre.x; frame[at + 4] = centre.y; frame[at + 5] = centre.z;
    at += BODY_HEAD;
    for (const [name, segment] of body.segments) {
      const p = segment.pose.position, q = segment.pose.rotation;
      frame[at] = p.x; frame[at + 1] = p.y; frame[at + 2] = p.z;
      frame[at + 3] = q.x; frame[at + 4] = q.y; frame[at + 5] = q.z; frame[at + 6] = q.w;
      frame[at + 7] = handPoseCode(segment.handPose?.applied);
      frame[at + 8] = segment.toes ? segment.toes.bend : 0;
      frame[at + 9] = body.attached(name) ? 1 : 0;
      at += SEGMENT_ROW;
    }
  }
  if (at !== length) throw new Error(`a frame of ${at} numbers does not fit its roster's ${length}`);
  return frame;
}
