/**
 * **A stub executor**: a blow never ready, that aims at nothing (its strike names no regions or aim). Its state names it, counts the steps it was updated and
 * keeps the guard it was made with (`ExecutorMaking.guard`), so a test can read that the part a
 * config names is the part that ran and that its blows return to the mind's guard. Its strike
 * (`STUB_STRIKE`) is the Option that names it, with either hand.
 */
import { anyBody } from "../../../src/core/parts/parts.ts";
import { strikeKind } from "../../../src/core/option/kinds.ts";

export const STUB_BLOW = Object.freeze({
  role: "executor", label: "Never ready (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "swap:stub-blow" }), keys: Object.freeze({ kind: true }),
  fits: anyBody, faults: () => [], effectors: Object.freeze(["hand.left", "hand.right"]), aims: false,
  make({ guard }) {
    const state = { stub: "swap:stub-blow", steps: 0, guard: { ...guard } };
    return {
      state, resume() {},
      needs: (_action, effector) => [effector],
      readiness: () => ({ kind: "blocked", reason: "a stub" }),
      update() { state.steps++; return []; },
      start() { throw new Error("a stub blow is never ready"); },
      command: () => ({}),
    };
  },
});

/** The strike by the stub blow (`strikeKind`), with either hand, aimed at nothing: a kind of the swap entrant's own. */
const STRUCK = strikeKind("swap:stub-blow", "Stub blow", "either-hand");
export const STUB_STRIKE = Object.freeze({ ...STRUCK, stage: "experimental",
  defaults: Object.freeze({ kind: "swap:strike-stub-blow", skill: STUB_BLOW.defaults, limbs: "either-hand" }) });
