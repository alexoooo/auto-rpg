import records from "../../../assets/core/path-strike.json" with { type: "json" };
import { deepFreeze } from "../state.ts";

/** Every body's path strike record (`dataOf("path-strike")`): a module of its own, imported only when loaded (`loadData`). */
export const PATH_STRIKE_RECORDS: unknown = deepFreeze(records);
