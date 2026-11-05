import { deepFreeze } from "../../core/world/state.ts";
import type { SolidSense } from "../../core/bodies/object-senses.ts";
import { cryptFurnishing, type KitPlacement } from "../environment/furniture.ts";

/** A crypt furnishing as a ground level's obstacle: its collision solid and its kit placement. */
const furnishing = (piece: "column" | "tomb" | "bench", z: number) => {
  const resolved = cryptFurnishing(piece, `ground.${piece}`, 0, z);
  return { solids: [resolved.solid], placements: [resolved.placement] };
};

/**
 * The grounds a fall happens on: the open floor, which the stand-up target's falls use, or an
 * obstacle that stays fixed while the same chest shoves or clear drops make the fall.
 */
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
