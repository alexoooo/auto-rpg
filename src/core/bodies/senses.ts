import { Quaternion, Vector3 } from "../math/vector.ts";
import type { BodySpec } from "./spec/body.ts";
import type { ObjectSense, SolidSense } from "./object-senses.ts";
/**
 * **What a mind is told of the world**, each control step, as the last solver step left it. A
 * mind's own body is not here: it has that whole (`OwnBody`, `mind.ts`). Everything it knows of
 * another body is in `others`, and nothing of another mind is: not its memory, its command or
 * its orders.
 */
export interface Senses {
  /** Seconds of the world's clock. */
  readonly time: number;
  /** The side this body fights on; empty in no fight. */
  readonly side: string;
  /** Whether this body is out of the fight. Its own, so it knows at once, whatever the delay. */
  readonly out: boolean;
  /** Its own life, a fraction of its full life (`Pool.bar`), at once: whole where nothing keeps its life. */
  readonly life: number;
  /** When the fight's clock started, s of the world's clock: given where `ends` is. */
  readonly begins?: number;
  /** When the fight's clock gives its verdict at the latest, s of the world's clock: absent where no clock ends it. */
  readonly ends?: number;
  /** Every other body the senses carry, as they pass it (`createSenses`): in the order added. */
  readonly others: readonly BodySense[];
  /** Explicitly permitted external objects, including separate equipment and research targets. */
  readonly objects?: readonly ObjectSense[];
  /** Fixed collision geometry explicitly granted by the world's builder. */
  readonly solids?: readonly SolidSense[];
}

/**
 * **Another body, as sensed**: everything physical of it, whether it is still in the fight, and
 * its life as a whole, never a part's hit points. A planner's choice of foe reads `side`, `out` and `centre`
 * (`nearestFoe`, `targets.ts`), and the edge of a foe's reach the spec with what the body holds
 * (`placedReach`); the segments' poses, velocities and spins are what a mind that attacks a moving
 * body, blocks or parries reads (`docs/roadmap.md`, The AI).
 */
export interface BodySense {
  readonly id: string;
  /** Actual observation time; omitted by callers that supply only current readings. */
  readonly time?: number;
  readonly side: string;
  /** What it is built from, with what it holds. */
  readonly spec: BodySpec;
  readonly out: boolean;
  /** Whether it is down by its own body's rule (`PhysicalBody.down`): what anyone who sees it lying sees. */
  readonly down: boolean;
  /** Its life, a fraction of its full life (`Pool.bar`), as late as every reading of it. */
  readonly life: number;
  /** Its centre of mass and that centre's velocity, world. */
  readonly centre: Vector3;
  readonly velocity: Vector3;
  /** Each segment on it (`attachment`), by name, in the order built: a part cut off is no longer the body's. */
  readonly segments: ReadonlyMap<string, SegmentSense>;
}

interface SegmentSense {
  readonly handPose?: import("./spec/body.ts").HandPose;
  /** The segment frame's origin and turn, world: its pose's. */
  readonly position: Vector3;
  readonly rotation: Quaternion;
  /** Its rigid body's centre of mass, with what it holds, world; that centre's velocity; its spin. */
  readonly centre: Vector3;
  readonly velocity: Vector3;
  readonly spin: Vector3;
}

/** A sensed segment's code, where a hand's pose's goes, for a segment off its body (`attachment`). */
export const OFF_BODY = -2;

/** A segment's sense as its shower writes it. */
type ShownSegment = { -readonly [K in keyof SegmentSense]: SegmentSense[K] };

/**
 * **The segments a body is shown by**: a sense for each of `names`, made once (`all`), and the map
 * of those still on the body in the same order; `mark` says whether the i-th is on, and `settle`
 * gives the map, made again only where a mark has changed it.
 */
export function shownSegments(names: readonly string[]) {
  const all = names.map((name): [string, ShownSegment] => [name, { position: new Vector3(), rotation: new Quaternion(), centre: new Vector3(), velocity: new Vector3(), spin: new Vector3() }]);
  const on = new Uint8Array(all.length).fill(1);
  let map: ReadonlyMap<string, SegmentSense> = new Map(all), moved = false;
  return {
    all: all.map(([, sense]) => sense),
    mark(i: number, now: boolean): void { const next = now ? 1 : 0; if (on[i] !== next) { on[i] = next; moved = true; } },
    settle(): ReadonlyMap<string, SegmentSense> {
      if (moved) { map = new Map(all.filter((_, i) => on[i] === 1)); moved = false; }
      return map;
    },
  };
}

/** What a body senses before anything has been read for it: no time, no side, its life whole, nobody. */
export const NOTHING_SENSED: Senses = Object.freeze({ time: 0, side: "", out: false, life: 1, others: Object.freeze([]) });
