import type { ConfigFor } from "../parts/lookup.ts";
import { slotOne } from "../parts/parts.ts";
import { deepFreeze } from "../core/state.ts";
import { motorControl } from "./motor.ts";
import type { MotorMaker, MotorPart } from "./motor-part.ts";
import { MOTOR_PATHS, MOTOR_STANCE } from "./motor-part.ts";
import type { BalancePart } from "./balance-part.ts";
import type { PartConfig } from "../parts/parts.ts";

/** The whole-body solve under the balance `part` at `config`, and the reference and calibration that balance supplies. */
export function wholeBodyMotor<C extends PartConfig>(part: BalancePart<C>, config: C): MotorMaker {
  const balance = part.make(config);
  return {
    requirements: Object.freeze([MOTOR_STANCE, MOTOR_PATHS]),
    reference: part.reference,
    make: (built, _muscles, seconds, posture, stanceTuning, assist) => motorControl(built, seconds, posture ?? {}, stanceTuning, assist ?? null, balance),
    envelope: (spec, experiment) => part.envelope(spec, config, experiment),
  };
}

/** **The whole-body solve** (`motorControl`, `solveBody`): its balance's asks, the posture's and the points' as one problem. */
interface WholeBodyMotorConfig { readonly kind: "whole-body"; readonly balance: ConfigFor<"balance"> }

/** **The whole-body solve** as a motor control: the game's, and what a body whose mind names none is given. */
export const wholeBodyMotorPart = (balanceDefault: ConfigFor<"balance">): MotorPart<WholeBodyMotorConfig> => deepFreeze<MotorPart<WholeBodyMotorConfig>>({
  role: "motor", label: "Whole-body solve", fields: [], slots: [slotOne("balance", "Balance", "balance")],
  defaults: { kind: "whole-body", balance: balanceDefault }, keys: { kind: true, balance: true },
  // It fits a body its balance stands.
  fits: (spec, config, parts) => parts.of("balance", config.balance).fits(spec, config.balance, parts), faults: () => [],
  make: (config, parts) => wholeBodyMotor(parts.of("balance", config.balance), config.balance),
});

declare module "./motor-part.ts" {
  interface MotorConfigs {
    readonly "whole-body": WholeBodyMotorConfig;
  }
}
