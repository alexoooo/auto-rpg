import type { JointStopSettings } from "../control/joint-stops.ts";

/** Experimental numeric settings (`docs/reference/joint-stop-tracking.md#numerical-inputs`). */
const SETTINGS: Readonly<JointStopSettings> = Object.freeze({ margin: 0.001, forceTolerance: 1e-5,
  accelerationTolerance: 1e-4, iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6 });

/** The task declares stop prediction explicitly; policies cannot change physical limits. */
export function jointStopProbeSettings(enabled: boolean | undefined): Readonly<JointStopSettings> | undefined {
  if (enabled !== undefined && typeof enabled !== "boolean") throw new Error("invalid joint-stop probe selection");
  return enabled ? SETTINGS : undefined;
}
