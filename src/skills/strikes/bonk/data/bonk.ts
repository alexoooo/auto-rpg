import records from "../../../../../assets/skills/strikes/bonk/bonk.json" with { type: "json" };
import { deepFreeze } from "../../../../core/world/state.ts";

/** Immutable per-body bonk settings, loaded before their executor is built. */
export const BONK_RECORDS: unknown = deepFreeze(records);
