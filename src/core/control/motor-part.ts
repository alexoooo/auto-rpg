import type { PartLookup } from "../mind/lookup.ts";
import type { KeysOf, Part, PartConfig } from "../mind/parts.ts";
import type { ReadBody } from "../read-body.ts";
import type { Assist } from "./assist.ts";
import type { MotorControl, Pose } from "./motor.ts";
import type { StanceTuning } from "./stance-tuning.ts";

/**
 * **What makes a motor control**: from the body, its servo's time constant, its posture, its
 * stance's tuning and its assist, as `motorControl` is; it says the goals it carries out
 * (`MotorControl.carries`).
 */
export type MotorMaker = (built: ReadBody, seconds: number, posture?: Pose, stanceTuning?: StanceTuning, assist?: Assist | null) => MotorControl;

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
