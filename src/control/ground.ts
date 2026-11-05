/**
 * How upright a body is over the ground it lies or stands on, read from the body alone: the rule a
 * fight reads a body down by (`fallen`), the bar a mind reads its own body by (`down`), and the
 * readings every page and sub-mind takes of it.
 */
import { Vector3, Quaternion } from "../core/math/vector.ts";
import type { DownSpec, ConfigurationName, SegmentFrame, ShapeSpec } from "../core/bodies/spec/body.ts";
import type { Vec3 } from "../core/bodies/spec/quantity.ts";
import { partsOn, turnOfToRef } from "../core/bodies/read-motion.ts";
import type { ReadBody, ReadSegment } from "../core/bodies/read-body.ts";

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
   * Whether the body is down, by its spec's rule (`DownSpec`). Under `asked`, `asked` is the
   * height its mind asks it to hold, m: its standing height unless given, and no more than it, so a
   * body asked to stand taller than it can is not down for failing to. `posed`, a body held in a
   * supported pose is asked no lower than `fallen` under its standing height. `low` asks nothing.
   */
  down(asked?: number, posed?: boolean): boolean;
  /**
   * Whether the body is down as a fight reads it, by its spec's rule (`DownSpec`) of the body
   * alone: `down` at its standing height, or, under `touch`, a segment but its bearers at the ground.
   */
  fallen(): boolean;
  /**
   * How far over the body's lowest point the lowest point of its segments but `except` is, m, now:
   * a body that touches the ground with those alone holds the rest this far clear of it.
   */
  clearance(except: ReadonlySet<ReadSegment>): number;
}

/** `spec`'s rule of when `built` is down, its standing height `standing` and its height read now by `height`. */
function downRule(built: ReadBody, spec: DownSpec, standing: number, height: () => number): Uprightness["down"] {
  switch (spec.kind) {
    case "asked": case "touch": {
      const fallen = spec.fallen.value;
      return (asked = standing, posed = false) => Math.min(posed ? Math.max(asked, standing - fallen) : asked, standing) - height() > fallen;
    }
    case "low": {
      const root = built.segments.get(spec.root);
      if (!root) throw new Error(`${built.spec.model} has no ${spec.root} to read its tilt by`);
      const least = spec.up.value, low = standing * spec.height.value;
      const turn = new Quaternion(), up = new Vector3(), vertical = new Vector3(0, 1, 0);
      return () => {
        turnOfToRef(root, turn);
        vertical.applyRotationQuaternionToRef(turn, up);
        return up.y < least || height() < low;
      };
    }
    default: return unknownDown(spec);
  }
}

/** `spec`'s rule of when a fight reads `built` down, from its own `down` and its `clearance`. */
function fallenRule(built: ReadBody, spec: DownSpec, down: Uprightness["down"], clearance: Uprightness["clearance"]): Uprightness["fallen"] {
  switch (spec.kind) {
    case "asked": case "low": return () => down();
    case "touch": {
      const bearers = new Set(spec.bearers.map((name) => {
        const segment = built.segments.get(name);
        if (!segment) throw new Error(`${built.spec.model} has no ${name} to bear on`);
        return segment;
      }));
      const within = spec.within.value;
      return () => clearance(bearers) < within;
    }
    default: return unknownDown(spec);
  }
}

function unknownDown(spec: never): never {
  throw new Error(`no down rule of a ${JSON.stringify((spec as { kind?: unknown }).kind)}`);
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

/**
 * A segment as the reading takes it: its mass, and its centre and its shape's points from its pose,
 * in the reference pose's axes, each point four numbers: where, and how far its shape reaches around it.
 */
interface Part {
  readonly segment: ReadSegment;
  readonly mass: number;
  readonly centre: Vector3;
  readonly lows: Float64Array;
}

/** The height of (`vx`, `vy`, `vz`) turned by (`qx`, `qy`, `qz`, `qw`): the y `Vector3.applyRotationQuaternionToRef` writes, its sums in its order. */
function turnedY(qx: number, qy: number, qz: number, qw: number, vx: number, vy: number, vz: number): number {
  const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
  return vy + qw * ty + qz * tx - qx * tz;
}

/** Numbers a part's pose is kept in (`readUprightness`): its position and turn. */
const POSE = 7;

/**
 * Each body's uprightness, by its first segment's position: a body and its mind's read view of it
 * read the same poses, rest turns and rigid bodies, and share that vector, so the two have one. It
 * reads the body as it is when asked, keeping only the pose its last reading answers.
 */
const uprights = new WeakMap<object, Uprightness>();

/** `built`'s uprightness. What a hand holds weighs, and is not a point the body lies on. */
export function uprightness(built: ReadBody): Uprightness {
  const first = built.segments.values().next().value;
  if (!first) throw new Error(`${built.spec.model} has no segment to stand on`);
  let found = uprights.get(first.pose.position);
  if (!found) uprights.set(first.pose.position, found = readUprightness(built));
  return found;
}

function readUprightness(built: ReadBody): Uprightness {
  let mass = 0, moment = 0, lowest = Infinity;
  const parts: Part[] = [];
  for (const segment of built.segments.values()) {
    const origin = segment.frame.origin, centre = segment.rigid.centre, lows = lowsOf(segment.spec.shape, segment.frame);
    const from = (p: Vec3): Vector3 => new Vector3(p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]);
    const packed = (points: readonly Low[]): Float64Array => {
      const made = new Float64Array(4 * points.length);
      points.forEach((low, k) => { made[4 * k] = low.at[0] - origin[0]; made[4 * k + 1] = low.at[1] - origin[1]; made[4 * k + 2] = low.at[2] - origin[2]; made[4 * k + 3] = low.radius; });
      return made;
    };
    mass += segment.rigid.mass;
    moment += segment.rigid.mass * centre[1];
    for (const low of lows) lowest = Math.min(lowest, low.at[1] - low.radius);
    const base = packed(lows);
    const poses = segment.poses && Object.fromEntries((Object.keys(segment.poses) as ConfigurationName[]).map(name =>
      [name, packed(lowsOf(segment.poses![name].shape, segment.frame))]));
    parts.push({ segment, mass: segment.rigid.mass, centre: from(centre),
      get lows() { return poses && segment.configuration ? poses[segment.configuration.applied]! : base; } });
  }
  if (parts.length === 0) throw new Error(`${built.spec.model} has no segment to stand on`);
  const standing = moment / mass - lowest;
  const turn = new Quaternion();
  const down = downRule(built, built.spec.down, standing, () => height());
  /** The centre of mass's height, world, and the lowest point's, read now. */
  const levels = { centre: 0, low: 0 };
  /**
   * The pose `levels` were read in: each part's position and turn, seven numbers a part,
   * and the points it read (`Part.lows`, by its hand's pose). A read in that pose answers them again.
   */
  const pose = new Float64Array(parts.length * POSE), lows: (Float64Array | null)[] = parts.map(() => null);
  /** The parts on the body as `levels` were read (`partsOn`), and which of `parts` are off it: a part cut off is not the body's. */
  const on = partsOn(built);
  let kept = on();
  const off = new Uint8Array(parts.length);
  /** Each part's lowest point, world, as `levels` were read. */
  const partLow = new Float64Array(parts.length);
  const samePose = (): boolean => {
    for (let k = 0, i = 0; k < parts.length; k++, i += POSE) {
      const part = parts[k]!, p = part.segment.pose.position, q = part.segment.pose.rotation;
      if (lows[k] !== part.lows || pose[i] !== p.x || pose[i + 1] !== p.y || pose[i + 2] !== p.z
        || pose[i + 3] !== q.x || pose[i + 4] !== q.y || pose[i + 5] !== q.z || pose[i + 6] !== q.w) return false;
    }
    return true;
  };
  const read = (): typeof levels => {
    const now = on();
    if (now !== kept) {
      kept = now;
      for (let k = 0; k < parts.length; k++) off[k] = now.segments.includes(parts[k]!.segment) ? 0 : 1;
      pose.fill(NaN);
    }
    if (samePose()) return levels;
    let high = 0, low = Infinity;
    for (let k = 0, i = 0; k < parts.length; k++, i += POSE) {
      if (off[k]) continue;
      const part = parts[k]!, { position: p, rotation: q } = part.segment.pose, points = part.lows;
      pose[i] = p.x; pose[i + 1] = p.y; pose[i + 2] = p.z; pose[i + 3] = q.x; pose[i + 4] = q.y; pose[i + 5] = q.z; pose[i + 6] = q.w;
      lows[k] = points;
      turnOfToRef(part.segment, turn);
      const qx = turn.x, qy = turn.y, qz = turn.z, qw = turn.w, c = part.centre;
      high += part.mass * (turnedY(qx, qy, qz, qw, c.x, c.y, c.z) + p.y);
      let own = Infinity;
      for (let n = 0; n < points.length; n += 4) own = Math.min(own, turnedY(qx, qy, qz, qw, points[n]!, points[n + 1]!, points[n + 2]!) + p.y - points[n + 3]!);
      partLow[k] = own;
      low = Math.min(low, own);
    }
    levels.centre = high / kept.mass;
    levels.low = low;
    return levels;
  };
  const height = (): number => {
    const { centre, low } = read();
    return centre - low;
  };
  // A segment of `except` is the part of its spec: a body's and its read view's segments are two objects of one spec.
  const excepted = (part: Part, except: ReadonlySet<ReadSegment>): boolean => {
    for (const segment of except) if (segment.spec === part.segment.spec) return true;
    return false;
  };
  const clearance: Uprightness["clearance"] = (except) => {
    const { low } = read();
    let rest = Infinity;
    for (let k = 0; k < parts.length; k++) if (!off[k] && !excepted(parts[k]!, except)) rest = Math.min(rest, partLow[k]!);
    return rest - low;
  };
  return {
    height, standing,
    lowest: () => read().low,
    down, clearance,
    fallen: fallenRule(built, built.spec.down, down, clearance),
  };
}
