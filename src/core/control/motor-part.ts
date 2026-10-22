import type { KeysOf, Part, PartConfig } from "../mind/parts.ts";
import type { motorControl } from "./motor.ts";

/**
 * **A kind of motor control**: a part of role `motor` that owns its config's type, keys, defaults,
 * faults and fit, and makes what turns a body's goals into its muscles' command. It is made as
 * `motorControl` is: from the body, its servo's time constant, its posture, its stance's tuning
 * and its assist, and takes the goals `BodyCommand` names; a kind that needs other goals brings
 * their vocabulary with it.
 */
export interface MotorPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "motor";
  readonly keys: KeysOf<C>;
  readonly make: typeof motorControl;
}
