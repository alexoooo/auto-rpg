import records from "../../../assets/core/bite.json" with { type: "json" };
import { deepFreeze } from "../state.ts";

/** Every body's bite settings (`dataOf("bite")`): a module of its own, imported only when loaded (`loadData`). */
export const BITE_RECORDS: unknown = deepFreeze(records);
