import records from "../../../../assets/skills/strikes/cut/cut.json" with { type: "json" };
import { deepFreeze } from "../../../core/world/state.ts";

/** Every body's cut record (`dataOf("cut")`): a module of its own, imported only when loaded (`loadData`). */
export const CUT_RECORDS: unknown = deepFreeze(records);
