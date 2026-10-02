/**
 * How upright a body is over the ground it lies or stands on, read from the body alone: the bar a
 * body is down by, and the reading every fight, page and sub-mind takes of it.
 */
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltSegment } from "../build/build-body.ts";
import type { SegmentFrame, ShapeSpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { turnOfToRef } from "./support.ts";

/**
 * How far under the height it is asked to hold a body's centre of mass is when the body is down, m
 * (`docs/reference/rising.md#down`). Set, not swept.
 */
export const FALLEN = 0.25;

/**
 * **How upright a body is, as the body itself can tell**: its centre of mass's height over its
 * lowest point. The ground is level, y up, and a body on it touches it at its lowest point.
 */
interface Uprightness {
  /** The centre of mass's height over the body's lowest point, m, now. */
  height(): number;
  /** The height of the body's lowest point, world, m, now: the ground's level under a body that touches it. */
  lowest(): number;
  /** That height in the reference pose, m: the spec's, whatever pose the body is in when this is made. */
  readonly standing: number;
  /**
   * Whether the body is down: its centre of mass more than `FALLEN` under `asked`, the height its
   * mind asks it to hold, m. Its standing height unless given, and no more than it: a body asked
   * to stand taller than it can is not down for failing to.
   */
  down(asked?: number): boolean;
}

/** A point of a segment's shape, body frame, reference pose, and how far the shape reaches around it, m. */
interface Low {
  readonly at: Vec3;
  readonly radius: number;
}

/** The points a shape's lowest is among, whichever way it is turned, and its fastest when it turns: a capsule's two ends, a sphere's centre, a box's corners, a hull's points. */
export function lowsOf(shape: ShapeSpec, frame: SegmentFrame): Low[] {
  switch (shape.kind) {
    case "capsule": return [{ at: shape.from.value, radius: shape.radius.value }, { at: shape.to.value, radius: shape.radius.value }];
    case "sphere": return [{ at: shape.centre.value, radius: shape.radius.value }];
    case "box": {
      const centre = shape.centre.value, size = shape.size.value, { x, y, z } = frame, lows: Low[] = [];
      for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
        const at = (k: 0 | 1 | 2): number => centre[k] + sx * size[0] * x[k] + sy * size[1] * y[k] + sz * size[2] * z[k];
        lows.push({ at: [at(0), at(1), at(2)], radius: 0 });
      }
      return lows;
    }
    case "hull": return shape.points.map((point) => ({ at: point.value, radius: 0 }));
    default: return unknownShape(shape);
  }
}

function unknownShape(shape: never): never {
  throw new Error(`no lowest point of a ${JSON.stringify((shape as { kind?: unknown }).kind)}`);
}

/** A segment as the reading takes it: its mass, and its centre and its shape's points from its node, in the reference pose's axes. */
interface Part {
  readonly segment: BuiltSegment;
  readonly mass: number;
  readonly centre: Vector3;
  readonly lows: readonly { readonly from: Vector3; readonly radius: number }[];
}

/** `built`'s uprightness. What a hand holds weighs, and is not a point the body lies on. */
export function uprightness(built: BuiltBody): Uprightness {
  let mass = 0, moment = 0, lowest = Infinity;
  const parts: Part[] = [];
  for (const segment of built.segments.values()) {
    const origin = segment.frame.origin, centre = segment.rigid.centre, lows = lowsOf(segment.spec.shape, segment.frame);
    const from = (p: Vec3): Vector3 => new Vector3(p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]);
    mass += segment.rigid.mass;
    moment += segment.rigid.mass * centre[1];
    for (const low of lows) lowest = Math.min(lowest, low.at[1] - low.radius);
    parts.push({ segment, mass: segment.rigid.mass, centre: from(centre), lows: lows.map((low) => ({ from: from(low.at), radius: low.radius })) });
  }
  if (parts.length === 0) throw new Error(`${built.spec.model} has no segment to stand on`);
  const standing = moment / mass - lowest;
  const turn = new Quaternion(), at = new Vector3();
  /** The centre of mass's height, world, and the lowest point's, read now. */
  const levels = { centre: 0, low: 0 };
  const read = (): typeof levels => {
    let high = 0, low = Infinity;
    for (const part of parts) {
      const node = part.segment.node;
      turnOfToRef(part.segment, turn);
      high += part.mass * (part.centre.applyRotationQuaternionToRef(turn, at).y + node.position.y);
      for (const point of part.lows) low = Math.min(low, point.from.applyRotationQuaternionToRef(turn, at).y + node.position.y - point.radius);
    }
    levels.centre = high / mass;
    levels.low = low;
    return levels;
  };
  const height = (): number => {
    const { centre, low } = read();
    return centre - low;
  };
  return {
    height, standing,
    lowest: () => read().low,
    down: (asked = standing) => Math.min(asked, standing) - height() > FALLEN,
  };
}
