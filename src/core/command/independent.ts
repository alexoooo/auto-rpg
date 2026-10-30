import { deepFreeze } from "../state.ts";
import { kindOnly, type CommanderEntry } from "./kind.ts";
import { placeMovement, type GroundPoint, type MovementRequest } from "../mind/movement.ts";
import { STAND_ORDERS, type Orders } from "../mind/orders.ts";
import { ARRIVAL, approach, direction, distance, lyingSince, throughDoors, worthFighting, type Opening } from "./goals.ts";
import type { Commander, MemberReport, TeamDecision, TeamHost, TeamView } from "./team.ts";

/** How far a member of an independent team sees a foe along a clear line (`TeamLevel.sees`), m (`docs/reference/play.md#sight`). */
export const SIGHT_METRES = 14;
/** How long a member that has lost sight of its foe goes on to the place it last saw it, s (`docs/reference/play.md#run-timing`). */
export const ALERT_SECONDS = 7;

/** What an independent team remembers of a member: its foe, where and until when it was last seen, and the door it is opening. */
interface Memory {
  target: string | null;
  lastSeen: GroundPoint | null;
  alertedUntil: number;
  opening: Opening | null;
}

/**
 * **Independent members**: each goes for the nearest foe it sees, walks on to the place it last saw
 * one for `ALERT_SECONDS`, and otherwise goes back home. Nobody leads it; it hears no command.
 * Each look (`TeamView.look`) a member picks again; with no foe in the fight, what it last saw stands.
 */
function independentCommander(host: TeamHost): Commander {
  // When each foe lying down went down, by id (`lyingSince`).
  const state = { members: {} as Record<string, Memory>, down: {} as Record<string, number> };
  const memory = (id: string): Memory => state.members[id] ??=
    { target: null, lastSeen: null, alertedUntil: 0, opening: null };
  const { level } = host;

  const look = (view: TeamView) => {
    const foes = view.others.filter(other => worthFighting(other, state.down, view.time));
    if (!foes.length) return;
    for (const member of view.members) {
      const mind = memory(member.id);
      if (!member.fighting || member.held) { mind.target = null; continue; }
      let seen = -1, best = Infinity;
      for (let i = 0; i < foes.length; i++) {
        const d = distance(member.at, foes[i].at);
        if (d < best && level.sees(member.at, foes[i].at, SIGHT_METRES)) { best = d; seen = i; }
      }
      if (seen >= 0) {
        mind.lastSeen = { x: foes[seen].at.x, z: foes[seen].at.z }; mind.alertedUntil = view.time + ALERT_SECONDS;
        mind.target = foes[seen].id;
      } else mind.target = null;
    }
  };

  /** A member pursues its foe, the last place it saw one, or its home. */
  const movement = (mind: Memory, home: GroundPoint, reach: number, time: number): MovementRequest | null => {
    if (mind.target) return approach(mind.target, reach);
    const goal = mind.alertedUntil > time ? mind.lastSeen : home;
    return goal ? placeMovement(goal, ARRIVAL.point) : null;
  };

  return {
    state,
    // Nobody leads an independent team.
    hear() {},
    decide(view: TeamView): TeamDecision {
      lyingSince(state.down, view);
      if (view.look) look(view);
      const orders = new Map<string, Orders>();
      for (const member of view.members) {
        if (!member.fighting || member.held) { orders.set(member.id, STAND_ORDERS); continue; }
        const mind = memory(member.id);
        const move = throughDoors(mind, member, movement(mind, member.home, member.reach, view.time), view, level);
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

/** **Independent members** (`independentCommander`): each at the nearest foe it sees. */
export const INDEPENDENT: CommanderEntry = deepFreeze({
  label: "Independent", sides: ["enemies"], defaults: { kind: "independent" }, faults: kindOnly,
  create: (host: TeamHost) => independentCommander(host),
});
