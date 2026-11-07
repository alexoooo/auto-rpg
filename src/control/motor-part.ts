import type { PartLookup } from "../parts/lookup.ts";
import type { KeysOf, Part, PartConfig, Requirement } from "../parts/parts.ts";
import { SUPPORT_REFERENCE } from "./support-reference.ts";

export const MOTOR_STANCE = "motor-stance";
export const MOTOR_SUPPORT = "motor-support";
export const MOTOR_PATHS = "motor-paths";
declare module "../parts/parts.ts" {
  interface Requirements { readonly [MOTOR_STANCE]: true; readonly [MOTOR_SUPPORT]: true; readonly [MOTOR_PATHS]: true }
}
import type { ReadBody } from "../core/bodies/read-body.ts";
import type { MuscleReading } from "../core/bodies/muscle/driver.ts";
import type { AssistReading } from "../core/bodies/assist.ts";
import type { MotorControl } from "./motor.ts";
import type { Pose } from "../core/bodies/spec/pose.ts";
import type { StanceTuning } from "./stance/stance-tuning.ts";
import type { BodySpec } from "../core/bodies/spec/body.ts";
import type { Experiment } from "./body.ts";
import type { StanceEnvelope } from "./stance/stance-envelope.ts";

/**
 * **What makes a motor control**: from the body, the muscles it drives, its servo's time constant,
 * its posture, its stance's tuning and its assist; it says the goals it carries out
 * (`MotorControl.carries`).
 */
export interface MotorMaker {
  /** Mechanical requirements this configured motor satisfies before construction. */
  readonly requirements?: readonly Requirement[];
  readonly reference?: import("./support-reference.ts").SupportReference;
  make(built: ReadBody, muscles: MuscleReading, seconds: number, posture?: Pose, stanceTuning?: StanceTuning, assist?: AssistReading | null): MotorControl;
  /** The calibration this implementation supplies for the body and research settings. */
  envelope(spec: BodySpec, experiment: Experiment): StanceEnvelope | null;
}

/** Admit the capabilities consumed by configured skills before constructing a motor. */
export function motorRequirementRefusal(motor: MotorMaker, spec: BodySpec, requirements: readonly Requirement[]): string | null {
  for (const requirement of requirements) {
    if (requirement === SUPPORT_REFERENCE) {
      if (!motor.reference) return "the selected skills require a motor support reference";
      const refusal = motor.reference.fits(spec);
      if (refusal) return refusal;
    } else if (!motor.requirements?.includes(requirement)) return `the selected skills require ${requirement}`;
  }
  return null;
}

/**
 * **A kind of motor control**: a part of role `motor` that owns its config's type, keys, defaults,
 * faults and fit, and gives what makes the motor control of a config (`MotorMaker`): the body's,
 * and each sub-mind's that drives the body itself. A kind that needs other goals brings their
 * vocabulary with it.
 */
export interface MotorPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "motor";
  readonly keys: KeysOf<C>;
  /** What makes a motor control of `config`, the parts it names (its balance) as `parts` finds them. */
  make(config: C, parts: PartLookup): MotorMaker;
}

declare module "../parts/lookup.ts" {
  interface RoleParts {
    readonly motor: MotorPart;
  }
}
