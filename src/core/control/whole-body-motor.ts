import { anyBody } from "../mind/parts.ts";
import { deepFreeze } from "../state.ts";
import { motorControl } from "./motor.ts";
import type { MotorPart } from "./motor-part.ts";

/** **The whole-body solve** (`motorControl`, `solveBody`): the stance's asks, the posture's and the points' as one problem. */
interface WholeBodyMotorConfig { readonly kind: "whole-body" }

/** **The whole-body solve** as a motor control: the game's, and what a body whose mind names none is given. */
export const WHOLE_BODY_MOTOR: MotorPart<WholeBodyMotorConfig> = deepFreeze({
  role: "motor", label: "Whole-body solve", stage: "game", fields: [], slots: [], defaults: { kind: "whole-body" }, keys: { kind: true },
  fits: anyBody, faults: () => [],
  make: motorControl,
});
