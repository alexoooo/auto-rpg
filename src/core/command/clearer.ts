import { deepFreeze } from "../state.ts";
import { kindOnly, type CommanderEntry } from "./commander.ts";
import { placeMovement, type GroundPoint, type MovementRequest } from "../mind/movement.ts";
import { STAND_ORDERS, type Orders } from "../mind/orders.ts";
import { ARRIVAL, approach, arrived, direction, distance, lyingSince, reportOf, roomy, throughDoors, worthFighting, type Opening } from "./goals.ts";
import { spread } from "./spread.ts";
import type { Commander, MemberReport, MemberView, SensedBody, TeamDecision, TeamHost, TeamView } from "./team.ts";

/** How far a member of a level-clearing party sees a foe along a clear line, m. */
const SIGHT_METRES = 12;
/**
 * **The level-clearer's policy**, its distances in m and times in s:
 *
 * - a foe last seen within `engage` of a standing member is in the fight, and one unseen for
 *   `forget` is forgotten;
 * - a fight is taken on while the party's strength (the sum of its standing members' pools, each
 *   1 whole) is at least `odds` for each foe in it, and given up once `stall` has passed with no
 *   foe of it falling; a fight it cannot win it draws back from, to its rally point (the latest
 *   place on its way `clear` or more from every foe in it), `retreats` times at most, and no
 *   further than the rally point;
 * - otherwise it pushes on past its foes, each member striking only a foe within `upon` of it, as
 *   it does drawing back; fighting, a member whose pool is below `hurt` pulls back to the rally
 *   point;
 * - exploring, the leader waits while another stands farther than `apart` from it, until each is
 *   within `together`; the others follow it at `trail`; its way is remembered a point every
 *   `crumb`, the last `crumbs` of them;
 * - a leader whose legs have been out of its navigator's hands (down, or getting up) for `down`
 *   gives the lead to the next member standing.
 */
const POLICY = Object.freeze({ engage: 8, forget: 10, odds: 1, stall: 20, retreats: 2, clear: 12, hurt: 0.35, upon: 2.5,
  apart: 6, together: 3.5, trail: 3, crumb: 2, crumbs: 32, down: 3 });

/** What the party is doing: finding its way on, fighting, drawing back, or pushing on past its foes. */
type Mode = "explore" | "fight" | "retreat" | "push";

/** What a level-clearer remembers of a member: the foe it fights or strikes, the door it is opening, and since when its legs have been out of its navigator's hands. */
interface Memory {
  target: string | null;
  opening: Opening | null;
  down: number | null;
}

/**
 * **A level-clearer**: a party that clears a Crypt level by itself. Its leader (the first member
 * standing on its feet) explores the edge of what the party has seen, and makes for the exit once
 * seen (`TeamLevel.frontier`), waiting for the others to close up; they follow it. A foe it sees
 * near joins the fight. It takes on a fight it can win (`POLICY.odds`), its members spread over the
 * foes (`spread`), a hurt member pulling back, until the fight stalls; it draws back the way it
 * came from one it cannot, a few times; and otherwise it pushes on past its foes, striking what is
 * upon it. It knows what its members sense, the level its host answers and its memory; nobody
 * leads it, and it hears no command.
 */
function clearerCommander(host: TeamHost): Commander {
  const { level } = host;
  const state = {
    members: {} as Record<string, Memory>,
    mode: "explore" as Mode,
    /** Each foe in the fight seen, by id: where and when it was last seen. */
    known: {} as Record<string, { at: GroundPoint; time: number }>,
    /** The unexplored place, or the exit, the leader is making for. */
    goal: null as GroundPoint | null,
    /** The leader's way so far, a point every `POLICY.crumb`, newest last, kept while no foe was near. */
    way: [] as GroundPoint[],
    /** Where the party draws back to. */
    rally: null as GroundPoint | null,
    /** How many times it has drawn back. */
    retreats: 0,
    /** Since when its fight has gone on with no foe of it falling. */
    since: 0,
    /** Whether its fight has stalled: it pushes on until no foe is near. */
    stalled: false,
    /** Whether the leader waits for the others to close up. */
    waiting: false,
    /** The member who leads, by id. */
    leader: null as string | null,
    /** When each foe lying down went down, by id (`lyingSince`). */
    down: {} as Record<string, number>,
  };
  const memory = (id: string): Memory => state.members[id] ??= { target: null, opening: null, down: null };

  /** The foes in the fight: those worth fighting (`worthFighting`) seen, last seen within `engage` of a standing member, in the order sensed. */
  const threat = (view: TeamView, standing: readonly MemberView[]): SensedBody[] => view.others.filter(other => {
    const known = state.known[other.id];
    return worthFighting(other, state.down, view.time) && known !== undefined && standing.some(member => distance(member.at, known.at) <= POLICY.engage);
  });

  /** The nearest of `foes` within `metres` of `member` that it sees, or none. */
  const nearest = (member: MemberView, foes: readonly SensedBody[], metres: number): SensedBody | null => {
    let best: SensedBody | null = null, gap = metres;
    for (const foe of foes) {
      const d = distance(member.at, foe.at);
      if (d <= gap && level.sees(member.at, foe.at, SIGHT_METRES)) { gap = d; best = foe; }
    }
    return best;
  };

  /** The latest point on the way in `clear` or more from every foe of `foes`, else the first. */
  const rallyFrom = (foes: readonly SensedBody[]): GroundPoint | null => {
    for (let i = state.way.length - 1; i >= 0; i--) {
      const at = state.way[i]!;
      if (foes.every(foe => distance(at, state.known[foe.id]!.at) >= POLICY.clear)) return { x: at.x, z: at.z };
    }
    const first = state.way[0];
    return first ? { x: first.x, z: first.z } : null;
  };

  /** Whether `member`'s legs have been out of its navigator's hands for `POLICY.down`. */
  const isDown = (member: MemberView, time: number): boolean => {
    const since = memory(member.id).down;
    return since !== null && time - since >= POLICY.down;
  };

  /** The member who leads: the one leading while it stands on its feet, else the first standing that does, else the first standing. */
  const leaderOf = (view: TeamView, standing: readonly MemberView[]): MemberView | undefined => {
    const current = standing.find(member => member.id === state.leader);
    if (current && !isDown(current, view.time)) return current;
    return standing.find(member => !isDown(member, view.time)) ?? current ?? standing[0];
  };

  /** What the team reads at a look: the foes it sees, the fight, what it does about it, and whom each member fights. */
  const look = (view: TeamView, standing: readonly MemberView[], leader: MemberView) => {
    level.look(standing.map(member => member.at));
    for (const other of view.others) {
      const known = state.known[other.id];
      if (!other.fighting) {
        // A foe of the fight that falls keeps the fight going.
        if (known) { delete state.known[other.id]; state.since = view.time; }
        continue;
      }
      if (standing.some(member => level.sees(member.at, other.at, SIGHT_METRES))) state.known[other.id] = { at: { x: other.at.x, z: other.at.z }, time: view.time };
      else if (known && view.time - known.time > POLICY.forget) delete state.known[other.id];
    }
    const foes = threat(view, standing), was = state.mode;
    if (!foes.length) {
      state.mode = "explore"; state.stalled = false;
      const last = state.way.at(-1);
      if (!last || distance(last, leader.at) >= POLICY.crumb) {
        state.way.push({ x: leader.at.x, z: leader.at.z });
        if (state.way.length > POLICY.crumbs) state.way.shift();
      }
    } else {
      if (was === "fight" && view.time - state.since > POLICY.stall) state.stalled = true;
      const strength = standing.reduce((sum, member) => sum + member.vitality, 0), winnable = strength >= POLICY.odds * foes.length;
      const rally = was === "retreat" ? state.rally : rallyFrom(foes);
      if (winnable && !state.stalled) {
        if (was !== "fight") state.since = view.time;
        state.mode = "fight";
      } else if (!winnable && rally && (was === "retreat" ? distance(leader.at, rally) > POLICY.crumb : state.retreats < POLICY.retreats)) {
        if (was !== "retreat") { state.retreats++; state.rally = rally; }
        state.mode = "retreat";
      } else state.mode = "push";
    }
    if (state.mode !== was) { state.goal = null; state.waiting = false; }
    // Fighting, the members fit to fight are spread over the foes they see; any other strikes only a foe upon it.
    const fit = state.mode === "fight" ? standing.filter(member => member.vitality >= POLICY.hurt) : [];
    const given = spread(fit.map(member => ({ id: member.id, at: member.at, current: memory(member.id).target,
      seen: foes.filter(foe => level.sees(member.at, foe.at, SIGHT_METRES)) })));
    for (const member of standing) {
      const foe = fit.includes(member) ? given.get(member.id) : nearest(member, view.others.filter(other => worthFighting(other, state.down, view.time)), POLICY.upon);
      memory(member.id).target = foe?.id ?? null;
    }
  };

  /** The leader's way on: the edge of what is explored, or the exit once seen; exploring, it waits while another lags. */
  const explore = (view: TeamView, leader: MemberView, standing: readonly MemberView[]): MovementRequest | null => {
    if (state.mode === "explore") {
      // A member whose navigator cannot get it on, or whose legs it does not have, is not waited for.
      const coming = standing.filter(member => member !== leader && !isDown(member, view.time)
        && member.navigation?.status !== "unreachable" && member.navigation?.status !== "stalled");
      const farthest = coming.reduce((most, member) => Math.max(most, distance(member.at, leader.at)), 0);
      if (state.waiting ? farthest > POLICY.together : farthest > POLICY.apart) { state.waiting = true; return null; }
      state.waiting = false;
    }
    const status = state.goal ? reportOf(leader, placeMovement(state.goal, ARRIVAL.explored))?.status : undefined;
    // A goal its navigator gives up on is dropped for a step, so that the one asked next is a new request to it.
    if (status === "unreachable" || status === "stalled") { state.goal = null; return null; }
    if (!state.goal || arrived(leader, state.goal, ARRIVAL.explored)) state.goal = roomy(level, level.frontier(leader.at, leader.radius), leader.radius);
    return state.goal ? placeMovement(state.goal, ARRIVAL.explored) : null;
  };

  /** Where `member` goes now. */
  const movement = (view: TeamView, member: MemberView, leader: MemberView, standing: readonly MemberView[]): MovementRequest | null => {
    const mind = memory(member.id), back = state.rally ? placeMovement(state.rally, ARRIVAL.post) : null;
    switch (state.mode) {
      case "explore": case "push": return member === leader ? explore(view, leader, standing) : approach(leader.id, POLICY.trail);
      case "retreat": return back;
      case "fight": {
        if (member.vitality < POLICY.hurt && back) return back;
        if (mind.target) return approach(mind.target, member.reach);
        // One that sees no foe goes to where the nearest was last seen.
        let goal: GroundPoint | null = null, gap = Infinity;
        for (const foe of threat(view, standing)) {
          const at = state.known[foe.id]!.at, d = distance(member.at, at);
          if (d < gap) { gap = d; goal = at; }
        }
        return goal ? placeMovement(goal, ARRIVAL.lastSeen) : approach(leader.id, POLICY.trail);
      }
      default: { const unknown: never = state.mode; throw new Error(`no mode ${JSON.stringify(unknown)}`); }
    }
  };

  /** What `member` is doing, in a word or two. */
  const task = (member: string): string => {
    const leads = state.leader === member;
    switch (state.mode) {
      case "explore": return leads ? state.waiting ? "regrouping" : "exploring" : "following";
      case "fight": return state.members[member]?.target ? "fighting" : "closing in";
      case "retreat": return "drawing back";
      case "push": return leads ? "pushing on" : "following";
      default: { const unknown: never = state.mode; throw new Error(`no mode ${JSON.stringify(unknown)}`); }
    }
  };

  return {
    state,
    // Nobody leads a level-clearer.
    hear() {},
    decide(view: TeamView): TeamDecision {
      lyingSince(state.down, view);
      const standing = view.members.filter(member => member.fighting && !member.held), orders = new Map<string, Orders>();
      for (const member of standing) {
        const mind = memory(member.id);
        if (member.navigation?.status !== "unavailable") mind.down = null;
        else mind.down ??= view.time;
      }
      const leader = leaderOf(view, standing);
      if (leader && leader.id !== state.leader) { state.leader = leader.id; state.goal = null; }
      // With nobody standing the run is lost, and what the party last saw stands.
      if (view.look && leader) look(view, standing, leader);
      for (const member of view.members) {
        if (!leader || !standing.includes(member)) { orders.set(member.id, STAND_ORDERS); continue; }
        const mind = memory(member.id);
        const move = throughDoors(mind, member, movement(view, member, leader, standing), view, level);
        const target = mind.target === null ? null : view.others.find(other => other.id === mind.target) ?? null;
        // Fighting fit, a member faces its foe; otherwise it faces the way it goes and strikes what is upon it.
        const facing = target && state.mode === "fight" && member.vitality >= POLICY.hurt ? direction(member.at, target.at) : null;
        orders.set(member.id, { move, face: facing, ...(target?.fighting ? { foe: target.id } : {}) });
      }
      return { orders, looked: view.look };
    },
    idle: () => false,
    report(member: string): MemberReport {
      return { target: state.members[member]?.target ?? null, task: task(member), forced: false, selected: false };
    },
    get notice() { return ""; },
  };
}

/** **A level-clearer** (`clearerCommander`): a party clearing a level by itself. */
export const CLEARER: CommanderEntry = deepFreeze({
  label: "Level-clearer (AI)", sides: ["party"], defaults: { kind: "clearer" }, faults: kindOnly,
  create: (host: TeamHost) => clearerCommander(host),
});
