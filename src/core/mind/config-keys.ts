import type { BehaviourConfig, MindConfig, MoveRuleConfig, SkillConfig, SubMindConfig, TacticsConfig } from "./config.ts";
import { deepFreeze } from "../state.ts";

type Config = MindConfig | SubMindConfig | TacticsConfig | BehaviourConfig | MoveRuleConfig | SkillConfig;

/** Every accepted top-level key, including optional settings. The mapped type requires every config
 * property and rejects extras; editor fields and default values carry no validation authority.
 * Each part's faults predicate validates values, and its slots validate nested parts. */
export const CONFIG_KEYS = deepFreeze({
  "fighter": { kind: true, tactics: true, locomotion: true, guard: true, blow: true, kick: true, support: true, subs: true },
  "direct": { kind: true, targets: true, seconds: true, speed: true, activation: true },
  "quadruped": { kind: true, tuning: true },
  "lie": { kind: true },
  "support-recovery": { kind: true },
  "research-rise": { kind: true },
  "seek": { kind: true, guard: true, aim: true, range: true, tuning: true },
  "openings": {
    kind: true, hands: true, strikes: true, prefers: true, defence: true, combinations: true, spacing: true,
    spacingStep: true, tuning: true,
  },
  "script": { kind: true },
  "stand": { kind: true },
  "behaviours": { kind: true, list: true },
  "follow-orders": { kind: true },
  "flee": { kind: true },
  "close-in": { kind: true, metres: true },
  "keep-distance": { kind: true, metres: true },
  "strike": { kind: true, hands: true, aim: true, blow: true },
  "kick": { kind: true, feet: true, kick: true },
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
    pelvis: true, hold: true, turn: true, swerve: true, turnRate: true, speedup: true, arms: true, run: true, leg: true,
  },
  "move": { kind: true, rules: true, otherwise: true },
  "when-standing": { kind: true, gait: true },
  "when-distance": { kind: true, of: true, than: true, metres: true, gait: true },
  "cover-guard": { kind: true, tuning: true },
  "recipe-strike": { kind: true, tuning: true },
  "path-strike": { kind: true, overlap: true, tuning: true },
  "driven-strike": { kind: true, tuning: true, drive: true, torso: true, windup: true, contact: true },
  "whole-body-strike": { kind: true, drive: true },
  "straight-punch": {
    kind: true, pace: true, reach: true, band: true, settle: true, through: true, hips: true, turn: true,
    lean: true, chamber: true, lead: true, elbow: true, brake: true, follow: true, longest: true,
    recover: true, landed: true,
  },
  "choose-blow": { kind: true, options: true, policy: true },
  "front-kick": { kind: true, tuning: true },
  "support-fold": { kind: true },
} satisfies { readonly [K in Config["kind"]]: { readonly [P in keyof Extract<Config, { kind: K }>]-?: true } });
