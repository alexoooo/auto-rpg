import data from "../../../../assets/skills/recovery/edge-profiles.json" with { type: "json" };
import { deepFreeze } from "../../../core/world/state.ts";

/** The ground Options' profiles (`dataOf("edge-profiles")`), from Option Mind's tries in falls (`research/skills/recovery/edge-profiles.mjs`): a module of its own, imported only when loaded (`loadData`). */
export const EDGE_PROFILES: unknown = deepFreeze(data.profiles);
