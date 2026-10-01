import { cryptFurniture, type CryptArchetype, type CryptRoomKind } from "./crypt-archetypes.ts";
import { dressCryptMap, type CryptRoomPlan } from "./crypt-plan.ts";
import { LEVEL } from "./level.ts";
import { distance, findPath, walkable, type DungeonMap, type Point, type Room } from "./map.ts";
import { companionSpawn } from "./party-placement.ts";
import { mulberry32 } from "./rng.ts";

/**
 * The crypt's layout, in cells of 1 m (`docs/reference/play.md#the-crypt`): four rooms, two by two, each joined to
 * its neighbours along the ring but for one pair.
 */
const CRYPT_LAYOUT = Object.freeze({
  /** Cells a side of the map. */
  size: 44,
  /** The first room's centre from the map's corner, and the step from one room's centre to its neighbour's. */
  first: 12,
  pitch: 20,
  /** Half a room's side along x and z: `least` and one of `spread` draws each. A chapel's is fixed, and longer
   * along z. */
  half: Object.freeze({ least: 5, spread: 3, chapel: Object.freeze({ x: 5, z: 7 }) }),
  /** A rootbound room keeps as rock the cells fewer than this many steps from a corner, counted along both walls. */
  cornerCut: 2,
  /** Cells a corridor is wide either side of its middle line. */
  corridorHalf: 1,
  /** Arrangements a kind of room has. */
  variants: 3,
  /** Enemies in each room but the entrance. */
  spawns: 2,
  /** How far an enemy starts from the party's start, from every door and from the other enemy of its room, m. */
  spawnFromStart: 15,
  spawnFromDoor: 3,
  spawnSpacing: 2,
  /** Companions the entrance must have room for. */
  companions: 3,
});

/** The decoration's stream is seeded with the layout's seed, these bits turned, so that neither stream's draws
 * move the other's. A numeric setting. */
const ART_SALT = 0x63727970;

/** A whole number from 0 up to, and not including, `n`, drawn from the layout's stream. */
type Pick = (n: number) => number;

/** A seed whose layout cannot hold what a run needs. */
class CryptLayoutError extends Error {
  constructor(seed: number, what: string) {
    super(`Crypt ${seed}: ${what}`);
    this.name = "CryptLayoutError";
  }
}

/** Shuffles `items` in place: one draw an item, from the last down to the second. */
function shuffle<T>(items: T[], pick: Pick): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
}

/** Half a room's size in cells, along x and z. Every kind but the chapel draws each, x first. */
function halfSize(kind: CryptRoomKind, pick: Pick): Point {
  const { least, spread, chapel } = CRYPT_LAYOUT.half;
  switch (kind) {
    case "chapel": return chapel;
    case "guard":
    case "burial":
    case "rootbound": return { x: least + pick(spread), z: least + pick(spread) };
    default: { const never: never = kind; throw new Error(`Unknown kind of crypt room: ${String(never)}`); }
  }
}

/** Opens `room`'s cells in `floor`. A rootbound room keeps its corners as rock. */
function carveRoom(floor: Uint8Array, room: Room, kind: CryptRoomKind): void {
  for (let z = room.min.z; z <= room.max.z; z++) for (let x = room.min.x; x <= room.max.x; x++) {
    const fromCorner = Math.min(x - room.min.x, room.max.x - x) + Math.min(z - room.min.z, room.max.z - z);
    if (kind === "rootbound" && fromCorner < CRYPT_LAYOUT.cornerCut) continue;
    floor[z * CRYPT_LAYOUT.size + x] = 1;
  }
}

/** Opens a corridor from the centre of `a` to the centre of `b`, which share a row or a column, and says along
 * which axis it runs. */
function carveCorridor(floor: Uint8Array, a: Room, b: Room): "x" | "z" {
  const { size, corridorHalf } = CRYPT_LAYOUT;
  const axis = a.centre.z === b.centre.z ? "x" : "z";
  const low = Math.min(a.centre[axis], b.centre[axis]), high = Math.max(a.centre[axis], b.centre[axis]);
  for (let n = low; n <= high; n++) for (let side = -corridorHalf; side <= corridorHalf; side++) {
    const x = axis === "x" ? n : a.centre.x + side, z = axis === "z" ? n : a.centre.z + side;
    floor[z * size + x] = 1;
  }
  return axis;
}

/** The cell just outside `room`'s wall where its corridor along `axis` to `other` leaves it. */
function doorCell(room: Room, other: Room, axis: "x" | "z"): Point {
  const point = { ...room.centre };
  point[axis] = other.centre[axis] > room.centre[axis] ? room.max[axis] + 1 : room.min[axis] - 1;
  return point;
}

/** The room the most corridors from the first, and the lowest numbered of them if several are. */
function farthestRoom(adjacency: readonly (readonly number[])[]): number {
  const corridors: number[] = adjacency.map((_, id) => id === 0 ? 0 : -1), queue = [0];
  for (const id of queue) for (const next of adjacency[id]) if (corridors[next] < 0) {
    corridors[next] = corridors[id] + 1;
    queue.push(next);
  }
  return corridors.indexOf(Math.max(...corridors));
}

/** Where `room`'s enemies start: the first of its inner cells, shuffled, that a body can stand on and walk to from
 * the start, far enough from the start, from every door and from one another. */
function encounter(map: DungeonMap, room: Room, pick: Pick): Point[] {
  const { spawns, spawnFromStart, spawnFromDoor, spawnSpacing } = CRYPT_LAYOUT;
  const candidates: Point[] = [];
  for (let z = room.min.z + 1; z < room.max.z; z++) for (let x = room.min.x + 1; x < room.max.x; x++) candidates.push({ x, z });
  shuffle(candidates, pick);
  const chosen: Point[] = [];
  for (const p of candidates) {
    const fits = walkable(map, p, LEVEL.clearance) && distance(p, map.start) > spawnFromStart
      && map.doors.every(door => distance(p, door.point) > spawnFromDoor)
      && chosen.every(q => distance(p, q) > spawnSpacing) && findPath(map, map.start, p, LEVEL.clearance).length > 0;
    if (!fits) continue;
    chosen.push(p);
    if (chosen.length === spawns) break;
  }
  if (chosen.length !== spawns) throw new CryptLayoutError(map.seed, `room ${room.id} has no room for its ${spawns} enemies`);
  return chosen;
}

/** Four chambers joined by a seeded spanning tree: three encounters beyond the entrance. */
export function generateCryptDungeon(seed: number): CryptRoomPlan {
  const random = mulberry32(seed), pick: Pick = n => Math.floor(random() * n);
  const { size, first, pitch, variants, companions } = CRYPT_LAYOUT;

  // The entrance is a guard room; the other three kinds are shuffled over the other three rooms.
  const kinds: CryptRoomKind[] = ["burial", "chapel", "rootbound"];
  shuffle(kinds, pick);
  const archetypes: CryptArchetype[] = (["guard", ...kinds] as const)
    .map((kind, room) => ({ room, kind, variant: pick(variants), turn: pick(2) * Math.PI }));

  const floor = new Uint8Array(size * size);
  const rooms: Room[] = archetypes.map(({ room: id, kind }) => {
    const centre = { x: first + (id % 2) * pitch, z: first + Math.floor(id / 2) * pitch };
    const half = halfSize(kind, pick);
    return { id, centre, min: { x: centre.x - half.x, z: centre.z - half.z }, max: { x: centre.x + half.x - 1, z: centre.z + half.z - 1 } };
  });
  for (const room of rooms) carveRoom(floor, room, archetypes[room.id].kind);

  // The four rooms' ring of neighbours, less one pair: a tree, with a door at each end of every corridor.
  const ring = [[0, 1], [1, 3], [3, 2], [2, 0]], omitted = pick(ring.length);
  const map: DungeonMap = { seed: seed >>> 0, size, floor, rooms, doors: [], start: { ...rooms[0].centre }, exit: { ...rooms[0].centre }, spawns: [], obstacles: [] };
  const adjacency: number[][] = rooms.map(() => []);
  for (const [i, [a, b]] of ring.entries()) {
    if (i === omitted) continue;
    adjacency[a].push(b);
    adjacency[b].push(a);
    const axis = carveCorridor(floor, rooms[a], rooms[b]);
    for (const [room, other] of [[rooms[a], rooms[b]], [rooms[b], rooms[a]]]) {
      map.doors.push({ id: map.doors.length, point: doorCell(room, other, axis), axis, open: false });
    }
  }
  map.exit = { ...rooms[farthestRoom(adjacency)].centre };

  const furniture = rooms.map(room => cryptFurniture(room, archetypes[room.id]));
  map.obstacles = furniture.flatMap(f => f.obstacles);
  for (const room of rooms.slice(1)) map.spawns.push(...encounter(map, room, pick));

  const party = [map.start];
  for (let i = 0; i < companions; i++) {
    const place = companionSpawn(map, party);
    if (!place) throw new CryptLayoutError(map.seed, `the entrance has no room for ${companions} companions`);
    party.push(place);
  }
  for (const p of [map.exit, ...map.spawns, ...rooms.map(room => room.centre)]) {
    if (!findPath(map, map.start, p, LEVEL.clearance).length) throw new CryptLayoutError(map.seed, `no way from the start to ${p.x}, ${p.z}`);
  }
  return dressCryptMap(map, mulberry32((seed ^ ART_SALT) >>> 0), archetypes, furniture.flatMap(f => f.placements));
}
