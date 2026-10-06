import type { BodyView } from "../body.ts";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { rigidOf } from "../build/rigid.ts";
import { frameOf, type BodySpec, type SegmentSpec, type ShapeSpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { add, dot, scale, sub } from "../spec/vec.ts";
import type { SolidSense } from "./object-senses.ts";
import { segmentDistanceSquared } from "./openings.ts";
import { clearStep } from "./clear-step.ts";
import type { BodySense } from "./senses.ts";

/** Immutable collider support points, including attached items, in the segment's local frame. */
const LOCAL = new WeakMap<BodySpec, ReadonlyMap<string, readonly { readonly points: readonly Vec3[]; readonly radius: number }[]>>();

function pointsOf(shape: ShapeSpec, segment: SegmentSpec): { points: readonly Vec3[]; radius: number } {
  switch (shape.kind) {
    case "sphere": return { points: [shape.centre.value], radius: shape.radius.value };
    case "capsule": return { points: [shape.from.value, shape.to.value], radius: shape.radius.value };
    case "hull": return { points: shape.points.map(p => p.value), radius: 0 };
    case "box": {
      const frame = frameOf(segment), points: Vec3[] = [];
      for (const x of [-1 / 2, 1 / 2]) for (const y of [-1 / 2, 1 / 2]) for (const z of [-1 / 2, 1 / 2])
        points.push(add(shape.centre.value, add(scale(frame.x, x * shape.size.value[0]), add(scale(frame.y, y * shape.size.value[1]), scale(frame.z, z * shape.size.value[2])))));
      return { points, radius: 0 };
    }
    default: { const never: never = shape; throw new Error(`unknown collider ${never}`); }
  }
}

/** Conservative horizontal body extent includes hull and box anatomy rather than capsule-only radii. */
export function bodyClearance(spec: BodySpec): number {
  let radius = 0;
  for (const segment of spec.segments.filter(s => /Trunk$/.test(s.name))) {
    const shape = pointsOf(segment.shape, segment);
    for (const p of shape.points) radius = Math.max(radius, Math.sqrt(p[0] * p[0] + p[2] * p[2]) + shape.radius);
  }
  return radius;
}

/** Detached current world bounds for body and held colliders; no visual geometry or engine handles. */
function worldShapes(foe: BodySense) {
  let locals = LOCAL.get(foe.spec);
  if (!locals) {
    locals = new Map(foe.spec.segments.map(segment => {
      const frame = frameOf(segment);
      return [segment.name, rigidOf(foe.spec, segment).shapes.map(shape => {
        const data = pointsOf(shape, segment);
        return Object.freeze({ radius: data.radius, points: Object.freeze(data.points.map(p => {
          const d = sub(p, frame.origin); return [dot(d, frame.x), dot(d, frame.y), dot(d, frame.z)] as Vec3;
        })) });
      })];
    }));
    LOCAL.set(foe.spec, locals);
  }
  const scratch = new Vector3(), shapes: {name: string; points: Vec3[]; radius: number}[] = [];
  for (const [name, localsOf] of locals) {
    const sensed=foe.segments.get(name);if(!sensed)continue;
    localsOf.forEach((shape,index)=>shapes.push({name:`${foe.id}/${name}/${index}`,radius:shape.radius,
      points:shape.points.map(p=>{scratch.set(...p).applyRotationQuaternionToRef(sensed.rotation,scratch).addInPlace(sensed.position);return [scratch.x,scratch.y,scratch.z];})}));
  }
  return shapes;
}

function boundsOf(shape: ReturnType<typeof worldShapes>[number]): SolidSense {
  const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
  for(const at of shape.points)for(let k=0;k<3;k++){low[k]=Math.min(low[k]!,at[k]!-shape.radius);high[k]=Math.max(high[k]!,at[k]!+shape.radius);}
  return {name:shape.name,kind:"box",centre:low.map((v,k)=>(v+high[k]!)/2) as unknown as Vec3,
    size:low.map((v,k)=>high[k]!-v) as unknown as Vec3};
}

/** Detached current world bounds for body and held colliders; no visual geometry or engine handles. */
export function sensedBounds(foe: BodySense): readonly SolidSense[] {
  return worldShapes(foe).map(boundsOf);
}

/** Feet sweep against exact round colliders and conservative polyhedral bounds, admitting outward separation. */
export function sensedFootClearance(foe: BodySense) {
  const shapes=worldShapes(foe);
  return (from:Vec3,to:Vec3,radius:number):boolean=>shapes.every(shape=>{
    if(!shape.radius) {
      const bounds=boundsOf(shape);
      if(bounds.kind!=="box")throw new Error("collider bounds must be boxes");
      if(from.every((v,k)=>v===to[k]))return [0,1,2].some(k=>Math.abs(from[k]!-bounds.centre[k]!)>=bounds.size[k]!/2+radius);
      return clearStep(from,to,radius,[bounds]);
    }
    const a=shape.points[0]!,b=shape.points[shape.points.length-1]!,r=radius+shape.radius;
    const near=segmentDistanceSquared(from,to,a,b);
    if(near>r*r)return true;
    const before=segmentDistanceSquared(from,from,a,b),after=segmentDistanceSquared(to,to,a,b);
    const axis=sub(b,a),squared=dot(axis,axis),nearest=add(a,scale(axis,squared?Math.max(0,Math.min(1,dot(sub(from,a),axis)/squared)):0));
    return before<=r*r&&after>before&&dot(sub(from,nearest),sub(to,from))>=0;
  });
}

/** Observed opponent-height gate: `docs/reference/ground-combat.md#opponent-height`. */
const LOW_HEAD = .8;

/** A grounded opponent is observed by height over the body's own support, never its controller's state. */
export function lowOpponent(view: BodyView, foe: BodySense): boolean {
  const head = foe.segments.get("head");
  return !!head && head.centre.y - view.stance.support.y < LOW_HEAD;
}

