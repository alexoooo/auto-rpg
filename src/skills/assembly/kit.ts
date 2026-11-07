import type { MindKit } from "../framework/mind-kit.ts";
import type { Locomotion } from "../framework/locomotion-part.ts";
import type { Body } from "../../control/body.ts";
import type { MotorMaker } from "../../control/motor-part.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { Legs } from "../framework/locomotion-part.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { PartConfig } from "../../parts/parts.ts";
import { adaptLegs } from "../framework/leg-adapter.ts";

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

/** Why a selected or automatically fitted part under the body's skills cannot serve `spec`; null where every filled place fits. */
export function filledRefusal(parts: PartLookup, spec: BodySpec, given: Filled = {}): string | null {
  for (const filled of Object.keys(FILLED) as (keyof typeof FILLED)[]) {
    const part = given[filled] ?? parts.fitting(FILLED[filled], spec);
    if (typeof part === "string") return part;
    const refused = parts.of(FILLED[filled], part).fits(spec, part, parts);
    if (refused !== null) return `${filled}: ${refused}`;
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
 * extended by the leg capabilities registered with the catalog (`adaptLegs`).
 */
export function legsOf(parts: PartLookup, body: Body, config: PartConfig): Locomotion {
  return adaptLegs(parts, body, parts.of("locomotion", config).make(body, config, legsFrom(parts)));
}


/** **The kit of a body of `spec`**: its motor and its guard, each the one `given` passes in, else the one the body fits (`filledOf`), as `parts` finds it. */
export function mindKitOf(parts: PartLookup, spec: BodySpec, given: Filled = {}): MindKit {
  const guarding = filledOf(parts, spec, "guard", given), guard = parts.of("guard", guarding);
  return { motor: motorOf(parts, filledOf(parts, spec, "motor", given)), posture: guard.posture(spec, guarding), guard: (built) => guard.make(built, guarding), parts };
}
