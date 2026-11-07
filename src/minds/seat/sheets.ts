import type { ConfigurationRequest } from "../../core/bodies/build/configurations.ts";
import type { RecordingIdentity } from "../../core/world/recording.ts";

/**
 * **A body's order sheet as its mind left it at a step**: its muscles' command (`MuscleDriver.activation`,
 * `.velocity`), its assist's ask about the root's centre of mass, world, N and N m, and the segment
 * configurations it asked.
 */
export interface Sheet {
  readonly step: number;
  readonly activation: Float64Array;
  readonly velocity: Float64Array;
  readonly force: readonly [number, number, number];
  readonly moment: readonly [number, number, number];
  readonly configurations: readonly ConfigurationRequest[];
}

/**
 * **The order sheets a body's mind has written**, one a step it stepped, taken at the seam
 * (`embody`): with the bout's recipe, the whole of what its mind did to the world. A load that
 * goes back drops the sheets after it as the steps are taken again.
 */
export interface SheetLog {
  readonly identity: RecordingIdentity;
  readonly sheets: Sheet[];
}

/** An empty log, to record a body's sheets into. */
export function sheetLog(identity: RecordingIdentity): SheetLog {
  return { identity, sheets: [] };
}
