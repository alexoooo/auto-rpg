import type { MotorMaker } from "../../control/motor-part.ts";
import type { Pose } from "../../core/bodies/spec/pose.ts";
import type { ReadBody } from "../../core/bodies/read-body.ts";
import type { GuardSkill } from "./guard.ts";
import type { PartLookup } from "../../parts/lookup.ts";

/**
 * **What a mind hands the parts that drive its body themselves** (a sub-mind and its techniques):
 * its own motor and guard, so that a part swapped into the mind is the part they use.
 */
export interface MotorAndGuard {
  /** What makes a motor control: the mind's motor (`MotorPart.make`). */
  readonly motor: MotorMaker;
  /** The arms' rest: the mind's guard's posture for the body (`GuardPart.posture`). */
  readonly posture: Pose;
  /** The mind's guard, made for `built` (`GuardPart.make`). */
  guard(built: ReadBody): GuardSkill;
  /** The parts the mind's config may name, for the parts a sub-mind names (a stand-up's techniques). */
  readonly parts: PartLookup;
}
