import { slotOne, type PartConfig } from "../parts/parts.ts";
import { deepFreeze } from "../core/world/state.ts";
import { motorControl } from "./motor.ts";
import type { MotorMaker, MotorPart } from "./motor-part.ts";
import type { BalanceMaker } from "./balance-part.ts";
import { stanceControl } from "./stance.ts";
import { STANCE_BALANCE } from "./stance-balance.ts";

const STOCK_BALANCE: { readonly balance: BalanceMaker; readonly envelope: MotorMaker["envelope"] } = Object.freeze({
  balance: stanceControl,
  envelope: (spec, experiment) => STANCE_BALANCE.envelope(spec, STANCE_BALANCE.defaults, experiment),
});

/** The whole-body solve and the calibration supplied by its configured balance. */
export function wholeBodyMotor({ balance, envelope }: typeof STOCK_BALANCE = STOCK_BALANCE): MotorMaker {
  return {
    make: (built, _muscles, seconds, posture, stanceTuning, assist) => motorControl(built, seconds, posture, stanceTuning, assist, balance),
    envelope,
  };
}

/** **The whole-body solve** (`motorControl`, `solveBody`): its balance's asks, the posture's and the points' as one problem. */
interface WholeBodyMotorConfig { readonly kind: "whole-body"; readonly balance: PartConfig }

/** **The whole-body solve** as a motor control: the game's, and what a body whose mind names none is given. */
export const WHOLE_BODY_MOTOR: MotorPart<WholeBodyMotorConfig> = deepFreeze({
  role: "motor", label: "Whole-body solve", stage: "game", fields: [], slots: [slotOne("balance", "Balance", "balance")],
  defaults: { kind: "whole-body", balance: { kind: "stance" } }, keys: { kind: true, balance: true },
  // It fits a body its balance stands.
  fits: (spec, config, parts) => parts.of("balance", config.balance).fits(spec, config.balance, parts), faults: () => [],
  make: (config, parts) => {
    const balance = parts.of("balance", config.balance);
    return wholeBodyMotor({ balance: balance.make(config.balance), envelope: (spec, experiment) => balance.envelope(spec, config.balance, experiment) });
  },
});
