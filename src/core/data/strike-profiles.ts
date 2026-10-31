import data from "../../../assets/core/strike-profiles.json" with { type: "json" };
import { deepFreeze } from "../state.ts";

/** The strikes' profiles (`dataOf("strike-profiles")`), from the Strike drill (`research/strike-profiles.mjs`): a module of its own, imported only when loaded (`loadData`). */
export const STRIKE_PROFILES: unknown = deepFreeze(data.profiles);
