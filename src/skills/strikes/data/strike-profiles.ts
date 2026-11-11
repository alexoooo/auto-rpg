import type { Profile } from "../../framework/profile.ts";

declare module "../../../core/data/store.ts" { interface DataOf { "strike-profiles": readonly Profile[] } }

import data from "../../../../assets/skills/strikes/strike-profiles/strike-profiles.json" with { type: "json" };
import { deepFreeze } from "../../../core/state.ts";

/** The strikes' profiles (`dataOf("strike-profiles")`), from the Strike drill's fights (`research/skills/strikes/strike-profiles.mjs`): a module of its own, imported only when loaded (`loadData`). */
export const STRIKE_PROFILES: unknown = deepFreeze(data.profiles);
