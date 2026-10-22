import type { BehaviourConfig, MotorConfig, ReflexConfig, SkillConfig, TacticsConfig } from "./config.ts";
import type { MoveRuleConfig } from "../skills/move-part.ts";
import { deepFreeze } from "../state.ts";
import type { NavigationConfig } from "./navigation.ts";

type Config = TacticsConfig | BehaviourConfig | MoveRuleConfig | SkillConfig | ReflexConfig | MotorConfig | NavigationConfig;

/** Every accepted top-level key of a part below a mind, including optional settings; a mind's are
 * its controller's (`Controller.keys`), and a registered implementation's its own (`LocomotionPart.keys`, `SubMindPart.keys`, `ExecutorPart.keys`). The mapped type requires every config property and
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
  "support-fold": { kind: true },
  "cover-reflex": { kind: true },
  "whole-body": { kind: true },
} satisfies { readonly [K in Config["kind"]]: { readonly [P in keyof Extract<Config, { kind: K }>]-?: true } });
