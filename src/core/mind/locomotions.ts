import type { Body } from "../body.ts";
import type { Locomotion } from "../skills/locomotion.ts";
import { LEARNED_RUN_PART } from "../skills/learned-run-part.ts";
import { MOVE_PART } from "../skills/move-part.ts";
import { RUN_PART } from "../skills/run-part.ts";
import { SIMBICON_PART } from "../skills/simbicon-part.ts";
import { STANCE_WALK_PART } from "../skills/stance-walk-part.ts";
import { STRIDE_PART } from "../skills/stride-part.ts";
import { WALK_RUN_PART } from "../skills/walk-run-part.ts";
import type { Legs, LocomotionPart } from "./locomotion-part.ts";
import { partsByKind, type ConfigOf, type PartConfig } from "./parts.ts";

/**
 * **Every locomotion, by its kind** (`LocomotionPart`), in the order a picker offers them: what a
 * locomotion slot holds. A kind is its own module and a line here.
 */
export const LOCOMOTION_PARTS = partsByKind([STANCE_WALK_PART, STRIDE_PART, RUN_PART, SIMBICON_PART, WALK_RUN_PART, LEARNED_RUN_PART, MOVE_PART]);

/** **The legs' skill's config**, by kind (`LOCOMOTION_PARTS`). */
export type LocomotionConfig = ConfigOf<typeof LOCOMOTION_PARTS>;

/** The locomotion of `config`'s kind; a thrown error for a kind none has, read from a save or a link. */
function locomotionPart(config: PartConfig): LocomotionPart {
  const part = Object.hasOwn(LOCOMOTION_PARTS, config.kind) ? (LOCOMOTION_PARTS as Readonly<Record<string, unknown>>)[config.kind] : undefined;
  if (!part) throw new Error(`no locomotion of kind ${JSON.stringify(config.kind)}`);
  return part as LocomotionPart;
}

/** Legs of any registered kind, as Move makes its gaits. */
const LEGS: Legs = Object.freeze({
  make: (body: Body, config: PartConfig) => legsOf(body, config),
  runs: (config: PartConfig) => locomotionPart(config).runs?.(config),
});

/** **The legs' skill** of `config` for `body` (`LocomotionPart.make`). */
export function legsOf(body: Body, config: PartConfig): Locomotion {
  return locomotionPart(config).make(body, config, LEGS);
}
