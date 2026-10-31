import data from "../../../assets/core/gait-profiles.json" with { type: "json" };
import { deepFreeze } from "../state.ts";

/** The gaits' profiles (`dataOf("gait-profiles")`), from the Gait drill (`research/gait-profiles.mjs`): a module of its own, imported only when loaded (`loadData`). */
export const GAIT_PROFILES: unknown = deepFreeze(data.profiles);
