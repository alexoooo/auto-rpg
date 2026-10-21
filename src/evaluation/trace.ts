import type { ReadSegment } from "../core/read-body.ts";
import { Sha256 } from "./sha256.ts";

/** What a trace reads of a body: its segments, in the order they were built. */
interface Traced {
  readonly segments: ReadonlyMap<string, Pick<ReadSegment, "node">>;
}

/** A running digest of bodies' poses, taken step by step. */
interface Trace {
  /** Take the bodies as they stand. */
  take(): void;
  /** The digest of what was taken so far, 16 hex digits. */
  digest(): string;
}

/**
 * A running digest of every segment's pose in `builts`: each take hashes each segment's position
 * and rotation as seven float64s in the machine's byte order. Two runs of one bout agree to the bit
 * or their digests differ. The order is the bodies' as given and each body's segments as built.
 */
export function traceOf(builts: Iterable<Traced>): Trace {
  const hash = new Sha256(), row = new Float64Array(7), bytes = new Uint8Array(row.buffer);
  return {
    take() {
      for (const built of builts) for (const segment of built.segments.values()) {
        const p = segment.node.position, q = segment.node.rotationQuaternion!;
        row[0] = p.x; row[1] = p.y; row[2] = p.z; row[3] = q.x; row[4] = q.y; row[5] = q.z; row[6] = q.w;
        hash.update(bytes);
      }
    },
    digest: () => hash.hex().slice(0, 16),
  };
}
