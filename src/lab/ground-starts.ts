import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import poses from "../../assets/research/posture-holds.json" with { type: "json" };
import type { buildBody } from "../core/build/build-body.ts";
import { rigidOf } from "../core/build/rigid.ts";
import { lowsOf } from "../core/control/ground.ts";
import { pointAtToRef, poseAngles, specChainTo } from "../core/control/kinematics.ts";
import { guardPosture } from "../core/skills/guard.ts";
import { frameOf, handShapeAt, type BodySpec } from "../core/spec/body.ts";
import { mulberry32 } from "../rng.ts";
import type { LabAddress } from "./scenarios.ts";

type Placement = Parameters<typeof buildBody>[2];
type Point = readonly [number, number, number];
interface Convex { readonly segment: string; readonly points: readonly Point[]; readonly radius: number }
/** The placed configurations with installed joint geometry. */
export const GROUND_POSTURES = ["back", "front", "left", "right", "fours", "half-kneel", "squat"] as const;

/** Which installed starts this anatomy supplies. */
export function groundPostures(spec: BodySpec): readonly (typeof GROUND_POSTURES)[number][] {
  return GROUND_POSTURES.filter(name => ["back", "front", "left", "right"].includes(name)
    || poses.some(p => p.model === spec.model && p.id === name));
}

const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const neg = (a: Point): Point => [-a[0], -a[1], -a[2]];
const sub = (a: Point, b: Point): Point => add(a, neg(b));
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const toward = (edge: Point, origin: Point) => cross(cross(edge, origin), edge);

/** Convex support of a capsule, sphere, box or hull, with no collision-filter assumptions. */
function support(shape: Convex, direction: Point): Point {
  let at = shape.points[0]!;
  for (const p of shape.points) if (dot(p, direction) > dot(at, direction)) at = p;
  const length = Math.sqrt(dot(direction, direction)), scale = length > 0 ? shape.radius / length : 0;
  return [at[0] + direction[0] * scale, at[1] + direction[1] * scale, at[2] + direction[2] * scale];
}

/** GJK's origin test on the two shapes' Minkowski difference; boundary touches are allowed. */
function overlaps(first: Convex, second: Convex): boolean {
  const point = (d: Point) => sub(support(first, d), support(second, neg(d)));
  const simplex: Point[] = [point([1, 0, 0])];
  let direction = neg(simplex[0]!);
  const line = (a: Point, b: Point, ao: Point): Point => {
    const ab = sub(b, a);
    if (dot(ab, ao) > 0) { simplex.splice(0, simplex.length, b, a); return toward(ab, ao); }
    simplex.splice(0, simplex.length, a); return ao;
  };
  const triangle = (a: Point, b: Point, c: Point, ao: Point): Point => {
    const ab = sub(b, a), ac = sub(c, a), normal = cross(ab, ac);
    if (dot(cross(normal, ac), ao) > 0) {
      if (dot(ac, ao) > 0) { simplex.splice(0, simplex.length, c, a); return toward(ac, ao); }
      return line(a, b, ao);
    }
    if (dot(cross(ab, normal), ao) > 0) return line(a, b, ao);
    if (dot(normal, ao) > 0) { simplex.splice(0, simplex.length, c, b, a); return normal; }
    simplex.splice(0, simplex.length, b, c, a); return neg(normal);
  };
  for (let iteration = 0; iteration < 48; iteration++) {
    if (dot(direction, direction) < 1e-20 && simplex.length === 2) {
      const edge = sub(simplex[1]!, simplex[0]!);
      direction = cross(edge, [1, 0, 0]);
      if (dot(direction, direction) < 1e-20) direction = cross(edge, [0, 1, 0]);
    }
    const length = Math.sqrt(dot(direction, direction));
    if (length < 1e-10) return false;
    const a = point(direction);
    if (dot(a, direction) <= 1e-8 * length) return false;
    simplex.push(a);
    const ao = neg(a), b = simplex[simplex.length - 2]!;
    if (simplex.length === 2) { direction = line(a, b, ao); continue; }
    const c = simplex[simplex.length - 3]!;
    if (simplex.length === 3) { direction = triangle(a, b, c, ao); continue; }
    const d = simplex[0]!;
    let outside = false;
    for (const [u, v, opposite] of [[b, c, d], [c, d, b], [d, b, c]] as const) {
      let normal = cross(sub(u, a), sub(v, a));
      if (dot(normal, sub(opposite, a)) > 0) normal = neg(normal);
      if (dot(normal, ao) > 0) { direction = triangle(a, u, v, ao); outside = true; break; }
    }
    if (!outside) return true;
  }
  // A draw with an unresolved geometric query cannot be accepted as clear.
  return true;
}

/** The actual shapes of a placement, transformed by the same joint kinematics as its builder. */
function geometry(spec: BodySpec, placement: Placement): Convex[] {
  const rotation = new Quaternion(...(placement.rotation ?? [0, 0, 0, 1])).normalize();
  const translated = new Vector3(...placement.position), out: Convex[] = [];
  for (const original of spec.segments) {
    const segment = { ...original, shape: handShapeAt(spec, original, spec.held?.some(h => h.segment === original.name) ? "grip" : "open") };
    const chain = specChainTo(spec, segment.name), angles = chain.map(j => placement.joints?.[j.spec.name] ?? j.dofs.map(() => 0));
    for (const shape of rigidOf(spec, segment).shapes) {
      const lows = lowsOf(shape, frameOf(segment));
      const points = lows.map(low => {
        const p = chain.length ? pointAtToRef(chain, angles, low.at, new Vector3()) : new Vector3(...low.at);
        p.applyRotationQuaternionToRef(rotation, p).addInPlace(translated);
        return [p.x, p.y, p.z] as Point;
      });
      out.push({ segment: segment.name, points, radius: lows[0]!.radius });
    }
  }
  return out;
}

/** Nonadjacent shape pairs that penetrate geometrically before the world takes a step. */
export function groundPlacementFaults(spec: BodySpec, placement: Placement): string[] {
  const shapes = geometry(spec, placement), faults: string[] = [];
  for (let a = 0; a < shapes.length; a++) for (let b = a + 1; b < shapes.length; b++) {
    const first = shapes[a]!, second = shapes[b]!;
    if (first.segment === second.segment || spec.joints.some(j => j.parent === first.segment && j.child === second.segment
      || j.parent === second.segment && j.child === first.segment)) continue;
    if (overlaps(first, second)) faults.push(`${first.segment} overlaps ${second.segment}`);
  }
  return [...new Set(faults)];
}

/** A deterministic legal draw, raised by its own lowest shape rather than a guessed pelvis height. */
export function groundPlacement(spec: BodySpec, address: Pick<LabAddress, "seed" | "ground">): Placement {
  const options = address.ground;
  if (options.start === "shoved") return { position: [0, 0, 0], joints: poseAngles(spec, guardPosture(spec)) };
  if (!groundPostures(spec).includes(options.posture)) throw new Error(`${spec.model} has no installed ${options.posture} start`);
  const installed = options.start === "placed" ? poses.find(p => p.id === options.posture && p.model === spec.model) : undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    const random = mulberry32((address.seed + Math.imul(attempt, 0x9e3779b9)) >>> 0);
    const base = installed?.placement.joints as Readonly<Record<string, readonly number[]>> | undefined ?? poseAngles(spec, guardPosture(spec));
    const spread = options.start === "dropped" ? .3 : .1;
    const joints = Object.fromEntries(spec.joints.map(j => [j.name, j.dofs.map((d, k) => Math.max(d.min.value,
      Math.min(d.max.value, (base[j.name]?.[k] ?? 0) + (random() * 2 - 1) * spread * (d.max.value - d.min.value))))]));
    let rotation: readonly [number, number, number, number];
    if (options.start === "dropped") {
      const u = random(), a = random() * 2 * Math.PI, b = random() * 2 * Math.PI;
      rotation = [Math.sqrt(1 - u) * Math.sin(a), Math.sqrt(1 - u) * Math.cos(a), Math.sqrt(u) * Math.sin(b), Math.sqrt(u) * Math.cos(b)];
    } else if (installed) rotation = installed.placement.rotation as [number, number, number, number];
    else {
      const half = Math.sqrt(.5);
      switch (options.posture) {
        case "back": rotation = [-half, 0, 0, half]; break;
        case "front": rotation = [half, 0, 0, half]; break;
        case "left": rotation = [0, 0, half, half]; break;
        case "right": rotation = [0, 0, -half, half]; break;
        case "fours": case "half-kneel": case "squat": throw new Error(`no installed ${options.posture} start`);
        default: { const never: never = options.posture; throw new Error(`unknown ground posture ${never}`); }
      }
    }
    const zero: Placement = { position: [0, 0, 0], rotation, joints };
    const lowest = Math.min(...geometry(spec, zero).flatMap(shape => shape.points.map(p => p[1] - shape.radius)));
    const placement: Placement = { ...zero, position: [0, (options.start === "dropped" ? .3 : .02) - lowest, 0] };
    if (!groundPlacementFaults(spec, placement).length) return placement;
  }
  throw new Error(`no clear ${options.start} start for seed ${address.seed} in five draws`);
}
