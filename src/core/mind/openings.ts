import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../body.ts";
import type { Hand } from "../control/motor.ts";
import { attackPath, ATTACK_PATH, type AttackTuning } from "../skills/attack-path.ts";
import { pointPath } from "../control/point-path.ts";
import { intoFrameToRef } from "../control/kinematics.ts";
import type { CombatAction } from "./intent.ts";
import { aimOf } from "../skills/strikes.ts";
import { placedReach } from "../skills/strike.ts";
import { frameOf, type BodySpec, type SegmentSpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { add, dot, length, scale, sub } from "../spec/vec.ts";
import type { BodySense } from "./senses.ts";
import { convexHull } from "../spec/hull.ts";
import { hullEntry } from "./hull-entry.ts";

/** Visible lane ranking search cells: `docs/reference/combat-strikes.md#opening-selection`. */
const OPENINGS = Object.freeze({ prediction: .12, blocked: 2, reachPenalty: 2, handMargin: .5,
  head: 0, upperTrunk: .2, middleTrunk: .4, repeated: 1, elevation: .5, hookReserve: .15, hookCost: .1, pathSamples: 4 });

/** Immutable target preferences for development searches over the same geometry and executor. */
export type OpeningTuning = { readonly [K in "head" | "upperTrunk" | "middleTrunk" | "blocked" | "reachPenalty" | "repeated"]?: number };

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
const POLYS = new WeakMap<SegmentSpec, { readonly planes: ReturnType<typeof convexHull>["planes"]; readonly middle: Vec3; readonly extent: Vec3 }>();

function polyhedron(segment: SegmentSpec) {
  const shape = segment.shape;
  if(shape.kind!=="hull"&&shape.kind!=="box")return null;
  const found = POLYS.get(segment);if(found)return found;
  const frame = frameOf(segment);
  const local = (at:Vec3):Vec3 => {const d=sub(at,frame.origin);return [dot(d,frame.x),dot(d,frame.y),dot(d,frame.z)];};
  const vertices: Vec3[] = shape.kind==="hull"?shape.points.map(p=>local(p.value)):[];
  if(shape.kind==="box")for(const x of [-1/2,1/2])for(const y of [-1/2,1/2])for(const z of [-1/2,1/2])
    vertices.push(local(add(shape.centre.value,add(scale(frame.x,x*shape.size.value[0]),add(scale(frame.y,y*shape.size.value[1]),scale(frame.z,z*shape.size.value[2]))))));
  const low = [0,1,2].map(k=>Math.min(...vertices.map(p=>p[k]!))),high = [0,1,2].map(k=>Math.max(...vertices.map(p=>p[k]!)));
  const middle = scale(vertices.reduce((a,p)=>add(a,p),[0,0,0] as Vec3),1/vertices.length);
  const result = Object.freeze({planes:convexHull(vertices).planes,middle,extent:sub(high as unknown as Vec3,low as unknown as Vec3)});
  POLYS.set(segment,result);return result;
}

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

/** A vertical ray onto the actual sensed surface, suitable for attacks over a grounded trunk. */
export function upperSurface(foe: BodySense, name: string, from?: Vec3): Vec3 | null {
  const segment=foe.spec.segments.find(s=>s.name===name),sensed=foe.segments.get(name);
  if(!segment||!sensed)return null;
  const poly=polyhedron(segment),round=capsule(segment),scratch=new Vector3(),inverse=new Quaternion();
  const world=(p:Vec3):Vec3=>{scratch.set(...p).applyRotationQuaternionToRef(sensed.rotation,scratch).addInPlace(sensed.position);return [scratch.x,scratch.y,scratch.z];};
  if(round){const a=world(round.a),b=world(round.b),top=a[1]>=b[1]?a:b;return [top[0],top[1]+round.radius,top[2]];}
  if(!poly)return null;
  let toward=poly.middle;
  if(from) {
    scratch.set(...from).subtractInPlace(sensed.position).applyRotationQuaternionToRef(Quaternion.InverseToRef(sensed.rotation,inverse),scratch);
    const local=[scratch.x,scratch.y,scratch.z];
    toward=poly.middle.map((v,k)=>v+(local[k]!>v?1:local[k]!<v?-1:0)*OPENINGS.elevation*poly.extent[k]!/2) as unknown as Vec3;
  }
  const middle=world(toward);
  scratch.set(middle[0],middle[1]+foe.spec.stature.value,middle[2]).subtractInPlace(sensed.position)
    .applyRotationQuaternionToRef(Quaternion.InverseToRef(sensed.rotation,inverse),scratch);
  const entry=hullEntry(poly.planes,[scratch.x,scratch.y,scratch.z],toward);
  return entry?world(entry):null;
}

/** A replaceable, bounded geometric selector; reads physical shapes and poses, never opponent policy or health. */
export function openingSelector(spec: BodySpec, tuning: OpeningTuning = {}, paths: AttackTuning = ATTACK_PATH) {
  const settings = { ...OPENINGS, ...tuning };
  const scratch = new Vector3(), inverse = new Quaternion();
  const point = (foe: BodySense, name: string, at: Vec3): Vec3 => {
    const sensed = foe.segments.get(name)!;
    scratch.set(...at).applyRotationQuaternionToRef(sensed.rotation, scratch).addInPlace(sensed.position);
    return [scratch.x, scratch.y, scratch.z];
  };
  return (view: BodyView, foe: BodySense, hand: Hand, blockedSurface: string | null = null, repertoire: "linear" | "mixed" = "linear") => {
    const handShape = spec.segments.find(s => s.name === `hand.${hand}`)!.shape;
    const margin = (handShape.kind === "capsule" || handShape.kind === "sphere" ? handShape.radius.value : 0) * OPENINGS.handMargin;
    const fist = view.fists[hand].position;
    const observed = view.handFeedback?.[hand]?.point ?? [fist.x, fist.y, fist.z];
    const start: Vec3 = [observed[0], observed[1], observed[2]];
    const obstacles = foe.spec.segments.filter(s => /^hand\.|^forearm\./.test(s.name)).flatMap(segment => {
      const local = capsule(segment);
      return local && foe.segments.has(segment.name) ? [{ a: point(foe, segment.name, local.a), b: point(foe, segment.name, local.b), radius: local.radius + margin }] : [];
    });
    let best: { readonly hand: Hand; readonly target: Vec3; readonly segment: string; readonly family: CombatAction["family"]; readonly blocked: boolean; readonly reach: number; readonly score: number } | null = null;
    let families: readonly CombatAction["family"][];
    switch (repertoire) {
      case "linear": families = ["straight"]; break;
      case "mixed": families = ["straight", "hook"]; break;
      default: { const never: never = repertoire; throw new Error(`unknown repertoire ${never}`); }
    }
    for (const name of ["head", "upperTrunk", "middleTrunk"] as const) {
      const segment = foe.spec.segments.find(s => s.name === name), sensed = foe.segments.get(name);
      const local = segment && capsule(segment), poly = segment && polyhedron(segment);
      if ((!local&&!poly) || !sensed) continue;
      const fronts: Vec3[] = [];
      if(poly) {
        scratch.set(...start).subtractInPlace(sensed.position).applyRotationQuaternionToRef(Quaternion.InverseToRef(sensed.rotation,inverse),scratch);
        const from:Vec3 = [scratch.x,scratch.y,scratch.z];
        for(const vertical of [-OPENINGS.elevation,0,OPENINGS.elevation])for(const lateral of [-OPENINGS.elevation,0,OPENINGS.elevation]) {
          const toward=add(poly.middle,[lateral*poly.extent[0]/2,vertical*poly.extent[1]/2,0]);
          const entry=hullEntry(poly.planes,from,toward);if(entry)fronts.push(point(foe,name,entry));
        }
      }
      if(local) {
       const a = point(foe, name, local.a), b = point(foe, name, local.b);
       for (const part of [a, scale(add(a, b), 1 / 2), b]) for (const elevation of [-OPENINGS.elevation, 0, OPENINGS.elevation]) {
        const way: Vec3 = [start[0] - part[0], 0, start[2] - part[2]], far = length(way), flatRadius = local.radius * Math.sqrt(1 - elevation * elevation);
        const candidate = far > 0 ? add(part, [way[0] * flatRadius / far, elevation * local.radius, way[2] * flatRadius / far]) : part;
        const axis = sub(b, a), squared = dot(axis, axis);
        const nearest = add(a, scale(axis, squared ? Math.max(0, Math.min(1, dot(sub(candidate, a), axis) / squared)) : 0));
        const normal = sub(candidate, nearest), normalLength = length(normal);
        const front = normalLength > 0 ? add(nearest, scale(normal, local.radius / normalLength)) : candidate;
        fronts.push(front);
       }
      }
      for(const front of fronts) {
        const lever = sub(front, [sensed.centre.x, sensed.centre.y, sensed.centre.z]);
        const spin: Vec3 = [sensed.spin.y * lever[2] - sensed.spin.z * lever[1], sensed.spin.z * lever[0] - sensed.spin.x * lever[2],
          sensed.spin.x * lever[1] - sensed.spin.y * lever[0]];
        const target = add(front, scale(add([sensed.velocity.x, sensed.velocity.y, sensed.velocity.z], spin), OPENINGS.prediction + Math.max(0, view.time - (foe.time ?? view.time))));
        const armReach = placedReach(spec, hand, target[1] - view.head.y);
        const flat = sub(target, [view.head.x, target[1], view.head.z]);
        for (const family of families) {
          const reach = Math.max(0, armReach - (family === "hook" ? settings.hookReserve : 0));
          let blocked: boolean;
          if (repertoire === "linear") blocked = obstacles.some(o => segmentDistanceSquared(start, target, o.a, o.b) <= o.radius * o.radius);
          else {
            intoFrameToRef(view.root,target,scratch);const end: Vec3 = [scratch.x,scratch.y,scratch.z];
            const p = view.points[hand][aimOf(spec,hand)]!, path = attackPath([p.x,p.y,p.z],end,hand,family,paths);
            const world = (at: Vec3): Vec3 => { scratch.set(...at).applyRotationQuaternionToRef(view.root.rotation,scratch).addInPlace(view.root.position);return [scratch.x,scratch.y,scratch.z]; };
            let previous = world(path.chamber);blocked = false;
            for(let sample=1;sample<=settings.pathSamples;sample++) {
              const at = pointPath({position:path.chamber,velocity:[0,0,0]},end,path.seconds*sample/settings.pathSamples,path.seconds,path.contactVelocity,path.curve);
              const next = world(at.target);
              if(obstacles.some(o=>segmentDistanceSquared(previous,next,o.a,o.b)<=o.radius*o.radius)){blocked=true;break;}
              previous = next;
            }
          }
          const score = settings[name] + (name === blockedSurface ? settings.repeated : 0) + (blocked ? settings.blocked : 0)
            + settings.reachPenalty * Math.abs(length(flat) - reach + paths.windup) + (family === "hook" ? settings.hookCost : 0);
          if (!best || score < best.score) best = { hand, target, segment: name, family, blocked, reach, score };
        }
      }
    }
    return best;
  };
}
