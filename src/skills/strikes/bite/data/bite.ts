import records from "../../../../../assets/skills/strikes/bite/bite.json" with { type: "json" };
import { deepFreeze } from "../../../../core/state.ts";

/** Every body's bite settings (`dataOf("bite")`): a module of its own, imported only when loaded (`loadData`). */
export const BITE_RECORDS: unknown = deepFreeze(records);
