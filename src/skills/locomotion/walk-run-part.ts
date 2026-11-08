import type { Locomotion } from "../framework/locomotion-part.ts";
import { SUPPORT_REFERENCE } from "../../control/support-reference.ts";
import { STANCE_GAIT, validGaitTuning, type GaitTuning } from "../../control/stance/stance-tuning.ts";
import { SIDES } from "../../core/bodies/bilateral.ts";
import { dataOf } from "../../core/data/store.ts";
import type { GaitPart } from "../framework/locomotion-part.ts";
import type { SkillRecords } from "../framework/records.ts";
import { fitsSoles } from "../../control/stance/stance-balance.ts";
import { bodyKey, type BodySpec } from "../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../core/state.ts";
import { runCycleSettings, validRunCycle, type RunCycleSettings } from "./cycle-run.ts";
import { WALK_RUN, WALK_RUN_CYCLE, validWalkRun, walkRun, type WalkRunSettings } from "./walk-run.ts";
import type { Body } from "../../control/body.ts";
import { recordingKey } from "../../core/world/recording.ts";
import { learnedRun, learnedRunFaults, type LearnedRunSettings } from "./learned-run.ts";
import { validStanceEnvelope, type StanceEnvelope } from "../../control/stance/stance-envelope.ts";

/** **The walk and run's settings for a body**: its physical gait and optional learned corrections. */
export interface WalkRunRecord {
  readonly walk: WalkRunSettings;
  readonly run: RunCycleSettings;
  /** The cycle used while the requested pace is below the cycle's pace or the body's speed. */
  readonly braking?: RunCycleSettings;
  /** The travel stride; braced movement retains the motor's ordinary stance gait. */
  readonly stride?: GaitTuning;
  /** The learned corrections around this record's physical gait settings. */
  readonly learned?: LearnedRunSettings;
  /** This record's travel limits; braced permission retains the body's stance envelope. */
  readonly envelope?: StanceEnvelope;
}

declare module "../../core/data/store.ts" {
  interface DataOf {
    /** Every body's walk and run record, set for its own leg. */
    "walk-run": SkillRecords<WalkRunRecord>;
  }
}

/**
 * **The walk and run's config**: whether it may run (`Locomotion.runs`; unless false, it does), and
 * an experiment's research `tuning` of the stride, walk, run, braking, envelope and learned settings, which a link does not carry.
 */
interface WalkRunConfig {
  readonly kind: "walk-run";
  readonly runs?: boolean;
  readonly tuning?: { readonly walk?: Partial<WalkRunSettings>; readonly run?: Partial<RunCycleSettings>; readonly braking?: Partial<RunCycleSettings>; readonly stride?: Partial<GaitTuning>; readonly learned?: LearnedRunSettings; readonly envelope?: StanceEnvelope };
}

/** The settings `config`'s research tuning sets over `base`. */
const tunedOver = (base: WalkRunRecord, config: WalkRunConfig): WalkRunRecord & { readonly braking: RunCycleSettings } => {
  const run = runCycleSettings(config.tuning?.run, base.run);
  const stride = config.tuning?.stride ? { ...(base.stride ?? STANCE_GAIT), ...config.tuning.stride } : base.stride;
  const learned = config.tuning?.learned ?? base.learned;
  const envelope = config.tuning?.envelope ?? base.envelope;
  return { walk: { ...base.walk, ...config.tuning?.walk }, run,
    braking: runCycleSettings(config.tuning?.braking, base.braking ?? run), ...(stride ? { stride } : {}),
    ...(learned ? { learned } : {}), ...(envelope ? { envelope } : {}) };
};

/** The defaults every body takes scaled to its leg (`scaledGait`) where it has no record of its own. */
const DEFAULTS: WalkRunRecord = deepFreeze({ walk: WALK_RUN, run: WALK_RUN_CYCLE });

/** Walk/run permission changes preserve a body's motion only under identical physical settings. */
const motion = new WeakMap<Body, Map<string, Locomotion>>();

/** The named anatomical channels consumed by the cycle and its arm swing. */
function walkRunRefusal(spec: BodySpec): string | null {
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
  tuning: ["walk", "run", "braking", "stride", "learned", "envelope"], fits: walkRunRefusal,
  faults: (config) => {
    if (config.tuning !== undefined && (!config.tuning || typeof config.tuning !== "object" || Array.isArray(config.tuning))) return ["invalid walk and run tuning"];
    if (config.tuning && Object.values(config.tuning).some(value => !value || typeof value !== "object" || Array.isArray(value))) return ["invalid walk and run tuning"];
    const { walk, run, braking, stride, learned, envelope } = tunedOver(DEFAULTS, config);
    return [
      ...learned === undefined ? [] : learnedRunFaults(learned),
      ...(envelope === undefined || validStanceEnvelope(envelope) ? [] : ["invalid travel envelope"]),
      ...(stride === undefined || validGaitTuning(stride) ? [] : ["invalid travel stride settings"]),
      ...validRunCycle(braking) ? [] : ["a braking cycle needs the run cycle's complete valid settings"],
      ...validWalkRun(walk) ? [] : ["a walk and run's walk gives only the walk's settings, each finite, its run, turns and leg positive, timed to its haste to the power 0, 1/2 or 1"],
      ...validRunCycle(run) ? [] : ["a walk and run's run gives only the run's settings, each finite, its times and the cycle's positive and its shares of strength within (0, 1]"],
    ];
  },
  reads: () => ["walk-run"],
  runs: (config) => config.runs ?? true,
  make: (body, config) => {
    const { walk, run, braking, stride, learned, envelope } = tunedOver(dataOf("walk-run")[bodyKey(body.built.spec)]?.settings ?? DEFAULTS, config);
    let settings = motion.get(body);
    if (!settings) motion.set(body, settings = new Map());
    const key = recordingKey({ walk, run, braking, ...(stride ? { stride } : {}), ...(learned ? { learned } : {}), ...(envelope ? { envelope } : {}) });
    let shared = settings.get(key);
    if (!shared) {
      const motion = walkRun(body, walk, run, { may: config.runs ?? true, braking, stride, envelope, entry: learned?.entry, trim: learned?.trim });
      settings.set(key, shared = learned ? learnedRun(body, motion, learned, run.settle) : motion);
    }
    const controller = shared, may = config.runs ?? true;
    const goal: Locomotion["goal"] = (view, asked, dt, context) => { controller.runs?.(may); return controller.goal(view, asked, dt, context); };
    const resume: Locomotion["resume"] = view => { controller.runs?.(may); controller.resume(view); };
    return Object.freeze(Object.create(controller, { goal: { value: goal }, resume: { value: resume } })) as Locomotion;
  },
});

declare module "../config.ts" {
  interface GaitConfigs {
    readonly "walk-run": WalkRunConfig;
  }
}
