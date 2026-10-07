import { modelInfo, type BodyModel } from "../core/models.ts";
import { distance, findPath, walkable, type DungeonMap, type Point, type Room } from "./map.ts";
import { levelCandidates } from "./level.ts";

/** Pack and door clearance choices: `docs/reference/reptile.md#encounters`. */
const ENCOUNTERS = Object.freeze({ pack: 3, spacing: 2, doorMargin: 1 });

/** The crypt's initial sight separation in `docs/reference/play.md#the-crypt`. */
export function outsidePartyStart(map: DungeonMap, point: Point): boolean { return distance(point, map.start) > 15; }

/** Candidate selection includes encounter feasibility, before a generated run receives the map. */
export function generateEncounterLevel(seed: number) {
  const candidates = levelCandidates(seed).sort((a, b) => b.metrics.score - a.metrics.score);
  for (const candidate of candidates) {
    try { populateEncounters(candidate.map); return candidate; }
    catch (error) { if (!(error instanceof EncounterSpaceError)) throw error; }
  }
  throw new EncounterSpaceError(`no level of seed ${seed} accommodates its encounters`);
}

class EncounterSpaceError extends Error {}

/** Generated encounters alternate skeleton rooms and three-reptile packs: `docs/reference/reptile.md#encounters`. */
export function populateEncounters(map: DungeonMap): void {
  if (map.encounters) return;
  const rooms = map.rooms.filter(room => !contains(room, map.start) && map.spawns.some(point => contains(room, point)));
  const encounters: NonNullable<DungeonMap["encounters"]>[number][] = [];
  rooms.forEach((room, index) => {
    const model: BodyModel = index % 2 === 0 ? "crypt-skeleton" : "reptile", radius = modelInfo(model).radius;
    const existing = map.spawns.filter(point => contains(room, point));
    if (model === "crypt-skeleton") {
      for (const point of existing) encounters.push({ room: room.id, model, point: { ...point } });
      return;
    }
    const candidates: Point[] = [];
    for (let z = room.min.z + 1; z < room.max.z; z++) for (let x = room.min.x + 1; x < room.max.x; x++) candidates.push({ x, z });
    const centre = existing[0] ?? room.centre;
    candidates.sort((a, b) => distance(a, centre) - distance(b, centre) || a.z - b.z || a.x - b.x);
    const pack: Point[] = [];
    for (const point of candidates) {
      if (!walkable(map, point, radius, true) || !outsidePartyStart(map, point)
        || map.doors.some(door => distance(point, door.point) < radius + ENCOUNTERS.doorMargin)
        || pack.some(p => distance(p, point) < Math.max(2 * radius, ENCOUNTERS.spacing))
        || encounters.some(e => distance(e.point, point) < radius + modelInfo(e.model).radius)
        || !findPath(map, map.start, point, radius).length) continue;
      pack.push(point);
      if (pack.length === ENCOUNTERS.pack) break;
    }
    if (pack.length !== ENCOUNTERS.pack) throw new EncounterSpaceError(`room ${room.id} of seed ${map.seed} cannot hold three reptiles`);
    for (const point of pack) encounters.push({ room: room.id, model, point });
  });
  // Spawn points outside rooms remain the map's existing skeleton encounters.
  for (const point of map.spawns) if (!rooms.some(room => contains(room, point))) encounters.push({ room: -1, model: "crypt-skeleton", point: { ...point } });
  map.encounters = encounters;
  map.spawns = encounters.map(e => e.point);
}

function contains(room: Room, point: Point): boolean {
  return point.x >= room.min.x && point.x <= room.max.x && point.z >= room.min.z && point.z <= room.max.z;
}
