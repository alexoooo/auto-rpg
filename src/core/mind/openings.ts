import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../body.ts";
import type { Hand } from "../control/motor.ts";
import { ATTACK_PATH } from "../skills/attack-path.ts";
import { placedReach } from "../skills/strike.ts";
import { frameOf, type BodySpec, type SegmentSpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { add, dot, length, scale, sub } from "../spec/vec.ts";
import type { BodySense } from "./senses.ts";

/** Visible lane ranking search cells: `docs/reference/combat-strikes.md#opening-selection`. */
const OPENINGS = Object.freeze({ prediction: .12, blocked: 2, reachPenalty: 2, handMargin: .5,
  head: 0, upperTrunk: .2, middleTrunk: .4, repeated: 1, elevation: .5 });

/** Exact squared distance between two finite segments, including degenerate and parallel ones. */
export function segmentDistanceSquared(start: Vec3, end: Vec3, otherStart: Vec3, otherEnd: Vec3): number {
  const u = sub(end, start), v = sub(otherEnd, otherStart), w = sub(start, otherStart);
  const a = dot(u, u), b = dot(u, v), c = dot(v, v), d = dot(u, w), e = dot(v, w);
  const clip = (x: number) => Math.max(0, Math.min(1, x));
  const at = (s: number, t: number) => { const q = sub(add(w, scale(u, s)), scale(v, t)); return dot(q, q); };
  let best = Math.min(at(0, c ? clip(e / c) : 0), at(1, c ? clip((e + b) / c) : 0),
    at(a ? clip(-d / a) : 0, 0), at(a ? clip((b - d) / a) : 0, 1));
  const determinant = a * c - b * b;
  if (determinant > 0) {
    const s = (b * e - c * d) / determinant, t = (a * e - b * d) / determinant;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) best = Math.min(best, at(s, t));
  }
  return best;
}

/** Sourced collider centre lines in their segment frames; this cache contains no changing poses. */
const LOCAL = new WeakMap<SegmentSpec, { readonly a: Vec3; readonly b: Vec3; readonly radius: number }>();

function capsule(segment: SegmentSpec) {
  let local = LOCAL.get(segment);
  if (local) return local;
  const shape = segment.shape;
  if (shape.kind !== "capsule" && shape.kind !== "sphere") return null;
  const frame = frameOf(segment);
  const point = (at: Vec3): Vec3 => { const delta = sub(at, frame.origin); return [dot(delta, frame.x), dot(delta, frame.y), dot(delta, frame.z)]; };
  local = Object.freeze({ a: point(shape.kind === "capsule" ? shape.from.value : shape.centre.value),
    b: point(shape.kind === "capsule" ? shape.to.value : shape.centre.value), radius: shape.radius.value });
  LOCAL.set(segment, local); return local;
}

/** A replaceable, bounded geometric selector; reads physical shapes and poses, never opponent policy or health. */
export function openingSelector(spec: BodySpec) {
  const scratch = new Vector3();
  const point = (foe: BodySense, name: string, at: Vec3): Vec3 => {
    const sensed = foe.segments.get(name)!;
    scratch.set(...at).applyRotationQuaternionToRef(sensed.rotation, scratch).addInPlace(sensed.position);
    return [scratch.x, scratch.y, scratch.z];
  };
  return (view: BodyView, foe: BodySense, hand: Hand, blockedSurface: string | null = null) => {
    const handShape = spec.segments.find(s => s.name === `hand.${hand}`)!.shape;
    const margin = (handShape.kind === "capsule" || handShape.kind === "sphere" ? handShape.radius.value : 0) * OPENINGS.handMargin;
    const fist = view.fists[hand].position;
    const observed = view.handFeedback?.[hand]?.point ?? [fist.x, fist.y, fist.z];
    const start: Vec3 = [observed[0], observed[1], observed[2]];
    const obstacles = foe.spec.segments.filter(s => /^hand\.|^forearm\./.test(s.name)).flatMap(segment => {
      const local = capsule(segment);
      return local && foe.segments.has(segment.name) ? [{ a: point(foe, segment.name, local.a), b: point(foe, segment.name, local.b), radius: local.radius + margin }] : [];
    });
    let best: { readonly hand: Hand; readonly target: Vec3; readonly segment: string; readonly blocked: boolean; readonly reach: number; readonly score: number } | null = null;
    for (const name of ["head", "upperTrunk", "middleTrunk"] as const) {
      const segment = foe.spec.segments.find(s => s.name === name), sensed = foe.segments.get(name);
      const local = segment && capsule(segment);
      if (!local || !sensed) continue;
      const a = point(foe, name, local.a), b = point(foe, name, local.b);
      for (const part of [a, scale(add(a, b), 1 / 2), b]) for (const elevation of [-OPENINGS.elevation, 0, OPENINGS.elevation]) {
        const way: Vec3 = [start[0] - part[0], 0, start[2] - part[2]], far = length(way), flatRadius = local.radius * Math.sqrt(1 - elevation * elevation);
        const candidate = far > 0 ? add(part, [way[0] * flatRadius / far, elevation * local.radius, way[2] * flatRadius / far]) : part;
        const axis = sub(b, a), squared = dot(axis, axis);
        const nearest = add(a, scale(axis, squared ? Math.max(0, Math.min(1, dot(sub(candidate, a), axis) / squared)) : 0));
        const normal = sub(candidate, nearest), normalLength = length(normal);
        const front = normalLength > 0 ? add(nearest, scale(normal, local.radius / normalLength)) : candidate;
        const lever = sub(front, [sensed.centre.x, sensed.centre.y, sensed.centre.z]);
        const spin: Vec3 = [sensed.spin.y * lever[2] - sensed.spin.z * lever[1], sensed.spin.z * lever[0] - sensed.spin.x * lever[2],
          sensed.spin.x * lever[1] - sensed.spin.y * lever[0]];
        const target = add(front, scale(add([sensed.velocity.x, sensed.velocity.y, sensed.velocity.z], spin), OPENINGS.prediction));
        const blocked = obstacles.some(o => segmentDistanceSquared(start, target, o.a, o.b) <= o.radius * o.radius);
        const reach = placedReach(spec, hand, target[1] - view.head.y);
        const flat = sub(target, [view.head.x, target[1], view.head.z]);
        const score = OPENINGS[name] + (name === blockedSurface ? OPENINGS.repeated : 0) + (blocked ? OPENINGS.blocked : 0) + OPENINGS.reachPenalty * Math.abs(length(flat) - reach + ATTACK_PATH.windup);
        if (!best || score < best.score) best = { hand, target, segment: name, blocked, reach, score };
      }
    }
    return best;
  };
}
