// The generator the dungeon shipped with until 2026-09: seven rooms on a 3 x 3 lattice, 16 m apart,
// joined by 3 m corridors with a door at each end. It left `src/dungeon/map.ts` when the run moved
// onto `generateLevel` (src/dungeon/level.ts).
//
// Kept only as a fixed layout for tests about the *run* -- traversal, doors, fog, fights, force
// movement -- several of which place bodies at coordinates only this layout has. A change to the
// level generator must never read as a change to the run, so those tests do not use `generateLevel`.
import { mulberry32 } from "../../src/rng.ts";
import { distance, findPath } from "../../src/dungeon/map.ts";

/** Rooms occupy separated slots, so every connection has a genuine three-metre corridor. */
export function classicDungeon(seed) {
  const random = mulberry32(seed); const size = 51; const floor = new Uint8Array(size * size);
  const corners = [2, 6, 8]; // Shuffle with the seeded generator, never Array.sort(random).
  for (let i = corners.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [corners[i], corners[j]] = [corners[j], corners[i]];
  }
  const slots = Array.from({ length: 9 }, (_, i) => i).filter(i => !corners.slice(0, 2).includes(i));
  const rooms = slots.map((slot, id) => {
    const centre = { x: 9 + slot % 3 * 16, z: 9 + Math.floor(slot / 3) * 16 };
    const half = random() < 0.5 ? 4 : 5;
    return { id, centre, min: { x: centre.x - half, z: centre.z - half }, max: { x: centre.x + half, z: centre.z + half } };
  });
  const carve = (x, z) => { floor[z * size + x] = 1; };
  for (const r of rooms) for (let z = r.min.z; z <= r.max.z; z++)
    for (let x = r.min.x; x <= r.max.x; x++) carve(x, z);
  const edges = [];
  for (let a = 0; a < rooms.length; a++) for (let b = a + 1; b < rooms.length; b++)
    if (distance(rooms[a].centre, rooms[b].centre) === 16) edges.push({ a, b, weight: random() });
  edges.sort((a, b) => a.weight - b.weight);
  const parents = rooms.map(r => r.id);
  const root = (i) => parents[i] === i ? i : root(parents[i]);
  const doors = [];
  for (const edge of edges) {
    if (root(edge.a) === root(edge.b) && random() > 0.45) continue;
    parents[root(edge.a)] = root(edge.b);
    const a = rooms[edge.a], b = rooms[edge.b];
    const dx = Math.sign(b.centre.x - a.centre.x), dz = Math.sign(b.centre.z - a.centre.z);
    for (let t = 0; t <= 16; t++) for (let w = -1; w <= 1; w++)
      carve(a.centre.x + dx * t + dz * w, a.centre.z + dz * t + dx * w);
    for (const [room, direction] of [[a, 1], [b, -1]]) {
      const half = room.max.x - room.centre.x;
      doors.push({ id: doors.length, axis: dx ? "x" : "z", open: false,
        point: { x: room.centre.x + dx * direction * (half + 1),
          z: room.centre.z + dz * direction * (half + 1) } });
    }
  }
  const map = { seed: seed >>> 0, size, floor, rooms, doors,
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
