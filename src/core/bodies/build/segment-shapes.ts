import type { HandConfiguration } from "../read-body.ts";
import { frameOf, handShapeAt, type BodySpec, type HandPose, type SegmentSpec } from "../spec/body.ts";
import { rigidOf, type Rigid } from "./rigid.ts";
import { colliderOf } from "./collider.ts";
import { toesOf, type ToesState } from "./toes.ts";

/**
 * **A segment's shapes, from its spec alone**: its frame, its rigid body, the pose its hand starts
 * in (a hand that holds something grips it), a posable hand's configurations, a foot's toes at each
 * bend, and its rigid body as a hand's pose and its toes' bend stand (`rigidAt`). The built body
 * and a page's drawn body read the one rule.
 */
export function segmentShapes(body: BodySpec, spec: SegmentSpec) {
  const frame = frameOf(spec);
  const rigid = rigidOf(body, spec);
  const initial: HandPose = body.held?.some(held => held.segment === spec.name) ? "grip" : "open";
  const posed = (name: HandPose): HandConfiguration => {
    const shape = handShapeAt(body, spec, name);
    return { shape, rigid: { ...rigid, shapes: [shape, ...rigid.shapes.slice(1)] }, collider: colliderOf(frame, shape) };
  };
  const poses = spec.handPoses && { open: posed("open"), fist: posed("fist"), grip: posed("grip") };
  const bent = spec.toes ? toesOf(spec, frame, rigid) : undefined;
  const rigidAt = (pose: HandPose | undefined, toes: ToesState | undefined): Rigid =>
    poses && pose ? poses[pose].rigid : bent && toes ? bent(toes.bend).rigid : rigid;
  return { frame, rigid, initial, poses, bent, rigidAt };
}
