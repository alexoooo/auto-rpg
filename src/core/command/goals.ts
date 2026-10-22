import { hypot } from "../math/real.ts";
import { placeMovement, sameMovement, type GroundPoint, type MovementRequest } from "../mind/movement.ts";
import type { NavigationReport } from "../mind/navigation.ts";
import type { TeamOrder } from "./commands.ts";
import type { MemberView, TeamLevel, TeamView } from "./team.ts";

/**
 * Arrival tolerances, m (`docs/reference/play.md#arrival`): an ordered destination, a companion's
 * post, an exploration goal, the last place a target was seen.
 */
export const ARRIVAL = Object.freeze({ point: 0.4, post: 0.6, explored: 0.5, lastSeen: 0.5 });

export const distance = (a: GroundPoint, b: GroundPoint): number => hypot(a.x - b.x, a.z - b.z);

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
  const order = memory.order;
  if (request.kind === "place" && order?.kind === "force") {
    const start = memory.routeStart ?? 0, index = order.points.findIndex((point, i) => i >= start && point.x === goal.x && point.z === goal.z);
    if (index >= 0) {
      memory.routeStart = index;
      request = { ...request, points: order.points.slice(index).map(point => ({ ...point })) };
    }
  }
  memory.opening = { ...interaction, request: JSON.stringify(request) };
  return placeMovement(interaction.point);
}
