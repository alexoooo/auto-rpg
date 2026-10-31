import records from "../../../assets/core/blade-thrust.json" with { type: "json" };
import { deepFreeze } from "../state.ts";

/** Every body's blade thrust record (`dataOf("blade-thrust")`): a module of its own, imported only when loaded (`loadData`). */
export const BLADE_THRUST_RECORDS: unknown = deepFreeze(records);
