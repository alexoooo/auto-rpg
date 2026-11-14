import type { RunCycleSettings } from "./cycle-run.ts";
import type { GaitTuning } from "../../../../control/stance/stance-tuning.ts";
import type { WalkRunSettings } from "./walk-run.ts";

/**
 * **What a gait's setting measures**, for its scaling to a leg of another length by dynamic
 * similarity (a pendulum's gait at the same Froude number, Alexander and Jayes 1983): with the legs'
 * ratio k, a time goes as √k, a length as k, a speed as √k, and an angle, a share of strength or an
 * acceleration not at all.
 */
type Dimension = "time" | "length" | "speed" | "per-length" | "per-speed" | "rate" | "rate-change" | "same";

/** Each setting's dimension, the walk and run's and the run's. */
const DIMENSION: { readonly [K in keyof WalkRunSettings | keyof RunCycleSettings]: Dimension } = Object.freeze({
  settle: "time", pelvis: "time", contact: "time", gainSide: "time", wait: "time",
  width: "length", leg: "length", run: "speed", gainsFrom: "speed", ahead: "speed", paceGain: "per-length", swingGain: "per-speed", cadenceGain: "per-speed",
  turn: "rate", turnRate: "rate-change", cd: "per-length", cdSide: "per-length", arms: "per-length", cv: "per-speed", cvAnkleSide: "per-speed", leanGain: "per-speed",
  lean: "same", stance: "same", swing: "same", ankle: "same", hold: "same", elbow: "same", swerve: "same", hasted: "same", blend: "same", short: "same", leanMost: "same",
  bank: "same", period: "same", accel: "same", brake: "same", late: "same", paceMost: "same", kneeAdd: "same", ankleAdd: "same", hipAdd: "same", early: "same",
});

/**
 * What a setting of `dimension` is multiplied by for a leg `k` times as long, given `root`, √k, on a
 * body whose gait is `quick` times as quick (`quickness`): its times shortened by it, its lengths kept.
 */
function factor(dimension: Dimension, k: number, root: number, quick: number): number {
  switch (dimension) {
    case "time": return root / quick;
    case "speed": return root * quick;
    case "length": return k;
    case "per-length": return 1 / k;
    case "rate-change": return 1 / k * quick * quick;
    case "per-speed": return 1 / root / quick;
    case "rate": return 1 / root * quick;
    case "same": return 1;
    default: { const never: never = dimension; throw new Error(`no dimension ${String(never)}`); }
  }
}

/**
 * `settings` (the walk and run's or the run's) for a leg `k` times as long as the one they were set
 * for, on a body whose gait is `quick` times as quick; `settings` itself if both are 1.
 */
export function scaledGait<T extends Partial<Record<keyof typeof DIMENSION, number>>>(settings: T, k: number, quick = 1): T {
  if (k === 1 && quick === 1) return settings;
  const root = Math.sqrt(k);
  return Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, value * factor(DIMENSION[key as keyof typeof DIMENSION], k, root, quick)])) as T;
}

/** A stride on another leg: lengths follow the leg, times its pendulum time and haste. */
export function scaledStride(stride: GaitTuning, k: number, quick = 1): GaitTuning {
  if (k === 1 && quick === 1) return stride;
  const time = Math.sqrt(k) / quick;
  return { ...stride, seconds: stride.seconds * time, lift: stride.lift * k, width: stride.width * k,
    clearance: stride.clearance * k, crouch: stride.crouch * k, horizon: stride.horizon * time,
    ...(stride.transfer === undefined ? {} : { transfer: stride.transfer * time }),
    ...(stride.preswing === undefined ? {} : { preswing: { ...stride.preswing, seconds: stride.preswing.seconds * time } }) };
}

/** How many times as quick the gait of a body hasted `haste` times a person (`hasteOver`) is, timed by `hasted` (`WalkRunSettings.hasted`). */
export function quickness(haste: number, hasted: number): number {
  if (hasted === 0) return 1;
  if (hasted === 0.5) return Math.sqrt(haste);
  if (hasted === 1) return haste;
  throw new Error(`a gait is timed to its haste to the power 0, 1/2 or 1, not ${hasted}`);
}
