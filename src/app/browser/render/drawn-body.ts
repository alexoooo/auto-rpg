import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { ReadSegment } from "../../../core/bodies/read-body.ts";
import type { BodySpec, ConfigurationName } from "../../../core/bodies/spec/body.ts";

/**
 * **A body as the page draws it**: its spec, and each segment's node, frame and shapes as they
 * stand, with the pose each hand has. A built body (`BuiltBody`, `src/core/bodies/build/build-body.ts`) is
 * one; a body a worker steps is drawn through its puppet (`puppetBody`, `puppet.ts`).
 */
export interface DrawnBody {
  readonly spec: BodySpec;
  readonly segments: ReadonlyMap<string, DrawnSegment>;
  readonly configurations: { readonly state: Readonly<Record<string, { readonly applied: ConfigurationName }>> };
}

/** A segment as drawn: its node, which the page poses, and its shapes as a hand's pose and a foot's toes stand. */
export interface DrawnSegment extends Pick<ReadSegment, "spec" | "frame" | "rigid" | "configuration" | "toes"> {
  readonly node: TransformNode;
  /** Whether it is on its body (`attachment`), as the page last posed it: a part cut off is drawn apart. */
  readonly attached: boolean;
}
