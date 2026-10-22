import type { BehaviourConfig, ExecutorConfig, MotorConfig, ReflexConfig, SkillConfig, TacticsConfig } from "./config.ts";
import type { MoveRuleConfig } from "../skills/move-part.ts";
import { deepFreeze } from "../state.ts";
import type { NavigationConfig } from "./navigation.ts";

type Config = TacticsConfig | BehaviourConfig | MoveRuleConfig | SkillConfig | ExecutorConfig | ReflexConfig | MotorConfig | NavigationConfig;

/** Every accepted top-level key of a part below a mind, including optional settings; a mind's are
 * its controller's (`Controller.keys`), and a registered implementation's its own (`LocomotionPart.keys`, `SubMindPart.keys`). The mapped type requires every config property and
 * rejects extras; editor fields and default values carry no validation authority. Each part's
 * faults predicate validates values, and its slots validate nested parts. */
export const CONFIG_KEYS = deepFreeze({
  "visibility-navigation": { kind: true },
  "local-navigation": { kind: true },
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
  "approach": { kind: true, spacing: true, spacingStep: true, travel: true },
  "break-clinch": { kind: true, metres: true },
  "edge": { kind: true, band: true, patience: true },
  "ground": { kind: true },
  "cover": { kind: true, guard: true },
  "when-standing": { kind: true, gait: true },
  "when-distance": { kind: true, of: true, than: true, metres: true, gait: true },
  "cover-guard": { kind: true, tuning: true },
  "shield-guard": { kind: true, tuning: true },
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
  "blade-cut": { kind: true, name: true, tuning: true },
  "blade-thrust": { kind: true, name: true, tuning: true },
  "support-fold": { kind: true },
  "cover-reflex": { kind: true },
  "whole-body": { kind: true },
} satisfies { readonly [K in Config["kind"]]: { readonly [P in keyof Extract<Config, { kind: K }>]-?: true } });
