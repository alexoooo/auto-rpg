import { bodyRecords } from "../../../framework/records.ts";
import type { DataLoaders } from "../../../../core/data/store.ts";

/** The kick's per-body settings, each record registered as its variation's (`kick/<variation>`). */
export const KICK_DATA = {
  "kick/kick": bodyRecords(() => import("./kick.ts").then((m) => m.KICK_RECORDS)),
  "kick/push": bodyRecords(() => import("./push.ts").then((m) => m.PUSH_KICK_RECORDS)),
  "kick/front": bodyRecords(() => import("./front.ts").then((m) => m.FRONT_KICK_RECORDS)),
  "kick/stepping": bodyRecords(() => import("./stepping.ts").then((m) => m.STEPPING_KICK_RECORDS)),
} satisfies DataLoaders;
