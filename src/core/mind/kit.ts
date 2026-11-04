import type { Body } from "../body.ts";
import type { MotorMaker } from "../control/motor-part.ts";
import type { Pose } from "../spec/pose.ts";
import type { ReadBody } from "../read-body.ts";
import type { GuardSkill } from "../skills/guard/guard.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Locomotion } from "../skills/locomotion/locomotion.ts";
import type { Legs } from "../skills/framework/locomotion-part.ts";
import type { PartLookup } from "../parts/lookup.ts";
import type { PartConfig } from "../parts/parts.ts";

import { lowering } from "../recovery/rise/lowering.ts";

/**
 * **What lies under every skill of a body**, by the name an experiment passes it in by: what turns
 * its goals into its muscles' command (`motor`), the legs it stands and walks on (`legs`, role
 * `locomotion`), and its guard, the arms' rest it is built in and covers from (`guard`).
 */
export const FILLED = Object.freeze({ motor: "motor", legs: "locomotion", guard: "guard" } as const);

/** What lies under a body's skills (`FILLED`), each a part's config: one an experiment passes in, else the one the body fits (`filledOf`). */
export type Filled = { readonly [K in keyof typeof FILLED]?: PartConfig };

/**
 * **The part under `spec`'s skills in `filled`'s place** (`FILLED`): the one `given` passes in,
 * else the one game part of its role that fits the body (`PartLookup.fitting`). A body no single
 * part fits is no body a mind is made on: its mind's fit refused it (`Part.fits`).
 */
export function filledOf(parts: PartLookup, spec: BodySpec, filled: keyof typeof FILLED, given: Filled = {}): PartConfig {
  const part = given[filled] ?? parts.fitting(FILLED[filled], spec);
  if (typeof part === "string") throw new Error(`no ${filled} for ${spec.model}: ${part}`);
  return part;
}

/** Why a body of `spec` has not one part under its skills of each place (`FILLED`) but where `given` passes one in, a sentence; null where it has. */
export function filledRefusal(parts: PartLookup, spec: BodySpec, given: Filled = {}): string | null {
  for (const filled of Object.keys(FILLED) as (keyof typeof FILLED)[]) {
    const part = given[filled] ?? parts.fitting(FILLED[filled], spec);
    if (typeof part === "string") return part;
  }
  return null;
}

/** What makes the motor control `config` names, as `parts` finds it. */
export function motorOf(parts: PartLookup, config: PartConfig): MotorMaker {
  return parts.of("motor", config).make(config, parts);
}

/** Gaits' legs of any kind `parts` finds, as Move makes its gaits (`GaitPart.make`). */
function legsFrom(parts: PartLookup): Legs {
  return { make: (body, config) => parts.of("gait", config).make(body, config), runs: (config) => parts.of("gait", config).runs?.(config), parts };
}

/**
 * **The legs' skill** `config` names for `body`, as `parts` finds it (`LocomotionPart.make`), which
 * also lower the body onto the ends a lowering of its bears on (`lowering`).
 */
export function legsOf(parts: PartLookup, body: Body, config: PartConfig): Locomotion {
  return lowering(body, parts.of("locomotion", config).make(body, config, legsFrom(parts)));
}

/**
 * **A gait's legs alone** `config` names for `body`, as `parts` finds it (`GaitPart.make`), lowering
 * the body as the legs do (`legsOf`): what a rig that walks by one gait stands on.
 */
export function gaitLegsOf(parts: PartLookup, body: Body, config: PartConfig): Locomotion {
  return lowering(body, parts.of("gait", config).make(body, config));
}

/**
 * **What a mind hands the parts that drive its body themselves** (a sub-mind and its techniques):
 * its own motor and guard, so that a part swapped into the mind is the part they use.
 */
export interface MindKit {
  /** What makes a motor control: the mind's motor (`MotorPart.make`). */
  readonly motor: MotorMaker;
  /** The arms' rest: the mind's guard's posture for the body (`GuardPart.posture`). */
  readonly posture: Pose;
  /** The mind's guard, made for `built` (`GuardPart.make`). */
  guard(built: ReadBody): GuardSkill;
  /** The parts the mind's config may name, for the parts a sub-mind names (a stand-up's techniques). */
  readonly parts: PartLookup;
}

/** **The kit of a body of `spec`**: its motor and its guard, each the one `given` passes in, else the one the body fits (`filledOf`), as `parts` finds it. */
export function kitOf(parts: PartLookup, spec: BodySpec, given: Filled = {}): MindKit {
  const guarding = filledOf(parts, spec, "guard", given), guard = parts.of("guard", guarding);
  return { motor: motorOf(parts, filledOf(parts, spec, "motor", given)), posture: guard.posture(spec, guarding), guard: (built) => guard.make(built, guarding), parts };
}
