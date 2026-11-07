import meta from "../../../../../assets/skills/strikes/straight-punch/straight-punch.meta.json" with { type: "json" };
import type { Network } from "../../../../core/math/learning/recovery-network.ts";
import { deepFreeze } from "../../../../core/world/state.ts";
import type { SkillRecord } from "../../../framework/records.ts";
import type { StraightPunch } from "../../straight-punch.ts";

/**
 * **A straight punch's record for one body** (`dataOf("straight-punch")`,
 * `assets/skills/strikes/straight-punch/straight-punch.json`, by `bodyKey`): the settings it was tuned to on that body,
 * whole, and the network that steers it where it was trained (`punchFeatures` in, its steer out,
 * as `PUNCH_LAYOUT` lays them out and `recoveryNetwork` evaluates it), or null; `made` says how
 * (`research/skills/strikes/straight-punch/punch-export.mjs` writes it). A body throws the straight punch by its own record or
 * not at all: settings tuned on one body and thrown by another throw a different punch.
 */
export interface PunchRecord extends SkillRecord<StraightPunch> {
  readonly network: Network | null;
}

/** Every body's straight punch record, by `bodyKey`. */
type PunchRecords = Readonly<Record<string, PunchRecord>>;

declare module "../../../../core/data/store.ts" {
  interface DataOf {
    /** Every body's straight punch record. */
    "straight-punch": PunchRecords;
  }
}

/** **The bodies with a straight punch record**, known before the records load (`assets/skills/strikes/straight-punch/straight-punch.meta.json`). */
export const PUNCH_BODIES: readonly string[] = deepFreeze(meta.bodies);
