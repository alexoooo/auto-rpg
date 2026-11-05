import type { SegmentConfiguration } from "../read-body.ts";
import { frameOf, configurationShapeAt, type BodySpec, type ConfigurationName, type SegmentSpec } from "../spec/body.ts";
import { rigidOf, type Rigid } from "./rigid.ts";
import { colliderOf } from "./collider.ts";
import { toesOf, type ToesState } from "./toes.ts";
import { configurationFaults } from "./configurations.ts";

/**
 * **A segment's shapes, from its spec alone**: its frame, its rigid body, the configuration it starts
 * in, its declared collision configurations, a foot's toes at each
 * bend, and its rigid body as its configuration and its toes' bend stand (`rigidAt`). The built body
 * and a page's drawn body read the one rule.
 */
export function segmentShapes(body: BodySpec, spec: SegmentSpec) {
  const faults = configurationFaults(spec);
  if (faults.length) throw new Error(`${spec.name}: ${faults.join("; ")}`);
  const frame = frameOf(spec);
  const rigid = rigidOf(body, spec);
  const initial = spec.configurations && (body.held?.some(held => held.segment === spec.name)
    ? spec.configurations.holding?.configuration ?? spec.configurations.initial : spec.configurations.initial);
  const posed = (name: ConfigurationName): SegmentConfiguration => {
    const shape = configurationShapeAt(body, spec, name);
    return { shape, rigid: { ...rigid, shapes: [shape, ...rigid.shapes.slice(1)] }, collider: colliderOf(frame, shape) };
  };
  const poses = spec.configurations && Object.fromEntries(Object.keys(spec.configurations.shapes).map(name => [name, posed(name)]));
  const bent = spec.toes ? toesOf(spec, frame, rigid) : undefined;
  const rigidAt = (pose: ConfigurationName | undefined, toes: ToesState | undefined): Rigid =>
    poses && pose !== undefined ? poses[pose]!.rigid : bent && toes ? bent(toes.bend).rigid : rigid;
  return { frame, rigid, initial, poses, bent, rigidAt };
}
