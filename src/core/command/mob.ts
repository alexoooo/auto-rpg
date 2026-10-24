import { deepFreeze } from "../state.ts";
import { kindOnly, type CommanderEntry } from "./commander.ts";
import { atan2, cos, sin } from "../math/real.ts";
import { placeMovement, type GroundPoint, type MovementRequest } from "../mind/movement.ts";
import { STAND_ORDERS, type Orders } from "../mind/orders.ts";
import { ARRIVAL, approach, direction, distance, onBearing, throughDoors, type Opening } from "./goals.ts";
import { ALERT_SECONDS, SIGHT_METRES } from "./independent.ts";
import { bearingOf, bearings, spread } from "./spread.ts";
import type { Commander, MemberReport, MemberView, TeamDecision, TeamHost, TeamView } from "./team.ts";

/**
 * Where a mob's attacker stands about its foe, as shares of its reach (`RING.slot`, the radius of
 * its place round the foe), and when it stops making for that place and closes in on the foe, m:
 * within `near` of the place, or within its reach and `near` of the foe; it makes for its place
 * again past its reach and `far`. A place more than `detour` radians round from where the attacker
 * stands is come at by a waypoint halfway round, `around` reaches out, so that it walks round the
 * foe rather than through it.
 */
const RING = Object.freeze({ slot: 0.9, near: 1, far: 2, detour: Math.PI / 2, around: 2 });

/** What a mob remembers of a member: its foe, its place round it, where and until when it last saw one, and the door it is opening. */
interface Memory {
  target: string | null;
  /** The bearing round its foe it is given, radians from +z toward +x; null goes straight in. */
  bearing: number | null;
  /** Its place round its foe, set at each look. */
  slot: GroundPoint | null;
  /** Whether it has reached its place and closes in on its foe. */
  closed: boolean;
  lastSeen: GroundPoint | null;
  alertedUntil: number;
  opening: Opening | null;
}

/**
 * **A mob**: its members attack together, spread over the foes they see (`spread`) and, several on
 * one foe, about it (`bearings`): each makes for its place round its foe, at its reach on the
 * bearing it was given, and closes in from there. A member that sees no foe walks on to where it
 * last saw one for `ALERT_SECONDS`, and otherwise goes back home. Nobody leads it; it hears no
 * command. Each look (`TeamView.look`) it shares its foes out again; with no foe in the fight,
 * what it last saw stands.
 */
export function mobCommander(host: TeamHost): Commander {
  const state = { members: {} as Record<string, Memory> };
  const memory = (id: string): Memory => state.members[id] ??=
    { target: null, bearing: null, slot: null, closed: false, lastSeen: null, alertedUntil: 0, opening: null };
  const { level } = host;

  const look = (view: TeamView) => {
    const foes = view.others.filter(other => other.fighting);
    if (!foes.length) return;
    const attackers = [];
    for (const member of view.members) {
      const mind = memory(member.id);
      if (!member.fighting || member.held) { mind.target = null; mind.bearing = null; mind.slot = null; continue; }
      const seen = foes.filter(foe => level.sees(member.at, foe.at, SIGHT_METRES));
      if (seen.length) attackers.push({ member, attacker: { id: member.id, at: member.at, current: mind.target, seen } });
      else { mind.target = null; mind.bearing = null; mind.slot = null; }
    }
    const given = spread(attackers.map(({ attacker }) => attacker));
    for (const { member } of attackers) {
      const mind = memory(member.id), foe = given.get(member.id)!;
      if (mind.target !== foe.id) mind.closed = false;
      mind.target = foe.id; mind.lastSeen = { x: foe.at.x, z: foe.at.z }; mind.alertedUntil = view.time + ALERT_SECONDS;
    }
    for (const foe of foes) {
      const round = attackers.filter(({ member }) => memory(member.id).target === foe.id).map(({ member }) => member);
      const given = bearings(foe.at, round);
      for (const member of round) {
        const mind = memory(member.id), bearing = given.get(member.id) ?? null;
        mind.bearing = bearing;
        mind.slot = bearing === null ? null : placeRound(member, foe.at, bearing);
      }
    }
  };

  /** `member`'s place at `bearing` round a foe at `at`, where it is floor in a straight line from the foe; else none. */
  const placeRound = (member: MemberView, at: GroundPoint, bearing: number): GroundPoint | null => {
    const slot = onBearing(at, bearing, member.reach * RING.slot);
    return level.fits(slot, member.radius) && level.passes(at, slot, member.radius) ? slot : null;
  };

  /** The way to `member`'s place round its foe at `at`: straight there, or by a waypoint halfway round where the place is far round the foe. */
  const toPlace = (member: MemberView, at: GroundPoint, bearing: number, slot: GroundPoint): MovementRequest => {
    const own = bearingOf(at, member.at), turn = atan2(sin(bearing - own), cos(bearing - own));
    if (Math.abs(turn) <= RING.detour) return placeMovement(slot, ARRIVAL.point);
    const way = onBearing(at, own + turn / 2, Math.max(distance(at, member.at), member.reach * RING.around));
    if (!level.fits(way, member.radius)) return placeMovement(slot, ARRIVAL.point);
    return { kind: "place", points: [way, { x: slot.x, z: slot.z }], near: ARRIVAL.point };
  };

  /** A member makes for its place round its foe, closes in on it, goes to the last place it saw one, or home. */
  const movement = (view: TeamView, member: MemberView, mind: Memory): MovementRequest | null => {
    if (mind.target) {
      const foe = view.others.find(other => other.id === mind.target);
      if (foe && mind.bearing !== null && mind.slot) {
        const gap = distance(member.at, foe.at);
        if (mind.closed && gap > member.reach + RING.far) mind.closed = false;
        else if (!mind.closed && (distance(member.at, mind.slot) <= RING.near || gap <= member.reach + RING.near)) mind.closed = true;
        if (!mind.closed) return toPlace(member, foe.at, mind.bearing, mind.slot);
      }
      return approach(mind.target, member.reach);
    }
    const goal = mind.alertedUntil > view.time ? mind.lastSeen : member.home;
    return goal ? placeMovement(goal, ARRIVAL.point) : null;
  };

  return {
    state,
    // Nobody leads a mob.
    hear() {},
    decide(view: TeamView): TeamDecision {
      if (view.look) look(view);
      const orders = new Map<string, Orders>();
      for (const member of view.members) {
        if (!member.fighting || member.held) { orders.set(member.id, STAND_ORDERS); continue; }
        const mind = memory(member.id);
        const move = throughDoors(mind, member, movement(view, member, mind), view, level);
        const target = mind.target === null ? null : view.others.find(other => other.id === mind.target) ?? null;
        orders.set(member.id, { move, face: target ? direction(member.at, target.at) : null, ...(target?.fighting ? { foe: target.id } : {}) });
      }
      return { orders, looked: view.look };
    },
    idle(member: string, time: number) {
      const mind = state.members[member];
      return !mind || mind.target === null && mind.alertedUntil <= time;
    },
    report(member: string): MemberReport {
      return { target: state.members[member]?.target ?? null, task: "", forced: false, selected: false };
    },
    get notice() { return ""; },
  };
}

/** **A mob** (`mobCommander`): its members spread over the foes they see, and round each. */
export const MOB: CommanderEntry = deepFreeze({
  label: "Mob", sides: ["enemies"], defaults: { kind: "mob" }, faults: kindOnly,
  create: (host: TeamHost) => mobCommander(host),
});
