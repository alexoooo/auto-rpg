import { isRefused, type Refused } from "../../core/refusal.ts";
import type { BodyModel } from "../../core/bodies/models.ts";
import { cryptModel } from "./actors.ts";
import { distance, findPath, walkable, type DungeonMap, type Point, type Room } from "./map.ts";
import { levelCandidates } from "./level.ts";

/** Pack and door clearance choices: `docs/reference/reptile.md#encounters`. */
const ENCOUNTERS = Object.freeze({ pack: 3, spacing: 2, doorMargin: 1 });

/** The models a generated level's encounters field, by turn: skeleton rooms and reptile packs. */
export const ENCOUNTER_MODELS: readonly BodyModel[] = Object.freeze(["skeleton", "reptile"]);

/** Whether `point` is far enough from the party's start for an enemy to begin there: more than 15 m. */
export function outsidePartyStart(map: DungeonMap, point: Point): boolean { return distance(point, map.start) > 15; }

/** Candidate selection includes encounter feasibility, before a generated run receives the map. */
export function generateEncounterLevel(seed: number) {
  const candidates = levelCandidates(seed).sort((a, b) => b.metrics.score - a.metrics.score);
  for (const candidate of candidates) {
    const populated = populateEncounters(candidate.map);
    if (!isRefused(populated)) return candidate;
  }
  return { refused: `no level of seed ${seed} accommodates its encounters` };
}

/** Generated encounters alternate skeleton rooms and three-reptile packs: `docs/reference/reptile.md#encounters`. */
export function populateEncounters(map: DungeonMap): Refused | null {
  if (map.encounters) return null;
  const rooms = map.rooms.filter(room => !contains(room, map.start) && map.spawns.some(point => contains(room, point)));
  const encounters: NonNullable<DungeonMap["encounters"]>[number][] = [];
  for (const [index, room] of rooms.entries()) {
    const model = ENCOUNTER_MODELS[index % ENCOUNTER_MODELS.length]!, radius = cryptModel(model).radius;
    const existing = map.spawns.filter(point => contains(room, point));
    if (model === "skeleton") {
      for (const point of existing) encounters.push({ room: room.id, model, point: { ...point } });
      continue;
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
        || encounters.some(e => distance(e.point, point) < radius + cryptModel(e.model).radius)
        || !findPath(map, map.start, point, radius).length) continue;
      pack.push(point);
      if (pack.length === ENCOUNTERS.pack) break;
    }
    if (pack.length !== ENCOUNTERS.pack) return { refused: `room ${room.id} of seed ${map.seed} cannot hold three reptiles` };
    for (const point of pack) encounters.push({ room: room.id, model, point });
  }
  // Spawn points outside rooms remain the map's existing skeleton encounters.
  for (const point of map.spawns) if (!rooms.some(room => contains(room, point))) encounters.push({ room: -1, model: "skeleton", point: { ...point } });
  map.encounters = encounters;
  map.spawns = encounters.map(e => e.point);
  return null;
}

function contains(room: Room, point: Point): boolean {
  return point.x >= room.min.x && point.x <= room.max.x && point.z >= room.min.z && point.z <= room.max.z;
}
