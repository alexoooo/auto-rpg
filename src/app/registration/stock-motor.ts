import { STANCE_BALANCE } from "../../skills/locomotion/stance/index.ts";
import { wholeBodyMotor, wholeBodyMotorPart } from "../../control/whole-body-motor.ts";

export const WHOLE_BODY_MOTOR = wholeBodyMotorPart(STANCE_BALANCE.defaults);

/** Stock standing probes select the same calibrated balance as game composition. */
export const stockMotor = () => wholeBodyMotor({ balance: STANCE_BALANCE.make(STANCE_BALANCE.defaults),
  reference: STANCE_BALANCE.reference, envelope: (spec, experiment) => STANCE_BALANCE.envelope(spec, STANCE_BALANCE.defaults, experiment) });
