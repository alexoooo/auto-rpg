import { partsByKind, type ConfigOf } from "../mind/parts.ts";
import type { MotorPart } from "./motor-part.ts";
import { WHOLE_BODY_MOTOR } from "./whole-body-motor.ts";

/**
 * **Every kind of motor control, by its kind** (`MotorPart`), in the order a picker offers them:
 * what a mind's `motor` slot holds. A kind is its own module and a line here.
 */
export const MOTOR_PARTS = partsByKind([WHOLE_BODY_MOTOR]);

/** **A motor control's config**, by kind (`MOTOR_PARTS`). */
export type MotorConfig = ConfigOf<typeof MOTOR_PARTS>;

/** The motor control `config` names, made as `motorControl` is; the game's, the whole-body solve, where it names none. */
export function motorOf(config: MotorConfig | null | undefined): MotorPart["make"] {
  const kind = config?.kind ?? WHOLE_BODY_MOTOR.defaults.kind;
  const part = Object.hasOwn(MOTOR_PARTS, kind) ? (MOTOR_PARTS as Readonly<Record<string, unknown>>)[kind] : undefined;
  if (!part) throw new Error(`no motor control of kind ${JSON.stringify(kind)}`);
  return (part as MotorPart).make;
}
