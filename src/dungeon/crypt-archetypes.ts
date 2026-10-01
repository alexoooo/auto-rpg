import type { DungeonObstacle, Room } from "./map.ts";
import type { CryptPlacement } from "./crypt-room.ts";

export type CryptRoomKind = "guard" | "burial" | "chapel" | "rootbound";
export interface CryptArchetype { room: number; kind: CryptRoomKind; variant: number; turn: number }
/** Footprints are shared by exported furnishings and their authoritative colliders: each piece's width, depth and
 * height, m (`docs/reference/look.md#crypt-rooms`). */
export const CRYPT_FURNITURE = {
  tomb: [2.5,1.15,1.1], column: [.8,.8,2.65], altar: [2.4,1.1,1.05],
  bench: [1.7,.55,.65], rack: [1.8,.6,1.9], cluster: [1.8,1.5,.55],
} as const;
type Furnishing = keyof typeof CRYPT_FURNITURE;
/** Open frames obstruct feet, not vision. Keep this independent of collision height. */
const CRYPT_SIGHT = { tomb:false, column:true, altar:false, bench:false, rack:false, cluster:false } as const;

/**
 * Where each kind of room stands its furniture: offsets from the room's centre, m, before the room's turn mirrors
 * them (`docs/reference/look.md#crypt-rooms`). `shift` is how far one step of a room's variant moves a piece, and
 * the altar's `fromBack` how far short of the room's last row of cells it stands.
 */
const CRYPT_ARRANGEMENT = {
  shift: .3,
  guard: { rack: { x: 2.7, z: -3.5 }, bench: { x: 2.7, z: 3.2 }, turnedBench: { x: 3.5, z: 2.3 } },
  burial: { tomb: { x: 2.7, z: 2.5 } },
  chapel: { altar: { x: 2.2, fromBack: 1 }, column: 3, bench: { x: 2.6, z: 1.5 } },
  rootbound: { near: { x: -2.7, z: -2 }, far: { x: 2.5, z: 2.4 } },
} as const;

/** Stands one piece at an offset from its room's centre, turned by `turn`, rad. */
type Add = (piece: Furnishing, x: number, z: number, turn?: number) => void;
/**
 * One kind's arrangement, for a room's `variant` (0, 1 or 2) and the `shift` it makes. A room's obstacles are
 * numbered in the order of the `add` calls, so the order is part of the arrangement.
 */
type Arrange = (variant: number, shift: number, room: Room, add: Add) => void;

/** Two racks toward -z and two benches toward +z: side by side in variant 0; farther apart in the others, the
 * first turned, and the second too in variant 1. */
const arrangeGuard: Arrange = (variant, shift, _room, add) => {
  const { rack, bench, turnedBench } = CRYPT_ARRANGEMENT.guard;
  add("rack", -rack.x, rack.z);
  add("rack", rack.x, rack.z);
  if (variant === 0) {
    add("bench", -bench.x, bench.z);
    add("bench", bench.x, bench.z);
  } else {
    add("bench", -turnedBench.x, turnedBench.z + shift, Math.PI / 2);
    add("bench", turnedBench.x, turnedBench.z - shift, variant === 1 ? Math.PI / 2 : 0);
  }
};

/** Three tombs: two toward -z, the first turned in variant 1 and the second in variant 2, and one toward +z. */
const arrangeBurial: Arrange = (variant, shift, _room, add) => {
  const { tomb } = CRYPT_ARRANGEMENT.burial;
  add("tomb", -tomb.x, -tomb.z + shift, variant === 1 ? Math.PI / 2 : 0);
  add("tomb", tomb.x, -tomb.z - shift, variant === 2 ? Math.PI / 2 : 0);
  add("tomb", variant === 2 ? tomb.x : -tomb.x, tomb.z, 0);
};

/** An altar, four columns and four benches. The altar sits off the doorway axis; the central aisle stays two
 * metres wide. */
const arrangeChapel: Arrange = (variant, shift, room, add) => {
  const { altar, column, bench } = CRYPT_ARRANGEMENT.chapel;
  add("altar", variant === 1 ? altar.x : -altar.x, room.max.z - room.centre.z - altar.fromBack);
  for (const x of [-column, column]) for (const z of [-column, column]) add("column", x, z);
  for (const x of [-bench.x, bench.x]) for (const z of [-bench.z, bench.z]) add("bench", x, z + shift);
};

/** Two root-covered clusters, the second turned. */
const arrangeRootbound: Arrange = (_variant, shift, _room, add) => {
  const { near, far } = CRYPT_ARRANGEMENT.rootbound;
  add("cluster", near.x, near.z + shift);
  add("cluster", far.x, far.z - shift, Math.PI / 2);
};

/** A room's furniture: each piece as an obstacle of the map and as a placement of the art, sharing an id. */
export function cryptFurniture(room: Room, type: CryptArchetype): { obstacles: DungeonObstacle[]; placements: CryptPlacement[] } {
  const obstacles: DungeonObstacle[] = [], placements: CryptPlacement[] = [];
  const mirror = type.turn === 0 ? 1 : -1, shift = (type.variant - 1) * CRYPT_ARRANGEMENT.shift;
  const add: Add = (piece, x, z, turn = 0) => {
    const [width, depth, height] = CRYPT_FURNITURE[piece], rotated = Math.abs(Math.sin(turn)) > .5;
    const at = { x: room.centre.x + x * mirror, z: room.centre.z + z * mirror };
    const id = `crypt.${room.id}.${piece}.${obstacles.length}`;
    obstacles.push({ id, ...at, width: rotated ? depth : width, depth: rotated ? width : depth, height, blocksSight: CRYPT_SIGHT[piece] });
    placements.push({ piece, ...at, turn: turn + type.turn, obstacleId: id });
  };
  switch (type.kind) {
    case "guard": arrangeGuard(type.variant, shift, room, add); break;
    case "burial": arrangeBurial(type.variant, shift, room, add); break;
    case "chapel": arrangeChapel(type.variant, shift, room, add); break;
    case "rootbound": arrangeRootbound(type.variant, shift, room, add); break;
    default: { const never: never = type.kind; throw new Error(`Unknown kind of crypt room: ${String(never)}`); }
  }
  return { obstacles, placements };
}

/** Each kind of room's look: the odds of a niche, a root and scatter, whether it is damp, and its torches' colour,
 * strength and shadow (`docs/reference/look.md#crypt-rooms`). */
export const CRYPT_ROOM_LOOK = {
  guard: {niches:.08,roots:0,scatter:.05,damp:false,color:'#ffc077',intensity:6,shadow:85},
  burial: {niches:.85,roots:.12,scatter:.3,damp:false,color:'#ff9c4b',intensity:4,shadow:60},
  chapel: {niches:.35,roots:.05,scatter:.15,damp:false,color:'#ffe2ad',intensity:8,shadow:95},
  rootbound: {niches:.5,roots:1,scatter:1,damp:true,color:'#e7ba78',intensity:5,shadow:70},
} as const;
