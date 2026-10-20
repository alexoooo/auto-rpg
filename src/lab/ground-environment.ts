import { deepFreeze } from "../core/state.ts";
import type { SolidSense } from "../core/mind/object-senses.ts";
import { cryptFurnishing, type KitPlacement } from "../environment/furniture.ts";

/** Obstacle falls are named conditions, kept separate from the owner's open-floor target. */
const furnishing = (piece: "column" | "tomb" | "bench", z: number) => {
  const resolved = cryptFurnishing(piece, `ground.${piece}`, 0, z);
  return { solids: [resolved.solid], placements: [resolved.placement] };
};

/** The obstacle stays fixed while the same chest shoves or clear drops create the fall. */
export const GROUND_LEVELS = deepFreeze({
  open: { label: "Open floor", approach: null, dropOnTop: false, solids: [] as SolidSense[], placements: [] as KitPlacement[] },
  column: { label: "Beside a column", approach: null, dropOnTop: false, ...furnishing("column", -1.2) },
  wall: { label: "Against a wall", approach: null, dropOnTop: false, solids: [{ name: "ground.wall", kind: "box" as const, centre: [0, 1.325, -1.25] as const, size: [6, 2.65, .5] as const, turn: 0 }], placements: [] as KitPlacement[] },
  tomb: { label: "Onto / step back into a tomb", approach: { x: 0, z: -1 }, dropOnTop: true, ...furnishing("tomb", -1.2) },
  bench: { label: "Onto / beside a bench", approach: null, dropOnTop: true, ...furnishing("bench", -1.2) },
});

export type GroundLevel = keyof typeof GROUND_LEVELS;

/** Physics, sensing, placement and rendering read one resolved obstacle condition. */
export function groundEnvironment(level: GroundLevel = "open") {
  if (!Object.hasOwn(GROUND_LEVELS, level)) throw new Error(`unknown ground level ${level}`);
  return GROUND_LEVELS[level];
}
