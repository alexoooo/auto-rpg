import data from "../../../assets/core/strike-profiles.json" with { type: "json" };
import type { Profile } from "../skills/framework/profile.ts";
import { deepFreeze } from "../state.ts";

/** The strikes' profiles (`dataOf("strike-profiles")`), from the Strike drill (`research/strike-profiles.mjs`): a module of its own, imported only when loaded (`loadData`). */
export const STRIKE_PROFILES: readonly Profile[] = deepFreeze((data as unknown as { profiles: Profile[] }).profiles);
