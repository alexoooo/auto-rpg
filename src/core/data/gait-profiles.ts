import data from "../../../assets/core/gait-profiles.json" with { type: "json" };
import type { Profile } from "../skills/framework/profile.ts";
import { deepFreeze } from "../state.ts";

/** The gaits' profiles (`dataOf("gait-profiles")`), from the Gait drill (`research/gait-profiles.mjs`): a module of its own, imported only when loaded (`loadData`). */
export const GAIT_PROFILES: readonly Profile[] = deepFreeze((data as unknown as { profiles: Profile[] }).profiles);
