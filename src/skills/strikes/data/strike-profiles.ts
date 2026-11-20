import type { Origin, Profile } from "../../framework/profile/profile.ts";

/** **A strike's profile**: where it came from names the Strike drill's rung its trials were played on (`research/skills/strikes/strike-profiles.mjs`). */
export type StrikeProfile = Profile & { readonly from: Origin & { readonly protocol: string } };

declare module "../../../core/data/store.ts" { interface DataOf { "strike-profiles": readonly StrikeProfile[] } }

import data from "../../../../assets/skills/strikes/strike-profiles/strike-profiles.json" with { type: "json" };
import { deepFreeze } from "../../../core/state.ts";

/** The strikes' profiles (`dataOf("strike-profiles")`), from the Strike drill's rungs, each profile's named in it (`StrikeProfile`) (`research/skills/strikes/strike-profiles.mjs`): a module of its own, imported only when loaded (`loadData`). */
export const STRIKE_PROFILES: unknown = deepFreeze(data.profiles);
