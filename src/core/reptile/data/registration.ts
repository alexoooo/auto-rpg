import type { DataLoaders } from "../../data/store.ts";

/** The quadruped's recovery and bite records. */
export const PAW_DATA = {
  "righting": () => import("./righting.ts").then((m) => m.RIGHTING_RECORDS),
  "bite": () => import("./bite.ts").then((m) => m.BITE_RECORDS),
} satisfies DataLoaders;
