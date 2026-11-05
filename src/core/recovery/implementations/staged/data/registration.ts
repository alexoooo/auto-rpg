import type { DataLoaders } from "../../../../data/store.ts";

/** The staged rise's per-body records. */
export const STAGED_DATA = {
  "step-up": () => import("./step-up.ts").then((m) => m.STEP_UP_RECORDS),
  "sit-back": () => import("./sit-back.ts").then((m) => m.SIT_BACK_RECORDS),
} satisfies DataLoaders;
