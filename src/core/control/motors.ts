import { WHOLE_BODY_MOTOR } from "./whole-body-motor.ts";

/**
 * **Every kind of motor control, by its kind** (`MotorPart`), in the order a picker offers them:
 * what a mind's `motor` slot holds, a line here registering one. This module holds its imports and
 * this list and nothing else: a case's code reads it as where each kind's own code begins
 * (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const MOTORS = { "whole-body": WHOLE_BODY_MOTOR };
