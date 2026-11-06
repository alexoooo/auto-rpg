import { isRefused } from "../../refusal.ts";
import { geometricClearance, poseGeometry, shapeGeometry } from "../spec/clearance.ts";
import type { ReadBody, ReadSegment } from "../read-body.ts";
import type { HeldSpec, ShapeSpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";

type Geometry = Exclude<ReturnType<typeof shapeGeometry>, { readonly refused: string }>;
type Bounds = { readonly low: Vec3; readonly high: Vec3 };
interface Shape {
  readonly segment: ReadSegment;
  readonly index: number;
  readonly geometry: Geometry;
  readonly held: HeldSpec | null;
}
export interface SelfClearance {
  /** A lower bound on separation; negative values come from intersecting geometry, not a bounding box. */
  readonly least: number | null;
  readonly pair: readonly [string, string] | null;
  readonly pairs: number;
  readonly excluded: readonly { readonly pair: readonly [string, string]; readonly reason: "same segment" | "joint" | "same item" | "grip" }[];
}

function bounds(shape: Geometry): Bounds {
  switch (shape.kind) {
    case "capsule": return { low: shape.from.map((v, k) => Math.min(v, shape.to[k]!) - shape.radius) as unknown as Vec3,
      high: shape.from.map((v, k) => Math.max(v, shape.to[k]!) + shape.radius) as unknown as Vec3 };
    case "box": {
      const radius = [0, 1, 2].map(k => shape.axes.reduce((sum, axis, j) => sum + Math.abs(axis[k]!) * shape.half[j]!, 0));
      return { low: shape.centre.map((v, k) => v - radius[k]!) as unknown as Vec3, high: shape.centre.map((v, k) => v + radius[k]!) as unknown as Vec3 };
    }
    case "hull": return { low: [0, 1, 2].map(k => Math.min(...shape.points.map(p => p[k]!))) as unknown as Vec3,
      high: [0, 1, 2].map(k => Math.max(...shape.points.map(p => p[k]!))) as unknown as Vec3 };
    default: { const never: never = shape; throw new Error(`unknown clearance shape ${String(never)}`); }
  }
}
const boxGap = (a: Bounds, b: Bounds): number => Math.sqrt(a.low.reduce((sum, v, k) => {
  const apart = Math.max(0, v - b.high[k]!, b.low[k]! - a.high[k]!);
  return sum + apart * apart;
}, 0));

/** Geometric self-clearance, with the declared anatomical joint pairs and rigid grip geometry excluded. */
export function selfClearance(body: ReadBody) {
  const segments = [...body.segments.values()], parent = new Map(body.spec.joints.map(joint => [joint.child, joint.parent]));
  const state = { shapes: [] as Shape[], source: [] as ShapeSpec[], excluded: [] as SelfClearance["excluded"][number][] };
  const name = (shape: Shape): string => `${shape.segment.spec.name}/${shape.held?.item.name ?? "body"}/${shape.index}`;
  const heldBy = (segment: ReadSegment, index: number): HeldSpec | null => {
    const owner = segment.rigid.owners[index]!;
    return owner.kind === "held" || owner.kind === "held-region" ? owner.held : null;
  };
  function compile(): void {
    state.shapes.length = 0; state.source.length = 0;
    for (const segment of segments) for (const [index, shape] of segment.rigid.shapes.entries()) {
      const geometry = shapeGeometry(segment.spec, shape);
      if (isRefused(geometry)) throw new Error(`self clearance: ${geometry.refused}`);
      state.shapes.push({ segment, index, geometry, held: heldBy(segment, index) }); state.source.push(shape);
    }
  }
  function exclusion(a: Shape, b: Shape): SelfClearance["excluded"][number]["reason"] | null {
    if (a.held && a.held === b.held) return "same item";
    if (!a.held && !b.held) {
      if (a.segment === b.segment) return "same segment";
      if (parent.get(a.segment.spec.name) === b.segment.spec.name || parent.get(b.segment.spec.name) === a.segment.spec.name) return "joint";
    }
    const item = a.held ? a : b.held ? b : null, hand = item === a ? b : a;
    if (item && !hand.held && item.segment === hand.segment && item.held!.item.grip !== undefined) {
      // This pair's relative geometry is immutable. Only a shaft at the declared grip radius may intersect its holding hand.
      const original = item.segment.rigid.shapes[item.index]!;
      if (original.kind === "capsule" && original.radius.value === item.held!.item.grip!.value) return "grip";
    }
    return null;
  }
  compile();
  return (): SelfClearance => {
    const current = segments.flatMap(segment => segment.rigid.shapes);
    if (current.length !== state.source.length || current.some((shape, k) => shape !== state.source[k])) compile();
    const placed = state.shapes.map(shape => {
      const { segment } = shape, p = segment.pose.position, turn = segment.pose.rotation;
      return poseGeometry(shape.geometry, segment.frame, [p.x, p.y, p.z], [turn.x, turn.y, turn.z, turn.w]);
    });
    const boxes = placed.map(bounds);
    state.excluded.length = 0;
    let least: number | null = null, pair: SelfClearance["pair"] = null, pairs = 0;
    for (let i = 0; i < state.shapes.length; i++) for (let j = i + 1; j < state.shapes.length; j++) {
      const a = state.shapes[i]!, b = state.shapes[j]!, reason = exclusion(a, b), names = [name(a), name(b)] as const;
      if (reason) { state.excluded.push({ pair: names, reason }); continue; }
      const apart = boxGap(boxes[i]!, boxes[j]!);
      const distance = apart > 0 ? apart : geometricClearance(placed[i]!, placed[j]!);
      if (isRefused(distance)) throw new Error(`self clearance ${names.join(" and ")}: ${distance.refused}`);
      pairs++;
      if (least === null || distance < least) { least = distance; pair = names; }
    }
    return { least, pair, pairs, excluded: [...state.excluded] };
  };
}
