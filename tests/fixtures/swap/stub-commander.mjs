/**
 * **The stub Commander**: holds every member where it stands, counting the steps it decided, in
 * its memory. Registered from here by one list line (`commanders.mjs`), as an entrant's is.
 */
import { kindOnly } from "../../../src/core/command/kind.ts";
import { STAND_ORDERS } from "../../../src/core/intent/orders.ts";
import { approach } from "../../../src/core/command/goals.ts";

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

/** Emits an approach once; an omitted member keeps that order as the target moves. */
export const STUB_APPROACH_COMMANDER = Object.freeze({
  label: "Stub approach", sides: Object.freeze(["party", "enemies"]), defaults: Object.freeze({ kind: "stub-approach" }), faults: kindOnly,
  create: () => {
    const state = { sent: false };
    return { state, notice: "", hear() {}, idle: () => false,
      report: () => ({ target: null, task: "approach", forced: false, selected: false }),
      decide(view) {
        const orders = new Map();
        if (!state.sent) {
          const target = view.others[0];
          for (const member of view.members) orders.set(member.id, { move: approach(target.id, member.reach), face: null, foe: target.id });
          state.sent = true;
        }
        return { orders, looked: view.look };
      },
    };
  },
});
