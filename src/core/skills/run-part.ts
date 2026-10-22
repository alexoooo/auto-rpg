import type { LocomotionPart } from "../mind/locomotion-part.ts";
import { fitsSoles } from "../control/stance-balance.ts";
import { deepFreeze } from "../state.ts";
import { RUN, run, validRun, type RunSettings } from "./run.ts";

/** **The run** (`run`): steps that fly, its settings these. */
interface RunConfig extends RunSettings {
  readonly kind: "run";
}

/** **The run** (`run`): it states no envelope, and stops at its own acceleration (`RunSettings.accel`). */
export const RUN_PART: LocomotionPart<RunConfig> = deepFreeze({
  role: "locomotion", label: "Run", stage: "experimental", fields: [], slots: [], defaults: { kind: "run", ...RUN },
  keys: {
    kind: true, contact: true, flight: true, lift: true, settle: true, width: true, gain: true, accel: true,
    turn: true, drop: true, arms: true, drive: true, lever: true,
  },
  fits: fitsSoles,
  faults: (config) => validRun(config) ? [] : ["a run needs every setting finite and positive, its gain not negative"],
  make: (body, config) => { const { kind: _, ...settings } = config; return run(body, settings); },
});
