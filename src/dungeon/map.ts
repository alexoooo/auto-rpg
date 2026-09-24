import { mulberry32 } from "../rng.ts";

export interface Point { x: number; z: number }
export interface Room { id: number; centre: Point; half: number }
export interface Door { id: number; point: Point; axis: "x" | "z"; open: boolean }
export interface DungeonMap {
  seed: number; size: number; floor: Uint8Array; rooms: Room[]; doors: Door[];
  start: Point; exit: Point; spawns: Point[];
}
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.z - b.z);
export const cellKey = (map: DungeonMap, p: Point): number => Math.round(p.z) * map.size + Math.round(p.x);
export function isFloor(map: DungeonMap, x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < map.size && z < map.size && map.floor[z * map.size + x] === 1;
}

/** Rooms occupy separated slots, so every connection has a genuine three-metre corridor. */
export function generateDungeon(seed: number): DungeonMap {
  const random = mulberry32(seed); const size = 51; const floor = new Uint8Array(size * size);
  const corners = [2, 6, 8]; // Shuffle with the seeded generator, never Array.sort(random).
  for (let i = corners.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [corners[i], corners[j]] = [corners[j], corners[i]];
  }
  const slots = Array.from({ length: 9 }, (_, i) => i).filter(i => !corners.slice(0, 2).includes(i));
  const rooms = slots.map((slot, id) => ({ id, centre: { x: 9 + slot % 3 * 16, z: 9 + Math.floor(slot / 3) * 16 },
    half: random() < 0.5 ? 4 : 5 }));
  const carve = (x: number, z: number) => { floor[z * size + x] = 1; };
  for (const r of rooms) for (let z = r.centre.z - r.half; z <= r.centre.z + r.half; z++)
    for (let x = r.centre.x - r.half; x <= r.centre.x + r.half; x++) carve(x, z);
  const edges: { a: number; b: number; weight: number }[] = [];
  for (let a = 0; a < rooms.length; a++) for (let b = a + 1; b < rooms.length; b++)
    if (distance(rooms[a].centre, rooms[b].centre) === 16) edges.push({ a, b, weight: random() });
  edges.sort((a, b) => a.weight - b.weight);
  const parents = rooms.map(r => r.id);
  const root = (i: number): number => parents[i] === i ? i : root(parents[i]);
  const doors: Door[] = [];
  for (const edge of edges) {
    if (root(edge.a) === root(edge.b) && random() > 0.45) continue;
    parents[root(edge.a)] = root(edge.b);
    const a = rooms[edge.a], b = rooms[edge.b];
    const dx = Math.sign(b.centre.x - a.centre.x), dz = Math.sign(b.centre.z - a.centre.z);
    for (let t = 0; t <= 16; t++) for (let w = -1; w <= 1; w++)
      carve(a.centre.x + dx * t + dz * w, a.centre.z + dz * t + dx * w);
    for (const [room, direction] of [[a, 1], [b, -1]] as const) {
      doors.push({ id: doors.length, axis: dx ? "x" : "z", open: false,
        point: { x: room.centre.x + dx * direction * (room.half + 1),
          z: room.centre.z + dz * direction * (room.half + 1) } });
    }
  }
  const map: DungeonMap = { seed: seed >>> 0, size, floor, rooms, doors,
    start: { ...rooms[0].centre }, exit: { ...rooms[0].centre }, spawns: [] };
  let farthest = 0;
  for (const room of rooms.slice(1)) {
    const path = findPath(map, map.start, room.centre, 0.65);
    const length = path.reduce((n, p, i) => n + distance(i ? path[i - 1] : map.start, p), 0);
    if (length > farthest) { farthest = length; map.exit = { ...room.centre }; }
    map.spawns.push({ x: room.centre.x - 2, z: room.centre.z });
  }
  for (let i = 0; i < 2; i++) {
    const room = rooms[1 + Math.floor(random() * (rooms.length - 1))];
    const point = { x: room.centre.x + 2, z: room.centre.z + (i ? 2 : -2) };
    map.spawns.push(point);
  }
  return map;
}

/** Clearance is measured against cell rectangles, not an arbitrary number of tile neighbours. */
export function walkable(map: DungeonMap, p: Point, radius: number, closedDoors = false): boolean {
  if (!isFloor(map, Math.round(p.x), Math.round(p.z))) return false;
  const reach = Math.ceil(radius + 0.5);
  for (let z = Math.round(p.z) - reach; z <= Math.round(p.z) + reach; z++)
    for (let x = Math.round(p.x) - reach; x <= Math.round(p.x) + reach; x++) {
      if (isFloor(map, x, z)) continue;
      if (Math.hypot(Math.max(0, Math.abs(p.x - x) - 0.5), Math.max(0, Math.abs(p.z - z) - 0.5)) < radius + 0.001) return false;
    }
  return !closedDoors || !map.doors.some(d => !d.open &&
    Math.abs(p.x - d.point.x) < (d.axis === "x" ? 0.18 : 1.5) + radius &&
    Math.abs(p.z - d.point.z) < (d.axis === "z" ? 0.18 : 1.5) + radius);
}

export function clearSegment(map: DungeonMap, a: Point, b: Point, radius: number, closedDoors = false): boolean {
  const steps = Math.max(1, Math.ceil(distance(a, b) / 0.2));
  for (let i = 0; i <= steps; i++) if (!walkable(map,
    { x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps }, radius, closedDoors)) return false;
  return true;
}

export function canSee(map: DungeonMap, a: Point, b: Point, range = 12): boolean {
  return distance(a, b) <= range && clearSegment(map, a, b, 0, true);
}

/**
 * A* plans through openable doors. The world sweep still stops at a door until it opens. The search
 * steps from the middle of each cell, and out of the first cell from `from` itself as well: at a
 * 0.5 m radius the middle of a cell beside rock is not walkable, so a body standing in one had no
 * route at all. Only as well: every step the search took before is still taken. Leaving from
 * `from` alone changed the routes enough that the default biped's exploration lost seeds 0, 8 and 9
 * of the classic twelve (Node headless harness), though over 25,000 sampled starts it returned no
 * route nowhere the middle found one.
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

export function reveal(map: DungeonMap, hero: Point, explored: Set<number>, range = 12): Set<number> {
  const visible = new Set<number>();
  for (let z = Math.max(0, Math.floor(hero.z - range)); z <= Math.min(map.size - 1, hero.z + range); z++)
    for (let x = Math.max(0, Math.floor(hero.x - range)); x <= Math.min(map.size - 1, hero.x + range); x++) {
      const p = { x, z }; if (isFloor(map, x, z) && canSee(map, hero, p, range)) { const key = cellKey(map, p); visible.add(key); explored.add(key); }
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
