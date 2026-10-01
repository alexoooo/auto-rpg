import { createHash } from "node:crypto";

/**
 * A running digest of every segment's pose in `builts`, taken step by step: two runs of one bout
 * agree to the bit or their digests differ. The order is the bodies' as given and each body's
 * segments as built.
 */
export function traceOf(builts) {
  const hash = createHash("sha256"), row = new Float64Array(7), bytes = new Uint8Array(row.buffer);
  return {
    /** Take the bodies as they stand. */
    take() {
      for (const built of builts) for (const segment of built.segments.values()) {
        const p = segment.node.position, q = segment.node.rotationQuaternion;
        row.set([p.x, p.y, p.z, q.x, q.y, q.z, q.w]);
        hash.update(bytes);
      }
    },
    /** The digest of what was taken so far, 16 hex digits. */
    digest: () => hash.copy().digest("hex").slice(0, 16),
  };
}
