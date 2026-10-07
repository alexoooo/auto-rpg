export interface Point { x: number; z: number }
/** A room's floor, as inclusive fine-cell bounds; `centre` is a cell a body can stand on. */
export interface Room { id: number; centre: Point; min: Point; max: Point }
export interface Door { id: number; point: Point; axis: "x" | "z"; open: boolean }
export interface DungeonObstacle { id: string; x: number; z: number; width: number; depth: number; height: number; blocksSight: boolean }
export interface DungeonMap {
  obstacles?: readonly DungeonObstacle[];
  seed: number; size: number; floor: Uint8Array; rooms: Room[]; doors: Door[];
  start: Point; exit: Point; spawns: Point[];
  /** Optional authored/generated encounter metadata; point-only maps retain skeleton enemies. */
  encounters?: readonly { readonly room: number; readonly model: BodyModel; readonly point: Point }[];
}
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.z - b.z);
export const cellKey = (map: DungeonMap, p: Point): number => Math.round(p.z) * map.size + Math.round(p.x);
export function isFloor(map: DungeonMap, x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < map.size && z < map.size && map.floor[z * map.size + x] === 1;
}

/** Half of a closed door's box along `axis`, m: thin along the door's own axis, wide across it. */
const doorHalf = (door: Door, axis: "x" | "z"): number => door.axis === axis ? 0.18 : 1.5;

/** Clearance is measured against cell rectangles, not an arbitrary number of tile neighbours. */
export function walkable(map: DungeonMap, p: Point, radius: number, closedDoors = false, sight = false): boolean {
  if (!isFloor(map, Math.round(p.x), Math.round(p.z))) return false;
  if (map.obstacles?.some(o => (!sight || o.blocksSight) && Math.hypot(
    Math.max(0,Math.abs(p.x-o.x)-o.width/2),Math.max(0,Math.abs(p.z-o.z)-o.depth/2)) < radius+.001)) return false;
  const reach = Math.ceil(radius + 0.5);
  for (let z = Math.round(p.z) - reach; z <= Math.round(p.z) + reach; z++)
    for (let x = Math.round(p.x) - reach; x <= Math.round(p.x) + reach; x++) {
      if (isFloor(map, x, z)) continue;
      if (Math.hypot(Math.max(0, Math.abs(p.x - x) - 0.5), Math.max(0, Math.abs(p.z - z) - 0.5)) < radius + 0.001) return false;
    }
  return !closedDoors || !map.doors.some(d => !d.open &&
    Math.abs(p.x - d.point.x) < doorHalf(d, "x") + radius &&
    Math.abs(p.z - d.point.z) < doorHalf(d, "z") + radius);
}

export function clearSegment(map: DungeonMap, a: Point, b: Point, radius: number, closedDoors = false, sight = false): boolean {
  const steps = Math.max(1, Math.ceil(distance(a, b) / 0.2));
  for (let i = 0; i <= steps; i++) if (!walkable(map,
    { x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps }, radius, closedDoors, sight)) return false;
  return true;
}

/**
 * **Where sight needs no reading.** `clear[z * size + x]` is 1 where the cell is floor and no
 * sight-blocking obstacle and no closed door reaches any point of it. A sample of a sight line in
 * such a cell, within `SIGHT_RIM` of the cell's middle on both axes, is seen through whatever is
 * beside the cell: rock stops sight within 0.001 m of itself and no farther. Every other sample is
 * `walkable`'s.
 *
 * It is of the map as it was when made. It stays right as doors open, since a cell it does not
 * vouch for is read from the map; it is made again then so that those cells are fast. It is
 * wrong once a door has closed, an obstacle has come or the floor has changed: whoever does that
 * to a map makes another.
 */
export interface SightIndex { readonly clear: Uint8Array }

/**
 * A cell's samples within this of its middle on both axes are at least 0.002 m from every other
 * cell, m: twice the 0.001 m within which `walkable` stops sight at rock, a numeric setting
 * (`docs/reference/step-cost.md#sight-read-through-an-index`).
 */
const SIGHT_RIM = 0.498;

/**
 * The map's sight index. A cell is not vouched for where an obstacle's or a closed door's own test
 * in `walkable`, taken at the cell's nearest point to it and widened, could stop a sample: so the
 * index never vouches for a sample the map would stop.
 */
export function sightIndex(map: DungeonMap): SightIndex {
  const size = map.size, clear = new Uint8Array(size * size);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    if (map.floor[z * size + x] !== 1) continue;
    if (map.obstacles?.some(o => o.blocksSight &&
      Math.abs(x - o.x) - o.width / 2 - 0.5 < 0.002 && Math.abs(z - o.z) - o.depth / 2 - 0.5 < 0.002)) continue;
    if (map.doors.some(d => !d.open &&
      Math.abs(x - d.point.x) - 0.5 < doorHalf(d, "x") + 1e-9 && Math.abs(z - d.point.z) - 0.5 < doorHalf(d, "z") + 1e-9)) continue;
    clear[z * size + x] = 1;
  }
  return { clear };
}

/** `clearSegment` for sight, its samples the same: one the index vouches for is not read from the map. */
function clearSight(map: DungeonMap, a: Point, b: Point, index: SightIndex): boolean {
  const steps = Math.max(1, Math.ceil(distance(a, b) / 0.2)), size = map.size, clear = index.clear;
  for (let i = 0; i <= steps; i++) {
    const x = a.x + (b.x - a.x) * i / steps, z = a.z + (b.z - a.z) * i / steps, cx = Math.round(x), cz = Math.round(z);
    if (cx >= 0 && cz >= 0 && cx < size && cz < size && clear[cz * size + cx] === 1 &&
      Math.abs(x - cx) < SIGHT_RIM && Math.abs(z - cz) < SIGHT_RIM) continue;
    if (!walkable(map, { x, z }, 0, true, true)) return false;
  }
  return true;
}

/** Whether `b` is seen from `a`: within `range`, with nothing that stops sight on the line. `index`, the map's own, answers the same faster. */
export function canSee(map: DungeonMap, a: Point, b: Point, range = 12, index?: SightIndex): boolean {
  return distance(a, b) <= range && (index ? clearSight(map, a, b, index) : clearSegment(map, a, b, 0, true, true));
}

/**
 * A* plans through openable doors. The world sweep still stops at a door until it opens. The search
 * steps from the middle of each cell, and out of the first cell from `from` itself as well: at a
 * 0.5 m radius the middle of a cell beside rock is not walkable, so a body standing in one would
 * have no route at all. The first cell's middle is still tried, since stepping from `from` alone
 * changes the routes that the middle finds.
 */
export function findPath(map: DungeonMap, from: Point, to: Point, radius: number): Point[] {
  if (!walkable(map, to, radius)) return [];
  if (clearSegment(map, from, to, radius)) return [{ x: to.x, z: to.z }];
  const start = cellKey(map, from), goal = cellKey(map, to);
  const point = (key: number) => ({ x: key % map.size, z: Math.floor(key / map.size) });
  const open = new Set([start]), cost = new Map([[start, 0]]), previous = new Map<number, number>();
  while (open.size) {
    let current = -1, best = Infinity;
    for (const key of open) { const score = cost.get(key)! + distance(point(key), to); if (score < best) { best = score; current = key; } }
    if (current === goal) {
      const reverse = [to]; let key = current;
      while (key !== start) { reverse.push(point(key)); key = previous.get(key)!; }
      const raw = reverse.reverse(), result: Point[] = []; let anchor = from;
      for (let i = 0; i < raw.length;) {
        let end = i;
        while (end + 1 < raw.length && clearSegment(map, anchor, raw[end + 1], radius)) end++;
        result.push(raw[end]); anchor = raw[end]; i = end + 1;
      }
      return result;
    }
    open.delete(current); const p = point(current);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: p.x + dx, z: p.z + dz }, key = cellKey(map, next);
      if (!walkable(map, next, radius)) continue;
      if (!clearSegment(map, p, next, radius) && !(current === start && clearSegment(map, from, next, radius))) continue;
      const candidate = cost.get(current)! + 1;
      if (candidate >= (cost.get(key) ?? Infinity)) continue;
      cost.set(key, candidate); previous.set(key, current); open.add(key);
    }
  }
  return [];
}

/**
 * The floor cells seen from `hero`, each added to `explored`. `seen`, where given, is the cells
 * this reading has seen from other places: a cell in it is not looked at again, what is seen from
 * here is added to it, and it is what is returned.
 */
export function reveal(map: DungeonMap, hero: Point, explored: Set<number>, range = 12, index?: SightIndex, seen?: Set<number>): Set<number> {
  const visible = seen ?? new Set<number>();
  for (let z = Math.max(0, Math.floor(hero.z - range)); z <= Math.min(map.size - 1, hero.z + range); z++)
    for (let x = Math.max(0, Math.floor(hero.x - range)); x <= Math.min(map.size - 1, hero.x + range); x++) {
      if (!isFloor(map, x, z) || seen?.has(z * map.size + x)) continue;
      const p = { x, z }; if (canSee(map, hero, p, range, index)) { const key = cellKey(map, p); visible.add(key); explored.add(key); }
    }
  return visible;
}

/** Frontier choice uses only explored cells and their immediate unknown neighbours. */
export function explorationGoal(map: DungeonMap, from: Point, explored: Set<number>, radius: number): Point | null {
  if (explored.has(cellKey(map, map.exit))) return { ...map.exit };
  const candidates = [...explored].map(key => ({ x: key % map.size, z: Math.floor(key / map.size) }))
    .filter(p => distance(p, from) > 1 && walkable(map, p, radius) &&
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([x, z]) => isFloor(map, p.x + x, p.z + z) && !explored.has(cellKey(map, { x: p.x + x, z: p.z + z }))))
    .sort((a, b) => distance(a, from) - distance(b, from));
  for (const candidate of candidates) if (findPath(map, from, candidate, radius).length) return candidate;
  // A closed door's near edge is the last visible frontier. Approaching that known door opens it.
  for (const d of map.doors.filter(d => !d.open).sort((a, b) => distance(a.point, from) - distance(b.point, from))) {
    if ([...explored].some(key => distance({ x: key % map.size, z: Math.floor(key / map.size) }, d.point) < 2) &&
      findPath(map, from, d.point, radius).length) return { ...d.point };
  }
  return null;
}
import type { BodyModel } from "../core/models.ts";
