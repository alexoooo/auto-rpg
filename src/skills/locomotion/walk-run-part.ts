import { SUPPORT_REFERENCE } from "../../control/support-reference.ts";
import { SIDES } from "../../core/bodies/bilateral.ts";
import { dataOf } from "../../core/data/store.ts";
import type { GaitPart } from "../framework/locomotion-part.ts";
import type { SkillRecords } from "../framework/records.ts";
import { fitsSoles } from "../../control/stance-balance.ts";
import { bodyKey, type BodySpec } from "../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../core/world/state.ts";
import { runCycleSettings, validRunCycle, type RunCycleSettings } from "./cycle-run.ts";
import { WALK_RUN, WALK_RUN_CYCLE, validWalkRun, walkRun, type WalkRunSettings } from "./walk-run.ts";

/** **The walk and run's settings for a body**: the walk's (`WalkRunSettings`) and its run's (`RunCycleSettings`). */
export interface WalkRunRecord {
  readonly walk: WalkRunSettings;
  readonly run: RunCycleSettings;
}

declare module "../../core/data/store.ts" {
  interface DataOf {
    /** Every body's walk and run record, set for its own leg. */
    "walk-run": SkillRecords<WalkRunRecord>;
  }
}

/**
 * **The walk and run's config**: whether it may run (`Locomotion.runs`; unless false, it does), and
 * an experiment's research `tuning` of the walk's and the run's settings, which a link does not carry.
 */
interface WalkRunConfig {
  readonly kind: "walk-run";
  readonly runs?: boolean;
  readonly tuning?: { readonly walk?: Partial<WalkRunSettings>; readonly run?: Partial<RunCycleSettings> };
}

/** The settings `config`'s research tuning sets over `base`. */
const tunedOver = (base: WalkRunRecord, config: WalkRunConfig): WalkRunRecord =>
  ({ walk: { ...base.walk, ...config.tuning?.walk }, run: runCycleSettings(config.tuning?.run, base.run) });

/** The defaults every body takes scaled to its leg (`scaledGait`) where it has no record of its own. */
const DEFAULTS: WalkRunRecord = deepFreeze({ walk: WALK_RUN, run: WALK_RUN_CYCLE });

/** The named anatomical channels consumed by the cycle and its arm swing. */
export function walkRunRefusal(spec: BodySpec): string | null {
  const soles = fitsSoles(spec);
  if (soles) return soles;
  for (const side of SIDES) for (const [joint, motions] of [
    ["hip", ["flexion", "abduction", "internal rotation"]], ["knee", ["flexion"]],
    ["ankle", ["dorsiflexion", "inversion"]], ["shoulder", ["flexion", "abduction"]], ["elbow", ["flexion"]],
  ] as const) {
    const found = spec.joints.find(one => one.name === joint + "." + side);
    if (!found || motions.some(motion => !found.dofs.some(dof => dof.positive === motion)))
      return "the walk and run needs its bilateral hip, knee, ankle, shoulder and elbow channels";
  }
  return null;
}

/**
 * **The walk and run** (`walkRun`): its settings its body's record (`assets/skills/locomotion/walk-run/walk-run.json`,
 * `dataOf("walk-run")`), else the defaults (`WALK_RUN`, `WALK_RUN_CYCLE`) scaled to its leg, a
 * research `tuning` over either. It holds the stance's walk's envelope (`Body.envelope`) and, while
 * it may run, its run's (`walkRunEnvelope`), and stops as the stance's walk does, or at
 * `RUN_STOPPING` while it may run.
 */
export const WALK_RUN_PART: GaitPart<WalkRunConfig> = deepFreeze({
  role: "gait", requires: [SUPPORT_REFERENCE], label: "Walk and run", stage: "game", fields: [], slots: [], defaults: { kind: "walk-run" },
  keys: { kind: true, tuning: true, runs: true },
  tuning: ["walk", "run"], fits: walkRunRefusal,
  faults: (config) => {
    if (config.tuning !== undefined && (!config.tuning || typeof config.tuning !== "object" || Array.isArray(config.tuning))) return ["invalid walk and run tuning"];
    if (config.tuning && Object.values(config.tuning).some(value => !value || typeof value !== "object" || Array.isArray(value))) return ["invalid walk and run tuning"];
    const { walk, run } = tunedOver(DEFAULTS, config);
    return [
      ...validWalkRun(walk) ? [] : ["a walk and run's walk gives only the walk's settings, each finite, its run, turns and leg positive, timed to its haste to the power 0, 1/2 or 1"],
      ...validRunCycle(run) ? [] : ["a walk and run's run gives only the run's settings, each finite, its times and the cycle's positive and its shares of strength within (0, 1]"],
    ];
  },
  reads: () => ["walk-run"],
  runs: (config) => config.runs ?? true,
  make: (body, config) => {
    const { walk, run } = tunedOver(dataOf("walk-run")[bodyKey(body.built.spec)]?.settings ?? DEFAULTS, config);
    return walkRun(body, walk, run, config.runs ?? true);
  },
});

declare module "../config.ts" {
  interface GaitConfigs {
    readonly "walk-run": WalkRunConfig;
  }
}
