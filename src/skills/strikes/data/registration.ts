import type { DataLoaders } from "../../../core/data/store.ts";
import { bodyProfiles } from "../../framework/profile/lookup.ts";

/** The measured profiles shared by strike selection and evaluation. */
export const STRIKE_PROFILES_DATA = {
  "strike-profiles": bodyProfiles(() => import("./strike-profiles.ts").then((m) => m.STRIKE_PROFILES)),
} satisfies DataLoaders;
