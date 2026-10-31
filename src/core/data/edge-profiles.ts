import data from "../../../assets/core/edge-profiles.json" with { type: "json" };
import { deepFreeze } from "../state.ts";

/** The ground edges' profiles (`dataOf("edge-profiles")`), from the Rise drill (`research/edge-profiles.mjs`): a module of its own, imported only when loaded (`loadData`). */
export const EDGE_PROFILES: unknown = deepFreeze(data.profiles);
