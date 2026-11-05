import type { PartLookup } from "../parts/lookup.ts";
import type { KeysOf, Part, PartConfig } from "../parts/parts.ts";
import type { ReadBody } from "../core/bodies/read-body.ts";
import type { MuscleReading } from "../core/bodies/muscle/driver.ts";
import type { AssistReading } from "../core/bodies/assist.ts";
import type { MotorControl } from "./motor.ts";
import type { Pose } from "../core/bodies/spec/pose.ts";
import type { StanceTuning } from "./stance-tuning.ts";

/**
 * **What makes a motor control**: from the body, the muscles it drives, its servo's time constant,
 * its posture, its stance's tuning and its assist; it says the goals it carries out
 * (`MotorControl.carries`).
 */
export type MotorMaker = (built: ReadBody, muscles: MuscleReading, seconds: number, posture?: Pose, stanceTuning?: StanceTuning, assist?: AssistReading | null) => MotorControl;

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
