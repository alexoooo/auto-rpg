import records from "../../../../../assets/skills/locomotion/walk-run/walk-run.json" with { type: "json" };
import { deepFreeze } from "../../../state.ts";

/** Every body's walk-run record (`dataOf("walk-run")`): a module of its own, imported only when loaded (`loadData`). */
export const WALK_RUN_RECORDS: unknown = deepFreeze(records);
