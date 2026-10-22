import { cos, sin } from "../math/real.ts";
import { directMovement, placeMovement, type GroundPoint, type MovementRequest } from "../mind/movement.ts";
import { STAND_ORDERS, type Orders } from "../mind/orders.ts";
import type { TeamCommand, TeamOrder } from "./commands.ts";
import { ARRIVAL, approach, arrived, direction, distance, reportOf, throughDoors, type Opening } from "./goals.ts";
import type { Commander, MemberReport, MemberView, SensedBody, TeamDecision, TeamHost, TeamView } from "./team.ts";

/** How far behind the leader an unposted member trails before it walks after it, m: clear of the leader's reach (`docs/reference/play.md#following`). */
const TRAIL_METRES = 2.5;
/**
 * How far a member sees a foe along a clear line, m (`docs/reference/play.md#sight`): the one its
 * order locks, `locked`; one it may pick for itself, `pick`; and how far the one it fights may go
 * before another is picked, `keep`.
 */
const PARTY_SIGHT = Object.freeze({ locked: 12, pick: 8, keep: 5 });
/**
 * With the pointer steering its facing, the leader takes on what the pointer points at, and also
 * any foe nearer than `metres` wherever it stands, turning to it for as long as it stays within
 * `keepMetres` (`docs/reference/play.md#targets`).
 */
const SET_UPON = Object.freeze({ metres: 2.5, keepMetres: 3.5 });
/** The cone about the pointer's direction the leader picks foes from, as the cosine of its half-angle (73 degrees; `docs/reference/play.md#targets`). */
const AIM_COSINE = 0.3;
/**
 * Where several members sent to one floor point stand, m (`docs/reference/play.md#following`): no
 * two slots nearer than `apart`, on eight bearings of each of these rings about the point.
 */
const SLOTS = Object.freeze({ apart: 1.3, rings: [1.4, 2.8] });

const IDLE: TeamOrder = Object.freeze({ kind: "idle" });

/** What the party remembers of a member. */
interface Memory {
  /** The foe it fights, by id. */
  target: string | null;
  /** Where it last saw the foe its order locks. */
  lastSeen: GroundPoint | null;
  /** The unexplored place the leader is making for; its Mind owns every route to it. */
  goal: GroundPoint | null;
  /** Its standing order; a drawn route's is shared with every member sent along it, and grows while it is drawn. */
  order: TeamOrder;
  /** Where along a drawn route it resumes after a door. */
  routeStart: number;
  /** The door it is on its way to open. */
  opening: Opening | null;
  /** Where it was last sent, which it holds once there; null follows the leader. The leader's stays null. */
  post: GroundPoint | null;
  /** Its order was dropped or replaced, and it plans afresh at the next step. */
  replan: boolean;
}

/**
 * **A person's party**: the leader (the team's first member) goes where its person steers or
 * explores by itself; the others follow it at `TRAIL_METRES` or hold where they were last sent.
 * Each fights the foe its order locks, or the nearest it sees; members sent to one point take
 * slots about it; a member whose way is shut by a door goes to open it first. A person's command
 * (`TeamCommand`) replaces what the members it names were doing.
 *
 * It looks when its host's schedule says (`TeamView.look`) and at once after a member's plan is
 * reset. With the pointer steering the leader's facing, the leader takes on what it points at
 * first (`AIM_COSINE`, `SET_UPON`).
 */
export function partyCommander(host: TeamHost): Commander {
  const { level } = host;
  const state = { members: {} as Record<string, Memory>, leader: null as string | null, notice: "" };
  const memory = (id: string): Memory => state.members[id] ??=
    { target: null, lastSeen: null, goal: null, order: IDLE, routeStart: 0, opening: null, post: null, replan: false };

  /**
   * The point itself for the first member sent to it, then the first of eight bearings on each ring
   * of `SLOTS`, nearest first, that is floor within sight of it and clear of every slot already
   * given. Each slot is recorded in `taken`.
   */
  const slot = (point: GroundPoint, radius: number, taken: GroundPoint[]): GroundPoint => {
    const free = (at: GroundPoint) => taken.every(other => distance(other, at) >= SLOTS.apart);
    let chosen: GroundPoint | null = free(point) ? { x: point.x, z: point.z } : null;
    for (const ring of SLOTS.rings) for (let i = 0; i < 8 && !chosen; i++) {
      const at = { x: point.x + sin(i * Math.PI / 4) * ring, z: point.z + cos(i * Math.PI / 4) * ring };
      if (free(at) && level.fits(at, radius) && level.passes(point, at, radius)) chosen = at;
    }
    const given = chosen ?? { x: point.x, z: point.z };
    taken.push(given); return given;
  };

  /** Whether the pointer points the leader at `foe`: always, unless the pointer steers the leader's facing. */
  const aimedAt = (view: TeamView, foe: SensedBody): boolean => {
    const aim = view.lead?.aim, at = view.members[0]!.at;
    if (!aim) return true;
    const look = direction(at, aim), toward = direction(at, foe.at);
    return toward.x * look.x + toward.z * look.z > AIM_COSINE;
  };

  /** Which the leader takes on first, lowest first: a foe upon it that the pointer points at, one upon it, one the pointer points at, then the rest. */
  const aimRank = (view: TeamView, foe: SensedBody): number => {
    if (!view.lead?.aim) return 0;
    const leader = view.members[0]!;
    const reach = foe.id === memory(leader.id).target ? SET_UPON.keepMetres : SET_UPON.metres;
    const upon = distance(leader.at, foe.at) < reach;
    return (upon ? 0 : 2) + (aimedAt(view, foe) ? 0 : 1);
  };

  /** Which foe `member` fights: the one its order locks, or the nearest it can see. */
  const choose = (view: TeamView, member: MemberView): void => {
    const mind = memory(member.id), order = mind.order, at = member.at;
    if (order.kind === "lock") {
      const locked = view.others.find(other => other.id === order.target);
      if (locked?.fighting && level.sees(at, locked.at, PARTY_SIGHT.locked)) {
        mind.target = locked.id; mind.lastSeen = { x: locked.at.x, z: locked.at.z }; return;
      }
      // Pursue the last observed position, never a hidden moving body.
      if (locked?.fighting && mind.lastSeen && distance(at, mind.lastSeen) > ARRIVAL.lastSeen &&
        level.reaches(at, mind.lastSeen, member.radius)) { mind.target = null; return; }
      mind.order = IDLE; mind.replan = true; mind.lastSeen = null;
    }
    const leads = member.id === view.members[0]!.id, current = mind.target;
    const rank = (foe: SensedBody) => leads ? aimRank(view, foe) : 0;
    const candidates = view.others.filter(foe => foe.fighting && level.sees(at, foe.at, PARTY_SIGHT.pick))
      .filter(foe => !leads || aimedAt(view, foe) || distance(at, foe.at) < (foe.id === current ? SET_UPON.keepMetres : SET_UPON.metres))
      .sort((a, b) => rank(a) - rank(b) || distance(a.at, at) - distance(b.at, at));
    const kept = current === null ? undefined : candidates.find(foe => foe.id === current);
    const keep = kept !== undefined && distance(kept.at, at) < PARTY_SIGHT.keep && rank(kept) <= rank(candidates[0]!);
    mind.target = keep ? current : candidates[0]?.id ?? null;
  };

  /** Where `member` is going: where its person steers it, its order's place, its foe's band, its post, after its leader, or the edge of what is explored. */
  const movement = (view: TeamView, member: MemberView, mind: Memory): MovementRequest | null => {
    const lead = view.lead, order = mind.order, leader = view.members[0]!, leads = member.id === leader.id;
    if (leads && lead?.keys) return lead.keys.x || lead.keys.z ? directMovement(lead.keys.x, lead.keys.z) : null;
    if (order.kind === "force") {
      const last = order.points.at(-1);
      if (!last) return null;
      if (!order.drawing && arrived(member, last, ARRIVAL.point)) {
        mind.order = IDLE; if (!leads) mind.post = { ...last };
        return null;
      }
      return { kind: "place", points: order.points.slice(mind.routeStart).map(point => ({ ...point })), near: ARRIVAL.point };
    }
    if (mind.target) return approach(mind.target, member.reach);
    if (order.kind === "lock" && mind.lastSeen) return placeMovement(mind.lastSeen, ARRIVAL.lastSeen);
    if (order.kind === "attack-move") {
      if (arrived(member, order.destination, ARRIVAL.point)) {
        mind.order = IDLE; if (!leads) mind.post = { ...order.destination };
        return null;
      }
      return placeMovement(order.destination, ARRIVAL.point);
    }
    if (!leads) {
      if (mind.post) return placeMovement(mind.post, ARRIVAL.post);
      return leader.fighting ? approach(leader.id, TRAIL_METRES) : null;
    }
    if (lead?.explore) {
      const status = mind.goal ? reportOf(member, placeMovement(mind.goal, ARRIVAL.explored))?.status : undefined;
      if (!mind.goal || arrived(member, mind.goal, ARRIVAL.explored) || status === "unreachable" || status === "stalled")
        mind.goal = level.frontier(member.at, member.radius);
      return mind.goal ? placeMovement(mind.goal, ARRIVAL.explored) : null;
    }
    return null;
  };

  /** What `order` has a member doing, in a word or two: what it was told, or does untold. */
  const task = (order: TeamOrder, post: GroundPoint | null, leads: boolean): string => {
    switch (order.kind) {
      case "idle": return post ? "holding" : leads ? "standing" : "with you";
      case "lock": return "fighting";
      case "attack-move": return "attack-moving";
      case "force": return order.points.length ? "force-moving" : post ? "holding" : leads ? "standing" : "with you";
      default: { const unknown: never = order; throw new Error(`no task for ${JSON.stringify(unknown)}`); }
    }
  };

  return {
    state,
    hear(command: TeamCommand, view: TeamView) {
      state.leader ??= view.members[0]?.id ?? null;
      switch (command.kind) {
        case "order": {
          // Several sent to one floor point take the slots about it, or all but one crowd it for ever.
          const { order } = command, taken: GroundPoint[] = [];
          for (const member of view.members) if (command.members.includes(member.id)) {
            const mind = memory(member.id);
            mind.order = order.kind === "attack-move" ? { kind: "attack-move", destination: slot(order.destination, member.radius, taken) } : order;
            mind.replan = true;
            if (order.kind !== "idle") mind.post = null;
          }
          state.notice = "";
          return;
        }
        case "regroup":
          // The leader is nobody's to call back.
          for (const member of view.members) if (member.id !== view.members[0]!.id && command.members.includes(member.id)) {
            const mind = memory(member.id);
            mind.order = IDLE; mind.post = null; mind.replan = true;
          }
          return;
        default: { const unknown: never = command; throw new Error(`no command ${JSON.stringify(unknown)}`); }
      }
    },
    decide(view: TeamView): TeamDecision {
      state.leader ??= view.members[0]?.id ?? null;
      let replanned = false;
      for (const member of view.members) {
        const mind = memory(member.id);
        if (!mind.replan) continue;
        mind.replan = false; mind.goal = null; mind.target = null; mind.lastSeen = null; mind.opening = null; mind.routeStart = 0;
        replanned = true;
        if (mind.order.kind === "idle" && member.id === view.members[0]!.id) state.notice = "";
      }
      const looked = view.look || replanned;
      const standing = view.members.filter(member => member.fighting);
      // With nobody standing the fight is lost, and what the party last saw stands.
      if (looked && standing.length) {
        level.look(standing.map(member => member.at));
        for (const member of standing) choose(view, member);
      }
      const orders = new Map<string, Orders>();
      for (const member of view.members) {
        if (!member.fighting || member.held) { orders.set(member.id, STAND_ORDERS); continue; }
        const mind = memory(member.id);
        const move = throughDoors(mind, member, movement(view, member, mind), view, level);
        const target = mind.target === null ? null : view.others.find(other => other.id === mind.target) ?? null;
        const aim = member.id === view.members[0]!.id ? view.lead?.aim ?? null : null;
        const face = target ? direction(member.at, target.at) : aim ? direction(member.at, aim) : null;
        orders.set(member.id, { move, face, ...(mind.order.kind !== "force" && target?.fighting ? { foe: target.id } : {}) });
        if (move?.kind === "place") {
          if (mind.opening) state.notice = "Approaching door";
          else if (reportOf(member, move)?.status === "unreachable") state.notice = "Destination unreachable";
          else if (reportOf(member, move)?.status === "stalled") state.notice = "Movement stalled";
        }
      }
      return { orders, looked };
    },
    idle: () => false,
    report(member: string): MemberReport {
      const mind = state.members[member], order = mind?.order ?? IDLE;
      return { target: mind?.target ?? null, task: task(order, mind?.post ?? null, member === state.leader), forced: order.kind === "force" };
    },
    get notice() { return state.notice; },
  };
}
