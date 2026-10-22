/**
 * **The stub Commander**: holds every member where it stands, counting the steps it decided, in
 * its memory. Registered from here by one list line (`commanders.mjs`), as an entrant's is.
 */
import { kindOnly } from "../../../src/core/command/commander.ts";
import { STAND_ORDERS } from "../../../src/core/mind/orders.ts";

export const STUB_COMMANDER = Object.freeze({
  label: "Stub hold", sides: Object.freeze(["party", "enemies"]), defaults: Object.freeze({ kind: "stub-hold" }), faults: kindOnly,
  create: () => {
    const state = { decided: 0 };
    return {
      state, notice: "",
      hear() {},
      decide(view) { state.decided++; return { orders: new Map(view.members.map((member) => [member.id, STAND_ORDERS])), looked: view.look }; },
      idle: () => true,
      report: () => ({ target: null, task: "hold", forced: false, selected: false }),
    };
  },
});
