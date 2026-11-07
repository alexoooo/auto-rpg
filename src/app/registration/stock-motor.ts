import { bodyKey } from "../../core/bodies/spec/body.ts";
import { stanceCalibration } from "../../skills/locomotion/stance/calibration.ts";
import { stanceBalance } from "../../control/stance/stance-balance.ts";
import { wholeBodyMotor, wholeBodyMotorPart } from "../../control/whole-body-motor.ts";
import { stanceEnvelope } from "../../skills/locomotion/stance/envelope.ts";

/** The stock stance uses its measured locomotion envelope. */
export const STANCE_BALANCE = stanceBalance(stanceEnvelope, spec => stanceCalibration(bodyKey(spec)) ?? {});
export const WHOLE_BODY_MOTOR = wholeBodyMotorPart(STANCE_BALANCE.defaults);

/** Stock standing probes select the same calibrated balance as game composition. */
export const stockMotor = () => wholeBodyMotor({ balance: STANCE_BALANCE.make(STANCE_BALANCE.defaults),
  reference: STANCE_BALANCE.reference, envelope: (spec, experiment) => STANCE_BALANCE.envelope(spec, STANCE_BALANCE.defaults, experiment) });
