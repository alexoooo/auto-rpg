import type { ReflexConfig } from "./config.ts";
import type { MoveRuleConfig } from "../skills/move-part.ts";
import { deepFreeze } from "../state.ts";

type Config = MoveRuleConfig | ReflexConfig;

/** Every accepted top-level key of a part below a mind, including optional settings; a mind's are
 * its controller's (`Controller.keys`), and a registered implementation's its own (`LocomotionPart.keys`, `SubMindPart.keys`, `ExecutorPart.keys`, `MotorPart.keys`, `NavigatorPart.keys`, `GuardPart.keys`, `SupportPart.keys`). The mapped type requires every config property and
 * rejects extras; editor fields and default values carry no validation authority. Each part's
 * faults predicate validates values, and its slots validate nested parts. */
export const CONFIG_KEYS = deepFreeze({
  "when-standing": { kind: true, gait: true },
  "when-distance": { kind: true, of: true, than: true, metres: true, gait: true },
  "cover-reflex": { kind: true },
} satisfies { readonly [K in Config["kind"]]: { readonly [P in keyof Extract<Config, { kind: K }>]-?: true } });
