import { bodyRecords } from "../../../framework/records.ts";
import type { DataLoaders } from "../../../../core/data/store.ts";

/** The stomp's per-body settings, each record registered as its variation's (`stomp/<variation>`). */
export const STOMP_DATA = {
  "stomp/stomp": bodyRecords(() => import("./stomp.ts").then((m) => m.STOMP_RECORDS)),
  "stomp/kick": bodyRecords(() => import("./kick.ts").then((m) => m.LOW_KICK_RECORDS)),
  "stomp/front": bodyRecords(() => import("./front.ts").then((m) => m.LOW_FRONT_KICK_RECORDS)),
} satisfies DataLoaders;
