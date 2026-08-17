export type RoomFloorVariant = Readonly<{
  id: 0 | 1 | 2 | 3;
  piece: "floor_a" | "floor_b";
  quarterTurns: 0 | 1 | 2 | 3;
}>;

function mix(value: number): number {
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

/** Four stable presentations from two authored silhouettes and rotated albedo. */
export function chooseRoomFloorVariant(seed: number, tx: number, ty: number): RoomFloorVariant {
  const hash = mix((seed + Math.imul(tx, 0x9e3779b1) + Math.imul(ty, 0x85ebca6b)) >>> 0);
  const id = ((hash >>> 9) & 3) as 0 | 1 | 2 | 3;
  return Object.freeze({
    id,
    piece: id < 2 ? "floor_a" : "floor_b",
    quarterTurns: ((id + ((hash >>> 15) & 1) * 2) & 3) as 0 | 1 | 2 | 3,
  });
}

/** Two coursing phases; wall orientation remains architectural, never decorative. */
export function chooseRoomWallSurfaceVariant(seed: number, tx: number, ty: number, side: number): 0 | 1 {
  return ((mix(seed ^ 0x57414c4c ^ Math.imul(tx, 0x27d4eb2d) ^
    Math.imul(ty, 0x165667b1) ^ Math.imul(side, 0x9e3779b1)) >>> 12) & 1) as 0 | 1;
}
