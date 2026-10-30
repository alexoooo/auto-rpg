import { anyBody, slotOne, type PartConfig } from "../parts/parts.ts";
import { deepFreeze } from "../state.ts";
import { motorControl } from "./motor.ts";
import type { MotorPart } from "./motor-part.ts";

/** **The whole-body solve** (`motorControl`, `solveBody`): its balance's asks, the posture's and the points' as one problem. */
interface WholeBodyMotorConfig { readonly kind: "whole-body"; readonly balance: PartConfig }

/** **The whole-body solve** as a motor control: the game's, and what a body whose mind names none is given. */
export const WHOLE_BODY_MOTOR: MotorPart<WholeBodyMotorConfig> = deepFreeze({
  role: "motor", label: "Whole-body solve", stage: "game", fields: [], slots: [slotOne("balance", "Balance", "balance")],
  defaults: { kind: "whole-body", balance: { kind: "stance" } }, keys: { kind: true, balance: true },
  fits: anyBody, faults: () => [],
  make: (config, parts) => {
    const balance = parts.of("balance", config.balance).make(config.balance);
    return (built, seconds, posture, stanceTuning, assist) => motorControl(built, seconds, posture, stanceTuning, assist, balance);
  },
});
