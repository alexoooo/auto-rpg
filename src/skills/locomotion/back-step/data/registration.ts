import type { DataLoaders } from "../../../../core/data/store.ts";
import { bodyProfiles } from "../../../framework/profile/lookup.ts";

/** The measured profiles of the steps a mind takes out of a blow's way (the back step's). */
export const STEP_PROFILES_DATA = {
  "step-profiles": bodyProfiles(() => import("./step-profiles.ts").then((m) => m.STEP_PROFILES)),
} satisfies DataLoaders;
