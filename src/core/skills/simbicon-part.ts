import type { LocomotionPart } from "../mind/locomotion-part.ts";
import { takesCommands } from "../mind/parts.ts";
import { deepFreeze } from "../state.ts";
import { runCycleSettings, validRunCycle, type RunCycleSettings } from "./cycle-run.ts";
import { SIMBICON, simbicon, simbiconWays, validSimbicon, validWays, type SimbiconSettings, type SimbiconWay } from "./simbicon.ts";

/**
 * **The SIMBICON walk** (`simbicon`): the legs driven by a state machine with no stance, its settings
 * these, forward's; and the settings it takes walking to a side or back in place of forward's, over its own (`SimbiconWays`),
 * and running, over the run's. It runs unless `runs` is false (`Locomotion.runs`).
 */
interface SimbiconConfig extends SimbiconSettings {
  readonly kind: "simbicon";
  readonly runs?: boolean;
  readonly tuning?: { readonly side?: Partial<SimbiconWay>; readonly back?: Partial<SimbiconWay>; readonly run?: Partial<RunCycleSettings> };
}

/** A SIMBICON walk's config's settings, its kind taken off. */
const settingsOf = ({ kind: _, tuning: __, runs: ___, ...settings }: SimbiconConfig): SimbiconSettings => settings;

/**
 * **The SIMBICON walk** (`simbicon`): it holds its walk's envelope (`simbiconEnvelope`) and, while it
 * may run, its run's, and stops at its `slowdown`, or its run's `brake` while it may run.
 */
export const SIMBICON_PART: LocomotionPart<SimbiconConfig> = deepFreeze({
  role: "locomotion", label: "SIMBICON walk", stage: "game", fields: [], slots: [], defaults: { kind: "simbicon", ...SIMBICON },
  keys: {
    kind: true, tuning: true, runs: true, seconds: true, longest: true, swingHip: true, swingHipLate: true,
    swingKnee: true, swingKneeLate: true, swingSpread: true, swingAnkle: true, swingAnkleLate: true,
    stanceKnee: true, stanceKneeLate: true, stanceAnkle: true, cvAnkle: true, cvAnkleSide: true, lean: true,
    cd: true, cv: true, cdLate: true, cvLate: true, cdSide: true, cvSide: true, landing: true, lead: true,
    leadSide: true, leadOut: true, width: true, vf: true, vfSide: true, vfMost: true, trim: true,
    trimSide: true, trimMost: true, trimLeak: true, settle: true, stance: true, swing: true, ankle: true,
    pelvis: true, hold: true, turn: true, swerve: true, turnRate: true, speedup: true, slowdown: true, arms: true, run: true, leg: true, hasted: true,
  },
  tuning: ["side", "back", "run"], fits: takesCommands,
  faults: (config) => [
    ...validSimbicon(settingsOf(config)) ? [] : ["a SIMBICON gait needs every setting finite, its times, turn, swerve, turn's change, speed-up, run and leg positive, and its shares of strength within (0, 1]"],
    ...validWays(simbiconWays(config.tuning)) ? [] : ["a SIMBICON gait's side and back give only the settings a way changes, each finite"],
    ...validRunCycle(runCycleSettings(config.tuning?.run)) ? [] : ["a SIMBICON gait's run gives only the run's settings, each finite, its times and the cycle's positive and its shares of strength within (0, 1]"],
  ],
  runs: (config) => config.runs ?? true,
  make: (body, config) => simbicon(body, settingsOf(config), simbiconWays(config.tuning), runCycleSettings(config.tuning?.run), config.runs ?? true),
});
