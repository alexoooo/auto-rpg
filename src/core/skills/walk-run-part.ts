import type { LocomotionPart } from "../mind/locomotion-part.ts";
import { fitsSoles } from "../control/stance-balance.ts";
import { deepFreeze } from "../state.ts";
import { runCycleSettings, validRunCycle, type RunCycleSettings } from "./cycle-run.ts";
import { WALK_RUN, WALK_RUN_CYCLE, validWalkRun, walkRun, type WalkRunSettings } from "./walk-run.ts";

/**
 * **The walk and the run** (`walkRun`): the stance's walk, and the run that tracks a person's cycle past
 * `run`, its settings these and the run's over its own. It runs unless `runs` is false (`Locomotion.runs`).
 */
interface WalkRunConfig extends WalkRunSettings {
  readonly kind: "walk-run";
  readonly runs?: boolean;
  readonly tuning?: { readonly run?: Partial<RunCycleSettings> };
}

/** A walk and run's config's settings, its kind taken off. */
const walkRunOf = ({ kind: _, tuning: __, runs: ___, ...settings }: WalkRunConfig): WalkRunSettings => settings;

/**
 * **The walk and run** (`walkRun`): it holds the stance's walk's envelope (`Body.envelope`) and,
 * while it may run, its run's (`walkRunEnvelope`), and stops as the stance's walk does, or at
 * `RUN_STOPPING` while it may run.
 */
export const WALK_RUN_PART: LocomotionPart<WalkRunConfig> = deepFreeze({
  role: "locomotion", label: "Walk and run", stage: "game", fields: [], slots: [], defaults: { kind: "walk-run", ...WALK_RUN },
  keys: { kind: true, tuning: true, runs: true, run: true, turn: true, swerve: true, turnRate: true, leg: true, hasted: true },
  tuning: ["run"], fits: fitsSoles,
  faults: (config) => [
    ...validWalkRun(walkRunOf(config)) ? [] : ["a walk and run needs every setting finite, its run, turns and leg positive, timed to its haste to the power 0, 1/2 or 1"],
    ...validRunCycle(runCycleSettings(config.tuning?.run, WALK_RUN_CYCLE)) ? [] : ["a walk and run's run gives only the run's settings, each finite, its times and the cycle's positive and its shares of strength within (0, 1]"],
  ],
  runs: (config) => config.runs ?? true,
  make: (body, config) => walkRun(body, walkRunOf(config), runCycleSettings(config.tuning?.run, WALK_RUN_CYCLE), config.runs ?? true),
});
