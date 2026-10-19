import type { MotorConfig } from "../mind/config.ts";
import type { Part } from "../mind/parts.ts";
import { deepFreeze } from "../state.ts";
import { motorControl } from "./motor.ts";

/** How a kind of motor control is made, as `motorControl` is: from the body, its servo's time constant, its posture, its stance's tuning and its assist. */
type MotorMaker = typeof motorControl;

/**
 * **Every kind of motor control, by its kind**, as a part (`Part`) of role `motor`: what turns a
 * body's goals into its muscles' command. A kind without an entry does not compile.
 */
export const MOTOR_PARTS: { readonly [K in MotorConfig["kind"]]: Part<Extract<MotorConfig, { kind: K }>> } = deepFreeze({
  "whole-body": { role: "motor", label: "Whole-body solve", stage: "game", fields: [], slots: [], defaults: { kind: "whole-body" }, fits: () => true, faults: () => [] },
});

/** The motor control `config` names; the game's, the whole-body solve (`motorControl`), where it names none. */
export function motorOf(config: MotorConfig | null | undefined): MotorMaker {
  const kind = config?.kind ?? "whole-body";
  switch (kind) {
    case "whole-body": return motorControl;
    default: { const never: never = kind; throw new Error(`no motor control of kind ${JSON.stringify(never)}`); }
  }
}
