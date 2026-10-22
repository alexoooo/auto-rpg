import type { SupportEndpoint } from "../control/supported-motor.ts";
import { supportedMotor } from "../control/supported-motor.ts";
import type { OwnBody } from "../mind/mind.ts";
import { deepFreeze } from "../state.ts";
import { fitsPaws, type SupportMotorPart } from "./parts.ts";
import { REPTILE_MOTOR, REPTILE_TRAVEL } from "./tuning.ts";

/** **The paw motor**'s config. */
interface PawMotorConfig { readonly kind: "paw-motor" }

/**
 * **The paw motor**: the floating-base support solve over the paws (`supportedMotor`), holding at
 * `REPTILE_MOTOR`'s response and travelling at `REPTILE_TRAVEL`'s.
 */
export const PAW_MOTOR_PART: SupportMotorPart<PawMotorConfig> = deepFreeze({
  role: "support-motor", label: "Paw support", stage: "game", fields: [], slots: [], defaults: { kind: "paw-motor" }, keys: { kind: true },
  fits: fitsPaws, faults: () => [],
  make: (own: OwnBody, paws: readonly SupportEndpoint[]) => ({ motor: supportedMotor(own, paws, REPTILE_MOTOR), hold: REPTILE_MOTOR, travel: REPTILE_TRAVEL }),
});
