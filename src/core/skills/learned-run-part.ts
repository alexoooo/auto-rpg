import { dataOf } from "../data/store.ts";
import type { LocomotionPart } from "../mind/locomotion-part.ts";
import { fitsSoles } from "../control/stance-balance.ts";
import { deepFreeze } from "../state.ts";
import { runCycleSettings, validRunCycle, type RunCycleSettings } from "./cycle-run.ts";
import { learnedRun, RUN_POLICY } from "./learned-run.ts";
import { WALK_RUN, WALK_RUN_CYCLE, validWalkRun, type WalkRunSettings } from "./walk-run.ts";

/**
 * **The walk and the learned run** (`learnedRun`): the walk and run whose run a policy steers, the one
 * `policy` names (`RUN_POLICY`, its network `dataOf("learned-run")`), or, null, steered from outside the mind (research's training). Its settings are the walk and run's,
 * its gait by default timed to its haste as its policy's was in training (`RunPolicy.hasted`).
 */
interface LearnedRunConfig extends WalkRunSettings {
  readonly kind: "learned-run";
  readonly policy: string | null;
  readonly runs?: boolean;
  readonly tuning?: { readonly run?: Partial<RunCycleSettings> };
}

/** A learned run's config's walk and run settings, its kind and policy taken off. */
const learnedRunOf = ({ kind: _, tuning: __, runs: ___, policy: ____, ...settings }: LearnedRunConfig): WalkRunSettings => settings;

/**
 * **The walk and learned run** (`learnedRun`): it holds the stance's walk's envelope and stops as the
 * walk and run does; its run is held to no envelope.
 */
export const LEARNED_RUN_PART: LocomotionPart<LearnedRunConfig> = deepFreeze({
  role: "locomotion", label: "Walk and learned run", stage: "experimental", fields: [], slots: [],
  defaults: { kind: "learned-run", ...WALK_RUN, hasted: RUN_POLICY.hasted, policy: RUN_POLICY.policies[0]! },
  keys: { kind: true, policy: true, tuning: true, runs: true, run: true, turn: true, swerve: true, turnRate: true, leg: true, hasted: true },
  tuning: ["run"], fits: fitsSoles,
  faults: (config) => [
    ...validWalkRun(learnedRunOf(config)) ? [] : ["a walk and learned run needs every setting finite, its run, turns and leg positive, timed to its haste to the power 0, 1/2 or 1"],
    ...validRunCycle(runCycleSettings(config.tuning?.run, WALK_RUN_CYCLE)) ? [] : ["a walk and learned run's run gives only the run's settings, each finite, its times and the cycle's positive and its shares of strength within (0, 1]"],
    ...config.policy === null || RUN_POLICY.policies.includes(config.policy) ? [] : [`a learned run has no policy called ${JSON.stringify(config.policy)}`],
  ],
  reads: (config) => config.policy === null ? [] : ["learned-run"],
  runs: (config) => config.runs ?? true,
  make: (body, config) => learnedRun(body, config.policy === null ? null : dataOf("learned-run"), learnedRunOf(config), runCycleSettings(config.tuning?.run, WALK_RUN_CYCLE), config.runs ?? true),
});
