import { STANCE_BALANCE } from "../../skills/locomotion/stance/index.ts";
import { wholeBodyMotor, wholeBodyMotorPart } from "../../control/whole-body-motor.ts";

export const WHOLE_BODY_MOTOR = wholeBodyMotorPart(STANCE_BALANCE.defaults);

/** Stock standing probes select the same calibrated balance as game composition. */
export const stockMotor = () => wholeBodyMotor(STANCE_BALANCE, STANCE_BALANCE.defaults);
