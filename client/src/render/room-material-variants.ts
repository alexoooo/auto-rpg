export type RoomFloorVariant = Readonly<{
  id: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  piece: "floor_a" | "floor_b" | "floor_c" | "floor_d";
  quarterTurns: 0 | 1 | 2 | 3;
  valueBand: 0 | 1 | 2 | 3;
}>;

function mix(value: number): number {
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

/** Eight stable treatments from four authored reliefs and rotated painterly albedo. */
export function chooseRoomFloorVariant(seed: number, tx: number, ty: number): RoomFloorVariant {
  const hash = mix((seed + Math.imul(tx, 0x9e3779b1) + Math.imul(ty, 0x85ebca6b)) >>> 0);
  const id = ((hash >>> 9) & 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  const pieces = ["floor_a", "floor_b", "floor_c", "floor_d"] as const;
  return Object.freeze({
    id,
    piece: pieces[id >>> 1] ?? "floor_a",
    quarterTurns: ((id + ((hash >>> 15) & 1) * 2) & 3) as 0 | 1 | 2 | 3,
    valueBand: ((hash >>> 21) & 3) as 0 | 1 | 2 | 3,
  });
}

/** Six restrained masonry value families; topology and orientation remain architectural. */
export function chooseRoomWallSurfaceVariant(seed: number, tx: number, ty: number, side: number):
  0 | 1 | 2 | 3 | 4 | 5 {
  return (mix(seed ^ 0x57414c4c ^ Math.imul(tx, 0x27d4eb2d) ^
    Math.imul(ty, 0x165667b1) ^ Math.imul(side, 0x9e3779b1)) % 6) as 0 | 1 | 2 | 3 | 4 | 5;
}
