import { deepFreeze } from "../state.ts";
import type { CommanderConfig, CommanderEntry } from "./commander.ts";
import { cos, sin } from "../math/real.ts";
import { directMovement, placeMovement, type GroundPoint, type MovementRequest } from "../mind/movement.ts";
import { STAND_ORDERS, type Orders } from "../mind/orders.ts";
import { travelSpeed } from "../mind/travel.ts";
import type { Command, DrawnRoute, TeamOrder } from "./commands.ts";
import { ARRIVAL, approach, arrived, direction, distance, lyingSince, reportOf, roomy, throughDoors, worthFighting, type Opening } from "./goals.ts";
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
/**
 * When a member sent with others to one point stands where it is short of its slot
 * (`docs/reference/play.md#following`): within `metres` of the slot, with a companion already
 * standing within `metres` of it, having come no `headway` m nearer the slot for `seconds` s.
 */
const CROWDED = Object.freeze({ metres: 2.5, headway: 0.1, seconds: 3 });

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
  /** The way its person turned it to face, where it fights nobody; null leaves its facing to its Mind. */
  facing: GroundPoint | null;
  /** Where it stands at the end of the drawn route it walks, once the route is drawn: its slot about the route's last point. */
  end: GroundPoint | null;
  /** Near its slot, the nearest it has come and when it came so near, s; null farther off. */
  headway: { nearest: number; since: number } | null;
}

/** **The party's config**: whether a member takes on a foe it sees untold (`picks`, the default), or fights only the foe it is told to. */
export interface PartyConfig {
  readonly kind: "party";
  readonly picks?: boolean;
}

/**
 * **A person's party**: the leader (the team's first member) goes where its person steers or
 * explores by itself; the others follow it at `TRAIL_METRES` or hold where they were last sent.
 * Each fights the foe its order locks, or, unless its config says not (`PartyConfig.picks`), the
 * nearest it sees; members sent to one point, or along one drawn route, take slots about its end, no
 * faster than the slowest of them goes (`travelSpeed`), so that they arrive together; a member whose
 * way is shut by a door goes to open it first. A person's command (`Command`) replaces what the
 * members selected were doing; the person's keys and pointer steer one member (`TeamView.lead`), and
 * the keys steering it drop any order but a foe's.
 *
 * It looks when its host's schedule says (`TeamView.look`) and at once after a member's plan is
 * reset. With the pointer steering a member's facing, that member takes on what it points at
 * first (`AIM_COSINE`, `SET_UPON`).
 */
export function partyCommander(host: TeamHost, config: PartyConfig): Commander {
  const { level } = host, picks = config.picks ?? true;
  // Whom the person's commands go to (`selected`), by id: null, everybody, until the person selects.
  // When each foe lying down went down, by id (`lyingSince`).
  const state = { members: {} as Record<string, Memory>, leader: null as string | null, notice: "", selected: null as string[] | null,
    down: {} as Record<string, number> };
  const memory = (id: string): Memory => state.members[id] ??=
    { target: null, lastSeen: null, goal: null, order: IDLE, routeStart: 0, opening: null, post: null, replan: false, facing: null, end: null, headway: null };

  /** The members the person's commands go to, in the team's order. */
  const chosen = (view: TeamView): MemberView[] => view.members.filter(member => state.selected === null || state.selected.includes(member.id));
  /** The member the keys and the pointer steer: the one selected, or the leader where several are. */
  const steered = (view: TeamView): MemberView => { const selected = chosen(view); return selected.length === 1 ? selected[0]! : view.members[0]!; };
  /**
   * The ceiling of a member on `order`, m/s: of those sent with it (`together`) and going there still,
   * the slowest's top speed by the gait it goes by now (`travelSpeed`); none where it goes alone, or
   * where none states its gait.
   */
  const ceiling = (view: TeamView, order: TeamOrder): number | undefined => {
    const sent = order.kind === "attack-move" || order.kind === "force" ? order.together : undefined;
    if (!sent) return undefined;
    let pace = Infinity, going = 0;
    for (const member of view.members) {
      const mind = memory(member.id), its = mind.order;
      // One fighting on the way goes nowhere with the rest; a forced route passes every foe.
      if (!member.fighting || (its.kind !== "attack-move" && its.kind !== "force") || its.together !== sent || its.kind === "attack-move" && mind.target) continue;
      going++;
      if (member.gait) pace = Math.min(pace, travelSpeed(member.gait, [1, 0], Infinity, []));
    }
    return going > 1 && Number.isFinite(pace) ? pace : undefined;
  };

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

  /**
   * The slots about `point` for `members` sent together (`slot`, each fitting the widest of them),
   * the member nearest the point given the slot farthest from where they all are: the first there
   * goes deepest, so that none comes in through a slot already stood in. Ties go in the team's order.
   */
  const slotsFor = (point: GroundPoint, members: readonly MemberView[]): Map<string, GroundPoint> => {
    const radius = members.reduce((most, member) => Math.max(most, member.radius), 0), taken: GroundPoint[] = [];
    const places = members.map(() => slot(point, radius, taken));
    let cx = 0, cz = 0;
    for (const member of members) { cx += member.at.x / members.length; cz += member.at.z / members.length; }
    const from = { x: cx, z: cz }, byDepth = places.map((_, i) => i).sort((a, b) => distance(places[b]!, from) - distance(places[a]!, from) || a - b);
    const byNear = members.map((_, i) => i).sort((a, b) => distance(members[a]!.at, point) - distance(members[b]!.at, point) || a - b);
    const given = new Map<string, GroundPoint>();
    byNear.forEach((member, k) => given.set(members[member]!.id, places[byDepth[k]!]!));
    return given;
  };

  /**
   * Whether `member`, sent with others to one point, is to stand where it is (`CROWDED`): near its
   * slot, a companion already standing near it, and no nearer the slot for a while.
   */
  const crowded = (view: TeamView, member: MemberView, mind: Memory, order: TeamOrder & { kind: "attack-move" }): boolean => {
    const off = distance(member.at, order.destination), sent = order.together;
    if (!sent || off > CROWDED.metres) { mind.headway = null; return false; }
    if (!mind.headway || off < mind.headway.nearest - CROWDED.headway) { mind.headway = { nearest: off, since: view.time }; return false; }
    if (view.time - mind.headway.since < CROWDED.seconds) return false;
    return view.members.some(other => other.id !== member.id && other.fighting && sent.includes(other.id)
      && memory(other.id).order.kind !== "attack-move" && distance(other.at, member.at) <= CROWDED.metres);
  };

  /** Whether the pointer points the member it steers at `foe`: always, unless the pointer steers its facing. */
  const aimedAt = (view: TeamView, foe: SensedBody): boolean => {
    const aim = view.lead?.aim, at = steered(view).at;
    if (!aim) return true;
    const look = direction(at, aim), toward = direction(at, foe.at);
    return toward.x * look.x + toward.z * look.z > AIM_COSINE;
  };

  /** Which the member the pointer steers takes on first, lowest first: a foe upon it that the pointer points at, one upon it, one the pointer points at, then the rest. */
  const aimRank = (view: TeamView, foe: SensedBody): number => {
    if (!view.lead?.aim) return 0;
    const aimed = steered(view);
    const reach = foe.id === memory(aimed.id).target ? SET_UPON.keepMetres : SET_UPON.metres;
    const upon = distance(aimed.at, foe.at) < reach;
    return (upon ? 0 : 2) + (aimedAt(view, foe) ? 0 : 1);
  };

  /** Which foe `member` fights: the one its order locks, or, where it picks, the nearest it can see that is worth fighting (`worthFighting`). */
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
    if (!picks) { mind.target = null; return; }
    const aimed = member.id === steered(view).id, current = mind.target;
    const rank = (foe: SensedBody) => aimed ? aimRank(view, foe) : 0;
    const candidates = view.others.filter(foe => worthFighting(foe, state.down, view.time) && level.sees(at, foe.at, PARTY_SIGHT.pick))
      .filter(foe => !aimed || aimedAt(view, foe) || distance(at, foe.at) < (foe.id === current ? SET_UPON.keepMetres : SET_UPON.metres))
      .sort((a, b) => rank(a) - rank(b) || distance(a.at, at) - distance(b.at, at));
    const kept = current === null ? undefined : candidates.find(foe => foe.id === current);
    const keep = kept !== undefined && distance(kept.at, at) < PARTY_SIGHT.keep && rank(kept) <= rank(candidates[0]!);
    mind.target = keep ? current : candidates[0]?.id ?? null;
  };

  /**
   * Where `member` is going: where its person steers it, its order's place, the place it holds, its
   * foe's band, after whom it follows, its post, after its leader, or the edge of what is explored.
   */
  const movement = (view: TeamView, member: MemberView, mind: Memory): MovementRequest | null => {
    const lead = view.lead, order = mind.order, leader = view.members[0]!, leads = member.id === leader.id;
    if (lead?.keys && member.id === steered(view).id) {
      // Steered, it drops where it was going; a companion keeps to where the keys leave it.
      if (order.kind !== "idle" && order.kind !== "lock") mind.order = IDLE;
      if (!leads) mind.post = { x: member.at.x, z: member.at.z };
      return lead.keys.x || lead.keys.z ? directMovement(lead.keys.x, lead.keys.z) : null;
    }
    if (order.kind === "force") {
      const points = order.route.points, last = points.at(-1);
      if (!last) return null;
      const end = mind.end ?? last;
      if (!order.route.drawing && arrived(member, end, ARRIVAL.point)) {
        mind.order = IDLE; if (!leads) mind.post = { ...end };
        return null;
      }
      const past = end.x === last.x && end.z === last.z ? [] : [{ ...end }];
      return { kind: "place", points: [...points.slice(mind.routeStart).map(point => ({ ...point })), ...past], near: ARRIVAL.point };
    }
    if (order.kind === "hold") return placeMovement(order.at, ARRIVAL.post);
    if (mind.target) return approach(mind.target, member.reach);
    if (order.kind === "follow") return view.members.find(other => other.id === order.member)?.fighting ? approach(order.member, TRAIL_METRES) : null;
    if (order.kind === "lock" && mind.lastSeen) return placeMovement(mind.lastSeen, ARRIVAL.lastSeen);
    if (order.kind === "attack-move") {
      if (arrived(member, order.destination, ARRIVAL.point)) {
        mind.order = IDLE; if (!leads) mind.post = { ...order.destination };
        return null;
      }
      if (crowded(view, member, mind, order)) {
        mind.order = IDLE; if (!leads) mind.post = { x: member.at.x, z: member.at.z };
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
        mind.goal = roomy(level, level.frontier(member.at, member.radius), member.radius);
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
      case "force": return order.route.points.length ? "force-moving" : post ? "holding" : leads ? "standing" : "with you";
      case "hold": return "holding fast";
      case "follow": return "following";
      default: { const unknown: never = order; throw new Error(`no task for ${JSON.stringify(unknown)}`); }
    }
  };

  /** `member` given `order`, and `post`, in place of what it was doing: it plans afresh. */
  const ordered = (member: MemberView, order: TeamOrder, post: GroundPoint | null = null): Memory => {
    const mind = memory(member.id);
    mind.order = order; mind.post = post; mind.end = null; mind.headway = null; mind.replan = true;
    state.notice = "";
    return mind;
  };

  /** The way `from` turned by `turn` radians, from +z toward +x. */
  const turned = (from: GroundPoint, turn: number): GroundPoint => {
    const c = cos(turn), s = sin(turn);
    return { x: from.x * c + from.z * s, z: from.z * c - from.x * s };
  };

  return {
    state,
    hear(command: Command, view: TeamView) {
      state.leader ??= view.members[0]?.id ?? null;
      const members = chosen(view), leader = view.members[0]?.id;
      switch (command.kind) {
        case "select":
          state.selected = view.members.filter(member => command.members.includes(member.id)).map(member => member.id);
          return;
        case "go": {
          const together = members.length > 1 ? { together: members.map(member => member.id) } : {};
          // Several sent to one floor point take the slots about it, or all but one crowd it for ever.
          const slots = "route" in command ? null : slotsFor(command.destination, members);
          for (const member of members) ordered(member, "route" in command ? { kind: "force", route: command.route, ...together }
            : { kind: "attack-move", destination: slots!.get(member.id)!, ...together }).facing = null;
          return;
        }
        case "attack":
          for (const member of members) ordered(member, { kind: "lock", target: command.foe }).facing = null;
          return;
        case "face":
          for (const member of members) {
            const mind = memory(member.id);
            if ("toward" in command) mind.facing = direction(member.at, command.toward);
            else {
              const from = mind.facing ?? (member.heading === null ? null : { x: sin(member.heading), z: cos(member.heading) });
              if (from) mind.facing = turned(from, command.turn);
            }
          }
          return;
        case "hold":
          for (const member of members) ordered(member, { kind: "hold", at: { x: member.at.x, z: member.at.z } });
          return;
        case "stop":
          // The leader keeps no post: it stands where it is untold.
          for (const member of members) ordered(member, IDLE, member.id === leader ? null : { x: member.at.x, z: member.at.z });
          return;
        case "regroup":
          // The leader is nobody's to call back.
          for (const member of members) if (member.id !== leader) ordered(member, IDLE).facing = null;
          return;
        case "follow":
          for (const member of members) if (member.id !== command.member) ordered(member, { kind: "follow", member: command.member }).facing = null;
          return;
        default: { const unknown: never = command; throw new Error(`no command ${JSON.stringify(unknown)}`); }
      }
    },
    decide(view: TeamView): TeamDecision {
      state.leader ??= view.members[0]?.id ?? null;
      lyingSince(state.down, view);
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
      // A drawn route, once drawn, has its end shared out as slots, in the team's order, among those sent along it.
      const ends = new Map<DrawnRoute, GroundPoint[]>();
      for (const member of view.members) {
        const mind = memory(member.id), order = mind.order;
        if (order.kind !== "force" || order.route.drawing || !order.route.points.length) continue;
        const taken = ends.get(order.route) ?? [];
        ends.set(order.route, taken);
        if (mind.end) taken.push(mind.end);
      }
      for (const member of view.members) {
        const mind = memory(member.id), order = mind.order, taken = order.kind === "force" ? ends.get(order.route) : undefined;
        if (order.kind === "force" && taken && !mind.end) mind.end = slot(order.route.points.at(-1)!, member.radius, taken);
      }
      const orders = new Map<string, Orders>(), steer = steered(view).id, lead = view.lead;
      for (const member of view.members) {
        if (!member.fighting || member.held) { orders.set(member.id, STAND_ORDERS); continue; }
        const mind = memory(member.id);
        const move = throughDoors(mind, member, movement(view, member, mind), view, level);
        const target = mind.target === null ? null : view.others.find(other => other.id === mind.target) ?? null;
        const steers = member.id === steer, aim = steers ? lead?.aim ?? null : null, strike = steers ? lead?.strike ?? null : null;
        // A person striking faces where they point; a member fighting faces its foe.
        const face = strike && aim ? direction(member.at, aim) : target ? direction(member.at, target.at) : aim ? direction(member.at, aim) : mind.facing;
        const order = mind.order, pace = target && order.kind !== "force" ? undefined : ceiling(view, order);
        orders.set(member.id, { move, face, ...(pace === undefined ? {} : { pace }), ...(steers && lead?.walk && move ? { walk: true as const } : {}),
          ...(strike ? { foe: strike.foe, region: { kind: "segment", segment: strike.region } } : order.kind !== "force" && target?.fighting ? { foe: target.id } : {}) });
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
      return { target: mind?.target ?? null, task: task(order, mind?.post ?? null, member === state.leader), forced: order.kind === "force",
        selected: state.selected === null || state.selected.includes(member) };
    },
    get notice() { return state.notice; },
  };
}

/** **A person's party** (`partyCommander`): the leader where its person steers, the others after it or where they were sent. */
export const PARTY: CommanderEntry = deepFreeze({
  label: "Led by you", sides: ["party"], defaults: { kind: "party" },
  faults: (config: CommanderConfig) => Object.entries(config).flatMap(([key, value]) => key === "kind" ? []
    : key !== "picks" ? [`${key}: not a setting of ${config.kind}`] : typeof value === "boolean" ? [] : ["picks: true or false"]),
  create: (host: TeamHost, config: CommanderConfig) => partyCommander(host, config as PartyConfig),
});
