import { deepFreeze } from "../state.ts";
import { kindOnly, type CommanderEntry } from "./commander.ts";
import { direction, distance } from "./goals.ts";
import type { Orders } from "../mind/orders.ts";
import type { Commander, MemberReport, SensedBody, TeamDecision, TeamView } from "./team.ts";

/**
 * **Standing members**: each stands where it is facing the nearest foe fighting, firmly
 * (`Orders.firm`), naming none, so its hands are held from blows (`orderAllows`); how it guards is
 * its mind's. With no foe it stands as it faces. Nobody leads it.
 */
function standCommander(): Commander {
  const state = { targets: {} as Record<string, string | null> };
  return {
    state,
    hear() {},
    decide(view: TeamView): TeamDecision {
      const orders = new Map<string, Orders>();
      for (const member of view.members) {
        let foe: SensedBody | null = null, apart = Infinity;
        for (const other of view.others) {
          if (!other.fighting) continue;
          const d = distance(member.at, other.at);
          if (d < apart) { foe = other; apart = d; }
        }
        state.targets[member.id] = foe?.id ?? null;
        orders.set(member.id, { move: null, face: foe ? direction(member.at, foe.at) : null, firm: true });
      }
      return { orders, looked: true };
    },
    idle() { return false; },
    report(member: string): MemberReport { return { target: state.targets[member] ?? null, task: "standing", forced: false, selected: false }; },
    get notice() { return ""; },
  };
}

/** **Stand** (`standCommander`): what the Cover drill leads its subject by. It leads no side of a Crypt run. */
export const STAND: CommanderEntry = deepFreeze({
  label: "Stand", sides: [], defaults: { kind: "stand" }, faults: kindOnly,
  create: () => standCommander(),
});
