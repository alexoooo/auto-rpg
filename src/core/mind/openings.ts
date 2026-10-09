import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../body.ts";
import { attackPath, ATTACK_PATH, type AttackTuning } from "../skills/attack-path.ts";
import { pointPath } from "../control/point-path.ts";
import { intoFrameToRef } from "../control/kinematics.ts";
import type { BlowAttack, BlowFamily } from "./intent.ts";
import { aimOf } from "../skills/strikes.ts";
import { placedReach } from "../skills/strike.ts";
import { type Side, frameOf, type BodySpec, type SegmentSpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { add, dot, length, scale, sub } from "../spec/vec.ts";
import type { BodySense } from "./senses.ts";
import { convexHull } from "../spec/hull.ts";
import { hullEntry } from "./hull-entry.ts";

/** Visible lane ranking search cells: `docs/reference/combat-strikes.md#opening-selection`. */
const OPENINGS = Object.freeze({ prediction: .12, blocked: 2, reachPenalty: 2, handMargin: .5,
  head: 0, upperTrunk: .2, middleTrunk: .4, overhand: 0, repeated: 1, elevation: .5,
  // Optional side-surface rays: `docs/reference/combat-strikes.md#lateral-head-surfaces`.
  headLateral: 0, hookReserve: .15, hookCost: .1, pathSamples: 4,
  // Upward close-range development cells: `docs/reference/combat-uppercut.md`.
  uppercut: .1, uppercutReserve: .25 });

/** What choosing `family` asks of a blow: the reach it keeps back, its score, and the vertical sense of its contact direction, 0 for none. */
function familyTerms(family: BlowFamily, settings: Readonly<Record<"hookReserve" | "hookCost" | "overhand" | "uppercut" | "uppercutReserve", number>>): { readonly reserve: number; readonly cost: number; readonly vertical: -1 | 0 | 1 } {
  switch (family) {
    case "straight": case "cross": case "downward": return { reserve: 0, cost: 0, vertical: 0 };
    case "hook": return { reserve: settings.hookReserve, cost: settings.hookCost, vertical: 0 };
    case "overhand": return { reserve: 0, cost: settings.overhand, vertical: -1 };
    case "uppercut": return { reserve: settings.uppercutReserve, cost: settings.uppercut, vertical: 1 };
    default: { const never: never = family; throw new Error(`unknown attack family ${never}`); }
  }
}

/** Immutable target preferences for development searches over the same geometry and executor. */
export type OpeningTuning = { readonly [K in "head" | "upperTrunk" | "middleTrunk" | "blocked" | "reachPenalty" | "repeated" | "overhand" | "headLateral" | "hookCost" | "uppercut" | "uppercutReserve"]?: number };

/** Opening scores are finite; the lateral surface fraction stays on the sensed collider. */
export function validOpeningTuning(tuning: OpeningTuning): boolean {
  const lateral = tuning.headLateral ?? OPENINGS.headLateral;
  return Object.values(tuning).every(Number.isFinite) && lateral >= 0 && lateral <= 1
    && (tuning.uppercutReserve ?? OPENINGS.uppercutReserve) >= 0;
}

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
const LOCAL = new WeakMap<SegmentSpec, { readonly a: Vec3; readonly b: Vec3; readonly radius: number; readonly bound: number }>();
const POLYS = new WeakMap<SegmentSpec, { readonly planes: ReturnType<typeof convexHull>["planes"]; readonly vertices: readonly Vec3[]; readonly middle: Vec3; readonly extent: Vec3; readonly bound: number }>();

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
  const bound = Math.max(...vertices.map(p => length(p)));
  const result = Object.freeze({bound,planes:convexHull(vertices).planes,vertices:Object.freeze(vertices),middle,extent:sub(high as unknown as Vec3,low as unknown as Vec3)});
  POLYS.set(segment,result);return result;
}

function capsule(segment: SegmentSpec) {
  let local = LOCAL.get(segment);
  if (local) return local;
  const shape = segment.shape;
  if (shape.kind !== "capsule" && shape.kind !== "sphere") return null;
  const frame = frameOf(segment);
  const point = (at: Vec3): Vec3 => { const delta = sub(at, frame.origin); return [dot(delta, frame.x), dot(delta, frame.y), dot(delta, frame.z)]; };
  const a = point(shape.kind === "capsule" ? shape.from.value : shape.centre.value), b = point(shape.kind === "capsule" ? shape.to.value : shape.centre.value);
  local = Object.freeze({ a, b, radius: shape.radius.value, bound: Math.max(length(a), length(b)) + shape.radius.value });
  LOCAL.set(segment, local); return local;
}

/** A vertical ray onto the actual sensed surface, suitable for attacks over a grounded trunk. */
export function upperSurface(foe: BodySense, name: string, from?: Vec3): Vec3 | null {
  return verticalSurface(foe, name, from, 1);
}

/** A ray from below onto the actual collider, for an upward attack. */
export function lowerSurface(foe: BodySense, name: string, from?: Vec3): Vec3 | null {
  return verticalSurface(foe, name, from, -1);
}

/** An exposed capsule side toward an observed point, with its centre line sampled at a world height. */
export function capsuleSurfaceAtHeight(foe: BodySense, name: string, from: Vec3, height: number): Vec3 | null {
  const segment = foe.spec.segments.find(s => s.name === name), sensed = foe.segments.get(name);
  const round = segment && capsule(segment);
  if (!round || !sensed || !Number.isFinite(height) || !from.every(Number.isFinite)) return null;
  const world = (p: Vec3) => new Vector3(...p).applyRotationQuaternionToRef(sensed.rotation, new Vector3()).addInPlace(sensed.position);
  const a = world(round.a), b = world(round.b), axis = b.subtract(a), squared = axis.lengthSquared();
  if (height < Math.min(a.y, b.y) - round.radius || height > Math.max(a.y, b.y) + round.radius) return null;
  const fraction = b.y === a.y ? 1 / 2 : Math.max(0, Math.min(1, (height - a.y) / (b.y - a.y)));
  const centre = a.add(axis.scale(fraction)), normal = new Vector3(...from).subtractInPlace(centre);
  const axial = Vector3.Dot(normal, axis);
  if (squared && (fraction > 0 && fraction < 1 || fraction === 0 && axial > 0 || fraction === 1 && axial < 0))
    normal.subtractInPlace(axis.scale(axial / squared));
  if (!normal.lengthSquared()) return null;
  const surface = centre.add(normal.normalize().scaleInPlace(round.radius));
  return [surface.x, surface.y, surface.z];
}

/** The near face of an observed collider, including limbs below a standing opponent's trunk. */
export function nearSurface(foe: BodySense, name: string, from: Vec3): Vec3 | null {
  const segment = foe.spec.segments.find(s => s.name === name), sensed = foe.segments.get(name);
  if (!segment || !sensed) return null;
  const scratch = new Vector3(), inverse = new Quaternion();
  scratch.set(...from).subtractInPlace(sensed.position).applyRotationQuaternionToRef(Quaternion.InverseToRef(sensed.rotation, inverse), scratch);
  const start: Vec3 = [scratch.x, scratch.y, scratch.z], round = capsule(segment), poly = polyhedron(segment);
  let at: Vec3 | null = null;
  if (round) {
    const axis = sub(round.b, round.a), squared = dot(axis, axis);
    const centre = add(round.a, scale(axis, squared ? Math.max(0, Math.min(1, dot(sub(start, round.a), axis) / squared)) : 0));
    const normal = sub(start, centre), size = length(normal);
    at = size ? add(centre, scale(normal, round.radius / size)) : add(centre, [round.radius, 0, 0]);
  } else if (poly) at = hullEntry(poly.planes, start, poly.middle);
  if (!at) return null;
  scratch.set(...at).applyRotationQuaternionToRef(sensed.rotation, scratch).addInPlace(sensed.position);
  return [scratch.x, scratch.y, scratch.z];
}

/** Immutable natural collider descriptions use the segment's common physical frame. */
const ENTRY_SHAPES = new WeakMap<SegmentSpec, readonly SegmentSpec[]>();

function entryShapes(segment: SegmentSpec): readonly SegmentSpec[] {
  let shapes = ENTRY_SHAPES.get(segment);
  if (!shapes) {
    shapes = Object.freeze([segment, ...(segment.contacts ?? []).map(contact => Object.freeze({ ...segment, shape: contact.shape }))]);
    ENTRY_SHAPES.set(segment, shapes);
  }
  return shapes;
}

/** A point on or inside any natural collider has no fresh exposed approach from there. */
export function surfaceContains(foe: BodySense, name: string, at: Vec3): boolean {
  const segment = foe.spec.segments.find(s => s.name === name), sensed = foe.segments.get(name);
  return !!segment && !!sensed && entryShapes(segment).some(shape => shapeEntry(shape, sensed, at, at) === false);
}

/** First exposed entry into a sensed segment's primary collider or natural contact regions. */
export function surfaceEntry(foe: BodySense, name: string, from: Vec3, to: Vec3): { readonly at: Vec3; readonly normal: Vec3 } | null {
  const segment = foe.spec.segments.find(s => s.name === name), sensed = foe.segments.get(name);
  if (!segment || !sensed) return null;
  let best: { readonly at: Vec3; readonly normal: Vec3 } | null = null, distance = Infinity;
  for (const shape of entryShapes(segment)) {
    const hit = shapeEntry(shape, sensed, from, to);
    if (hit === false) return null;
    if (!hit) continue;
    const dx = hit.at[0] - from[0], dy = hit.at[1] - from[1], dz = hit.at[2] - from[2], squared = dx * dx + dy * dy + dz * dz;
    if (squared < distance) { best = hit; distance = squared; }
  }
  return best;
}

/** An internal start has no exposed entry into the compound segment. */
function shapeEntry(segment: SegmentSpec, sensed: { readonly position: Vector3; readonly rotation: Quaternion }, from: Vec3, to: Vec3): { readonly at: Vec3; readonly normal: Vec3 } | false | null {
  const round = capsule(segment), poly = polyhedron(segment), bound = round?.bound ?? poly?.bound;
  if (bound === undefined) return null;
  const x = from[0] - sensed.position.x, y = from[1] - sensed.position.y, z = from[2] - sensed.position.z;
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  const reach = bound + Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (x * x + y * y + z * z > reach * reach) return null;
  const scratch = new Vector3(), inverse = Quaternion.Inverse(sensed.rotation);
  const local = (p: Vec3): Vec3 => {
    scratch.set(...p).subtractInPlace(sensed.position).applyRotationQuaternionToRef(inverse, scratch);
    return [scratch.x, scratch.y, scratch.z];
  };
  const start = local(from), finish = local(to), direction = sub(finish, start);
  let at: Vec3 | null = null, normal: Vec3 | null = null;
  if (poly) {
    if (poly.planes.every(plane => dot(plane.normal, start) <= plane.offset)) return false;
    at = hullEntry(poly.planes, start, finish);
    if (at) {
      let nearest = -Infinity;
      for (const plane of poly.planes) {
        const distance = dot(plane.normal, at) - plane.offset;
        if (distance > nearest) { nearest = distance; normal = plane.normal; }
      }
    }
  } else if (round) {
    const axis = sub(round.b, round.a), squared = dot(axis, axis), offset = sub(start, round.a);
    const projection = squared ? Math.max(0, Math.min(1, dot(offset, axis) / squared)) : 0;
    const nearest = sub(offset, scale(axis, projection));
    if (dot(nearest, nearest) <= round.radius * round.radius) return false;
    let first = Infinity;
    const roots = (a: number, b: number, c: number) => {
      const determinant = b * b - 4 * a * c;
      return a > 0 && determinant >= 0 ? [(-b - Math.sqrt(determinant)) / (2 * a), (-b + Math.sqrt(determinant)) / (2 * a)] : [];
    };
    const accept = (t: number, centre: Vec3) => {
      if (!(t >= 0 && t <= 1 && t < first)) return;
      const p = add(start, scale(direction, t)), n = sub(p, centre);
      if (!(dot(n, direction) < 0)) return;
      first = t; at = p; normal = scale(n, 1 / length(n));
    };
    if (squared) {
      const along = dot(offset, axis) / squared, speed = dot(direction, axis) / squared;
      const radial = sub(offset, scale(axis, along)), motion = sub(direction, scale(axis, speed));
      for (const t of roots(dot(motion, motion), 2 * dot(radial, motion), dot(radial, radial) - round.radius * round.radius)) {
        const position = along + t * speed;
        if (position >= 0 && position <= 1) accept(t, add(round.a, scale(axis, position)));
      }
    }
    for (const [end, side] of [[round.a, -1], [round.b, 1]] as const) {
      const offset = sub(start, end);
      for (const t of roots(dot(direction, direction), 2 * dot(offset, direction), dot(offset, offset) - round.radius * round.radius)) {
        const position = dot(sub(add(start, scale(direction, t)), end), axis);
        if (!squared || side * position >= 0) accept(t, end);
      }
    }
  }
  if (!at || !normal) return null;
  scratch.set(...at).applyRotationQuaternionToRef(sensed.rotation, scratch).addInPlace(sensed.position);
  const position: Vec3 = [scratch.x, scratch.y, scratch.z];
  scratch.set(...normal).applyRotationQuaternionToRef(sensed.rotation, scratch);
  return { at: position, normal: [scratch.x, scratch.y, scratch.z] };
}

function verticalSurface(foe: BodySense, name: string, from: Vec3 | undefined, sense: 1 | -1): Vec3 | null {
  const segment=foe.spec.segments.find(s=>s.name===name),sensed=foe.segments.get(name);
  if(!segment||!sensed)return null;
  const poly=polyhedron(segment),round=capsule(segment),scratch=new Vector3(),inverse=new Quaternion();
  const world=(p:Vec3):Vec3=>{scratch.set(...p).applyRotationQuaternionToRef(sensed.rotation,scratch).addInPlace(sensed.position);return [scratch.x,scratch.y,scratch.z];};
  if(round){const a=world(round.a),b=world(round.b),top=sense*a[1]>=sense*b[1]?a:b;return [top[0],top[1]+sense*round.radius,top[2]];}
  if(!poly)return null;
  let toward=poly.middle;
  if(from) {
    scratch.set(...from).subtractInPlace(sensed.position).applyRotationQuaternionToRef(Quaternion.InverseToRef(sensed.rotation,inverse),scratch);
    const local=[scratch.x,scratch.y,scratch.z];
    toward=poly.middle.map((v,k)=>v+(local[k]!>v?1:local[k]!<v?-1:0)*OPENINGS.elevation*poly.extent[k]!/2) as unknown as Vec3;
  }
  const middle=world(toward);
  scratch.set(middle[0],middle[1]+sense*foe.spec.stature.value,middle[2]).subtractInPlace(sensed.position)
    .applyRotationQuaternionToRef(Quaternion.InverseToRef(sensed.rotation,inverse),scratch);
  const entry=hullEntry(poly.planes,[scratch.x,scratch.y,scratch.z],toward);
  return entry?world(entry):null;
}

/** The highest point on a sensed collider; a downward policy can choose a reachable edge rather than a central ray. */
export function highestSurface(foe: BodySense, name: string, from?: Vec3): Vec3 | null {
  const segment=foe.spec.segments.find(s=>s.name===name),sensed=foe.segments.get(name);
  if(!segment||!sensed)return null;
  const poly=polyhedron(segment);if(!poly)return upperSurface(foe,name);
  const scratch=new Vector3();let highest:Vec3|null=null;
  const distance=(p:Vec3)=>from?(p[0]-from[0])*(p[0]-from[0])+(p[2]-from[2])*(p[2]-from[2]):0;
  for(const p of poly.vertices){
    scratch.set(...p).applyRotationQuaternionToRef(sensed.rotation,scratch).addInPlace(sensed.position);
    const world:Vec3=[scratch.x,scratch.y,scratch.z];
    if(!highest||world[1]>highest[1]||(world[1]===highest[1]&&distance(world)<distance(highest)))highest=world;
  }
  return highest;
}

/** An opening found: the blow's hand, point and family, and how it ranks. */
interface Opening {
  readonly hand: Side;
  readonly target: Vec3;
  readonly family: BlowFamily;
  readonly direction?: Vec3;
  readonly segment: string;
  readonly blocked: boolean;
  readonly reach: number;
  readonly score: number;
}

/** The blow an opening asks for, along its family's path. */
export function openingAction({ hand, target, family, direction }: Opening): BlowAttack {
  return { kind: "blow", hand, target, path: { family, ...(direction ? { direction } : {}) } };
}

/** A replaceable, bounded geometric selector; reads physical shapes and poses, never opponent policy or health. */
export function openingSelector(spec: BodySpec, tuning: OpeningTuning = {}, paths: AttackTuning = ATTACK_PATH) {
  if (!validOpeningTuning(tuning)) throw new Error("opening preferences must be finite and headLateral must be in [0,1]");
  const settings = { ...OPENINGS, ...tuning };
  /** The preference for a part by its segment's name (`OpeningTuning`'s `head`, `upperTrunk`, `middleTrunk`); none, 0. */
  const preference: Readonly<Record<string, number | undefined>> = settings;
  const headOffsets = settings.headLateral ? [-settings.headLateral, 0, settings.headLateral] : [0];
  const scratch = new Vector3(), inverse = new Quaternion();
  const point = (foe: BodySense, name: string, at: Vec3): Vec3 => {
    const sensed = foe.segments.get(name)!;
    scratch.set(...at).applyRotationQuaternionToRef(sensed.rotation, scratch).addInPlace(sensed.position);
    return [scratch.x, scratch.y, scratch.z];
  };
  return (view: BodyView, foe: BodySense, hand: Side, blockedSurface: string | null = null, repertoire: "linear" | "mixed" | "vertical" | "boxing" = "linear") => {
    const handShape = spec.segments.find(s => s.name === `hand.${hand}`)!.shape;
    const margin = (handShape.kind === "capsule" || handShape.kind === "sphere" ? handShape.radius.value : 0) * OPENINGS.handMargin;
    const fist = view.fists[hand].position;
    const observed = view.effectors[`hand.${hand}`]!.feedback?.point ?? [fist.x, fist.y, fist.z];
    const start: Vec3 = [observed[0], observed[1], observed[2]];
    const obstacles = foe.spec.segments.filter(s => /^hand\.|^forearm\./.test(s.name)).flatMap(segment => {
      const local = capsule(segment);
      return local && foe.segments.has(segment.name) ? [{ a: point(foe, segment.name, local.a), b: point(foe, segment.name, local.b), radius: local.radius + margin }] : [];
    });
    let best: Opening | null = null;
    let families: readonly BlowFamily[];
    switch (repertoire) {
      case "linear": families = ["straight"]; break;
      case "mixed": families = ["straight", "hook"]; break;
      case "vertical": families = ["straight", "hook", "overhand"]; break;
      case "boxing": families = ["straight", "hook", "uppercut"]; break;
      default: { const never: never = repertoire; throw new Error(`unknown repertoire ${never}`); }
    }
    const { high, middle } = foe.spec.marks;
    for (const name of [high, ...middle]) {
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
       for (const part of [a, scale(add(a, b), 1 / 2), b]) for (const elevation of [-OPENINGS.elevation, 0, OPENINGS.elevation])
         for (const lateral of name === high ? headOffsets : [0]) {
        const way: Vec3 = [start[0] - part[0], 0, start[2] - part[2]], far = length(way), flatRadius = local.radius * Math.sqrt(1 - elevation * elevation);
        const c = Math.sqrt(1 - lateral * lateral);
        const candidate = far > 0 ? lateral === 0 ? add(part, [way[0] * flatRadius / far, elevation * local.radius, way[2] * flatRadius / far])
          : add(part, [(way[0] * c + way[2] * lateral) * flatRadius / far, elevation * local.radius, (way[2] * c - way[0] * lateral) * flatRadius / far]) : part;
        const axis = sub(b, a), squared = dot(axis, axis);
        const nearest = add(a, scale(axis, squared ? Math.max(0, Math.min(1, dot(sub(candidate, a), axis) / squared)) : 0));
        const normal = sub(candidate, nearest), normalLength = length(normal);
        const front = normalLength > 0 ? add(nearest, scale(normal, local.radius / normalLength)) : candidate;
        fronts.push(front);
       }
      }
      const top = repertoire === "vertical" ? upperSurface(foe, name, start) : null;
      if (top) fronts.push(top);
      const bottom = repertoire === "boxing" ? lowerSurface(foe, name, start) : null;
      if (bottom) fronts.push(bottom);
      for(const front of fronts) {
        const lever = sub(front, [sensed.centre.x, sensed.centre.y, sensed.centre.z]);
        const spin: Vec3 = [sensed.spin.y * lever[2] - sensed.spin.z * lever[1], sensed.spin.z * lever[0] - sensed.spin.x * lever[2],
          sensed.spin.x * lever[1] - sensed.spin.y * lever[0]];
        const target = add(front, scale(add([sensed.velocity.x, sensed.velocity.y, sensed.velocity.z], spin), OPENINGS.prediction + Math.max(0, view.time - (foe.time ?? view.time))));
        const armReach = placedReach(spec, hand, target[1] - view.head.y);
        const flat = sub(target, [view.head.x, target[1], view.head.z]);
        for (const family of families) {
          if ((family === "overhand") !== (front === top)) continue;
          if ((family === "uppercut") !== (front === bottom)) continue;
          const terms = familyTerms(family, settings), reach = Math.max(0, armReach - terms.reserve);
          let blocked: boolean;
          if (repertoire === "linear") blocked = obstacles.some(o => segmentDistanceSquared(start, target, o.a, o.b) <= o.radius * o.radius);
          else {
            intoFrameToRef(view.root,target,scratch);const end: Vec3 = [scratch.x,scratch.y,scratch.z];
            const contactDirection = terms.vertical !== 0 ? scratch.set(0, terms.vertical, 0)
              .applyRotationQuaternionToRef(Quaternion.InverseToRef(view.root.rotation, inverse), scratch) : null;
            const p = view.effectors[`hand.${hand}`]!.points[aimOf(spec,hand)]!, path = attackPath([p.x,p.y,p.z],end,hand,family,paths,
              contactDirection ? [contactDirection.x,contactDirection.y,contactDirection.z] : undefined);
            const world = (at: Vec3): Vec3 => { scratch.set(...at).applyRotationQuaternionToRef(view.root.rotation,scratch).addInPlace(view.root.position);return [scratch.x,scratch.y,scratch.z]; };
            let previous = world(path.chamber);blocked = false;
            for(let sample=1;sample<=settings.pathSamples;sample++) {
              const at = pointPath({position:path.chamber,velocity:[0,0,0]},end,path.seconds*sample/settings.pathSamples,path.seconds,path.contactVelocity,path.curve);
              const next = world(at.target);
              if(obstacles.some(o=>segmentDistanceSquared(previous,next,o.a,o.b)<=o.radius*o.radius)){blocked=true;break;}
              previous = next;
            }
          }
          const score = (preference[name] ?? 0) + (name === blockedSurface ? settings.repeated : 0) + (blocked ? settings.blocked : 0)
            + settings.reachPenalty * Math.abs(length(flat) - reach + paths.windup) + terms.cost;
          if (!best || score < best.score) best = { hand, target, segment: name, family, blocked, reach, score,
            ...(terms.vertical !== 0 ? { direction: [0, terms.vertical, 0] as Vec3 } : {}) };
        }
      }
    }
    return best;
  };
}
