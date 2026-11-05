import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { segmentShapes } from "../../../core/bodies/build/segment-shapes.ts";
import type { ToesState } from "../../../core/bodies/build/toes.ts";
import { attachment, type ReadBody } from "../../../core/bodies/read-body.ts";
import type { Hook, World } from "../../../core/world/world.ts";
import type { BodySpec, ConfigurationName } from "../../../core/bodies/spec/body.ts";
import type { DrawnBody, DrawnSegment } from "./drawn-body.ts";

/** A segment of a puppet: drawn, with the segment's configuration and the toes' bend the page sets. */
interface PuppetSegment extends DrawnSegment {
  readonly configuration?: { applied: ConfigurationName; requested: ConfigurationName };
  readonly toes?: ToesState;
  attached: boolean;
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
 * order, at the reference pose until the page poses it; each segment's shapes follow its configuration
 * and the toes' bend the page sets, by the rule the built body follows (`segmentShapes`). Nothing of
 * it collides or decides anything.
 */
export function puppetBody(spec: BodySpec, scene: Scene): Puppet {
  const segments = new Map<string, PuppetSegment>(), state = Object.create(null) as Record<string, { applied: ConfigurationName; requested: ConfigurationName }>;
  for (const segmentSpec of spec.segments) {
    const { frame, initial, poses, bent, rigidAt } = segmentShapes(spec, segmentSpec);
    const node = new TransformNode(`${spec.model}.${segmentSpec.name}`, scene);
    node.position = Vector3.FromArray(frame.origin);
    node.rotationQuaternion = Quaternion.RotationQuaternionFromAxis(Vector3.FromArray(frame.x), Vector3.FromArray(frame.y), Vector3.FromArray(frame.z));
    const configuration = poses ? { applied: initial!, requested: initial! } : undefined;
    const toes = bent ? { bend: 0 } : undefined;
    segments.set(segmentSpec.name, { spec: segmentSpec, frame, node, attached: true, ...(configuration ? { configuration } : {}), ...(toes ? { toes } : {}),
      get rigid() { return rigidAt(configuration?.applied, toes); } });
    // Segment configurations keyed as the built body's (`createConfigurations`).
    if (configuration) state[segmentSpec.name] = configuration;
  }
  return {
    spec, segments, configurations: { state },
    setEnabled(enabled) { for (const segment of segments.values()) segment.node.setEnabled(enabled); },
    dispose() { for (const segment of segments.values()) segment.node.dispose(false, false); },
  };
}

/**
 * **`puppet` following `body`**, a body `world` steps on the page: each segment's pose and whether
 * it is on the body (`attachment`), each segment's configuration and toes, now and after every step until the hook is disposed. The page draws the
 * puppet and never hangs anything on the simulated body; what it writes on the puppet (a past frame,
 * `recordHistory`, `src/app/browser/lab/history.ts`) the simulation never reads.
 */
export function followBody(puppet: Puppet, body: Pick<ReadBody, "segments" | "joints">, world: Pick<World, "afterStep">): Hook {
  const on = attachment(body);
  const pairs = [...puppet.segments].map(([name, segment]) => {
    const followed = body.segments.get(name);
    if (!followed) throw new Error(`the puppet's segment ${name} is not the body's`);
    return { segment, followed };
  });
  const pose = () => {
    for (const { segment, followed } of pairs) {
      const p = followed.pose.position, q = followed.pose.rotation;
      segment.node.position.set(p.x, p.y, p.z);
      segment.node.rotationQuaternion!.set(q.x, q.y, q.z, q.w);
      segment.attached = on(followed);
      if (segment.configuration && followed.configuration) {
        segment.configuration.applied = followed.configuration.applied; segment.configuration.requested = followed.configuration.requested;
      }
      if (segment.toes && followed.toes) segment.toes.bend = followed.toes.bend;
    }
  };
  pose();
  return world.afterStep(pose);
}
