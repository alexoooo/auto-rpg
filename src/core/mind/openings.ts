import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../body.ts";
import { attackPath, ATTACK_PATH, type AttackTuning } from "../skills/attack-path.ts";
import { pointPathTargetToRef } from "../control/point-path.ts";
import { intoFrameToRef } from "../control/kinematics.ts";
import type { BlowFamily } from "../skills/attack-path.ts";
import { aimOf } from "../skills/strikes.ts";
import { placedReach, shoulderFromHead } from "../skills/arm-reach.ts";
import { type Side, frameOf, type BodySpec, type SegmentSpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { add, dot, length, scale, sub } from "../spec/vec.ts";
import { hypot } from "../math/real.ts";
import type { BodySense } from "./senses.ts";
import { convexHull } from "../spec/hull.ts";
import { hullEntry } from "./hull-entry.ts";

/** Visible lane ranking search cells: `docs/reference/combat-strikes.md#opening-selection`. */
const OPENINGS = Object.freeze({ prediction: .12, blocked: 2, reachPenalty: 2, handMargin: .5,
  head: 0, upperTrunk: .2, middleTrunk: .4, overhand: 0, repeated: 1, elevation: .5,
  // Optional side-surface rays: `docs/reference/combat-strikes.md#lateral-head-surfaces`.
  headLateral: 0, hookReserve: .15, hookCost: .1, pathSamples: 4,
  // Upward close-range development cells: `docs/reference/combat-uppercut.md`.
  uppercut: .1, uppercutReserve: .25,
  // How much a side blow's line from the striking shoulder off the surface's normal costs, by one less its cosine: none unless a tuning asks.
  square: 0 });

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
export type OpeningTuning = { readonly [K in "head" | "upperTrunk" | "middleTrunk" | "blocked" | "reachPenalty" | "repeated" | "overhand" | "headLateral" | "hookCost" | "uppercut" | "uppercutReserve" | "square"]?: number };

/** Opening scores are finite; the lateral surface fraction stays on the sensed collider. */
export function validOpeningTuning(tuning: OpeningTuning): boolean {
  const lateral = tuning.headLateral ?? OPENINGS.headLateral;
  return Object.values(tuning).every(Number.isFinite) && lateral >= 0 && lateral <= 1
    && (tuning.uppercutReserve ?? OPENINGS.uppercutReserve) >= 0;
}

/** `x` clipped to [0, 1]. */
const clip = (x: number): number => Math.max(0, Math.min(1, x));

/** The squared length of `w + u s - v t`, by components: the gap between two segments' points at `s` and `t`. */
function gapSquared(wx: number, wy: number, wz: number, ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, s: number, t: number): number {
  const qx = wx + ux * s - vx * t, qy = wy + uy * s - vy * t, qz = wz + uz * s - vz * t;
  return qx * qx + qy * qy + qz * qz;
}

/**
 * Exact squared distance between two finite segments, including degenerate and parallel ones. It
 * runs for every candidate blow against every guarding limb each control step, so it works in
 * numbers alone and allocates nothing.
 */
export function segmentDistanceSquared(start: Vec3, end: Vec3, otherStart: Vec3, otherEnd: Vec3): number {
  const ux = end[0] - start[0], uy = end[1] - start[1], uz = end[2] - start[2];
  const vx = otherEnd[0] - otherStart[0], vy = otherEnd[1] - otherStart[1], vz = otherEnd[2] - otherStart[2];
  const wx = start[0] - otherStart[0], wy = start[1] - otherStart[1], wz = start[2] - otherStart[2];
  const a = ux * ux + uy * uy + uz * uz, b = ux * vx + uy * vy + uz * vz, c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz, e = vx * wx + vy * wy + vz * wz;
  let best = Math.min(gapSquared(wx, wy, wz, ux, uy, uz, vx, vy, vz, 0, c ? clip(e / c) : 0),
    gapSquared(wx, wy, wz, ux, uy, uz, vx, vy, vz, 1, c ? clip((e + b) / c) : 0),
    gapSquared(wx, wy, wz, ux, uy, uz, vx, vy, vz, a ? clip(-d / a) : 0, 0),
    gapSquared(wx, wy, wz, ux, uy, uz, vx, vy, vz, a ? clip((b - d) / a) : 0, 1));
  const determinant = a * c - b * b;
  if (determinant > 0) {
    const s = (b * e - c * d) / determinant, t = (a * e - b * d) / determinant;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) best = Math.min(best, gapSquared(wx, wy, wz, ux, uy, uz, vx, vy, vz, s, t));
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

/** Whether the segment from `a` to `b` passes within any of `obstacles`' radii of its centre line. */
function crosses(obstacles: readonly { readonly a: Vec3; readonly b: Vec3; readonly radius: number }[], a: Vec3, b: Vec3): boolean {
  for (const o of obstacles) if (segmentDistanceSquared(a, b, o.a, o.b) <= o.radius * o.radius) return true;
  return false;
}

/** Each repertoire's blow families (`openingSelector`). */
const LINEAR: readonly BlowFamily[] = Object.freeze(["straight"]), MIXED: readonly BlowFamily[] = Object.freeze(["straight", "hook"]);
const VERTICAL: readonly BlowFamily[] = Object.freeze(["straight", "hook", "overhand"]), BOXING: readonly BlowFamily[] = Object.freeze(["straight", "hook", "uppercut"]);

/** Each spec's guarding limbs (its hands and forearms with a centre line), read once: what a blow's path must clear. */
const GUARDS = new WeakMap<BodySpec, readonly { readonly name: string; readonly local: NonNullable<ReturnType<typeof capsule>> }[]>();
function guardsOf(spec: BodySpec) {
  let guards = GUARDS.get(spec);
  if (!guards) GUARDS.set(spec, guards = Object.freeze(spec.segments.filter(s => /^hand\.|^forearm\./.test(s.name)).flatMap(segment => {
    const local = capsule(segment);
    return local ? [{ name: segment.name, local }] : [];
  })));
  return guards;
}

/** Each spec's parts a blow is aimed at unless told others: its high mark, then its middle ones, read once. */
const TARGETS = new WeakMap<BodySpec, readonly string[]>();
function targetsOf(spec: BodySpec): readonly string[] {
  let names = TARGETS.get(spec);
  if (!names) TARGETS.set(spec, names = Object.freeze([spec.marks.high, ...spec.marks.middle]));
  return names;
}

/** The heights and sideways offsets a face is aimed at, as fractions of its half-extent (`OPENINGS.elevation`). */
const ELEVATIONS: readonly number[] = Object.freeze([-OPENINGS.elevation, 0, OPENINGS.elevation]);

/** The lateral offsets of a part other than the head: straight at it. */
const NO_OFFSET: readonly number[] = Object.freeze([0]);

/** A point path's start velocity: at rest. */
const AT_REST: Vec3 = Object.freeze([0, 0, 0]) as unknown as Vec3;

/** A replaceable, bounded geometric selector; reads physical shapes and poses, never opponent policy or health. */
export function openingSelector(spec: BodySpec, tuning: OpeningTuning = {}, paths: AttackTuning = ATTACK_PATH) {
  if (!validOpeningTuning(tuning)) throw new Error("opening preferences must be finite and headLateral must be in [0,1]");
  const settings = { ...OPENINGS, ...tuning };
  /** The preference for a part by its segment's name (`OpeningTuning`'s `head`, `upperTrunk`, `middleTrunk`); none, 0. */
  const preference: Readonly<Record<string, number | undefined>> = settings;
  const headOffsets = settings.headLateral ? [-settings.headLateral, 0, settings.headLateral] : [0];
  const scratch = new Vector3(), inverse = new Quaternion();
  // What a family asks of a blow, read once a family: the settings do not change.
  const terms = new Map<BlowFamily, ReturnType<typeof familyTerms>>();
  const termsOf = (family: BlowFamily) => { let found = terms.get(family); if (!found) terms.set(family, found = familyTerms(family, settings)); return found; };
  // A path's samples, in work arrays of this selector's own that carry nothing between calls.
  const along: [number, number, number] = [0, 0, 0], work: [number, number, number] = [0, 0, 0];
  const previous: [number, number, number] = [0, 0, 0], next: [number, number, number] = [0, 0, 0];
  // A candidate's face point, its predicted target and a hull's aim, likewise.
  const front: [number, number, number] = [0, 0, 0], target: [number, number, number] = [0, 0, 0], toward: [number, number, number] = [0, 0, 0];
  // A path's ends and contact direction in the body's frame, and where its point path starts, likewise.
  const home: [number, number, number] = [0, 0, 0], end: [number, number, number] = [0, 0, 0], direction: [number, number, number] = [0, 0, 0];
  const from: { position: Vec3; readonly velocity: Vec3 } = { position: AT_REST, velocity: AT_REST };
  // The striking shoulder, world, and a candidate face's outward normal, likewise.
  const shoulder: [number, number, number] = [0, 0, 0], normal: [number, number, number] = [0, 0, 0];
  /** `at`, in the frame of sensed segment `sensed`, into `out` in the world's. */
  const pointToRef = (sensed: { readonly position: Vector3; readonly rotation: Quaternion }, at: Vec3, out: [number, number, number]) => {
    scratch.set(...at).applyRotationQuaternionToRef(sensed.rotation, scratch).addInPlace(sensed.position);
    out[0] = scratch.x; out[1] = scratch.y; out[2] = scratch.z;
  };
  const point = (foe: BodySense, name: string, at: Vec3): Vec3 => {
    const sensed = foe.segments.get(name)!;
    scratch.set(...at).applyRotationQuaternionToRef(sensed.rotation, scratch).addInPlace(sensed.position);
    return [scratch.x, scratch.y, scratch.z];
  };
  return (view: BodyView, foe: BodySense, hand: Side, blockedSurface: string | null = null, repertoire: "linear" | "mixed" | "vertical" | "boxing" = "linear",
    selection?: { readonly family: BlowFamily; readonly segments: readonly string[]; readonly blocked?: readonly string[] }) => {
    const handShape = spec.segments.find(s => s.name === `hand.${hand}`)!.shape;
    const margin = (handShape.kind === "capsule" || handShape.kind === "sphere" ? handShape.radius.value : 0) * OPENINGS.handMargin;
    const fist = view.fists[hand].position;
    const observed = view.effectors[`hand.${hand}`]!.feedback?.point ?? [fist.x, fist.y, fist.z];
    const start: Vec3 = [observed[0], observed[1], observed[2]];
    const obstacles = guardsOf(foe.spec).flatMap(({ name, local }) =>
      foe.segments.has(name) ? [{ a: point(foe, name, local.a), b: point(foe, name, local.b), radius: local.radius + margin }] : []);
    let best: Opening | null = null;
    let families: readonly BlowFamily[];
    switch (repertoire) {
      case "linear": families = LINEAR; break;
      case "mixed": families = MIXED; break;
      case "vertical": families = VERTICAL; break;
      case "boxing": families = BOXING; break;
      default: { const never: never = repertoire; throw new Error(`unknown repertoire ${never}`); }
    }
    if (selection) families = [selection.family];
    const { high } = foe.spec.marks;
    const ahead = OPENINGS.prediction + Math.max(0, view.time - (foe.time ?? view.time)), aim = aimOf(spec, hand);
    if (settings.square) {
      scratch.set(...shoulderFromHead(spec, hand)).applyRotationQuaternionToRef(view.root.rotation, scratch).addInPlace(view.head);
      shoulder[0] = scratch.x; shoulder[1] = scratch.y; shoulder[2] = scratch.z;
    }
    /** `at`, in the body's root frame, into `out` in the world's. */
    const worldToRef = (at: Vec3, out: [number, number, number]) => {
      scratch.set(at[0], at[1], at[2]).applyRotationQuaternionToRef(view.root.rotation, scratch).addInPlace(view.root.position);
      out[0] = scratch.x; out[1] = scratch.y; out[2] = scratch.z;
    };
    for (const name of selection?.segments ?? targetsOf(foe.spec)) {
      const segment = foe.spec.segments.find(s => s.name === name), sensed = foe.segments.get(name);
      const local = segment && capsule(segment), poly = segment && polyhedron(segment);
      if ((!local&&!poly) || !sensed) continue;
      const top = selection?.family === "overhand" || repertoire === "vertical" ? upperSurface(foe, name, start) : null;
      const bottom = selection?.family === "uppercut" || repertoire === "boxing" ? lowerSurface(foe, name, start) : null;
      const spin = sensed.spin, velocity = sensed.velocity, repeated = name === blockedSurface || selection?.blocked?.includes(name);
      /**
       * Each blow at `front`, a point on the segment's face (its top or bottom for an overhand or an
       * uppercut, its side for any other), scored: in the order the faces are found, so that a tie
       * keeps the first. The target is read into a work array, and copied only into the best.
       */
      const consider = (front: Vec3, face: "side" | "top" | "bottom", outward: Vec3 | null = null) => {
        const lx = front[0] - sensed.centre.x, ly = front[1] - sensed.centre.y, lz = front[2] - sensed.centre.z;
        target[0] = front[0] + (velocity.x + (spin.y * lz - spin.z * ly)) * ahead;
        target[1] = front[1] + (velocity.y + (spin.z * lx - spin.x * lz)) * ahead;
        target[2] = front[2] + (velocity.z + (spin.x * ly - spin.y * lx)) * ahead;
        const armReach = placedReach(spec, hand, target[1] - view.head.y);
        const flat = hypot(target[0] - view.head.x, target[1] - target[1], target[2] - view.head.z);
        let off = 0;
        if (settings.square && outward) {
          const lx = target[0] - shoulder[0], ly = target[1] - shoulder[1], lz = target[2] - shoulder[2], line = hypot(lx, ly, lz);
          if (line > 0) off = settings.square * (1 + (lx * outward[0] + ly * outward[1] + lz * outward[2]) / line);
        }
        for (const family of families) {
          if ((family === "overhand") !== (face === "top")) continue;
          if ((family === "uppercut") !== (face === "bottom")) continue;
          const terms = termsOf(family), reach = Math.max(0, armReach - terms.reserve);
          let blocked: boolean;
          if (repertoire === "linear") blocked = crosses(obstacles, start, target);
          else {
            intoFrameToRef(view.root,target,scratch);end[0] = scratch.x; end[1] = scratch.y; end[2] = scratch.z;
            const contactDirection = terms.vertical !== 0 ? scratch.set(0, terms.vertical, 0)
              .applyRotationQuaternionToRef(Quaternion.InverseToRef(view.root.rotation, inverse), scratch) : null;
            if (contactDirection) { direction[0] = contactDirection.x; direction[1] = contactDirection.y; direction[2] = contactDirection.z; }
            const p = view.effectors[`hand.${hand}`]!.points[aim]!; home[0] = p.x; home[1] = p.y; home[2] = p.z;
            const path = attackPath(home,end,hand,family,paths, contactDirection ? direction : undefined);
            from.position = path.chamber;
            worldToRef(path.chamber, previous); blocked = false;
            for(let sample=1;sample<=settings.pathSamples;sample++) {
              pointPathTargetToRef(from,end,path.seconds*sample/settings.pathSamples,path.seconds,along,work,path.contactVelocity,path.curve);
              worldToRef(along, next);
              if(crosses(obstacles,previous,next)){blocked=true;break;}
              previous[0] = next[0]; previous[1] = next[1]; previous[2] = next[2];
            }
          }
          const score = (preference[name] ?? 0) + (repeated ? settings.repeated : 0) + (blocked ? settings.blocked : 0)
            + settings.reachPenalty * Math.abs(flat - reach + paths.windup) + terms.cost + off;
          if (!best || score < best.score) best = { hand, target: [target[0], target[1], target[2]], segment: name, family, blocked, reach, score,
            ...(terms.vertical !== 0 ? { direction: [0, terms.vertical, 0] as Vec3 } : {}) };
        }
      };
      if(poly) {
        scratch.set(...start).subtractInPlace(sensed.position).applyRotationQuaternionToRef(Quaternion.InverseToRef(sensed.rotation,inverse),scratch);
        const from:Vec3 = [scratch.x,scratch.y,scratch.z];
        for(const vertical of ELEVATIONS)for(const lateral of ELEVATIONS) {
          toward[0]=poly.middle[0]+lateral*poly.extent[0]/2; toward[1]=poly.middle[1]+vertical*poly.extent[1]/2; toward[2]=poly.middle[2]+0;
          const entry=hullEntry(poly.planes,from,toward);
          if(entry){
            pointToRef(sensed,entry,front);
            let facing=poly.planes[0]!, nearest=-Infinity;
            for(const plane of poly.planes){const n=plane.normal,d=(n[0]*entry[0]+n[1]*entry[1]+n[2]*entry[2])-plane.offset;if(d>nearest){nearest=d;facing=plane;}}
            scratch.set(...facing.normal).applyRotationQuaternionToRef(sensed.rotation,scratch);normal[0]=scratch.x;normal[1]=scratch.y;normal[2]=scratch.z;
            consider(front,"side",normal);
          }
        }
      }
      if(local) {
       const a = point(foe, name, local.a), b = point(foe, name, local.b), radius = local.radius;
       // The centre line's axis, and each candidate in numbers: this runs for every candidate blow each control step.
       const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2], squared = ax * ax + ay * ay + az * az;
       for (const part of [a, scale(add(a, b), 1 / 2), b]) for (const elevation of ELEVATIONS)
         for (const lateral of name === high ? headOffsets : NO_OFFSET) {
        const w0 = start[0] - part[0], w2 = start[2] - part[2], far = hypot(w0, 0, w2), flatRadius = radius * Math.sqrt(1 - elevation * elevation);
        const c = Math.sqrt(1 - lateral * lateral);
        let cx = part[0], cy = part[1], cz = part[2];
        if (far > 0 && lateral === 0) { cx = part[0] + w0 * flatRadius / far; cy = part[1] + elevation * radius; cz = part[2] + w2 * flatRadius / far; }
        else if (far > 0) { cx = part[0] + (w0 * c + w2 * lateral) * flatRadius / far; cy = part[1] + elevation * radius; cz = part[2] + (w2 * c - w0 * lateral) * flatRadius / far; }
        const fraction = squared ? Math.max(0, Math.min(1, ((cx - a[0]) * ax + (cy - a[1]) * ay + (cz - a[2]) * az) / squared)) : 0;
        const nx = a[0] + ax * fraction, ny = a[1] + ay * fraction, nz = a[2] + az * fraction;
        const mx = cx - nx, my = cy - ny, mz = cz - nz, normalLength = hypot(mx, my, mz);
        if (normalLength > 0) {
          const out = radius / normalLength; front[0] = nx + mx * out; front[1] = ny + my * out; front[2] = nz + mz * out;
          normal[0] = mx / normalLength; normal[1] = my / normalLength; normal[2] = mz / normalLength;
          consider(front, "side", normal);
        } else { front[0] = cx; front[1] = cy; front[2] = cz; consider(front, "side"); }
       }
      }
      if (top) consider(top, "top");
      if (bottom) consider(bottom, "bottom");
    }
    // Assigned in `consider`, which the checker does not follow.
    return best as Opening | null;
  };
}
