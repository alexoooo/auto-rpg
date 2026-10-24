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
import { groundEnvironment } from "./ground-environment.ts";
import type { SolidSense } from "../core/mind/object-senses.ts";
import { cos, sin } from "../core/math/real.ts";

type Placement = Parameters<typeof buildBody>[2];
/** A start the bed refuses: no clear draw, or one that overlaps the level's furniture; why, a sentence. */
export interface GroundRefusal { readonly refused: string }
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
export function groundPlacementFaults(spec: BodySpec, placement: Placement, solids: readonly SolidSense[] = []): string[] {
  const shapes = geometry(spec, placement), faults: string[] = [];
  for (let a = 0; a < shapes.length; a++) for (let b = a + 1; b < shapes.length; b++) {
    const first = shapes[a]!, second = shapes[b]!;
    if (first.segment === second.segment || spec.joints.some(j => j.parent === first.segment && j.child === second.segment
      || j.parent === second.segment && j.child === first.segment)) continue;
    if (overlaps(first, second)) faults.push(`${first.segment} overlaps ${second.segment}`);
  }
  for (const solid of solids) {
    let points: readonly Point[];
    switch (solid.kind) {
      case "hull": points = solid.points; break;
      case "box": {
        const c = cos(solid.turn ?? 0), s = sin(solid.turn ?? 0), corners: Point[] = [];
        for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) {
          const dx = x * solid.size[0], dz = z * solid.size[2];
          corners.push([solid.centre[0] + c * dx + s * dz, solid.centre[1] + y * solid.size[1], solid.centre[2] - s * dx + c * dz]);
        }
        points = corners; break;
      }
      default: { const never: never = solid; throw new Error(`unknown ground solid ${never}`); }
    }
    for (const shape of shapes) if (overlaps(shape, { segment: solid.name, points, radius: 0 })) faults.push(`${shape.segment} overlaps ${solid.name}`);
  }
  return [...new Set(faults)];
}

/** Drops onto low furniture start above its top; shoves begin with a small geometric gap behind. */
function inEnvironment(spec: BodySpec, placement: Placement, options: LabAddress["ground"]): Placement | GroundRefusal {
  const level = groundEnvironment(options.level);
  if (!level.solids.length) return placement;
  const solid = level.solids[0]!;
  if (solid.kind !== "box") throw new Error("ground environments require a box footprint");
  const onTop = level.dropOnTop && (options.start === "dropped" || options.start === "placed");
  const [x, y, z] = placement.position;
  const rear = Math.min(...geometry(spec, placement).flatMap(shape => shape.points.map(point => point[2] - shape.radius)));
  // Eight centimetres avoids initial penetration while keeping a backward step against the obstacle.
  const result: Placement = { ...placement, position: onTop ? [x, y + solid.centre[1] + solid.size[1] / 2, solid.centre[2]]
    : [x, y, z + solid.centre[2] + solid.size[2] / 2 + .08 - rear] };
  const faults = groundPlacementFaults(spec, result, level.solids);
  return faults.length ? { refused: `invalid ${options.level} ground start: ${faults.join(", ")}` } : result;
}

/** A deterministic legal draw, raised by its own lowest shape rather than a guessed pelvis height; or why the bed refuses the start. */
export function groundPlacement(spec: BodySpec, address: Pick<LabAddress, "seed" | "ground">, waypoint?: Placement): Placement | GroundRefusal {
  const options = address.ground;
  if (options.start === "shoved" || options.start === "round") return inEnvironment(spec, { position: [0, 0, 0], joints: poseAngles(spec, guardPosture(spec)) }, options);
  if (!waypoint && !groundPostures(spec).includes(options.posture)) throw new Error(`${spec.model} has no installed ${options.posture} start`);
  const installed = options.start === "placed" ? poses.find(p => p.id === options.posture && p.model === spec.model) : undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    const random = mulberry32((address.seed + Math.imul(attempt, 0x9e3779b9)) >>> 0);
    const base = waypoint?.joints ?? installed?.placement.joints as Readonly<Record<string, readonly number[]>> | undefined ?? poseAngles(spec, guardPosture(spec));
    const spread = options.start === "dropped" ? .3 : .1;
    const joints = Object.fromEntries(spec.joints.map(j => [j.name, j.dofs.map((d, k) => Math.max(d.min.value,
      Math.min(d.max.value, (base[j.name]?.[k] ?? 0) + (random() * 2 - 1) * spread * (d.max.value - d.min.value))))]));
    let rotation: readonly [number, number, number, number];
    if (options.start === "dropped") {
      const u = random(), a = random() * 2 * Math.PI, b = random() * 2 * Math.PI;
      rotation = [Math.sqrt(1 - u) * sin(a), Math.sqrt(1 - u) * cos(a), Math.sqrt(u) * sin(b), Math.sqrt(u) * cos(b)];
    } else if (waypoint) rotation = waypoint.rotation ?? [0, 0, 0, 1];
    else if (installed) rotation = installed.placement.rotation as [number, number, number, number];
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
    if (!groundPlacementFaults(spec, placement).length) return inEnvironment(spec, placement, options);
  }
  return { refused: `no clear ${options.start} start for seed ${address.seed} in five draws` };
}
