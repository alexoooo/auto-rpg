import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { segmentShapes } from "../core/build/segment-shapes.ts";
import type { ToesState } from "../core/build/toes.ts";
import type { BodySpec, HandPose } from "../core/spec/body.ts";
import type { DrawnBody, DrawnSegment } from "./drawn-body.ts";

/** A segment of a puppet: drawn, with the hand's pose and the toes' bend the page sets. */
interface PuppetSegment extends DrawnSegment {
  readonly handPose?: { applied: HandPose; requested: HandPose };
  readonly toes?: ToesState;
}

/** A body drawn on a page from its spec alone, its nodes posed by the page from what a worker sends. */
export interface Puppet extends DrawnBody {
  readonly segments: ReadonlyMap<string, PuppetSegment>;
  /** Hide or show every node, and what hangs on them. */
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

/**
 * **A puppet of `spec`**: a node for each segment, named as the built body names it, in the spec's
 * order, at the reference pose until the page poses it; each segment's shapes follow the hand's pose
 * and the toes' bend the page sets, by the rule the built body follows (`segmentShapes`). Nothing of
 * it collides or decides anything.
 */
export function puppetBody(spec: BodySpec, scene: Scene): Puppet {
  const segments = new Map<string, PuppetSegment>(), state: Record<string, { applied: HandPose; requested: HandPose }> = {};
  for (const segmentSpec of spec.segments) {
    const { frame, initial, poses, bent, rigidAt } = segmentShapes(spec, segmentSpec);
    const node = new TransformNode(`${spec.model}.${segmentSpec.name}`, scene);
    node.position = Vector3.FromArray(frame.origin);
    node.rotationQuaternion = Quaternion.RotationQuaternionFromAxis(Vector3.FromArray(frame.x), Vector3.FromArray(frame.y), Vector3.FromArray(frame.z));
    const handPose = poses ? { applied: initial, requested: initial } : undefined;
    const toes = bent ? { bend: 0 } : undefined;
    segments.set(segmentSpec.name, { spec: segmentSpec, frame, node, ...(handPose ? { handPose } : {}), ...(toes ? { toes } : {}),
      get rigid() { return rigidAt(handPose?.applied, toes); } });
    // The hands as the built body's poses name them (`createHandPoses`).
    for (const hand of ["left", "right"] as const) if (handPose && segmentSpec.name === `hand.${hand}`) state[hand] = handPose;
  }
  return {
    spec, segments, handPoses: { state },
    setEnabled(enabled) { for (const segment of segments.values()) segment.node.setEnabled(enabled); },
    dispose() { for (const segment of segments.values()) segment.node.dispose(false, false); },
  };
}
