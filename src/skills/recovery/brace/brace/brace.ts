import { deepFreeze } from "../../../../core/state.ts";
import { poseDrive } from "../../shared/technique.ts";
import type { MuscleCommand } from "../../../../core/bodies/muscle/driver.ts";

/** Protective flexion keeps the chin tucked and the forearms before the face while falling. */
const BRACE = deepFreeze({ "cervical flexion": .3, "shoulder.left flexion": .8, "shoulder.right flexion": .8,
  "elbow.left flexion": 1.7, "elbow.right flexion": 1.7, "hip.left flexion": .8, "hip.right flexion": .8,
  "knee.left flexion": 1.2, "knee.right flexion": 1.2 });

/** How the brace is driven, firmly (`poseDrive`): the seconds a gap closes in, the top rate, rad/s, and the activation. */
const BRACING = deepFreeze({ within: .3, top: 2, activation: .4 });

/** Drive the brace (`BRACE`, `BRACING`) with `drive` (`poseDrive`). */
export const brace = (drive: ReturnType<typeof poseDrive>, command: MuscleCommand): void => drive(command, BRACE, BRACING.within, BRACING.top, BRACING.activation);
