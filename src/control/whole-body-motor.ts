import type { ConfigFor } from "../parts/lookup.ts";
import { slotOne } from "../parts/parts.ts";
import { deepFreeze } from "../core/state.ts";
import { motorControl } from "./motor.ts";
import type { MotorMaker, MotorPart } from "./motor-part.ts";
import { MOTOR_PATHS, MOTOR_STANCE } from "./motor-part.ts";
import type { BalanceMaker } from "./balance-part.ts";

/** The whole-body solve and the calibration supplied by its configured balance. */
export function wholeBodyMotor({ balance, envelope, reference }: { readonly balance: BalanceMaker; readonly envelope: MotorMaker["envelope"]; readonly reference?: MotorMaker["reference"] }): MotorMaker {
  return {
    requirements: Object.freeze([MOTOR_STANCE, MOTOR_PATHS]),
    reference,
    make: (built, _muscles, seconds, posture, stanceTuning, assist) => motorControl(built, seconds, posture ?? {}, stanceTuning, assist ?? null, balance),
    envelope,
  };
}

/** **The whole-body solve** (`motorControl`, `solveBody`): its balance's asks, the posture's and the points' as one problem. */
interface WholeBodyMotorConfig { readonly kind: "whole-body"; readonly balance: ConfigFor<"balance"> }

/** **The whole-body solve** as a motor control: the game's, and what a body whose mind names none is given. */
export const wholeBodyMotorPart = (balanceDefault: ConfigFor<"balance">): MotorPart<WholeBodyMotorConfig> => deepFreeze({
  role: "motor", label: "Whole-body solve", stage: "game", fields: [], slots: [slotOne("balance", "Balance", "balance")],
  defaults: { kind: "whole-body", balance: balanceDefault }, keys: { kind: true, balance: true },
  // It fits a body its balance stands.
  fits: (spec, config, parts) => parts.of("balance", config.balance).fits(spec, config.balance, parts), faults: () => [],
  make: (config, parts) => {
    const balance = parts.of("balance", config.balance);
    return wholeBodyMotor({ balance: balance.make(config.balance), reference: balance.reference, envelope: (spec, experiment) => balance.envelope(spec, config.balance, experiment) });
  },
});

declare module "./motor-part.ts" {
  interface MotorConfigs {
    readonly "whole-body": WholeBodyMotorConfig;
  }
}
