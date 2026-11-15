import meta from "../../../../../assets/skills/strikes/straight-punch/drive.meta.json" with { type: "json" };
import movingMeta from "../../../../../assets/skills/strikes/straight-punch/moving.meta.json" with { type: "json" };
import type { Network } from "../../../../core/math/learning/recovery-network.ts";
import { deepFreeze } from "../../../../core/state.ts";
import type { SkillRecord } from "../../../framework/records.ts";
import type { StraightDrive } from "../../shared/straight-drive.ts";

/**
 * **A straight punch's record for one body** (`dataOf("straight-punch/drive")`,
 * `assets/skills/strikes/straight-punch/drive.json`, by model): the settings it was tuned to on that body,
 * whole, and the network that steers it where it was trained (`steerFeatures` in, its steer out,
 * as `PUNCH_LAYOUT` (`straight-punch/index.ts`) lays them out and `recoveryNetwork` evaluates it), or null; `made` says how
 * (`research/skills/strikes/straight-punch/punch-export.mjs` writes it). A body throws the straight punch by its own record or
 * not at all: settings tuned on one body and thrown by another throw a different punch.
 */
export interface PunchRecord extends SkillRecord<StraightDrive> {
  readonly network: Network | null;
}

/** Every body's straight punch record, by model. */
type PunchRecords = Readonly<Record<string, PunchRecord>>;

/** **The straight punch's records**, each a variation's own (`straight-punch/<variation>`) and read by every variation that names it. */
export type PunchRecordKey = "straight-punch/drive" | "straight-punch/moving";

declare module "../../../../core/data/store.ts" {
  interface DataOf {
    /** Every body's straight punch record, its drive variation's. */
    "straight-punch/drive": PunchRecords;
    /** Every body's record of the punch on the move (`assets/skills/strikes/straight-punch/moving.json`). */
    "straight-punch/moving": PunchRecords;
  }
}

/** **The bodies with the drive's record**, known before the records load (`assets/skills/strikes/straight-punch/drive.meta.json`). */
export const DRIVE_BODIES: readonly string[] = deepFreeze(meta.bodies);

/** **The bodies with the moving punch's record** (`assets/skills/strikes/straight-punch/moving.meta.json`). */
export const MOVING_BODIES: readonly string[] = deepFreeze(movingMeta.bodies);
