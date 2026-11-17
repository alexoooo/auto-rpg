import type { Profile } from "../../../framework/profile.ts";

declare module "../../../../core/data/store.ts" { interface DataOf { "step-profiles": readonly Profile[] } }

import data from "../../../../../assets/skills/locomotion/step-profiles.json" with { type: "json" };
import { deepFreeze } from "../../../../core/state.ts";

/** The steps' profiles (`dataOf("step-profiles")`), from the back step's evaluation's sparring (`research/skills/locomotion/back-step-profiles.mjs`): a module of its own, imported only when loaded (`loadData`). */
export const STEP_PROFILES: unknown = deepFreeze(data.profiles);
