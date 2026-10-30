import { cos, hypot, sin } from "../math/real.ts";
import { placeMovement, sameMovement, type GroundPoint, type MovementRequest } from "../intent/movement.ts";
import type { NavigationReport } from "../navigation/navigator.ts";
import type { TeamOrder } from "./commands.ts";
import type { MemberView, SensedBody, TeamLevel, TeamView } from "./team.ts";

/**
 * Arrival tolerances, m (`docs/reference/play.md#arrival`): an ordered destination, a companion's
 * post, an exploration goal, the last place a target was seen.
 */
export const ARRIVAL = Object.freeze({ point: 0.4, post: 0.6, explored: 0.5, lastSeen: 0.5 });

export const distance = (a: GroundPoint, b: GroundPoint): number => hypot(a.x - b.x, a.z - b.z);

/** The point `metres` from `at` on `bearing`, radians from +z toward +x. */
export const onBearing = (at: GroundPoint, bearing: number, metres: number): GroundPoint =>
  ({ x: at.x + sin(bearing) * metres, z: at.z + cos(bearing) * metres });

/**
 * How long a foe may lie down before a team passes it over, s: the cap the owner's target gives a
 * stand-up (`docs/reference/rising.md#the-owners-target`), past which its rise has failed.
 */
const PASS_OVER_DOWN = 30;

/** Keeps in `since`, by id, when each body of `view` lying down went down; a body up again is dropped. */
export function lyingSince(since: Record<string, number>, view: TeamView): void {
  for (const other of view.others) {
    if (other.down) since[other.id] ??= view.time;
    else delete since[other.id];
  }
}

/** Whether `foe` is one to fight at `time`: in the fight, and not lying down `PASS_OVER_DOWN` s or longer (`lyingSince`). */
export const worthFighting = (foe: SensedBody, since: Readonly<Record<string, number>>, time: number): boolean =>
  foe.fighting && !(foe.down && time - (since[foe.id] ?? time) >= PASS_OVER_DOWN);

/** The room a goal is given beyond a body's footprint, m: about what a club held at its side reaches out. */
const ROOM = 0.4;

/**
 * `goal`, or where it stands close by a wall, the nearest point within a metre of it with `ROOM`
 * more than `radius` about it that a body of `radius` passes to straight from it: room for what
 * the body carries, which its navigator keeps clear of the walls.
 */
export function roomy(level: TeamLevel, goal: GroundPoint | null, radius: number): GroundPoint | null {
  if (!goal || level.fits(goal, radius + ROOM)) return goal;
  for (const ring of [0.5, 1]) for (let i = 0; i < 8; i++) {
    const at = onBearing(goal, i * Math.PI / 4, ring);
    if (level.fits(at, radius + ROOM) && level.passes(goal, at, radius)) return at;
  }
  return goal;
}

/** The unit step on the ground from `from` toward `to`. */
export const direction = (from: GroundPoint, to: GroundPoint): GroundPoint => {
  const d = Math.max(0.001, distance(from, to)); return { x: (to.x - from.x) / d, z: (to.z - from.z) / d };
};

/** A sensed opponent is approached to a band; no request routes through its centre. */
export const approach = (focus: string, far: number): MovementRequest => ({ kind: "range", focus, near: far * .8, far });

/** `member`'s navigation report where it is of `request`, and else none: its Mind may have walked a request of its own since. */
export function reportOf(member: MemberView, request: MovementRequest | null): NavigationReport | null {
  const report = member.navigation;
  return report && sameMovement(report.request, request) ? report : null;
}

/** Whether `member` stands within `near` of `point`, and its navigator, where it has one, says it has arrived there. */
export function arrived(member: MemberView, point: GroundPoint, near: number): boolean {
  if (distance(member.at, point) > near) return false;
  const report = member.navigation;
  return !report || report.status === "arrived" && report.goal?.x === point.x && report.goal.z === point.z;
}

/** Where a body of the view stands, member or sensed, by id. */
function placeOf(view: TeamView, id: string): GroundPoint | null {
  return view.members.find(member => member.id === id)?.at ?? view.others.find(other => other.id === id)?.at ?? null;
}

/** The door a member is on its way to open, for which request (as JSON), and where it stands to open it. */
export interface Opening { readonly door: number; readonly point: GroundPoint; readonly request: string }

/** What a member remembers of its way through doors: the door it is opening, and, where it walks a drawn route, its order and how far along it has come. */
interface DoorMemory {
  opening: Opening | null;
  routeStart?: number;
  readonly order?: TeamOrder;
}

/**
 * `request`, or, where `member`'s navigator finds it unreachable and a closed door is in the way,
 * the place before that door: the door opens as a body comes near it, and the request resumes. A
 * drawn route resumes from the point the door was met on the way to.
 */
export function throughDoors(memory: DoorMemory, member: MemberView, request: MovementRequest | null, view: TeamView, level: TeamLevel): MovementRequest | null {
  if (!request || request.kind === "direct") { memory.opening = null; return request; }
  const key = JSON.stringify(request);
  if (memory.opening) {
    if (memory.opening.request !== key || level.open(memory.opening.door)) memory.opening = null;
    else return placeMovement(memory.opening.point);
  }
  const report = reportOf(member, request);
  if (report?.status !== "unreachable") return request;
  let goal = report.goal;
  if (!goal && request.kind === "range") goal = placeOf(view, request.focus);
  if (!goal && request.kind === "place") goal = request.points[0] ?? null;
  if (!goal) return request;
  const interaction = level.doorway(member.at, goal, member.radius);
  if (!interaction) return request;
  // A drawn route's request is its points from where the member resumes, and what it walks past their end.
  if (request.kind === "place" && memory.order?.kind === "force") {
    const index = request.points.findIndex(point => point.x === goal.x && point.z === goal.z);
    if (index >= 0) {
      memory.routeStart = (memory.routeStart ?? 0) + index;
      request = { ...request, points: request.points.slice(index).map(point => ({ ...point })) };
    }
  }
  memory.opening = { ...interaction, request: JSON.stringify(request) };
  return placeMovement(interaction.point);
}
