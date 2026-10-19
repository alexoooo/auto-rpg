import type { BehaviourConfig, ExecutorConfig, MotorConfig, MoveRuleConfig, ReflexConfig, SkillConfig, SubMindConfig, TacticsConfig } from "./config.ts";
import { deepFreeze } from "../state.ts";

type Config = SubMindConfig | TacticsConfig | BehaviourConfig | MoveRuleConfig | SkillConfig | ExecutorConfig | ReflexConfig | MotorConfig;

/** Every accepted top-level key of a part below a mind, including optional settings; a mind's are
 * its controller's (`Controller.keys`). The mapped type requires every config property and
 * rejects extras; editor fields and default values carry no validation authority. Each part's
 * faults predicate validates values, and its slots validate nested parts. */
export const CONFIG_KEYS = deepFreeze({
  "get-away": { kind: true, metres: true },
  "ground-fight": { kind: true, reach: true, kicks: true },
  "stand-up": { kind: true, techniques: true },
  "lie": { kind: true },
  "support-recovery": { kind: true },
  "research-rise": { kind: true },
  "script": { kind: true },
  "stand": { kind: true },
  "behaviours": { kind: true, target: true, choose: true, list: true },
  "follow-orders": { kind: true },
  "flee": { kind: true },
  "close-in": { kind: true, metres: true },
  "keep-distance": { kind: true, metres: true },
  "attack": { kind: true },
  "clear-of-walls": { kind: true },
  "clear-of-fallen": { kind: true },
  "evade": { kind: true },
  "approach": { kind: true, spacing: true, spacingStep: true },
  "break-clinch": { kind: true, metres: true },
  "edge": { kind: true, band: true, patience: true },
  "ground": { kind: true },
  "cover": { kind: true, guard: true },
  "stance-walk": { kind: true, tuning: true },
  "stride": {
    kind: true, swing: true, transfer: true, lift: true, settle: true, width: true, longest: true, accel: true,
    turn: true, paced: true, lands: true, push: true, launch: true, lead: true, momentum: true, lever: true,
    arms: true, ramp: true, drive: true, lengthen: true,
  },
  "run": {
    kind: true, contact: true, flight: true, lift: true, settle: true, width: true, gain: true, accel: true,
    turn: true, drop: true, arms: true, drive: true, lever: true,
  },
  "simbicon": {
    kind: true, tuning: true, runs: true, seconds: true, longest: true, swingHip: true, swingHipLate: true,
    swingKnee: true, swingKneeLate: true, swingSpread: true, swingAnkle: true, swingAnkleLate: true,
    stanceKnee: true, stanceKneeLate: true, stanceAnkle: true, cvAnkle: true, cvAnkleSide: true, lean: true,
    cd: true, cv: true, cdLate: true, cvLate: true, cdSide: true, cvSide: true, landing: true, lead: true,
    leadSide: true, leadOut: true, width: true, vf: true, vfSide: true, vfMost: true, trim: true,
    trimSide: true, trimMost: true, trimLeak: true, settle: true, stance: true, swing: true, ankle: true,
    pelvis: true, hold: true, turn: true, swerve: true, turnRate: true, speedup: true, slowdown: true, arms: true, run: true, leg: true, hasted: true,
  },
  "walk-run": { kind: true, tuning: true, runs: true, run: true, turn: true, swerve: true, turnRate: true, leg: true, hasted: true },
  "learned-run": { kind: true, policy: true, tuning: true, runs: true, run: true, turn: true, swerve: true, turnRate: true, leg: true, hasted: true },
  "move": { kind: true, rules: true, otherwise: true },
  "when-standing": { kind: true, gait: true },
  "when-distance": { kind: true, of: true, than: true, metres: true, gait: true },
  "cover-guard": { kind: true, tuning: true },
  "recipe-strike": { kind: true, name: true, tuning: true },
  "path-strike": { kind: true, name: true, overlap: true, tuning: true },
  "driven-strike": { kind: true, name: true, tuning: true, drive: true, torso: true, windup: true, contact: true },
  "whole-body-strike": { kind: true, name: true, drive: true },
  "straight-punch": {
    kind: true, name: true, pace: true, reach: true, band: true, settle: true, through: true, hips: true, turn: true,
    lean: true, chamber: true, lead: true, elbow: true, brake: true, follow: true, longest: true,
    recover: true, landed: true, driven: true,
  },
  "combination": {
    kind: true, name: true, pace: true, reach: true, band: true, settle: true, through: true, hips: true, turn: true,
    lean: true, chamber: true, lead: true, elbow: true, brake: true, follow: true, longest: true,
    recover: true, landed: true, driven: true, drives: true, gap: true, poise: true, wait: true,
  },
  "front-kick": { kind: true, name: true, tuning: true },
  "support-fold": { kind: true },
  "cover-reflex": { kind: true },
  "whole-body": { kind: true },
} satisfies { readonly [K in Config["kind"]]: { readonly [P in keyof Extract<Config, { kind: K }>]-?: true } });
