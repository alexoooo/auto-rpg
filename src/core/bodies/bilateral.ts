/** A side of a bilateral body, independent of player roles in a bout. */
export type Side = "left" | "right";

/** Bilateral anatomy, in left-to-right order. */
export const SIDES: readonly Side[] = Object.freeze(["left", "right"]);

/** The anatomical side across from `side`. */
export const otherSide = (side: Side): Side => side === "left" ? "right" : "left";
