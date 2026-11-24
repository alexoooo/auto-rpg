import records from "../../../../../assets/skills/strikes/kick/push.json" with { type: "json" };
import { deepFreeze } from "../../../../core/state.ts";

/** Every body's push kick record (`dataOf("kick/push")`): a module of its own, imported only when loaded (`loadData`). */
export const PUSH_KICK_RECORDS: unknown = deepFreeze(records);
