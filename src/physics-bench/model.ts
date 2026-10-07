import { humanSpec } from "../core/human/spec.ts";
import { frameOf, type SegmentSpec } from "../core/spec/body.ts";
import { STANDARD_GRAVITY } from "../core/spec/constants.ts";
import {
  add, dot, qFromBasis, qMatrix, qRotate, scale, sub, symmetricEigen, type Q4, type V3,
} from "./math.ts";

/**
 * **The bake-off's engine-neutral body**: what every engine adapter builds, and nothing else.
 *
 * It is read from `humanSpec("workshop-fighter")`: each segment's mass, centre of mass, principal
 * inertia (kg m2, about the segment frame's axes) and each joint's centre, freedoms, ranges and
 * muscle peaks, as the spec states them. Two simplifications, the same for every engine:
 *
 * - **Every body is built world-aligned in the reference pose, its origin at its centre of mass.**
 *   The inertia's principal axes are given as a rotation (`inertiaFrame`), and shapes are placed
 *   relative to the centre of mass. So a joint's axis is the same vector in both bodies' frames, and
 *   a body's orientation read back is its rotation from the reference pose.
 * - **A convex hull becomes the box that bounds it in its segment frame** (the three trunk
 *   segments); capsules and boxes are the spec's own.
 *
 * A joint whose `parent` is -1 is anchored to the world (the shoulder of the arm case).
 */
export type Shape =
  | { readonly kind: "capsule"; readonly a: V3; readonly b: V3; readonly radius: number }
  | { readonly kind: "box"; readonly centre: V3; readonly half: V3; readonly rotation: Q4 }
  | { readonly kind: "sphere"; readonly centre: V3; readonly radius: number };

interface Segment {
  readonly name: string;
  readonly mass: number;
  /** World, reference pose. */
  readonly com: V3;
  /** Principal moments about the centre of mass, kg m2. */
  readonly inertia: V3;
  /** World-from-principal-axes rotation in the reference pose. */
  readonly inertiaFrame: Q4;
  /** Relative to the centre of mass, world-aligned in the reference pose. */
  readonly shape: Shape;
}

interface Dof {
  readonly name: string;
  /** Unit axis, world, reference pose. */
  readonly axis: V3;
  readonly min: number;
  readonly max: number;
  /** Peak isometric torque toward positive and toward negative angles, N m. */
  readonly peakPositive: number;
  readonly peakNegative: number;
}

export interface Joint {
  readonly name: string;
  /** Index into `segments`, or -1 for the world. */
  readonly parent: number;
  readonly child: number;
  /** World, reference pose. */
  readonly centre: V3;
  readonly dofs: readonly Dof[];
}

export interface Model {
  readonly name: string;
  readonly segments: readonly Segment[];
  readonly joints: readonly Joint[];
}

export const GRAVITY = STANDARD_GRAVITY.value;
const RECIPE_FIGHTER = "workshop-fighter" as const;

/** Segment frame coordinates of body-frame `p`. */
function inFrame(spec: SegmentSpec, p: readonly number[]): V3 {
  const f = frameOf(spec);
  const d = sub(p, f.origin);
  return [dot(d, f.x), dot(d, f.y), dot(d, f.z)];
}

function segmentOf(spec: SegmentSpec): Segment {
  const f = frameOf(spec);
  const frame = qFromBasis(f.x, f.y, f.z);
  const com = [...spec.centreOfMass.value] as V3;
  const s = spec.shape;
  let shape: Shape;
  switch (s.kind) {
    case "capsule":
      shape = { kind: "capsule", a: sub(s.from.value, com), b: sub(s.to.value, com), radius: s.radius.value };
      break;
    case "sphere":
      shape = { kind: "sphere", centre: sub(s.centre.value, com), radius: s.radius.value };
      break;
    case "box":
      shape = { kind: "box", centre: sub(s.centre.value, com), half: scale(s.size.value, 0.5), rotation: frame };
      break;
    case "hull": {
      const local = s.points.map((p) => inFrame(spec, p.value));
      const lo = [0, 1, 2].map((k) => Math.min(...local.map((p) => p[k]!)));
      const hi = [0, 1, 2].map((k) => Math.max(...local.map((p) => p[k]!)));
      const mid: V3 = [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2];
      const world = add(f.origin, add(add(scale(f.x, mid[0]), scale(f.y, mid[1])), scale(f.z, mid[2])));
      shape = { kind: "box", centre: sub(world, com), half: [(hi[0]! - lo[0]!) / 2, (hi[1]! - lo[1]!) / 2, (hi[2]! - lo[2]!) / 2], rotation: frame };
      break;
    }
    default: {
      const never: never = s;
      throw new Error(`unknown shape ${JSON.stringify(never)}`);
    }
  }
  return { name: spec.name, mass: spec.mass.value, com, inertia: [...spec.inertia.value] as V3, inertiaFrame: frame, shape };
}

/** The whole workshop human, every segment and joint of the spec, hulls as boxes. */
export function humanModel(): Model {
  const spec = humanSpec(RECIPE_FIGHTER);
  const segments = spec.segments.map(segmentOf);
  const index = new Map(segments.map((s, i) => [s.name, i]));
  const joints = spec.joints.map((j): Joint => ({
    name: j.name, parent: index.get(j.parent)!, child: index.get(j.child)!, centre: [...j.centre.value] as V3,
    dofs: j.dofs.map((d) => ({
      name: `${j.name} ${d.positive}`, axis: [...d.axis.value] as V3, min: d.min.value, max: d.max.value,
      peakPositive: d.muscle.peakPositive.value, peakNegative: d.muscle.peakNegative.value,
    })),
  }));
  return { name: "human", segments, joints };
}

/** World inertia tensor (row-major) of `s` about its centre of mass. */
export function worldInertia(s: Segment): number[] {
  const r = qMatrix(s.inertiaFrame);
  const out = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let sum = 0;
    for (let k = 0; k < 3; k++) sum += r[i * 3 + k]! * s.inertia[k]! * r[j * 3 + k]!;
    out[i * 3 + j] = sum;
  }
  return out;
}

/** One rigid segment standing for `parts`: their mass, centre of mass and inertia about it. */
function composite(name: string, parts: readonly Segment[], shape: (com: V3) => Shape): Segment {
  const mass = parts.reduce((m, s) => m + s.mass, 0);
  const com = scale(parts.reduce<V3>((c, s) => add(c, scale(s.com, s.mass)), [0, 0, 0]), 1 / mass);
  const tensor = new Array<number>(9).fill(0);
  for (const s of parts) {
    const own = worldInertia(s), d = sub(s.com, com), dd = dot(d, d);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      tensor[i * 3 + j]! += own[i * 3 + j]! + s.mass * ((i === j ? dd : 0) - d[i]! * d[j]!);
    }
  }
  const { values, rotation } = symmetricEigen(tensor);
  return { name, mass, com, inertia: values, inertiaFrame: rotation, shape: shape(com) };
}

/** The foot's sole middle, world (x, z), reference pose: the bottom face's centre of its box. */
function soleMiddle(model: Model, foot: string): V3 {
  const s = model.segments.find((x) => x.name === foot)!;
  if (s.shape.kind !== "box") throw new Error(`${foot} is not a box`);
  const c = add(s.com, s.shape.centre);
  return [c[0], lowestOf(s), c[2]];
}

/**
 * **Case A's body**: the left leg (thigh, shank, foot) and one block for the upper body (trunk,
 * head, both arms: the spec's segments, their composite mass and inertia) on the left hip joint.
 * The block is moved across the ground (not up) so the whole body's centre of mass is over the
 * sole's middle: a standing pose the leg can hold without falling.
 */
export function legModel(): Model {
  const human = humanModel();
  const leg = ["thigh.left", "shank.left", "foot.left"];
  const upper = human.segments.filter((s) => !s.name.startsWith("thigh.") && !s.name.startsWith("shank.") && !s.name.startsWith("foot."));
  const legSegs = leg.map((n) => human.segments.find((s) => s.name === n)!);
  const sole = soleMiddle(human, "foot.left");
  const block0 = composite("upperBody", upper, () => ({ kind: "box", centre: [0, 0, 0], half: [0.15, 0.25, 0.1], rotation: [0, 0, 0, 1] }));
  const legMass = legSegs.reduce((m, s) => m + s.mass, 0);
  const legMoment = legSegs.reduce<V3>((c, s) => add(c, scale(s.com, s.mass)), [0, 0, 0]);
  const total = legMass + block0.mass;
  // Block centre (x, z) so that (legMoment + block.mass * block.com) / total = sole (x, z).
  const bx = (sole[0] * total - legMoment[0]) / block0.mass, bz = (sole[2] * total - legMoment[2]) / block0.mass;
  const block: Segment = { ...block0, com: [bx, block0.com[1], bz] };
  const segments = [block, ...legSegs];
  const idx = new Map(segments.map((s, i) => [s.name, i]));
  const joints = human.joints.filter((j) => ["hip.left", "knee.left", "ankle.left"].includes(j.name)).map((j): Joint => {
    const parentName = human.segments[j.parent]!.name, childName = human.segments[j.child]!.name;
    return { ...j, parent: parentName === "lowerTrunk" ? idx.get("upperBody")! : idx.get(parentName)!, child: idx.get(childName)! };
  });
  return { name: "leg", segments, joints };
}

/** **Case B's body**: the right upper arm, forearm and hand, the shoulder anchored to the world. */
export function armModel(): Model {
  const human = humanModel();
  const names = ["upperArm.right", "forearm.right", "hand.right"];
  const segments = names.map((n) => human.segments.find((s) => s.name === n)!);
  const idx = new Map(segments.map((s, i) => [s.name, i]));
  const joints = human.joints.filter((j) => ["shoulder.right", "elbow.right", "wrist.right"].includes(j.name)).map((j): Joint => {
    const parentName = human.segments[j.parent]!.name;
    return { ...j, parent: idx.has(parentName) ? idx.get(parentName)! : -1, child: idx.get(human.segments[j.child]!.name)! };
  });
  return { name: "arm", segments, joints };
}

/** `model` moved by `offset`. */
export function placed(model: Model, offset: readonly number[]): Model {
  const o = offset as V3;
  return {
    name: model.name,
    segments: model.segments.map((s) => ({ ...s, com: add(s.com, o) })),
    joints: model.joints.map((j) => ({ ...j, centre: add(j.centre, o) })),
  };
}

/** The lowest point of a segment's shape, world y, reference pose. */
function lowestOf(s: Segment): number {
  const sh = s.shape;
  switch (sh.kind) {
    case "capsule": return s.com[1] + Math.min(sh.a[1], sh.b[1]) - sh.radius;
    case "sphere": return s.com[1] + sh.centre[1] - sh.radius;
    case "box": {
      let lo = Infinity;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        const p = qRotate(sh.rotation, [sx * sh.half[0], sy * sh.half[1], sz * sh.half[2]]);
        lo = Math.min(lo, s.com[1] + sh.centre[1] + p[1]);
      }
      return lo;
    }
    default: {
      const never: never = sh;
      throw new Error(`unknown shape ${JSON.stringify(never)}`);
    }
  }
}

export const lowest = (m: Model): number => Math.min(...m.segments.map(lowestOf));

/**
 * The segments on the side of joint `j` away from `root` (a segment index): the ones its torque
 * holds up. With `root` on the child's side, the parent's side.
 */
export function sideAway(m: Model, j: number, root: number): { readonly segments: number[]; readonly onParent: boolean } {
  const joint = m.joints[j]!;
  const seen = new Set<number>([joint.child]);
  const stack = [joint.child];
  while (stack.length) {
    const s = stack.pop()!;
    m.joints.forEach((k, i) => {
      if (i === j) return;
      for (const [a, b] of [[k.parent, k.child], [k.child, k.parent]] as const) {
        if (a === s && b >= 0 && !seen.has(b)) { seen.add(b); stack.push(b); }
      }
    });
  }
  const childSide = [...seen];
  if (joint.parent < 0 || !seen.has(root)) return { segments: childSide, onParent: false };
  return { segments: m.segments.map((_, i) => i).filter((i) => !seen.has(i)), onParent: true };
}
