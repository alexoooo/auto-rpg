import { PAW_MOTOR_PART } from "./paw-motor.ts";

/**
 * **Every motor over support chains, by its kind** (`SupportMotorPart`), in the order a picker
 * offers them. This module holds its imports and this list and nothing else (`caseCoder`,
 * `scripts/build-identity.mjs`).
 */
export const SUPPORT_MOTORS = { "paw-motor": PAW_MOTOR_PART };
