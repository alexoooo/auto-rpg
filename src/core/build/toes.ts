import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { ColliderShape, SegmentBody } from "../engine/engine.ts";
import { atan2, cos, sin } from "../math/real.ts";
import type { ContactRegionSpec, SegmentFrame, SegmentSpec } from "../spec/body.ts";
import { derive, type Vec3 } from "../spec/quantity.ts";
import type { World } from "../world.ts";
import { colliderOf, local } from "./collider.ts";
import { toesShape, type Rigid } from "./rigid.ts";

/**
 * **Toes** (`ToesSpec`): a slab ahead of a foot's box (heel to ball), hinged at the box's bottom
 * front edge, the ball. They lie along the ground as the foot tips heel up over them, from flat
 * (the foot flat) to a right angle (the foot on end), as toes bend under a foot; the foot's box
 * never changes. They are a contact region of the foot (`regionsOf`, `rigid.ts`) and carry no mass:
 * the foot's mass properties are its spec's. Measured: `docs/reference/toes.md`.
 */

/** A foot's toes now, plain data in its body's state: their bend from flat toward the foot's top, rad, a whole number of `TOE_STEP`s. */
export interface ToesState { bend: number }

/** Toes lying flat. */
export const flatToes = (): ToesState => ({ bend: 0 });

/**
 * The step the toes' bend is taken in, rad: each change of it restarts their contacts, and each
 * step's shapes are made once (`docs/reference/toes.md#toe_step`).
 */
const TOE_STEP = 0.02;

/** `segment`'s toes as a contact region bent `bend` rad toward the foot's top, body frame, reference pose. */
export function toesRegion(segment: SegmentSpec, frame: SegmentFrame, bend: number): ContactRegionSpec {
  const { shape, toes } = segment;
  if (shape.kind !== "box" || !toes) throw new Error(`${segment.name} has no box with toes`);
  if (toes.length.value > shape.size.value[2]) throw new Error(`${segment.name}'s toes are longer than its box is high`);
  const c = local(frame, shape.centre.value), s = shape.size.value, ball = c[1] + s[1] / 2, sole = c[2] + s[2] / 2;
  const y = cos(bend), z = -sin(bend), length = toes.length.value, thick = toes.thickness.value;
  const body = (p: Vec3): Vec3 => [0, 1, 2].map((k) => frame.origin[k]! + frame.x[k]! * p[0] + frame.y[k]! * p[1] + frame.z[k]! * p[2]) as unknown as Vec3;
  // Its corners: across the box's width, from the ball out along the toes, and from the sole up through their thickness.
  const corners: Vec3[] = [];
  for (const x of [c[0] - s[0] / 2, c[0] + s[0] / 2]) for (const a of [0, length]) for (const b of [0, thick])
    corners.push(body([x, ball + a * y + b * z, sole + a * z - b * y]));
  return { name: "toes", surface: segment.surface,
    shape: { kind: "hull", points: corners.map((p) => derive("m", "a foot's toes as they bend", [shape.centre, shape.size, toes.length, toes.thickness], () => p)) } };
}

/** A foot's toes at each bend (`ToesState.bend`): their region, the foot's rigid body with it, and their collider, each made once. */
export function toesOf(segment: SegmentSpec, frame: SegmentFrame, base: Rigid): (bend: number) => { readonly rigid: Rigid; readonly collider: ColliderShape } {
  const k = toesShape(segment), made = new Map<number, { rigid: Rigid; collider: ColliderShape }>();
  return (bend) => {
    let at = made.get(bend);
    if (!at) {
      const region = toesRegion(segment, frame, bend), shapes = [...base.shapes], owners = [...base.owners];
      shapes[k] = region.shape; owners[k] = { kind: "region", region };
      at = { rigid: bend === 0 ? base : { ...base, shapes, owners }, collider: colliderOf(frame, region.shape) };
      made.set(bend, at);
    }
    return at;
  };
}

/** Work made once: toes are read one foot at a time and keep nothing between calls. */
const work = { up: new Vector3(), turn: new Quaternion() };

/**
 * How far toes bend on a foot whose node is turned `rotation`, rad, in `TOE_STEP`s: as far as the
 * foot is tipped heel up over them, to a right angle, so they lie along the ground; less as the
 * foot rolls onto its side, where its tip has no ground to lie along, and flat on it.
 */
function bendOf(rotation: Quaternion): number {
  // The world's up in the foot's frame: its node's axes are the frame's.
  const up = Vector3.UpReadOnly.applyRotationQuaternionToRef(Quaternion.InverseToRef(rotation, work.turn), work.up);
  const upright = Math.sqrt(up.y * up.y + up.z * up.z), tip = Math.min(Math.max(atan2(-up.y, -up.z), 0), Math.PI / 2);
  return Math.round(tip * upright / TOE_STEP) * TOE_STEP;
}

/** A foot as `createToes` reads and turns it. */
interface Toed {
  readonly spec: SegmentSpec;
  readonly node: { readonly rotationQuaternion: Quaternion | null };
  readonly body: SegmentBody;
  readonly toes?: ToesState;
  readonly bent?: (bend: number) => { readonly collider: ColliderShape };
}

/** The toes of the feet among `segments`, each bent to lie along the ground before every world step. */
export function createToes(segments: readonly Toed[], world: World): { readonly state: Readonly<Record<string, ToesState>>; dispose(): void } {
  const feet = segments.filter((segment) => segment.toes && segment.bent);
  const hook = feet.length === 0 ? null : world.beforeStep(() => {
    for (const foot of feet) {
      const bend = bendOf(foot.node.rotationQuaternion!);
      if (bend === foot.toes!.bend) continue;
      foot.toes!.bend = bend;
      foot.body.changeShape(toesShape(foot.spec), foot.bent!(bend).collider);
    }
  });
  return { state: Object.fromEntries(feet.map((foot) => [foot.spec.name, foot.toes!])), dispose: () => hook?.dispose() };
}
