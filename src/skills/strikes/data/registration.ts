import type { DataLoaders } from "../../../core/data/store.ts";

/** The strike implementations' records and measured profiles. */
export const STRIKE_DATA = {
  "straight-punch": () => import("./straight-punch.ts").then((m) => m.STRAIGHT_PUNCH_RECORDS),
  "stomp": () => import("./stomp.ts").then((m) => m.STOMP_RECORDS),
  "club-blow": () => import("./club-blow.ts").then((m) => m.CLUB_BLOW_RECORDS),
  "cut": () => import("./cut.ts").then((m) => m.CUT_RECORDS),
  "sword-thrust": () => import("./sword-thrust.ts").then((m) => m.SWORD_THRUST_RECORDS),
  "strike-profiles": () => import("./strike-profiles.ts").then((m) => m.STRIKE_PROFILES),
} satisfies DataLoaders;
