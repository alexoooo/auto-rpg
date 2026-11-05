/** A participant's seat in the two-seat Arena, independent of anatomical laterality. */
export type ArenaSeat = "left" | "right";
export const ARENA_SEATS: readonly ArenaSeat[] = Object.freeze(["left", "right"]);
export const otherSeat = (seat: ArenaSeat): ArenaSeat => seat === "left" ? "right" : "left";
