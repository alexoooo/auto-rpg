import meta from "../../../assets/core/straight-punch.meta.json" with { type: "json" };
import type { Network } from "../control/recovery-network.ts";
import { bodyKey, type BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import type { StraightPunch } from "./straight-punch.ts";

/**
 * **A straight punch's record for one body** (`dataOf("straight-punch")`,
 * `assets/core/straight-punch.json`, by `bodyKey`): the settings it was tuned to on that body,
 * whole, and the network that steers it where it was trained (`punchFeatures` in, its steer out,
 * as `PUNCH_LAYOUT` lays them out and `recoveryNetwork` evaluates it), or null; `made` says how
 * (`research/punch-export.mjs` writes it). A body throws the straight punch by its own record or
 * not at all: settings tuned on one body and thrown by another throw a different punch.
 */
export interface PunchRecord {
  readonly made: string;
  readonly settings: StraightPunch;
  readonly network: Network | null;
}

/** Every body's straight punch record, by `bodyKey`. */
export type PunchRecords = Readonly<Record<string, PunchRecord>>;

/** **The bodies with a straight punch record**, known before the records load (`assets/core/straight-punch.meta.json`). */
const PUNCH_BODIES: readonly string[] = deepFreeze(meta.bodies);

/** Whether a body of `spec` has a straight punch record. */
export const punchRecorded = (spec: BodySpec): boolean => PUNCH_BODIES.includes(bodyKey(spec));
